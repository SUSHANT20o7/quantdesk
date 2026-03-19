import { useState, useEffect } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  ComposedChart, Area, BarChart, Bar
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  bg:"#0a0e1a", bg2:"#111827", bg3:"#1a2235",
  border:"#2a3a52", text:"#e2e8f0", muted:"#8fa3bf",
  dim:"#4a6080", green:"#00d084", red:"#ff4d6d",
  blue:"#3b82f6", amber:"#f59e0b", teal:"#14b8a6", purple:"#8b5cf6",
};

const PERIODS = ["1mo","3mo","6mo","1y"];

// Popular suggestions shown in dropdown
const SUGGESTIONS = [
  "AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","AMD","INTC","ORCL",
  "CRM","ADBE","NFLX","UBER","COIN","PLTR","SNOW","NET","CRWD","JPM",
  "BAC","GS","V","MA","PYPL","JNJ","PFE","MRNA","LLY","XOM","CVX",
  "WMT","NKE","DIS","SPY","QQQ","GLD","INFY","WIT","HDB","TTM",
];

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, marginBottom:16 }}>
      <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:13, fontWeight:500 }}>{title}</div>
        {subtitle && <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding:"16px 18px" }}>{children}</div>
    </div>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const map: Record<string,{bg:string;color:string}> = {
    overbought: { bg:"rgba(255,77,109,.15)",  color:C.red    },
    oversold:   { bg:"rgba(0,208,132,.15)",   color:C.green  },
    neutral:    { bg:"rgba(139,92,246,.15)",  color:C.purple },
    bullish:    { bg:"rgba(0,208,132,.15)",   color:C.green  },
    bearish:    { bg:"rgba(255,77,109,.15)",  color:C.red    },
    above_upper:{ bg:"rgba(255,77,109,.15)",  color:C.red    },
    below_lower:{ bg:"rgba(0,208,132,.15)",   color:C.green  },
    inside:     { bg:"rgba(59,130,246,.15)",  color:C.blue   },
  };
  const st = map[signal] || map.neutral;
  return (
    <span style={{ background:st.bg, color:st.color, padding:"3px 10px", borderRadius:4, fontSize:11, fontWeight:500, textTransform:"capitalize" }}>
      {signal.replace(/_/g," ")}
    </span>
  );
}

export default function Indicators() {
  const [inputVal,  setInputVal]  = useState("AAPL");
  const [symbol,    setSymbol]    = useState("AAPL");
  const [period,    setPeriod]    = useState("6mo");
  const [data,      setData]      = useState<any>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string|null>(null);
  const [showDrop,  setShowDrop]  = useState(false);
  const [notFound,  setNotFound]  = useState(false);

  // Filter suggestions based on input
  const filtered = SUGGESTIONS.filter(s =>
    s.startsWith(inputVal.toUpperCase()) || s.includes(inputVal.toUpperCase())
  ).slice(0, 6);

  // Fetch indicators whenever symbol or period changes
  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    axios.get(`${API}/api/indicators/${symbol}?period=${period}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(e => {
        const msg = e.response?.data?.detail || e.message;
        if (msg.includes("No data") || e.response?.status === 404) setNotFound(true);
        else setError(msg);
        setLoading(false);
      });
  }, [symbol, period]);

  const handleSearch = (sym?: string) => {
    const clean = (sym || inputVal).trim().toUpperCase();
    if (!clean) return;
    setInputVal(clean);
    setSymbol(clean);
    setShowDrop(false);
  };

  const chartData = data?.data?.slice(-120) || [];

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'DM Sans',system-ui,sans-serif", padding:20, fontSize:14 }}>

      {/* Search bar + period selector */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>

        {/* Symbol search */}
        <div style={{ position:"relative" }}>
          <div style={{ display:"flex", gap:6 }}>
            <input
              value={inputVal}
              onChange={e => { setInputVal(e.target.value.toUpperCase()); setShowDrop(true); setNotFound(false); }}
              onFocus={() => setShowDrop(true)}
              onKeyDown={e => { if (e.key==="Enter") handleSearch(); if (e.key==="Escape") setShowDrop(false); }}
              placeholder="Type any symbol…"
              style={{ background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
                padding:"8px 12px", borderRadius:6, fontSize:13, outline:"none",
                fontFamily:"monospace", width:160 }}
            />
            <button onClick={() => handleSearch()}
              style={{ background:C.blue, color:"#fff", border:"none", borderRadius:6,
                padding:"0 16px", fontSize:12, fontWeight:500, cursor:"pointer" }}>
              Go
            </button>
          </div>

          {/* Dropdown suggestions */}
          {showDrop && inputVal.length > 0 && filtered.length > 0 && (
            <div style={{ position:"absolute", top:"100%", left:0, zIndex:999, marginTop:4,
              background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6,
              overflow:"hidden", minWidth:160, boxShadow:"0 8px 24px rgba(0,0,0,.5)" }}>
              {filtered.map(s => (
                <div key={s} onClick={() => handleSearch(s)}
                  style={{ padding:"8px 12px", cursor:"pointer", fontSize:12,
                    fontFamily:"monospace", color:C.text, borderBottom:`1px solid ${C.border}` }}
                  onMouseEnter={e => (e.currentTarget.style.background="rgba(59,130,246,.12)")}
                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                  {s}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Period pills */}
        {PERIODS.map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{ padding:"6px 14px", borderRadius:20, fontSize:11, fontWeight:500,
              cursor:"pointer", border:`1px solid ${p===period?C.blue:C.border}`,
              background:p===period?"rgba(59,130,246,.15)":"transparent",
              color:p===period?C.blue:C.muted }}>
            {p}
          </button>
        ))}

        {data && (
          <div style={{ marginLeft:"auto", fontSize:12, color:C.dim }}>
            {symbol} · {data.data?.length} data points
          </div>
        )}
      </div>

      {/* Not found message */}
      {notFound && (
        <div style={{ background:"rgba(255,77,109,.1)", border:`1px solid rgba(255,77,109,.3)`,
          borderRadius:8, padding:"14px 18px", marginBottom:16, fontSize:13, color:C.red }}>
          Symbol <strong>{symbol}</strong> not found. Check the ticker and try again. Examples: AAPL, MSFT, INFY, RELIANCE.NS
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:300, color:C.muted, fontSize:13 }}>
          Loading {symbol} indicators…
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ color:C.red, padding:20, fontSize:13 }}>Error: {error}</div>
      )}

      {/* Results */}
      {data && !loading && !error && !notFound && (
        <>
          {/* Summary cards */}
          {data.summary && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"13px 16px" }}>
                <div style={{ fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:".7px", marginBottom:6, fontWeight:500 }}>Price</div>
                <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:500 }}>${data.summary.price?.toFixed(2)||"—"}</div>
              </div>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"13px 16px" }}>
                <div style={{ fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:".7px", marginBottom:6, fontWeight:500 }}>RSI (14)</div>
                <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:500, color:data.summary.rsi>70?C.red:data.summary.rsi<30?C.green:C.amber }}>
                  {data.summary.rsi?.toFixed(1)||"—"}
                </div>
                <div style={{ marginTop:5 }}><SignalBadge signal={data.summary.rsi_signal} /></div>
              </div>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"13px 16px" }}>
                <div style={{ fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:".7px", marginBottom:6, fontWeight:500 }}>MACD</div>
                <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:500, color:data.summary.macd>0?C.green:C.red }}>
                  {data.summary.macd?.toFixed(3)||"—"}
                </div>
                <div style={{ marginTop:5 }}><SignalBadge signal={data.summary.macd_signal} /></div>
              </div>
              <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:"13px 16px" }}>
                <div style={{ fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:".7px", marginBottom:6, fontWeight:500 }}>Bollinger</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
                  <div>Upper: <span style={{ color:C.red, fontFamily:"monospace" }}>{data.summary.bb_upper?.toFixed(2)}</span></div>
                  <div>Lower: <span style={{ color:C.green, fontFamily:"monospace" }}>{data.summary.bb_lower?.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Price + Bollinger Bands */}
          <Card title={`${symbol} — Price + Bollinger Bands`} subtitle="20-period SMA ± 2 standard deviations">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                  tickFormatter={v=>v.slice(5)} interval={Math.floor(chartData.length/6)} />
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={55} />
                <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}} labelStyle={{color:C.muted}} />
                <Area type="monotone" dataKey="bb_upper" stroke={C.amber} strokeWidth={1} fill="rgba(245,158,11,.04)" dot={false} strokeDasharray="4 4" />
                <Area type="monotone" dataKey="bb_lower" stroke={C.amber} strokeWidth={1} fill="rgba(245,158,11,.04)" dot={false} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="bb_mid"  stroke={C.purple} strokeWidth={1} dot={false} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="ema20"   stroke={C.teal}   strokeWidth={1} dot={false} />
                <Line type="monotone" dataKey="close"   stroke={C.text}   strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:C.dim,flexWrap:"wrap"}}>
              {[["Price",C.text],["BB Upper/Lower",C.amber],["SMA 20",C.purple],["EMA 20",C.teal]].map(([l,c])=>(
                <span key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:10,height:2,background:c as string,display:"inline-block",borderRadius:1}} />{l}
                </span>
              ))}
            </div>
          </Card>

          {/* RSI + MACD side by side */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Card title="RSI (14)" subtitle="Overbought > 70 · Oversold < 30">
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                    tickFormatter={v=>v.slice(5)} interval={Math.floor(chartData.length/5)} />
                  <YAxis domain={[0,100]} tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={30} />
                  <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}} labelStyle={{color:C.muted}} />
                  <ReferenceLine y={70} stroke={C.red}   strokeDasharray="4 4" strokeWidth={1} />
                  <ReferenceLine y={30} stroke={C.green} strokeDasharray="4 4" strokeWidth={1} />
                  <ReferenceLine y={50} stroke={C.border} strokeDasharray="2 4" strokeWidth={1} />
                  <Line type="monotone" dataKey="rsi" stroke={C.purple} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              {data.summary && (
                <div style={{textAlign:"center",marginTop:8,fontFamily:"monospace",fontSize:15}}>
                  RSI: <span style={{color:data.summary.rsi>70?C.red:data.summary.rsi<30?C.green:C.amber}}>{data.summary.rsi?.toFixed(1)}</span>
                  <span style={{marginLeft:8}}><SignalBadge signal={data.summary.rsi_signal} /></span>
                </div>
              )}
            </Card>

            <Card title="MACD (12, 26, 9)" subtitle="MACD · Signal · Histogram">
              <ResponsiveContainer width="100%" height={190}>
                <ComposedChart data={chartData}>
                  <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                    tickFormatter={v=>v.slice(5)} interval={Math.floor(chartData.length/5)} />
                  <YAxis tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={40} />
                  <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}} labelStyle={{color:C.muted}} />
                  <ReferenceLine y={0} stroke={C.border} strokeWidth={1} />
                  <Bar dataKey="macd_hist" shape={(props:any)=>{
                    const {x,y,width,height,value}=props;
                    return <rect x={x} y={y} width={width} height={Math.abs(height)} fill={value>=0?C.green:C.red} opacity={0.6}/>;
                  }} />
                  <Line type="monotone" dataKey="macd"        stroke={C.blue} strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="macd_signal" stroke={C.red}  strokeWidth={1}   dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
              {data.summary && (
                <div style={{textAlign:"center",marginTop:8,fontSize:12,color:C.muted}}>
                  MACD: <span style={{fontFamily:"monospace",color:data.summary.macd>0?C.green:C.red}}>{data.summary.macd?.toFixed(3)}</span>
                  <span style={{marginLeft:8}}><SignalBadge signal={data.summary.macd_signal} /></span>
                </div>
              )}
            </Card>
          </div>

          {/* Moving Averages */}
          <Card title={`${symbol} — Moving Averages`} subtitle="EMA 20 · EMA 50 · SMA 20 · SMA 50">
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={chartData}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                  tickFormatter={v=>v.slice(5)} interval={Math.floor(chartData.length/6)} />
                <YAxis domain={["auto","auto"]} tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={55} />
                <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}} labelStyle={{color:C.muted}} />
                <Line type="monotone" dataKey="close" stroke={C.text}   strokeWidth={1.5} dot={false} name="Price" />
                <Line type="monotone" dataKey="ema20" stroke={C.teal}   strokeWidth={1}   dot={false} name="EMA 20" />
                <Line type="monotone" dataKey="ema50" stroke={C.amber}  strokeWidth={1}   dot={false} name="EMA 50" />
                <Line type="monotone" dataKey="sma20" stroke={C.blue}   strokeWidth={1}   dot={false} name="SMA 20" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="sma50" stroke={C.purple} strokeWidth={1}   dot={false} name="SMA 50" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:C.dim,flexWrap:"wrap"}}>
              {[["Price",C.text],["EMA 20",C.teal],["EMA 50",C.amber],["SMA 20",C.blue],["SMA 50",C.purple]].map(([l,c])=>(
                <span key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                  <span style={{width:10,height:2,background:c as string,display:"inline-block",borderRadius:1}} />{l}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
