import { useState } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const C = { bg:"#0a0e1a",bg2:"#111827",bg3:"#1a2235",border:"#2a3a52",text:"#e2e8f0",muted:"#8fa3bf",dim:"#4a6080",green:"#00d084",red:"#ff4d6d",blue:"#3b82f6",amber:"#f59e0b",teal:"#14b8a6" };
const STRATEGIES = [
  { id:"sma_crossover", label:"SMA Crossover",      desc:"Buy when fast MA crosses above slow MA" },
  { id:"rsi_reversion", label:"RSI Mean Reversion", desc:"Buy oversold, sell overbought" },
  { id:"macd_momentum", label:"MACD Momentum",      desc:"Follow MACD signal crossovers" },
  { id:"bb_breakout",   label:"Bollinger Breakout", desc:"Buy at lower band, sell at midline" },
];
const SYMBOLS = ["AAPL","MSFT","NVDA","TSLA","AMZN","META","GOOGL","SPY","QQQ"];
const PERIODS  = ["6mo","1y","2y","5y"];

function fmt(n: number|null|undefined, dec=2) {
  if (n==null) return "—";
  return n.toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}

function MCard({label,value,color,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
      <div style={{fontSize:10,color:C.dim,textTransform:"uppercase",letterSpacing:".8px",marginBottom:5,fontWeight:500}}>{label}</div>
      <div style={{fontFamily:"monospace",fontSize:20,fontWeight:500,color:color||C.text}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>}
    </div>
  );
}

export default function Backtest() {
  const [symbol,   setSymbol]   = useState("AAPL");
  const [strategy, setStrategy] = useState("sma_crossover");
  const [period,   setPeriod]   = useState("1y");
  const [capital,  setCapital]  = useState(100000);
  const [fast,     setFast]     = useState(10);
  const [slow,     setSlow]     = useState(30);
  const [stopLoss, setStopLoss] = useState(2);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState<string|null>(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await axios.post(`${API}/api/backtest`,{symbol,strategy,period,initial_capital:capital,fast_period:fast,slow_period:slow,stop_loss_pct:stopLoss});
      setResult(res.data);
    } catch(e:any) { setError(e.response?.data?.detail||e.message); }
    finally { setLoading(false); }
  };

  const m = result?.metrics;
  const inp = {background:C.bg3,border:`1px solid ${C.border}`,color:C.text,padding:"7px 10px",borderRadius:6,fontSize:13,width:"100%",outline:"none"};
  const sel = {...inp,cursor:"pointer"};

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',system-ui,sans-serif",padding:20,fontSize:14}}>
      <div style={{display:"grid",gridTemplateColumns:"290px 1fr",gap:16}}>

        {/* Config */}
        <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
          <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Configuration</div>
          <div style={{padding:"16px 18px"}}>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:5,fontWeight:500}}>Symbol</div>
              <select style={sel} value={symbol} onChange={e=>setSymbol(e.target.value)}>
                {SYMBOLS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:5,fontWeight:500}}>Strategy</div>
              {STRATEGIES.map(st=>(
                <div key={st.id} onClick={()=>setStrategy(st.id)} style={{padding:"8px 10px",borderRadius:6,marginBottom:4,cursor:"pointer",border:`1px solid ${strategy===st.id?C.blue:C.border}`,background:strategy===st.id?"rgba(59,130,246,.1)":"transparent"}}>
                  <div style={{fontSize:12,fontWeight:500,color:strategy===st.id?C.blue:C.text}}>{st.label}</div>
                  <div style={{fontSize:11,color:C.dim,marginTop:2}}>{st.desc}</div>
                </div>
              ))}
            </div>

            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:5,fontWeight:500}}>Period</div>
              <div style={{display:"flex",gap:6}}>
                {PERIODS.map(p=>(
                  <button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:"6px 0",borderRadius:6,fontSize:11,fontWeight:500,cursor:"pointer",border:`1px solid ${period===p?C.blue:C.border}`,background:period===p?"rgba(59,130,246,.15)":"transparent",color:period===p?C.blue:C.muted}}>{p}</button>
                ))}
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[["Capital ($)",capital,setCapital,1],["Stop Loss %",stopLoss,setStopLoss,0.5],["Fast MA",fast,setFast,1],["Slow MA",slow,setSlow,1]].map(([label,val,setter,step]:any)=>(
                <div key={label}>
                  <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:5,fontWeight:500}}>{label}</div>
                  <input style={inp} type="number" value={val} step={step} onChange={e=>setter(+e.target.value)} />
                </div>
              ))}
            </div>

            <button onClick={run} disabled={loading} style={{background:C.blue,color:"#fff",border:"none",borderRadius:6,padding:"10px 0",fontSize:13,fontWeight:500,cursor:"pointer",width:"100%",opacity:loading?.7:1}}>
              {loading?"Running…":"▶ Run Backtest"}
            </button>
            {error&&<div style={{fontSize:12,color:C.red,marginTop:8}}>Error: {error}</div>}
          </div>
        </div>

        {/* Results */}
        <div>
          {!result&&!loading&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:400,gap:10,color:C.muted}}>
              <div style={{fontSize:36}}>⚡</div>
              <div style={{fontSize:15,color:C.text,fontWeight:500}}>Configure and run a backtest</div>
              <div style={{fontSize:13}}>Results will appear here</div>
            </div>
          )}
          {loading&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300,color:C.muted,fontSize:13}}>Running backtest on {symbol}…</div>}

          {result&&m&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
                <MCard label="Strategy Return" value={(m.total_return>=0?"+":"")+fmt(m.total_return)+"%"} color={m.total_return>=0?C.green:C.red} />
                <MCard label="Buy & Hold"      value={(result.bh_return>=0?"+":"")+fmt(result.bh_return)+"%"} color={result.bh_return>=0?C.green:C.red} />
                <MCard label="Alpha"           value={(result.alpha>=0?"+":"")+fmt(result.alpha)+"%"} color={result.alpha>=0?C.green:C.red} sub="vs benchmark" />
                <MCard label="Final Value"     value={"$"+Math.round(m.final_value).toLocaleString()} color={C.blue} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:10}}>
                <MCard label="Sharpe Ratio"  value={fmt(m.sharpe_ratio)}  color={m.sharpe_ratio>1?C.green:m.sharpe_ratio>0?C.amber:C.red} />
                <MCard label="Sortino Ratio" value={fmt(m.sortino_ratio)} color={m.sortino_ratio>1?C.green:C.amber} />
                <MCard label="Max Drawdown"  value={fmt(m.max_drawdown)+"%"} color={C.red} />
                <MCard label="CAGR"          value={(m.cagr>=0?"+":"")+fmt(m.cagr)+"%"} color={m.cagr>=0?C.teal:C.red} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                <MCard label="Win Rate"      value={fmt(m.win_rate)+"%"} color={m.win_rate>50?C.green:C.amber} />
                <MCard label="Total Trades"  value={String(m.total_trades)} sub={`${m.winning_trades}W / ${m.losing_trades}L`} />
                <MCard label="Profit Factor" value={fmt(m.profit_factor)} color={m.profit_factor>1.5?C.green:m.profit_factor>1?C.amber:C.red} />
              </div>

              <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Equity Curve — Strategy vs Buy & Hold</div>
                <div style={{padding:"16px 18px"}}>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={result.equity_curve}>
                      <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} tickFormatter={v=>v.slice(5)} interval={Math.floor(result.equity_curve.length/6)} />
                      <YAxis tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={65} tickFormatter={v=>"$"+(v/1000).toFixed(0)+"k"} />
                      <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}} labelStyle={{color:C.muted}} formatter={(v:number,n:string)=>["$"+Math.round(v).toLocaleString(),n==="strategy"?"Strategy":"Buy & Hold"]} />
                      <ReferenceLine y={capital} stroke={C.border} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="strategy" stroke={C.green} strokeWidth={1.5} dot={false} />
                      <Line type="monotone" dataKey="bh"       stroke={C.blue}  strokeWidth={1}   dot={false} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",gap:16,marginTop:8,fontSize:11,color:C.dim}}>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:2,background:C.green,display:"inline-block"}} /> Strategy</span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:12,height:2,background:C.blue,display:"inline-block"}} /> Buy & Hold</span>
                  </div>
                </div>
              </div>

              {result.trades?.length>0&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Recent Trades</div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                      {["#","Entry","Exit","P&L","Result","Stop"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 14px",fontSize:10,textTransform:"uppercase",letterSpacing:".7px",color:C.dim,fontWeight:500}}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {result.trades.map((t:any,i:number)=>(
                        <tr key={i} style={{borderBottom:`1px solid rgba(42,58,82,.4)`}}>
                          <td style={{padding:"8px 14px",color:C.dim}}>{i+1}</td>
                          <td style={{padding:"8px 14px",fontFamily:"monospace"}}>${fmt(t.entry)}</td>
                          <td style={{padding:"8px 14px",fontFamily:"monospace"}}>${fmt(t.exit)}</td>
                          <td style={{padding:"8px 14px",fontFamily:"monospace",color:t.pnl>=0?C.green:C.red}}>{t.pnl>=0?"+":""}${fmt(t.pnl)}</td>
                          <td style={{padding:"8px 14px"}}><span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:500,background:t.pnl>=0?"rgba(0,208,132,.12)":"rgba(255,77,109,.12)",color:t.pnl>=0?C.green:C.red}}>{t.pnl>=0?"Win":"Loss"}</span></td>
                          <td style={{padding:"8px 14px",fontSize:11,color:t.stopped_out?C.red:C.dim}}>{t.stopped_out?"Yes":"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
