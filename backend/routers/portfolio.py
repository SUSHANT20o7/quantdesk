# v2 - Yahoo Finance v8
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import requests as rq
from datetime import datetime
from typing import List

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://finance.yahoo.com",
}


class OptimizeRequest(BaseModel):
    symbols:     List[str] = ["AAPL", "MSFT", "NVDA", "AMZN", "META"]
    period:      str       = "1y"
    simulations: int       = 1000
    risk_free:   float     = 4.5


class PortfolioRequest(BaseModel):
    symbols: List[str] = ["AAPL", "MSFT", "NVDA", "AMZN", "META"]
    period:  str       = "1y"


def fetch_closes(symbol: str, period: str) -> pd.Series:
    """Fetch closing prices using Yahoo Finance v8 API."""
    url  = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range={period}"
    resp = rq.get(url, headers=HEADERS, timeout=15)
    data = resp.json()
    result_data = data.get("chart", {}).get("result", [])
    if not result_data:
        return pd.Series(dtype=float)
    chart      = result_data[0]
    timestamps = chart.get("timestamp", [])
    closes     = chart.get("indicators", {}).get("quote", [{}])[0].get("close", [])
    records    = []
    dates      = []
    for i in range(len(timestamps)):
        if i >= len(closes) or closes[i] is None:
            continue
        dates.append(datetime.fromtimestamp(timestamps[i]).strftime("%Y-%m-%d"))
        records.append(round(float(closes[i]), 2))
    return pd.Series(records, index=pd.to_datetime(dates), name=symbol)


def fetch_returns(symbols: List[str], period: str):
    """Fetch returns for multiple symbols."""
    all_data = {}
    for sym in symbols:
        try:
            closes = fetch_closes(sym, period)
            if len(closes) > 10:
                all_data[sym] = closes
        except Exception:
            continue

    if len(all_data) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 valid symbols with data")

    prices  = pd.DataFrame(all_data).dropna()
    returns = prices.pct_change().dropna()
    return returns, prices


def portfolio_performance(weights, mean_returns, cov_matrix, risk_free):
    ret    = float(np.sum(mean_returns * weights) * 252)
    vol    = float(np.sqrt(np.dot(weights.T, np.dot(cov_matrix * 252, weights))))
    sharpe = (ret - risk_free / 100) / vol if vol > 0 else 0
    return ret, vol, sharpe


@router.post("/optimize")
def optimize_portfolio(req: OptimizeRequest):
    symbols = [s.upper() for s in req.symbols]
    if len(symbols) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 symbols")
    if len(symbols) > 10:
        raise HTTPException(status_code=400, detail="Max 10 symbols")

    returns, prices = fetch_returns(symbols, req.period)
    valid_symbols   = list(returns.columns)
    n               = len(valid_symbols)
    mean_returns    = returns.mean()
    cov_matrix      = returns.cov()
    rf              = req.risk_free

    np.random.seed(42)
    results     = []
    all_weights = []

    for _ in range(req.simulations):
        w = np.random.random(n)
        w = w / w.sum()
        ret, vol, sharpe = portfolio_performance(w, mean_returns, cov_matrix, rf)
        results.append({"return": round(ret * 100, 3), "risk": round(vol * 100, 3), "sharpe": round(sharpe, 4)})
        all_weights.append(w.tolist())

    sharpes         = [r["sharpe"] for r in results]
    vols            = [r["risk"]   for r in results]
    max_sharpe_idx  = int(np.argmax(sharpes))
    min_vol_idx     = int(np.argmin(vols))
    max_sharpe_w    = all_weights[max_sharpe_idx]
    min_vol_w       = all_weights[min_vol_idx]

    stock_stats = []
    for sym in valid_symbols:
        ann_ret = float(mean_returns[sym] * 252 * 100)
        ann_vol = float(returns[sym].std() * np.sqrt(252) * 100)
        sharpe  = (ann_ret - rf) / ann_vol if ann_vol > 0 else 0
        stock_stats.append({
            "symbol": sym,
            "return": round(ann_ret, 2),
            "risk":   round(ann_vol, 2),
            "sharpe": round(sharpe, 3),
        })

    corr        = returns.corr().round(3)
    corr_matrix = []
    for sym1 in valid_symbols:
        row = [float(corr.loc[sym1, sym2]) for sym2 in valid_symbols]
        corr_matrix.append(row)

    max_sharpe_ret, max_sharpe_vol, max_sharpe_val = portfolio_performance(np.array(max_sharpe_w), mean_returns, cov_matrix, rf)
    min_vol_ret, min_vol_vol, min_vol_val           = portfolio_performance(np.array(min_vol_w),   mean_returns, cov_matrix, rf)

    return {
        "symbols":     valid_symbols,
        "simulations": len(results),
        "all_points":  results[::max(1, len(results) // 500)],
        "max_sharpe": {
            "weights": {valid_symbols[i]: round(max_sharpe_w[i] * 100, 2) for i in range(n)},
            "return":  round(max_sharpe_ret * 100, 2),
            "risk":    round(max_sharpe_vol * 100, 2),
            "sharpe":  round(max_sharpe_val, 3),
        },
        "min_variance": {
            "weights": {valid_symbols[i]: round(min_vol_w[i] * 100, 2) for i in range(n)},
            "return":  round(min_vol_ret * 100, 2),
            "risk":    round(min_vol_vol * 100, 2),
            "sharpe":  round(min_vol_val, 3),
        },
        "stock_stats":  stock_stats,
        "corr_matrix":  corr_matrix,
        "corr_symbols": valid_symbols,
        "period":       req.period,
    }


@router.post("/performance")
def portfolio_performance_history(req: PortfolioRequest):
    symbols         = [s.upper() for s in req.symbols]
    returns, prices = fetch_returns(symbols, req.period)
    valid           = list(returns.columns)
    n               = len(valid)
    w               = np.array([1 / n] * n)
    port_returns    = returns[valid].dot(w)
    equity          = (1 + port_returns).cumprod() * 100
    dates           = equity.index.strftime("%Y-%m-%d").tolist()
    vals            = [round(float(v), 3) for v in equity.values]
    return {"symbols": valid, "dates": dates, "equity": vals}
