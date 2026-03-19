# backend/routers/sentiment.py
# Sentiment Analysis — Yahoo Finance RSS + VADER NLP
# No API key needed

from fastapi import APIRouter, HTTPException
import numpy as np
import re
import xml.etree.ElementTree as ET
from datetime import datetime

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    analyzer = SentimentIntensityAnalyzer()
    VADER_AVAILABLE = True
except ImportError:
    VADER_AVAILABLE = False

router = APIRouter(prefix="/api/sentiment", tags=["sentiment"])

# ── Finance keyword fallback ──────────────────────────────────────────────────
POSITIVE_WORDS = [
    "beat","beats","exceed","exceeds","record","growth","surge","soar","rally",
    "profit","gain","rise","strong","bullish","upgrade","buy","outperform",
    "innovation","expand","revenue","earnings","dividend","breakthrough","positive",
    "higher","increase","recover","boom","momentum","solid","robust","jump","spike",
    "strong","optimistic","approve","approved","launch","wins","awarded","partnership",
]
NEGATIVE_WORDS = [
    "miss","misses","decline","fall","drop","loss","weak","bearish","downgrade",
    "sell","underperform","cut","reduce","layoff","lawsuit","debt","concern","risk",
    "crash","plunge","slump","disappointing","negative","lower","decrease","warn",
    "recall","investigation","fine","penalty","fraud","loss","deficit","disappoints",
    "below","tumble","slide","trouble","crisis","default","bankrupt","suspend",
]


def score_text(text: str) -> dict:
    if not text:
        return {"compound": 0, "pos": 0, "neg": 0, "neu": 1, "label": "neutral"}

    if VADER_AVAILABLE:
        scores   = analyzer.polarity_scores(text)
        compound = scores["compound"]
        pos      = scores["pos"]
        neg      = scores["neg"]
        neu      = scores["neu"]
    else:
        words     = re.findall(r'\b\w+\b', text.lower())
        pos_count = sum(1 for w in words if w in POSITIVE_WORDS)
        neg_count = sum(1 for w in words if w in NEGATIVE_WORDS)
        total     = max(pos_count + neg_count, 1)
        compound  = (pos_count - neg_count) / total
        pos       = pos_count / max(len(words), 1)
        neg       = neg_count / max(len(words), 1)
        neu       = 1 - pos - neg

    label = "positive" if compound >= 0.05 else "negative" if compound <= -0.05 else "neutral"
    return {
        "compound": round(float(compound), 4),
        "pos":      round(float(pos), 4),
        "neg":      round(float(neg), 4),
        "neu":      round(float(neu), 4),
        "label":    label,
    }


def fetch_yahoo_rss(symbol: str) -> list:
    """Fetch news from Yahoo Finance RSS feed."""
    urls = [
        f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US",
        f"https://finance.yahoo.com/rss/headline?s={symbol}",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    for url in urls:
        try:
            resp = requests.get(url, headers=headers, timeout=8)
            if resp.status_code != 200:
                continue
            root  = ET.fromstring(resp.content)
            items = root.findall(".//item")
            news  = []
            for item in items[:20]:
                title     = item.findtext("title", "")
                link      = item.findtext("link", "")
                pub_date  = item.findtext("pubDate", "")
                publisher = item.findtext("source", "Yahoo Finance")
                if title:
                    news.append({
                        "title":     title.strip(),
                        "url":       link.strip(),
                        "date":      pub_date[:16] if pub_date else "",
                        "publisher": publisher,
                    })
            if news:
                return news
        except Exception:
            continue
    return []


def fetch_google_rss(symbol: str, company: str = "") -> list:
    """Fetch news from Google News RSS as fallback."""
    query = f"{symbol} stock" if not company else f"{company} stock"
    query = query.replace(" ", "+")
    url   = f"https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp  = requests.get(url, headers=headers, timeout=8)
        root  = ET.fromstring(resp.content)
        items = root.findall(".//item")
        news  = []
        for item in items[:15]:
            title     = item.findtext("title", "")
            link      = item.findtext("link", "")
            pub_date  = item.findtext("pubDate", "")
            source    = item.findtext("source", "Google News")
            if title:
                # Clean Google News title format "Title - Source"
                if " - " in title:
                    parts     = title.rsplit(" - ", 1)
                    title     = parts[0].strip()
                    source    = parts[1].strip() if len(parts) > 1 else source
                news.append({
                    "title":     title,
                    "url":       link,
                    "date":      pub_date[:16] if pub_date else "",
                    "publisher": source,
                })
        return news
    except Exception:
        return []


def fetch_yfinance_news(symbol: str) -> list:
    """Try yfinance as additional source."""
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        raw    = ticker.news or []
        news   = []
        for a in raw[:15]:
            title = a.get("title", "")
            if not title:
                continue
            ts    = a.get("providerPublishTime", 0)
            date  = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M") if ts else ""
            news.append({
                "title":     title,
                "url":       a.get("link", ""),
                "date":      date,
                "publisher": a.get("publisher", "Yahoo Finance"),
            })
        return news
    except Exception:
        return []


def get_all_news(symbol: str) -> list:
    """Try multiple sources and combine unique headlines."""
    all_news  = []
    seen      = set()

    # Try all sources
    for fetch_fn in [fetch_yfinance_news, fetch_yahoo_rss, fetch_google_rss]:
        try:
            news = fetch_fn(symbol)
            for item in news:
                title = item.get("title", "").strip()
                if title and title not in seen:
                    seen.add(title)
                    all_news.append(item)
        except Exception:
            continue

    return all_news[:20]


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/{symbol}")
def get_sentiment(symbol: str):
    symbol = symbol.upper()
    news   = get_all_news(symbol)

    if not news:
        return {
            "symbol":    symbol,
            "score":     0,
            "label":     "neutral",
            "fg_index":  50,
            "fg_label":  "Neutral",
            "headlines": [],
            "summary":   {"positive": 0, "negative": 0, "neutral": 0, "total": 0},
            "trend":     [],
            "analyzed":  0,
            "message":   "No recent news found. Try AAPL, TSLA, NVDA, or MSFT.",
        }

    # Score each headline
    scored = []
    for article in news:
        title     = article.get("title", "").strip()
        if not title:
            continue
        sentiment = score_text(title)
        scored.append({
            "title":     title,
            "publisher": article.get("publisher", ""),
            "url":       article.get("url", ""),
            "date":      article.get("date", ""),
            "score":     sentiment["compound"],
            "label":     sentiment["label"],
            "pos":       sentiment["pos"],
            "neg":       sentiment["neg"],
            "neu":       sentiment["neu"],
        })

    if not scored:
        return {"symbol": symbol, "score": 0, "label": "neutral", "headlines": [], "summary": {}, "trend": []}

    scores    = [s["score"] for s in scored]
    avg_score = float(np.mean(scores))
    avg_label = "positive" if avg_score >= 0.05 else "negative" if avg_score <= -0.05 else "neutral"

    summary = {
        "positive": len([s for s in scored if s["label"] == "positive"]),
        "negative": len([s for s in scored if s["label"] == "negative"]),
        "neutral":  len([s for s in scored if s["label"] == "neutral"]),
        "total":    len(scored),
    }

    trend = [{"date": s["date"][:10], "score": s["score"]} for s in scored if s["date"]]

    fg_index = int((avg_score + 1) / 2 * 100)
    fg_label = (
        "Extreme Fear"  if fg_index < 20 else
        "Fear"          if fg_index < 40 else
        "Neutral"       if fg_index < 60 else
        "Greed"         if fg_index < 80 else
        "Extreme Greed"
    )

    return {
        "symbol":     symbol,
        "score":      round(avg_score, 4),
        "label":      avg_label,
        "fg_index":   fg_index,
        "fg_label":   fg_label,
        "summary":    summary,
        "headlines":  scored[:15],
        "trend":      trend,
        "analyzed":   len(scored),
        "vader_used": VADER_AVAILABLE,
    }


@router.get("/market/overview")
def market_overview():
    symbols = ["SPY","AAPL","MSFT","NVDA","TSLA","AMZN","META"]
    results = []
    for sym in symbols:
        try:
            d = get_sentiment(sym)
            results.append({
                "symbol":   sym,
                "score":    d["score"],
                "label":    d["label"],
                "fg_index": d.get("fg_index", 50),
                "fg_label": d.get("fg_label", "Neutral"),
                "count":    d.get("analyzed", 0),
            })
        except Exception:
            results.append({"symbol": sym, "score": 0, "label": "neutral", "fg_index": 50, "fg_label": "Neutral", "count": 0})

    scores       = [r["score"] for r in results]
    market_score = float(np.mean(scores)) if scores else 0
    market_label = "positive" if market_score >= 0.05 else "negative" if market_score <= -0.05 else "neutral"

    return {
        "market_score": round(market_score, 4),
        "market_label": market_label,
        "stocks":       results,
    }
