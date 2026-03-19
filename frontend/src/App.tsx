import Sentiment from "./pages/Sentiment";
import Options from "./pages/Options";
import Portfolio from "./pages/Portfolio";
import Backtest from "./pages/Backtest";
import { useState, useEffect, useRef } from "react";
import { useQuote, usePrices, useLivePrices } from "./api";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Indicators from "./pages/Indicators";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtBig(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(2) + "M";
  return "$" + n.toLocaleString();
}

const C = {
  bg: "#0a0e1a", bg2: "#111827", bg3: "#1a2235",
  border: "#2a3a52", text: "#e2e8f0", muted: "#8fa3bf",
  dim: "#4a6080", green: "#00d084", red: "#ff4d6d",
  blue: "#3b82f6", amber: "#f59e0b", teal: "#14b8a6",
};

const TABS = [
  { id: "dashboard",  label: "Dashboard" },
  { id: "indicators", label: "Indicators" },
  { id: "backtest",   label: "Backtest" },
  { id: "portfolio",  label: "Portfolio" },
  { id: "options",    label: "Options" },
  { id: "sentiment",  label: "Sentiment" },
];

const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META"];
const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y"];

const POPULAR_STOCKS = [
  "AAPL","MSFT","NVDA","GOOGL","GOOG","META","AMZN","TSLA","AMD","INTC",
  "ORCL","CRM","ADBE","NFLX","SHOP","UBER","LYFT","SNAP","SPOT","COIN",
  "RBLX","PLTR","SNOW","NET","DDOG","ZM","DOCU","CRWD","OKTA","MDB",
  "JPM","BAC","GS","MS","WFC","C","V","MA","PYPL","SQ","BRK-B","AXP",
  "BLK","SCHW","COF","USB","PNC","TFC","ALLY","NU","SOFI","AFRM",
  "JNJ","PFE","MRNA","ABBV","MRK","LLY","BMY","AMGN","GILD","BIIB",
  "XOM","CVX","COP","SLB","EOG","MPC","PSX","VLO","OXY","HAL",
  "WMT","TGT","COST","HD","LOW","MCD","SBUX","NKE","DIS","CMCSA",
  "SPY","QQQ","IWM","DIA","VTI","VOO","GLD","SLV","TLT","HYG","VIX",
  "INFY","WIT","HDB","IBN","TTM","RDY","RELIANCE.NS","TCS.NS",
  "BA","CAT","GE","MMM","HON","LMT","RTX","NOC","DE","EMR",
  "BABA","JD","PDD","BIDU","NIO","XPEV","LI","TCOM","TME","BILI",
];

// ─── Search Bar ───────────────────────────────────────────────────────────────
function SearchBar({ onAdd }: { onAdd: (sym: string) => void }) {
  const [query, setQuery]       = useState("");
  const [suggestions, setSuggs] = useState<string[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (query.length < 1) { setSuggs([]); setNotFound(false); return; }
    const q = query.toUpperCase();
    const matches = POPULAR_STOCKS.filter(s => s.startsWith(q) || s.includes(q)).slice(0, 8);
    setSuggs(matches);
    setNotFound(false);
  }, [query]);

  const handleAdd = async (sym: string) => {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    setChecking(true);
    setNotFound(false);
    try {
      await axios.get(`${API}/api/quote/${clean}`);
      onAdd(clean);
      setQuery("");
      setSuggs([]);
      setShowDrop(false);
    } catch {
      setNotFound(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ padding: "12px 12px 8px", position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDrop(true); }}
            onFocus={() => setShowDrop(true)}
            onKeyDown={e => {
              if (e.key === "Enter") handleAdd(suggestions[0] || query);
              if (e.key === "Escape") setShowDrop(false);
            }}
            placeholder="Search any stock…"
            style={{
              width: "100%", background: C.bg3, border: `1px solid ${C.border}`,
              color: C.text, padding: "7px 10px", borderRadius: 6,
              fontSize: 12, outline: "none", fontFamily: "monospace",
            }}
          />
          {showDrop && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
              background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6,
              marginTop: 4, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.5)"
            }}>
              {suggestions.map(sym => (
                <div key={sym} onClick={() => handleAdd(sym)}
                  style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, fontFamily: "monospace", color: C.text, borderBottom: `1px solid ${C.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,.12)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  {sym}
                </div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => handleAdd(suggestions[0] || query)} disabled={checking || !query}
          style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 6, padding: "0 12px", fontSize: 12, cursor: query ? "pointer" : "not-allowed", opacity: query ? 1 : .5, fontWeight: 500 }}>
          {checking ? "…" : "Add"}
        </button>
      </div>
      {notFound && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Symbol not found. Check ticker and try again.</div>}
    </div>
  );
}

// ─── Watchlist Item ───────────────────────────────────────────────────────────
function WatchlistItem({ sym, livePrice, isActive, onClick, onRemove }: {
  sym: string; livePrice?: { price: number; change_pct: number };
  isActive: boolean; onClick: () => void; onRemove: (e: React.MouseEvent) => void;
}) {
  const { data: q } = useQuote(sym);
  const price = livePrice?.price ?? q?.price;
  const pct   = livePrice?.change_pct ?? q?.change_pct;
  const up    = (pct ?? 0) >= 0;
  const [hover, setHover] = useState(false);

  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", cursor: "pointer",
        borderLeft: `2px solid ${isActive ? C.blue : "transparent"}`,
        background: isActive ? "rgba(59,130,246,.08)" : hover ? "rgba(255,255,255,.03)" : "transparent",
        transition: "all .12s" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: pct != null ? (up ? C.green : C.red) : C.dim }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{sym}</div>
        <div style={{ fontSize: 11, color: C.dim, fontFamily: "monospace" }}>{price ? "$" + fmt(price) : "…"}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        {pct != null && <div style={{ fontSize: 11, fontFamily: "monospace", color: up ? C.green : C.red }}>{up ? "+" : ""}{fmt(pct)}%</div>}
        {hover && (
          <div onClick={onRemove}
            style={{ fontSize: 10, cursor: "pointer", padding: "1px 5px", borderRadius: 3, background: "rgba(255,77,109,.15)", color: C.red }}>
            ✕
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Price Chart ──────────────────────────────────────────────────────────────
function PriceChart({ symbol, period }: { symbol: string; period: string }) {
  const { data, loading, error } = usePrices(symbol, period);
  if (loading) return <div style={{ color: C.muted, padding: 40, textAlign: "center", fontSize: 13 }}>Loading {symbol}…</div>;
  if (error)   return <div style={{ color: C.red, padding: 40, textAlign: "center", fontSize: 13 }}>Error: {error}</div>;
  if (!data)   return null;
  const chartData = data.data.slice(-90).map(d => ({
    ...d, spacer: Math.min(d.open, d.close), body: Math.abs(d.close - d.open) || 0.01
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.dim }} tickLine={false} axisLine={false}
          tickFormatter={v => v.slice(5)} interval={Math.floor(chartData.length / 6)} />
        <YAxis domain={["auto","auto"]} tick={{ fontSize: 10, fill: C.dim }} tickLine={false} axisLine={false} width={55} tickFormatter={v => fmt(v)} />
        <Tooltip contentStyle={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12 }} labelStyle={{ color: C.muted }} />
        <Bar dataKey="spacer" stackId="c" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="body"   stackId="c" fill={C.green} isAnimationActive={false} />
        <Line type="monotone" dataKey="close" stroke={C.blue} dot={false} strokeWidth={1} strokeDasharray="3 3" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 12, color: C.muted }}>
      <div style={{ fontSize: 40 }}>⚙️</div>
      <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>{name}</div>
      <div style={{ fontSize: 13 }}>Coming in the next phase</div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab]       = useState("dashboard");
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const [period, setPeriod]             = useState("1y");
  const [watchlist, setWatchlist]       = useState<string[]>(DEFAULT_WATCHLIST);
  const { prices, connected }           = useLivePrices();
  const { data: quote }                 = useQuote(activeSymbol);

  const livePrice    = prices[activeSymbol];
  const displayPrice = livePrice?.price ?? quote?.price;
  const displayPct   = livePrice?.change_pct ?? quote?.change_pct;
  const up           = (displayPct ?? 0) >= 0;

  const addToWatchlist = (sym: string) => {
    if (!watchlist.includes(sym)) setWatchlist(prev => [...prev, sym]);
    setActiveSymbol(sym);
  };

  const removeFromWatchlist = (sym: string) => {
    setWatchlist(prev => prev.filter(s => s !== sym));
    if (activeSymbol === sym) setActiveSymbol(watchlist.find(s => s !== sym) || "AAPL");
  };

  const s: Record<string, React.CSSProperties> = {
    app:    { background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14 },
    topbar: { background: C.bg2, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 20px", height: 52, gap: 4 },
    logo:   { fontFamily: "monospace", fontWeight: 500, fontSize: 15, marginRight: 20, display: "flex", alignItems: "center", gap: 6 },
    tab:    { padding: "0 14px", height: 52, display: "flex", alignItems: "center", fontSize: 13, cursor: "pointer", color: C.muted, borderBottom: "2px solid transparent" },
    tabOn:  { padding: "0 14px", height: 52, display: "flex", alignItems: "center", fontSize: 13, cursor: "pointer", color: C.blue, borderBottom: `2px solid ${C.blue}`, background: "rgba(59,130,246,.06)" },
    badge:  { background: "rgba(0,208,132,.12)", color: C.green, fontSize: 11, fontFamily: "monospace", padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(0,208,132,.25)", display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" },
    layout: { display: "grid", gridTemplateColumns: "220px 1fr", height: "calc(100vh - 52px)" },
    sidebar:{ background: C.bg2, borderRight: `1px solid ${C.border}`, overflowY: "auto" as const },
    main:   { overflowY: "auto" as const, padding: 20, background: C.bg },
    card:   { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 16 },
    cardH:  { padding: "13px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" },
    cardB:  { padding: "16px 18px" },
  };

  return (
    <div style={s.app}>
      <div style={s.topbar}>
        <div style={s.logo}><span style={{ color: C.green }}>▣</span> QUANTDESK</div>
        {TABS.map(t => (
          <div key={t.id} style={t.id === activeTab ? s.tabOn : s.tab} onClick={() => setActiveTab(t.id)}>{t.label}</div>
        ))}
        <div style={s.badge}>
          <span style={{ width: 5, height: 5, background: C.green, borderRadius: "50%", animation: "pulse 1.5s infinite" }} />
          {connected ? "LIVE" : "RECONNECTING"}
        </div>
      </div>

      <div style={s.layout}>
        <div style={s.sidebar}>
          <SearchBar onAdd={addToWatchlist} />
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", color: C.dim, padding: "4px 16px 8px" }}>
            Watchlist ({watchlist.length})
          </div>
          {watchlist.map(sym => (
            <WatchlistItem key={sym} sym={sym} livePrice={prices[sym]} isActive={sym === activeSymbol}
              onClick={() => setActiveSymbol(sym)}
              onRemove={e => { e.stopPropagation(); removeFromWatchlist(sym); }} />
          ))}
          <div style={{ margin: "16px 16px 0", padding: "12px 0", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "1.2px", color: C.dim, marginBottom: 10 }}>Market</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>S&P 500 (SPY)</div>
            <div style={{ fontFamily: "monospace", fontSize: 15, color: C.green, marginBottom: 8 }}>{prices["SPY"] ? "$" + fmt(prices["SPY"].price) : "—"}</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>NASDAQ (QQQ)</div>
            <div style={{ fontFamily: "monospace", fontSize: 15, color: C.green }}>{prices["QQQ"] ? "$" + fmt(prices["QQQ"].price) : "—"}</div>
          </div>
        </div>

        <div style={s.main}>
          {activeTab === "dashboard" && (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 600 }}>{activeSymbol}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>Equity</div>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 500 }}>{displayPrice ? "$" + fmt(displayPrice) : "…"}</div>
                {displayPct != null && (
                  <div style={{ fontFamily: "monospace", fontSize: 16, color: up ? C.green : C.red, paddingBottom: 4 }}>
                    {up ? "▲ +" : "▼ "}{fmt(displayPct)}%
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
                <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 6, fontWeight: 500 }}>Price</div>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 500, color: up ? C.green : C.red }}>{displayPrice ? "$" + fmt(displayPrice) : "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Live</div>
                </div>
                <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 6, fontWeight: 500 }}>Change</div>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 500, color: up ? C.green : C.red }}>{quote?.change != null ? (up ? "+" : "") + fmt(quote.change) : "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Today</div>
                </div>
                <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 6, fontWeight: 500 }}>Volume</div>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 500 }}>{quote?.volume ? (quote.volume / 1e6).toFixed(2) + "M" : "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>shares</div>
                </div>
                <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: ".8px", marginBottom: 6, fontWeight: 500 }}>Market Cap</div>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 500 }}>{fmtBig(quote?.market_cap)}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>USD</div>
                </div>
              </div>
              <div style={s.card}>
                <div style={s.cardH}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{activeSymbol} — Price History</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {PERIODS.map(p => (
                      <button key={p} onClick={() => setPeriod(p)}
                        style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer", border: `1px solid ${period === p ? C.blue : C.border}`, background: period === p ? "rgba(59,130,246,.15)" : "transparent", color: period === p ? C.blue : C.muted }}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={s.cardB}><PriceChart symbol={activeSymbol} period={period} /></div>
              </div>
            </>
          )}
          {activeTab === "indicators" && <Indicators />}
       
{activeTab === "backtest" && <Backtest />}
         {activeTab === "portfolio" && <Portfolio />}
          {activeTab === "options" && <Options />}
         {activeTab === "sentiment" && <Sentiment />}
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0e1a; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a3a52; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
      `}</style>
    </div>
  );
}
