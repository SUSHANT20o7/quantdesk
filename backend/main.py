# v3 - Alpha Vantage
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import redis
import json
import asyncio
import os
import requests as req_session
from datetime import datetime

from routers.indicators import router as indicators_router
from routers.backtest   import router as backtest_router
from routers.portfolio  import router as portfolio_router
from routers.options    import router as options_router
from routers.sentiment  import router as sentiment_router

ALPHA_KEY = os.getenv("ALPHA_VANTAGE_KEY", "8OGJGTFSCUTGUWX7")

app = FastAPI(title="QuantDesk API", version="1.0.0")

app.include_router(indicators_router)
app.include_router(backtest_router)
app.include_router(portfolio_router)
app.include_router(options_router)
app.include_router(sentiment_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    cache = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
    cache.ping()
    REDIS_AVAILABLE = True
except Exception:
    REDIS_AVAILABLE = False
    print("Redis not available - running without cache")

CACHE_TTL = 60


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
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return float(val)


def fetch_quote_av(symbol: str):
    """Fetch quote using Yahoo Finance v8 API - no key needed."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://finance.yahoo.com",
        "Origin": "https://finance.yahoo.com",
    }
    resp   = req_session.get(url, headers=headers, timeout=10)
    print(f"Yahoo v8 status for {symbol}: {resp.status_code}")
    data   = resp.json()
    result = data.get("chart", {}).get("result", [])
    if not result:
        print(f"No result for {symbol}: {data}")
        return None
    meta       = result[0].get("meta", {})
    price      = round(float(meta.get("regularMarketPrice", 0)), 2)
    prev_close = round(float(meta.get("previousClose", price)), 2)
    change     = round(price - prev_close, 2)
    change_pct = round((change / prev_close) * 100, 2) if prev_close else 0
    volume     = int(meta.get("regularMarketVolume", 0))
    if price == 0:
        return None
    return {
        "symbol":     symbol,
        "price":      price,
        "change":     change,
        "change_pct": change_pct,
        "volume":     volume,
        "market_cap": None,
        "timestamp":  datetime.utcnow().isoformat(),
    }

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
        result = fetch_quote_av(symbol)
        if not result:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")
        cache_set(f"quote:{symbol}", result, ttl=60)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/prices/{symbol}")
def get_prices(symbol: str, period: str = "1y", interval: str = "1d"):
    symbol    = symbol.upper()
    cache_key = f"prices:{symbol}:{period}:{interval}"
    cached    = cache_get(cache_key)
    if cached:
        return cached
    try:
        import yfinance as yf
        df = yf.download(symbol, period=period, interval=interval, progress=False)
        if df.empty:
            raise HTTPException(status_code=404, detail=f"No data for {symbol}")
        df = df.reset_index()
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
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/info/{symbol}")
def get_info(symbol: str):
    symbol = symbol.upper()
    cached = cache_get(f"info:{symbol}")
    if cached:
        return cached
    try:
        import yfinance as yf
        info = yf.Ticker(symbol).info
        result = {
            "symbol":         symbol,
            "name":           info.get("longName") or info.get("shortName"),
            "sector":         info.get("sector"),
            "industry":       info.get("industry"),
            "description":    (info.get("longBusinessSummary") or "")[:400],
            "pe_ratio":       clean_float(info.get("trailingPE")),
            "eps":            clean_float(info.get("trailingEps")),
            "dividend_yield": clean_float(info.get("dividendYield")),
            "week_52_high":   clean_float(info.get("fiftyTwoWeekHigh")),
            "week_52_low":    clean_float(info.get("fiftyTwoWeekLow")),
            "avg_volume":     int(info.get("averageVolume") or 0),
        }
        cache_set(f"info:{symbol}", result, ttl=3600)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/watchlist")
def get_watchlist(symbols: str = "AAPL,MSFT,NVDA,TSLA,AMZN,META"):
    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    results = []
    for sym in symbol_list:
        try:
            results.append(get_quote(sym))
        except Exception:
            results.append({"symbol": sym, "price": None, "change": None, "change_pct": None})
    return results


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
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
    while True:
        if manager.active:
            prices = {}
            for sym in DEFAULT_SYMBOLS:
                try:
                    result = fetch_quote_av(sym)
                    if result:
                        prices[sym] = {
                            "price":      result["price"],
                            "change_pct": result["change_pct"],
                        }
                except Exception:
                    pass
            if prices:
                await manager.broadcast({
                    "type": "prices",
                    "data": prices,
                    "ts":   datetime.utcnow().isoformat()
                })
        await asyncio.sleep(30)


async def keep_alive():
    await asyncio.sleep(60)
    while True:
        try:
            req_session.get("https://quantdesk-57jj.onrender.com/", timeout=5)
            print("Keep alive ping")
        except Exception:
            pass
        await asyncio.sleep(600)

@app.on_event("startup")
async def startup():
    asyncio.create_task(price_broadcaster())
    asyncio.create_task(keep_alive())
@app.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)