# backend/routers/backtest.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

class BacktestRequest(BaseModel):
    symbol:          str   = "AAPL"
    strategy:        str   = "sma_crossover"
    period:          str   = "1y"
    initial_capital: float = 100000.0
    fast_period:     int   = 10
    slow_period:     int   = 30
    rsi_period:      int   = 14
    rsi_oversold:    float = 30.0
    rsi_overbought:  float = 70.0
    stop_loss_pct:   float = 2.0

def calc_rsi(closes, period=14):
    delta = closes.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period-1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period-1, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def calc_macd(closes, fast=12, slow=26, signal=9):
    ema_fast = closes.ewm(span=fast, adjust=False).mean()
    ema_slow = closes.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    return macd_line, signal_line

def calc_bb(closes, period=20, std_dev=2):
    sma = closes.rolling(period).mean()
    std = closes.rolling(period).std()
    return sma + std_dev*std, sma, sma - std_dev*std

def compute_metrics(equity, initial_capital, trades):
    eq = np.array(equity)
    rets = np.diff(eq) / eq[:-1]
    rf_daily = 0.045 / 252
    excess = rets - rf_daily
    sharpe = float(np.mean(excess) / np.std(excess) * np.sqrt(252)) if np.std(excess) > 0 else 0
    downside = rets[rets < rf_daily]
    sortino = float(np.mean(excess) / np.std(downside) * np.sqrt(252)) if len(downside) > 0 and np.std(downside) > 0 else 0
    peak = np.maximum.accumulate(eq)
    max_dd = float(np.min((eq - peak) / peak))
    total_return = (eq[-1] - initial_capital) / initial_capital
    years = len(equity) / 252
    cagr = float((1 + total_return) ** (1 / years) - 1) if years > 0 else 0
    wins = [t["pnl"] for t in trades if t.get("pnl", 0) > 0]
    losses = [t["pnl"] for t in trades if t.get("pnl", 0) < 0]
    win_rate = len(wins) / len(trades) if trades else 0
    profit_factor = abs(sum(wins) / sum(losses)) if losses and sum(losses) != 0 else 0
    return {
        "total_return":   round(total_return * 100, 2),
        "cagr":           round(cagr * 100, 2),
        "sharpe_ratio":   round(sharpe, 3),
        "sortino_ratio":  round(sortino, 3),
        "max_drawdown":   round(max_dd * 100, 2),
        "win_rate":       round(win_rate * 100, 2),
        "total_trades":   len(trades),
        "winning_trades": len(wins),
        "losing_trades":  len(losses),
        "avg_win":        round(float(np.mean(wins)) if wins else 0, 2),
        "avg_loss":       round(float(np.mean(losses)) if losses else 0, 2),
        "profit_factor":  round(profit_factor, 3),
        "final_value":    round(float(eq[-1]), 2),
    }

def run_strategy(df, req):
    closes = df["close"]
    cash = req.initial_capital
    shares = 0
    entry_price = 0
    equity = []
    trades = []
    fast_ma = closes.rolling(req.fast_period).mean()
    slow_ma = closes.rolling(req.slow_period).mean()
    rsi = calc_rsi(closes, req.rsi_period)
    macd, macd_sig = calc_macd(closes)
    bb_upper, bb_mid, bb_lower = calc_bb(closes)

    for i in range(len(df)):
        price = float(closes.iloc[i])
        buy = False
        sell = False

        if req.strategy == "sma_crossover":
            if not pd.isna(fast_ma.iloc[i]) and not pd.isna(slow_ma.iloc[i]):
                pf = fast_ma.iloc[i-1] if i > 0 else fast_ma.iloc[i]
                ps = slow_ma.iloc[i-1] if i > 0 else slow_ma.iloc[i]
                buy  = fast_ma.iloc[i] > slow_ma.iloc[i] and pf <= ps
                sell = fast_ma.iloc[i] < slow_ma.iloc[i] and pf >= ps
        elif req.strategy == "rsi_reversion":
            if not pd.isna(rsi.iloc[i]):
                pr = rsi.iloc[i-1] if i > 0 else rsi.iloc[i]
                buy  = rsi.iloc[i] > req.rsi_oversold and pr <= req.rsi_oversold
                sell = rsi.iloc[i] > req.rsi_overbought
        elif req.strategy == "macd_momentum":
            if not pd.isna(macd.iloc[i]):
                pm = macd.iloc[i-1] if i > 0 else macd.iloc[i]
                ps = macd_sig.iloc[i-1] if i > 0 else macd_sig.iloc[i]
                buy  = macd.iloc[i] > macd_sig.iloc[i] and pm <= ps
                sell = macd.iloc[i] < macd_sig.iloc[i] and pm >= ps
        elif req.strategy == "bb_breakout":
            if not pd.isna(bb_lower.iloc[i]):
                buy  = price <= float(bb_lower.iloc[i])
                sell = shares > 0 and price >= float(bb_mid.iloc[i])

        if buy and shares == 0 and cash > 0:
            shares = cash / price
            cash = 0
            entry_price = price
        elif sell and shares > 0:
            pnl = (price - entry_price) * shares
            cash = shares * price
            trades.append({"entry": round(entry_price,2), "exit": round(price,2), "pnl": round(pnl,2)})
            shares = 0

        if shares > 0 and entry_price > 0:
            if (price - entry_price) / entry_price * 100 < -req.stop_loss_pct:
                pnl = (price - entry_price) * shares
                cash = shares * price
                trades.append({"entry": round(entry_price,2), "exit": round(price,2), "pnl": round(pnl,2), "stopped_out": True})
                shares = 0

        equity.append(cash + shares * price)
    return equity, trades

@router.post("")
def run_backtest(req: BacktestRequest):
    symbol = req.symbol.upper()
    df = yf.download(symbol, period=req.period, interval="1d", progress=False)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")
    df = df.reset_index()
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]
    df.columns = [c.lower() for c in df.columns]
    df = df.dropna(subset=["close"])
    closes = df["close"]
    date_col = "date" if "date" in df.columns else "datetime"
    dates = df[date_col].astype(str).str[:10].tolist()
    equity, trades = run_strategy(df, req)
    bh_shares = req.initial_capital / float(closes.iloc[0])
    bh_equity = [bh_shares * float(p) for p in closes]
    metrics = compute_metrics(equity, req.initial_capital, trades)
    bh_return = round((bh_equity[-1] - req.initial_capital) / req.initial_capital * 100, 2)
    alpha = round(metrics.get("total_return", 0) - bh_return, 2)
    step = max(1, len(dates) // 252)
    equity_curve = [
        {"date": dates[i], "strategy": round(equity[i], 2), "bh": round(bh_equity[i], 2)}
        for i in range(0, len(dates), step)
    ]
    return {
        "symbol": symbol, "strategy": req.strategy, "period": req.period,
        "metrics": metrics, "bh_return": bh_return, "alpha": alpha,
        "trades": trades[-20:], "equity_curve": equity_curve,
    }
