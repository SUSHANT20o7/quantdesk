# backend/routers/indicators.py
# Technical Indicators — RSI, MACD, Bollinger Bands, EMA, SMA
# Endpoint: GET /api/indicators/{symbol}?period=1y&interval=1d

from fastapi import APIRouter, HTTPException
import yfinance as yf
import pandas as pd
import numpy as np

router = APIRouter(prefix="/api/indicators", tags=["indicators"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def clean(val):
    """Convert NaN/numpy types to Python float safely."""
    if val is None:
        return None
    try:
        if np.isnan(val):
            return None
    except Exception:
        pass
    return round(float(val), 4)


def fetch_ohlcv(symbol: str, period: str, interval: str) -> pd.DataFrame:
    """Fetch OHLCV from yfinance and return clean DataFrame."""
    df = yf.download(symbol, period=period, interval=interval, progress=False)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")

    # Flatten MultiIndex columns if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [col[0] for col in df.columns]

    df = df.reset_index()
    df.columns = [c.lower() for c in df.columns]
    return df


def calc_rsi(closes: pd.Series, period: int = 14) -> pd.Series:
    """Calculate RSI manually (no external library needed)."""
    delta = closes.diff()
    gain  = delta.clip(lower=0)
    loss  = -delta.clip(upper=0)

    avg_gain = gain.ewm(com=period - 1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period - 1, min_periods=period).mean()

    rs  = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calc_macd(closes: pd.Series, fast=12, slow=26, signal=9):
    """Calculate MACD line, signal line, and histogram."""
    ema_fast   = closes.ewm(span=fast,   adjust=False).mean()
    ema_slow   = closes.ewm(span=slow,   adjust=False).mean()
    macd_line  = ema_fast - ema_slow
    signal_line= macd_line.ewm(span=signal, adjust=False).mean()
    histogram  = macd_line - signal_line
    return macd_line, signal_line, histogram


def calc_bollinger(closes: pd.Series, period=20, std_dev=2):
    """Calculate Bollinger Bands: upper, middle (SMA), lower."""
    sma   = closes.rolling(window=period).mean()
    std   = closes.rolling(window=period).std()
    upper = sma + std_dev * std
    lower = sma - std_dev * std
    return upper, sma, lower


def calc_ema(closes: pd.Series, period=20) -> pd.Series:
    return closes.ewm(span=period, adjust=False).mean()


def calc_sma(closes: pd.Series, period=20) -> pd.Series:
    return closes.rolling(window=period).mean()


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/{symbol}")
def get_all_indicators(
    symbol:   str,
    period:   str = "6mo",
    interval: str = "1d",
):
    """
    Returns all indicators for a symbol in one call:
    - OHLCV price data
    - RSI (14)
    - MACD (12, 26, 9)
    - Bollinger Bands (20, 2)
    - EMA 20 and EMA 50
    - SMA 20 and SMA 50
    """
    symbol = symbol.upper()
    df     = fetch_ohlcv(symbol, period, interval)
    closes = df["close"]

    # ── Calculate all indicators ──────────────────────────────────────────────
    rsi                        = calc_rsi(closes, 14)
    macd_line, signal_line, histogram = calc_macd(closes, 12, 26, 9)
    bb_upper, bb_mid, bb_lower = calc_bollinger(closes, 20, 2)
    ema20  = calc_ema(closes, 20)
    ema50  = calc_ema(closes, 50)
    sma20  = calc_sma(closes, 20)
    sma50  = calc_sma(closes, 50)

    # ── Build response ────────────────────────────────────────────────────────
    records = []
    date_col = "date" if "date" in df.columns else "datetime"

    for i in range(len(df)):
        records.append({
            "date":       str(df[date_col].iloc[i])[:10],
            "open":       clean(df["open"].iloc[i]),
            "high":       clean(df["high"].iloc[i]),
            "low":        clean(df["low"].iloc[i]),
            "close":      clean(closes.iloc[i]),
            "volume":     int(df["volume"].iloc[i]) if not pd.isna(df["volume"].iloc[i]) else 0,
            "rsi":        clean(rsi.iloc[i]),
            "macd":       clean(macd_line.iloc[i]),
            "macd_signal":clean(signal_line.iloc[i]),
            "macd_hist":  clean(histogram.iloc[i]),
            "bb_upper":   clean(bb_upper.iloc[i]),
            "bb_mid":     clean(bb_mid.iloc[i]),
            "bb_lower":   clean(bb_lower.iloc[i]),
            "ema20":      clean(ema20.iloc[i]),
            "ema50":      clean(ema50.iloc[i]),
            "sma20":      clean(sma20.iloc[i]),
            "sma50":      clean(sma50.iloc[i]),
        })

    # ── Latest values summary ─────────────────────────────────────────────────
    last_rsi  = clean(rsi.dropna().iloc[-1]) if not rsi.dropna().empty else None
    last_macd = clean(macd_line.dropna().iloc[-1]) if not macd_line.dropna().empty else None
    last_sig  = clean(signal_line.dropna().iloc[-1]) if not signal_line.dropna().empty else None

    rsi_signal  = "overbought" if last_rsi and last_rsi > 70 else "oversold" if last_rsi and last_rsi < 30 else "neutral"
    macd_signal = "bullish" if last_macd and last_sig and last_macd > last_sig else "bearish"

    return {
        "symbol":   symbol,
        "period":   period,
        "interval": interval,
        "summary": {
            "rsi":         last_rsi,
            "rsi_signal":  rsi_signal,
            "macd":        last_macd,
            "macd_signal": macd_signal,
            "price":       clean(closes.iloc[-1]),
            "bb_upper":    clean(bb_upper.dropna().iloc[-1]),
            "bb_lower":    clean(bb_lower.dropna().iloc[-1]),
        },
        "data": records,
    }


@router.get("/rsi/{symbol}")
def get_rsi(symbol: str, period: str = "6mo", interval: str = "1d", length: int = 14):
    """RSI only endpoint."""
    symbol = symbol.upper()
    df     = fetch_ohlcv(symbol, period, interval)
    rsi    = calc_rsi(df["close"], length)
    date_col = "date" if "date" in df.columns else "datetime"

    data = [
        {"date": str(df[date_col].iloc[i])[:10], "rsi": clean(rsi.iloc[i])}
        for i in range(len(df))
    ]
    last = clean(rsi.dropna().iloc[-1]) if not rsi.dropna().empty else None
    return {
        "symbol": symbol,
        "rsi":    last,
        "signal": "overbought" if last and last > 70 else "oversold" if last and last < 30 else "neutral",
        "data":   data,
    }


@router.get("/macd/{symbol}")
def get_macd(symbol: str, period: str = "6mo", interval: str = "1d"):
    """MACD only endpoint."""
    symbol = symbol.upper()
    df     = fetch_ohlcv(symbol, period, interval)
    macd_line, signal_line, histogram = calc_macd(df["close"])
    date_col = "date" if "date" in df.columns else "datetime"

    data = [
        {
            "date":   str(df[date_col].iloc[i])[:10],
            "macd":   clean(macd_line.iloc[i]),
            "signal": clean(signal_line.iloc[i]),
            "hist":   clean(histogram.iloc[i]),
        }
        for i in range(len(df))
    ]
    last_macd = clean(macd_line.dropna().iloc[-1])
    last_sig  = clean(signal_line.dropna().iloc[-1])
    return {
        "symbol": symbol,
        "macd":   last_macd,
        "signal": last_sig,
        "crossover": "bullish" if last_macd and last_sig and last_macd > last_sig else "bearish",
        "data":   data,
    }


@router.get("/bb/{symbol}")
def get_bollinger(symbol: str, period: str = "6mo", interval: str = "1d"):
    """Bollinger Bands only endpoint."""
    symbol = symbol.upper()
    df     = fetch_ohlcv(symbol, period, interval)
    upper, mid, lower = calc_bollinger(df["close"])
    date_col = "date" if "date" in df.columns else "datetime"

    data = [
        {
            "date":  str(df[date_col].iloc[i])[:10],
            "close": clean(df["close"].iloc[i]),
            "upper": clean(upper.iloc[i]),
            "mid":   clean(mid.iloc[i]),
            "lower": clean(lower.iloc[i]),
        }
        for i in range(len(df))
    ]
    last_close = clean(df["close"].iloc[-1])
    last_upper = clean(upper.dropna().iloc[-1])
    last_lower = clean(lower.dropna().iloc[-1])
    position   = "above_upper" if last_close and last_upper and last_close > last_upper else \
                 "below_lower" if last_close and last_lower and last_close < last_lower else "inside"
    return {
        "symbol":   symbol,
        "upper":    last_upper,
        "lower":    last_lower,
        "position": position,
        "data":     data,
    }
