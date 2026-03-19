from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import os
import requests as req_session
ALPHA_KEY = os.getenv("ALPHA_VANTAGE_KEY", "8OGJGTFSCUTGUWX7")
import pandas as pd
import numpy as np
import redis
import json
import asyncio
from datetime import datetime
from typing import Optional

from routers.indicators import router as indicators_router
from routers.backtest import router as backtest_router
from routers.portfolio import router as portfolio_router
from routers.options import router as options_router
from routers.sentiment import router as sentiment_router



app = FastAPI(title="QuantDesk API", version="1.0.0")

app.include_router(indicators_router)
app.include_router(backtest_router)
app.include_router(portfolio_router)
app.include_router(options_router)
app.include_router(sentiment_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Redis client (graceful fallback if not running)
try:
    cache = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    cache.ping()
    REDIS_AVAILABLE = True
except Exception:
    REDIS_AVAILABLE = False
    print("Redis not available - running without cache")

CACHE_TTL = 60  # seconds


# ─── Helpers ────────────────────────────────────────────────────────────────

def cache_get(key: str):
    if not REDIS_AVAILABLE:
        return None
    try:
        val = cache.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


def cache_set(key: str, value, ttl: int = CACHE_TTL):
    if not REDIS_AVAILABLE:
        return
    try:
        cache.setex(key, ttl, json.dumps(value))
    except Exception:
        pass


def clean_float(val):
    """Convert numpy types and NaN to Python floats safely."""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)


# ─── Routes ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "ok", "message": "QuantDesk API is running"}




@app.get("/api/quote/{symbol}")
def get_quote(symbol: str):
    symbol = symbol.upper()
    cached = cache_get(f"quote:{symbol}")
    if cached:
        return cached
    try:
        url  = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={ALPHA_KEY}"
        resp = req_session.get(url, timeout=10)
        data = resp.json()
        quote = data.get("Global Quote", {})
        if not quote:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")
        price      = round(float(quote["05. price"]), 2)
        prev_close = round(float(quote["08. previous close"]), 2)
        change     = round(float(quote["09. change"]), 2)
        change_pct = round(float(quote["10. change percent"].replace("%", "")), 2)
        volume     = int(quote["06. volume"])
        result = {
            "symbol":     symbol,
            "price":      price,
            "change":     change,
            "change_pct": change_pct,
            "volume":     volume,
            "market_cap": None,
            "timestamp":  datetime.utcnow().isoformat(),
        }
        cache_set(f"quote:{symbol}", result, ttl=60)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/prices/{symbol}")
def get_prices(symbol: str, period: str = "1y", interval: str = "1d"):
    """
    OHLCV history for a symbol.
    period: 1d | 5d | 1mo | 3mo | 6mo | 1y | 2y | 5y
    interval: 1m | 5m | 15m | 1h | 1d | 1wk | 1mo
    Cached for 5 minutes.
    """
    symbol = symbol.upper()
    cache_key = f"prices:{symbol}:{period}:{interval}"
    cached = cache_get(cache_key)
    if cached:
        return cached

    try:
        df = yf.download(symbol, period=period, interval=interval, progress=False)

        if df.empty:
            raise HTTPException(status_code=404, detail=f"No price data found for {symbol}")

        df = df.reset_index()

        # Handle MultiIndex columns from yfinance
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = [col[0] if col[1] == '' else col[0] for col in df.columns]

        records = []
        for _, row in df.iterrows():
            date_val = row.get("Date") or row.get("Datetime")
            records.append({
                "date":   str(date_val)[:10] if date_val is not None else None,
                "open":   clean_float(row.get("Open")),
                "high":   clean_float(row.get("High")),
                "low":    clean_float(row.get("Low")),
                "close":  clean_float(row.get("Close")),
                "volume": int(row.get("Volume") or 0),
            })

        result = {"symbol": symbol, "period": period, "interval": interval, "data": records}
        cache_set(cache_key, result, ttl=300)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch prices for {symbol}: {str(e)}")


@app.get("/api/info/{symbol}")
def get_info(symbol: str):
    """Company info: name, sector, industry, description, PE, 52w range."""
    symbol = symbol.upper()
    cached = cache_get(f"info:{symbol}")
    if cached:
        return cached

    try:
        info = yf.Ticker(symbol).info
        result = {
            "symbol":        symbol,
            "name":          info.get("longName") or info.get("shortName"),
            "sector":        info.get("sector"),
            "industry":      info.get("industry"),
            "description":   (info.get("longBusinessSummary") or "")[:400],
            "pe_ratio":      clean_float(info.get("trailingPE")),
            "eps":           clean_float(info.get("trailingEps")),
            "dividend_yield":clean_float(info.get("dividendYield")),
            "week_52_high":  clean_float(info.get("fiftyTwoWeekHigh")),
            "week_52_low":   clean_float(info.get("fiftyTwoWeekLow")),
            "avg_volume":    int(info.get("averageVolume") or 0),
        }
        cache_set(f"info:{symbol}", result, ttl=3600)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/watchlist")
def get_watchlist(symbols: str = "AAPL,MSFT,NVDA,TSLA,AMZN,META"):
    """
    Bulk quotes for a comma-separated list of symbols.
    Used to populate the sidebar watchlist.
    """
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = []
    for sym in symbol_list:
        try:
            quote = get_quote(sym)
            results.append(quote)
        except Exception:
            results.append({"symbol": sym, "price": None, "change": None, "change_pct": None})
    return results


# ─── WebSocket live feed ─────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, data: dict):
        for ws in self.active.copy():
            try:
                await ws.send_json(data)
            except Exception:
                self.active.remove(ws)


manager = ConnectionManager()
DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "SPY"]


async def price_broadcaster():
    """Background task: polls quotes every 5s and broadcasts to all WS clients."""
    while True:
        if manager.active:
            prices = {}
            for sym in DEFAULT_SYMBOLS:
                try:
                    ticker = yf.Ticker(sym)
                    price = clean_float(ticker.fast_info.get("lastPrice"))
                    prev  = clean_float(ticker.fast_info.get("previousClose"))
                    if price and prev:
                        prices[sym] = {
                            "price":      price,
                            "change_pct": round((price - prev) / prev * 100, 2),
                        }
                except Exception:
                    pass
            if prices:
                await manager.broadcast({"type": "prices", "data": prices, "ts": datetime.utcnow().isoformat()})
        await asyncio.sleep(5)


@app.on_event("startup")
async def startup():
    asyncio.create_task(price_broadcaster())


@app.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()   # keep-alive ping from client
    except WebSocketDisconnect:
        manager.disconnect(websocket)
