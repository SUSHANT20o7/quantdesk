# backend/routers/portfolio.py
# Portfolio Optimizer — Modern Portfolio Theory
# Monte Carlo simulation, Efficient Frontier, Max Sharpe, Min Variance
# Endpoint: POST /api/portfolio/optimize

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
from typing import List

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class OptimizeRequest(BaseModel):
    symbols:      List[str] = ["AAPL", "MSFT", "NVDA", "AMZN", "META"]
    period:       str       = "1y"
    simulations:  int       = 1000
    risk_free:    float     = 4.5   # % annual


class PortfolioRequest(BaseModel):
    symbols: List[str] = ["AAPL", "MSFT", "NVDA", "AMZN", "META"]
    period:  str       = "1y"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def fetch_returns(symbols: List[str], period: str) -> pd.DataFrame:
    """Fetch adjusted close prices and compute daily returns."""
    all_data = {}
    for sym in symbols:
        try:
            df = yf.download(sym, period=period, interval="1d", progress=False)
            if df.empty:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [col[0] for col in df.columns]
            all_data[sym] = df["Close"]
        except Exception:
            continue

    if len(all_data) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 valid symbols")

    prices  = pd.DataFrame(all_data).dropna()
    returns = prices.pct_change().dropna()
    return returns, prices


def portfolio_performance(weights, mean_returns, cov_matrix, risk_free):
    """Compute annualized return, volatility, and Sharpe ratio."""
    ret  = float(np.sum(mean_returns * weights) * 252)
    vol  = float(np.sqrt(np.dot(weights.T, np.dot(cov_matrix * 252, weights))))
    sharpe = (ret - risk_free / 100) / vol if vol > 0 else 0
    return ret, vol, sharpe


# ─── Monte Carlo simulation ───────────────────────────────────────────────────

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

    mean_returns = returns.mean()
    cov_matrix   = returns.cov()
    rf           = req.risk_free

    # ── Monte Carlo: simulate random portfolios ───────────────────────────────
    np.random.seed(42)
    results     = []
    all_weights = []

    for _ in range(req.simulations):
        w = np.random.random(n)
        w = w / w.sum()
        ret, vol, sharpe = portfolio_performance(w, mean_returns, cov_matrix, rf)
        results.append({"return": round(ret*100, 3), "risk": round(vol*100, 3), "sharpe": round(sharpe, 4)})
        all_weights.append(w.tolist())

    # ── Find optimal portfolios ───────────────────────────────────────────────
    sharpes  = [r["sharpe"] for r in results]
    vols     = [r["risk"]   for r in results]

    # Max Sharpe
    max_sharpe_idx = int(np.argmax(sharpes))
    max_sharpe_w   = all_weights[max_sharpe_idx]

    # Min Volatility
    min_vol_idx = int(np.argmin(vols))
    min_vol_w   = all_weights[min_vol_idx]

    # ── Efficient frontier (sorted by volatility) ─────────────────────────────
    frontier_pts = sorted(results, key=lambda x: x["risk"])

    # ── Individual stock stats ────────────────────────────────────────────────
    stock_stats = []
    for sym in valid_symbols:
        ann_ret = float(mean_returns[sym] * 252 * 100)
        ann_vol = float(returns[sym].std() * np.sqrt(252) * 100)
        sharpe  = (ann_ret - rf) / ann_vol if ann_vol > 0 else 0
        stock_stats.append({
            "symbol":  sym,
            "return":  round(ann_ret, 2),
            "risk":    round(ann_vol, 2),
            "sharpe":  round(sharpe, 3),
        })

    # ── Correlation matrix ────────────────────────────────────────────────────
    corr = returns.corr().round(3)
    corr_matrix = []
    for sym1 in valid_symbols:
        row = []
        for sym2 in valid_symbols:
            row.append(float(corr.loc[sym1, sym2]))
        corr_matrix.append(row)

    # ── Build response ────────────────────────────────────────────────────────
    max_sharpe_ret, max_sharpe_vol, max_sharpe_val = portfolio_performance(
        np.array(max_sharpe_w), mean_returns, cov_matrix, rf)
    min_vol_ret, min_vol_vol, min_vol_val = portfolio_performance(
        np.array(min_vol_w), mean_returns, cov_matrix, rf)

    return {
        "symbols":     valid_symbols,
        "simulations": len(results),
        "frontier":    frontier_pts[::max(1, len(frontier_pts)//200)],  # sample for perf
        "all_points":  results[::max(1, len(results)//500)],

        "max_sharpe": {
            "weights":  {valid_symbols[i]: round(max_sharpe_w[i]*100, 2) for i in range(n)},
            "return":   round(max_sharpe_ret*100, 2),
            "risk":     round(max_sharpe_vol*100, 2),
            "sharpe":   round(max_sharpe_val, 3),
        },
        "min_variance": {
            "weights":  {valid_symbols[i]: round(min_vol_w[i]*100, 2) for i in range(n)},
            "return":   round(min_vol_ret*100, 2),
            "risk":     round(min_vol_vol*100, 2),
            "sharpe":   round(min_vol_val, 3),
        },

        "stock_stats":   stock_stats,
        "corr_matrix":   corr_matrix,
        "corr_symbols":  valid_symbols,
        "period":        req.period,
    }


# ─── Portfolio performance over time ─────────────────────────────────────────

@router.post("/performance")
def portfolio_performance_history(req: PortfolioRequest):
    """Returns equal-weight portfolio performance over time."""
    symbols = [s.upper() for s in req.symbols]
    returns, prices = fetch_returns(symbols, req.period)
    valid  = list(returns.columns)
    n      = len(valid)
    w      = np.array([1/n] * n)

    port_returns = returns[valid].dot(w)
    equity       = (1 + port_returns).cumprod() * 100

    dates = equity.index.strftime("%Y-%m-%d").tolist()
    vals  = [round(float(v), 3) for v in equity.values]

    return {
        "symbols": valid,
        "dates":   dates,
        "equity":  vals,
    }
