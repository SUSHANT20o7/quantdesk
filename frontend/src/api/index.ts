import axios from "axios";
import { useEffect, useState, useRef, useCallback } from "react";

// ─── Axios instance ──────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 10000,
});

// ─── Types ───────────────────────────────────────────────────────────────────
export interface Quote {
  symbol: string;
  price: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number;
  market_cap: number | null;
  timestamp: string;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PricesResponse {
  symbol: string;
  period: string;
  interval: string;
  data: OHLCV[];
}

export interface CompanyInfo {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  description: string;
  pe_ratio: number | null;
  eps: number | null;
  dividend_yield: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  avg_volume: number;
}

export interface LivePriceUpdate {
  [symbol: string]: {
    price: number;
    change_pct: number;
  };
}

// ─── Generic fetch hook ───────────────────────────────────────────────────────
function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .get<T>(url)
      .then((res) => {
        if (!cancelled) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.detail || err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  return { data, loading, error };
}

// ─── Domain hooks ─────────────────────────────────────────────────────────────

/** Single live quote for a symbol */
export function useQuote(symbol: string) {
  return useFetch<Quote>(symbol ? `/api/quote/${symbol.toUpperCase()}` : null, [symbol]);
}

/** OHLCV price history */
export function usePrices(
  symbol: string,
  period: string = "1y",
  interval: string = "1d"
) {
  return useFetch<PricesResponse>(
    symbol ? `/api/prices/${symbol.toUpperCase()}?period=${period}&interval=${interval}` : null,
    [symbol, period, interval]
  );
}

/** Company info */
export function useCompanyInfo(symbol: string) {
  return useFetch<CompanyInfo>(symbol ? `/api/info/${symbol.toUpperCase()}` : null, [symbol]);
}

/** Bulk watchlist quotes */
export function useWatchlist(symbols: string[] = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"]) {
  return useFetch<Quote[]>(`/api/watchlist?symbols=${symbols.join(",")}`, [symbols.join(",")]);
}

// ─── WebSocket live price hook ────────────────────────────────────────────────
export function useLivePrices() {
  const [prices, setPrices] = useState<LivePriceUpdate>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    const wsUrl = (import.meta.env.VITE_API_URL || "http://localhost:8000")
      .replace(/^http/, "ws") + "/ws/prices";

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send keep-alive ping every 10s
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 10000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "prices") {
          setPrices((prev) => ({ ...prev, ...msg.data }));
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingRef.current) clearInterval(pingRef.current);
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [connect]);

  return { prices, connected };
}

// ─── Direct API calls (for non-hook use, e.g. in event handlers) ─────────────
export const apiClient = {
  getQuote: (symbol: string) =>
    api.get<Quote>(`/api/quote/${symbol}`).then((r) => r.data),

  getPrices: (symbol: string, period = "1y", interval = "1d") =>
    api
      .get<PricesResponse>(`/api/prices/${symbol}?period=${period}&interval=${interval}`)
      .then((r) => r.data),

  getInfo: (symbol: string) =>
    api.get<CompanyInfo>(`/api/info/${symbol}`).then((r) => r.data),
};

export default api;
