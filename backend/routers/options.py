# backend/routers/options.py
# Options Pricer — Black-Scholes model
# Call/Put pricing, full Greeks, Implied Volatility solver
# Endpoint: POST /api/options/price

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq
from typing import Optional

router = APIRouter(prefix="/api/options", tags=["options"])


# ─── Request models ───────────────────────────────────────────────────────────

class OptionRequest(BaseModel):
    spot:       float = 150.0   # Current stock price (S)
    strike:     float = 155.0   # Strike price (K)
    expiry:     float = 0.25    # Time to expiry in years (T)
    rate:       float = 4.5     # Risk-free rate % (r)
    volatility: float = 28.0    # Implied volatility % (σ)
    option_type: str  = "call"  # call | put


class IVRequest(BaseModel):
    spot:         float = 150.0
    strike:       float = 155.0
    expiry:       float = 0.25
    rate:         float = 4.5
    market_price: float = 5.0
    option_type:  str   = "call"


class SurfaceRequest(BaseModel):
    spot:       float = 150.0
    rate:       float = 4.5
    volatility: float = 28.0
    option_type: str  = "call"


# ─── Core Black-Scholes functions ─────────────────────────────────────────────

def d1d2(S, K, T, r, sigma):
    """Compute d1 and d2 for Black-Scholes."""
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None, None
    d1 = (np.log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    return d1, d2


def bs_price(S, K, T, r, sigma, option_type="call"):
    """Black-Scholes option price."""
    d1, d2 = d1d2(S, K, T, r, sigma)
    if d1 is None:
        return 0.0
    if option_type == "call":
        return S * norm.cdf(d1) - K * np.exp(-r * T) * norm.cdf(d2)
    else:
        return K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)


def bs_greeks(S, K, T, r, sigma, option_type="call"):
    """Compute all Greeks."""
    d1, d2 = d1d2(S, K, T, r, sigma)
    if d1 is None:
        return {}

    price = bs_price(S, K, T, r, sigma, option_type)

    # Delta
    delta = norm.cdf(d1) if option_type == "call" else norm.cdf(d1) - 1

    # Gamma (same for call and put)
    gamma = norm.pdf(d1) / (S * sigma * np.sqrt(T))

    # Theta (per day)
    theta_common = -(S * norm.pdf(d1) * sigma) / (2 * np.sqrt(T))
    if option_type == "call":
        theta = (theta_common - r * K * np.exp(-r * T) * norm.cdf(d2)) / 365
    else:
        theta = (theta_common + r * K * np.exp(-r * T) * norm.cdf(-d2)) / 365

    # Vega (per 1% change in volatility)
    vega = S * norm.pdf(d1) * np.sqrt(T) / 100

    # Rho (per 1% change in rate)
    if option_type == "call":
        rho = K * T * np.exp(-r * T) * norm.cdf(d2) / 100
    else:
        rho = -K * T * np.exp(-r * T) * norm.cdf(-d2) / 100

    # Lambda (leverage / elasticity)
    lam = delta * S / price if price > 0 else 0

    return {
        "price":  round(float(price),  4),
        "delta":  round(float(delta),  4),
        "gamma":  round(float(gamma),  6),
        "theta":  round(float(theta),  4),
        "vega":   round(float(vega),   4),
        "rho":    round(float(rho),    4),
        "lambda": round(float(lam),    4),
        "d1":     round(float(d1),     4),
        "d2":     round(float(d2),     4),
    }


def implied_volatility(S, K, T, r, market_price, option_type="call"):
    """Solve for implied volatility using Brent's method."""
    if T <= 0 or market_price <= 0:
        return None

    intrinsic = max(0, S - K) if option_type == "call" else max(0, K - S)
    if market_price < intrinsic:
        return None

    try:
        iv = brentq(
            lambda sigma: bs_price(S, K, T, r, sigma, option_type) - market_price,
            1e-6, 10.0, xtol=1e-6, maxiter=200
        )
        return round(float(iv * 100), 4)
    except Exception:
        return None


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/price")
def price_option(req: OptionRequest):
    """Price an option and return all Greeks."""
    S     = req.spot
    K     = req.strike
    T     = req.expiry
    r     = req.rate / 100
    sigma = req.volatility / 100
    otype = req.option_type.lower()

    if otype not in ["call", "put"]:
        raise HTTPException(status_code=400, detail="option_type must be 'call' or 'put'")
    if T <= 0:
        raise HTTPException(status_code=400, detail="Expiry must be > 0")
    if sigma <= 0:
        raise HTTPException(status_code=400, detail="Volatility must be > 0")

    greeks = bs_greeks(S, K, T, r, sigma, otype)

    # Moneyness
    moneyness = "ATM"
    if otype == "call":
        if S > K * 1.01: moneyness = "ITM"
        elif S < K * 0.99: moneyness = "OTM"
    else:
        if S < K * 0.99: moneyness = "ITM"
        elif S > K * 1.01: moneyness = "OTM"

    # Intrinsic and time value
    intrinsic  = max(0, S - K) if otype == "call" else max(0, K - S)
    time_value = max(0, greeks["price"] - intrinsic)

    # Breakeven
    breakeven = K + greeks["price"] if otype == "call" else K - greeks["price"]

    return {
        **greeks,
        "moneyness":   moneyness,
        "intrinsic":   round(intrinsic, 4),
        "time_value":  round(time_value, 4),
        "breakeven":   round(breakeven, 4),
        "option_type": otype,
        "inputs": {
            "spot": S, "strike": K, "expiry": T,
            "rate": req.rate, "volatility": req.volatility,
        }
    }


@router.post("/implied-volatility")
def calc_iv(req: IVRequest):
    """Calculate implied volatility from market price."""
    iv = implied_volatility(
        req.spot, req.strike, req.expiry,
        req.rate / 100, req.market_price, req.option_type.lower()
    )
    if iv is None:
        raise HTTPException(status_code=400, detail="Could not solve for IV — check inputs")
    return {"implied_volatility": iv, "unit": "%"}


@router.post("/payoff")
def option_payoff(req: OptionRequest):
    """Generate payoff diagram data points."""
    S     = req.spot
    K     = req.strike
    T     = req.expiry
    r     = req.rate / 100
    sigma = req.volatility / 100
    otype = req.option_type.lower()

    premium = bs_price(S, K, T, r, sigma, otype)

    # Spot range: 70% to 130% of current spot
    spots = np.linspace(S * 0.65, S * 1.35, 80)
    data  = []

    for spot in spots:
        # BS price at this spot
        bs = bs_price(spot, K, T, r, sigma, otype)

        # Intrinsic (payoff at expiry)
        intrinsic = max(0, spot - K) if otype == "call" else max(0, K - spot)

        # P&L (buyer perspective)
        pnl = intrinsic - premium

        data.append({
            "spot":      round(float(spot),      2),
            "bs_price":  round(float(bs),        4),
            "intrinsic": round(float(intrinsic), 4),
            "pnl":       round(float(pnl),       4),
        })

    return {
        "premium": round(premium, 4),
        "strike":  K,
        "data":    data,
    }


@router.post("/surface")
def greeks_surface(req: SurfaceRequest):
    """Greeks vs spot price for sensitivity analysis."""
    S     = req.spot
    r     = req.rate / 100
    sigma = req.volatility / 100
    otype = req.option_type.lower()

    # Vary spot from 70% to 130%
    spots = np.linspace(S * 0.70, S * 1.30, 60)
    K     = S  # ATM strike
    T     = 0.25  # 3 months

    data = []
    for spot in spots:
        g = bs_greeks(spot, K, T, r, sigma, otype)
        data.append({
            "spot":  round(float(spot), 2),
            "delta": g.get("delta", 0),
            "gamma": g.get("gamma", 0),
            "theta": g.get("theta", 0),
            "vega":  g.get("vega",  0),
        })

    return {"data": data}
