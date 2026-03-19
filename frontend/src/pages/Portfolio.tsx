import { useState } from "react";
import axios from "axios";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart,
  Line, BarChart, Bar, Cell
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  bg:"#0a0e1a", bg2:"#111827", bg3:"#1a2235",
  border:"#2a3a52", text:"#e2e8f0", muted:"#8fa3bf",
  dim:"#4a6080", green:"#00d084", red:"#ff4d6d",
  blue:"#3b82f6", amber:"#f59e0b", teal:"#14b8a6", purple:"#8b5cf6",
};

const PERIODS      = ["6mo","1y","2y"];
const SIMULATIONS  = [500, 1000, 2000];
const DEFAULT_SYMS = ["AAPL","MSFT","NVDA","AMZN","META"];

function fmt(n: number|null|undefined, dec=2) {
  if (n==null) return "—";
  return n.toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}

function MCard({label,value,color,sub}:{label:string;value:string;color?:string;sub?:string}) {
  return (
    <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
      <div style={{fontSize:10,color:C.dim,textTransform:"uppercase",letterSpacing:".8px",marginBottom:5,fontWeight:500}}>{label}</div>
      <div style={{fontFamily:"monospace",fontSize:18,fontWeight:500,color:color||C.text}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>}
    </div>
  );
}

const COLORS = [C.blue, C.green, C.amber, C.purple, C.teal, C.red, "#ec4899", "#06b6d4", "#84cc16", "#f97316"];

export default function Portfolio() {
  const [symbols,  setSymbols]  = useState<string[]>(DEFAULT_SYMS);
  const [input,    setInput]    = useState("");
  const [period,   setPeriod]   = useState("1y");
  const [sims,     setSims]     = useState(1000);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<any>(null);
  const [error,    setError]    = useState<string|null>(null);
  const [view,     setView]     = useState<"sharpe"|"minvol">("sharpe");

  const addSymbol = () => {
    const s = input.trim().toUpperCase();
    if (s && !symbols.includes(s) && symbols.length < 10) {
      setSymbols(prev => [...prev, s]);
      setInput("");
    }
  };

  const removeSymbol = (s: string) => setSymbols(prev => prev.filter(x => x !== s));

  const run = async () => {
    if (symbols.length < 2) { setError("Add at least 2 symbols"); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await axios.post(`${API}/api/portfolio/optimize`, {
        symbols, period, simulations: sims, risk_free: 4.5
      });
      setResult(res.data);
    } catch(e:any) { setError(e.response?.data?.detail || e.message); }
    finally { setLoading(false); }
  };

  const activePort = result ? (view === "sharpe" ? result.max_sharpe : result.min_variance) : null;

  const inp: React.CSSProperties = {
    background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
    padding:"7px 10px", borderRadius:6, fontSize:13, outline:"none", fontFamily:"monospace"
  };

  // Colour scatter points by Sharpe
  const getColor = (sharpe: number) => {
    if (sharpe > 1.5) return C.green;
    if (sharpe > 0.8) return C.teal;
    if (sharpe > 0.3) return C.blue;
    if (sharpe > 0)   return C.amber;
    return C.red;
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',system-ui,sans-serif",padding:20,fontSize:14}}>
      <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16}}>

        {/* Config panel */}
        <div>
          <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Portfolio Assets</div>
            <div style={{padding:"16px 18px"}}>

              {/* Symbol chips */}
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {symbols.map((s,i) => (
                  <div key={s} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",borderRadius:4,border:`1px solid ${COLORS[i%COLORS.length]}`,background:`${COLORS[i%COLORS.length]}18`,fontSize:12,fontFamily:"monospace"}}>
                    <span style={{color:COLORS[i%COLORS.length],fontWeight:500}}>{s}</span>
                    <span onClick={()=>removeSymbol(s)} style={{cursor:"pointer",color:C.dim,fontSize:10,marginLeft:2}}>✕</span>
                  </div>
                ))}
              </div>

              {/* Add symbol */}
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                <input style={{...inp,flex:1}} value={input}
                  onChange={e=>setInput(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==="Enter"&&addSymbol()}
                  placeholder="Add symbol…" />
                <button onClick={addSymbol}
                  style={{background:C.blue,color:"#fff",border:"none",borderRadius:6,padding:"0 12px",fontSize:12,cursor:"pointer",fontWeight:500}}>
                  Add
                </button>
              </div>

              <div style={{fontSize:11,color:C.dim,marginBottom:14}}>{symbols.length}/10 assets · min 2</div>

              {/* Period */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:6,fontWeight:500}}>Period</div>
                <div style={{display:"flex",gap:6}}>
                  {PERIODS.map(p=>(
                    <button key={p} onClick={()=>setPeriod(p)}
                      style={{flex:1,padding:"6px 0",borderRadius:6,fontSize:11,fontWeight:500,cursor:"pointer",
                        border:`1px solid ${period===p?C.blue:C.border}`,
                        background:period===p?"rgba(59,130,246,.15)":"transparent",
                        color:period===p?C.blue:C.muted}}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulations */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:6,fontWeight:500}}>Simulations</div>
                <div style={{display:"flex",gap:6}}>
                  {SIMULATIONS.map(s=>(
                    <button key={s} onClick={()=>setSims(s)}
                      style={{flex:1,padding:"6px 0",borderRadius:6,fontSize:11,fontWeight:500,cursor:"pointer",
                        border:`1px solid ${sims===s?C.blue:C.border}`,
                        background:sims===s?"rgba(59,130,246,.15)":"transparent",
                        color:sims===s?C.blue:C.muted}}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={run} disabled={loading||symbols.length<2}
                style={{background:C.blue,color:"#fff",border:"none",borderRadius:6,padding:"10px 0",
                  fontSize:13,fontWeight:500,cursor:"pointer",width:"100%",
                  opacity:(loading||symbols.length<2)?.6:1}}>
                {loading ? "Optimizing…" : "Optimize Portfolio"}
              </button>

              {error&&<div style={{fontSize:12,color:C.red,marginTop:8}}>{error}</div>}
            </div>
          </div>

          {/* Stock stats */}
          {result?.stock_stats && (
            <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginTop:14}}>
              <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Individual Assets</div>
              <div style={{padding:"8px 0"}}>
                {result.stock_stats.map((s:any,i:number)=>(
                  <div key={s.symbol} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 16px",borderBottom:`1px solid rgba(42,58,82,.3)`}}>
                    <span style={{fontFamily:"monospace",fontWeight:500,fontSize:12,color:COLORS[i%COLORS.length],width:48}}>{s.symbol}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,color:C.muted}}>Ret: <span style={{color:s.return>=0?C.green:C.red,fontFamily:"monospace"}}>{s.return>=0?"+":""}{fmt(s.return)}%</span></div>
                      <div style={{fontSize:11,color:C.muted}}>Vol: <span style={{fontFamily:"monospace",color:C.amber}}>{fmt(s.risk)}%</span></div>
                    </div>
                    <span style={{fontFamily:"monospace",fontSize:11,color:s.sharpe>1?C.green:s.sharpe>0?C.teal:C.red}}>SR: {fmt(s.sharpe)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        <div>
          {!result&&!loading&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:400,gap:10,color:C.muted}}>
              <div style={{fontSize:36}}>🎯</div>
              <div style={{fontSize:15,color:C.text,fontWeight:500}}>Add assets and optimize</div>
              <div style={{fontSize:13}}>Monte Carlo simulation will find the optimal portfolio</div>
            </div>
          )}

          {loading&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:400,gap:10,color:C.muted}}>
              <div style={{fontSize:13}}>Running {sims} Monte Carlo simulations…</div>
              <div style={{fontSize:12}}>This takes 10-20 seconds</div>
            </div>
          )}

          {result&&(
            <>
              {/* Toggle max sharpe / min vol */}
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                <button onClick={()=>setView("sharpe")}
                  style={{padding:"7px 18px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",
                    border:`1px solid ${view==="sharpe"?C.amber:C.border}`,
                    background:view==="sharpe"?"rgba(245,158,11,.15)":"transparent",
                    color:view==="sharpe"?C.amber:C.muted}}>
                  ★ Max Sharpe Ratio
                </button>
                <button onClick={()=>setView("minvol")}
                  style={{padding:"7px 18px",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",
                    border:`1px solid ${view==="minvol"?C.blue:C.border}`,
                    background:view==="minvol"?"rgba(59,130,246,.15)":"transparent",
                    color:view==="minvol"?C.blue:C.muted}}>
                  ◆ Min Volatility
                </button>
                <div style={{marginLeft:"auto",fontSize:12,color:C.dim}}>{result.simulations} portfolios simulated</div>
              </div>

              {/* Optimal portfolio metrics */}
              {activePort&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                  <MCard label="Expected Return" value={(activePort.return>=0?"+":"")+fmt(activePort.return)+"%"} color={activePort.return>=0?C.green:C.red} sub="Annualized" />
                  <MCard label="Volatility (Risk)" value={fmt(activePort.risk)+"%"} color={C.amber} sub="Annualized" />
                  <MCard label="Sharpe Ratio" value={fmt(activePort.sharpe)} color={activePort.sharpe>1?C.green:C.teal} sub="Risk-adjusted return" />
                </div>
              )}

              {/* Optimal weights */}
              {activePort?.weights&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>
                    Optimal Weights — {view==="sharpe"?"Max Sharpe":"Min Volatility"}
                  </div>
                  <div style={{padding:"16px 18px"}}>
                    <div style={{display:"grid",gridTemplateColumns:`repeat(${result.symbols.length},1fr)`,gap:10,marginBottom:14}}>
                      {result.symbols.map((s:string,i:number)=>(
                        <div key={s} style={{textAlign:"center",background:C.bg3,borderRadius:8,padding:"10px 8px",border:`1px solid ${COLORS[i%COLORS.length]}30`}}>
                          <div style={{fontSize:11,fontFamily:"monospace",fontWeight:500,color:COLORS[i%COLORS.length],marginBottom:4}}>{s}</div>
                          <div style={{fontFamily:"monospace",fontSize:20,fontWeight:500,color:C.text}}>{fmt(activePort.weights[s])}%</div>
                        </div>
                      ))}
                    </div>
                    {/* Weight bars */}
                    <div style={{height:8,borderRadius:4,overflow:"hidden",display:"flex"}}>
                      {result.symbols.map((s:string,i:number)=>(
                        <div key={s} style={{width:`${activePort.weights[s]}%`,background:COLORS[i%COLORS.length],transition:"width .5s"}} />
                      ))}
                    </div>
                    <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
                      {result.symbols.map((s:string,i:number)=>(
                        <span key={s} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:C.dim}}>
                          <span style={{width:8,height:8,borderRadius:2,background:COLORS[i%COLORS.length],display:"inline-block"}} />{s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Efficient Frontier scatter */}
              <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{fontSize:13,fontWeight:500}}>Efficient Frontier</div>
                  <div style={{fontSize:11,color:C.dim,marginTop:2}}>Each dot = one simulated portfolio · Color = Sharpe ratio · ★ = optimal</div>
                </div>
                <div style={{padding:"16px 18px"}}>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{top:10,right:10,bottom:10,left:10}}>
                      <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                      <XAxis dataKey="risk" name="Risk (%)" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                        label={{value:"Risk (Volatility %)",position:"insideBottom",offset:-5,fontSize:10,fill:C.dim}} />
                      <YAxis dataKey="return" name="Return (%)" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                        label={{value:"Return (%)",angle:-90,position:"insideLeft",fontSize:10,fill:C.dim}} />
                      <Tooltip cursor={false}
                        contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}
                        formatter={(v:number,n:string)=>[fmt(v)+"%",n]} />
                      <Scatter data={result.all_points} fill={C.blue}>
                        {result.all_points.map((_:any,i:number)=>(
                          <Cell key={i} fill={getColor(result.all_points[i].sharpe)} opacity={0.5} />
                        ))}
                      </Scatter>
                      {/* Max Sharpe point */}
                      <Scatter data={[{risk:result.max_sharpe.risk,return:result.max_sharpe.return}]} fill={C.amber} shape="star" />
                      {/* Min Vol point */}
                      <Scatter data={[{risk:result.min_variance.risk,return:result.min_variance.return}]} fill={C.blue} />
                    </ScatterChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",gap:16,fontSize:11,color:C.dim,marginTop:4,flexWrap:"wrap"}}>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,background:C.green,borderRadius:"50%",display:"inline-block"}} />High Sharpe</span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,background:C.amber,borderRadius:"50%",display:"inline-block"}} />Max Sharpe ★</span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,background:C.blue,borderRadius:"50%",display:"inline-block"}} />Min Volatility ◆</span>
                    <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,background:C.red,borderRadius:"50%",display:"inline-block"}} />Low Sharpe</span>
                  </div>
                </div>
              </div>

              {/* Correlation matrix */}
              {result.corr_matrix&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Correlation Matrix</div>
                  <div style={{padding:"16px 18px",overflowX:"auto"}}>
                    <table style={{borderCollapse:"collapse",fontSize:12,width:"100%"}}>
                      <thead>
                        <tr>
                          <th style={{padding:"6px 10px",color:C.dim,fontWeight:500,fontSize:11}}></th>
                          {result.corr_symbols.map((s:string)=>(
                            <th key={s} style={{padding:"6px 10px",color:C.muted,fontWeight:500,fontSize:11,fontFamily:"monospace"}}>{s}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.corr_symbols.map((s1:string,i:number)=>(
                          <tr key={s1}>
                            <td style={{padding:"6px 10px",fontFamily:"monospace",fontWeight:500,fontSize:11,color:C.muted}}>{s1}</td>
                            {result.corr_matrix[i].map((val:number,j:number)=>{
                              const intensity = Math.abs(val);
                              const bg = val===1 ? "rgba(59,130,246,.3)" :
                                val>0.7 ? `rgba(255,77,109,${intensity*.5})` :
                                val>0.3 ? `rgba(245,158,11,${intensity*.4})` :
                                val<0   ? `rgba(0,208,132,${intensity*.4})` :
                                "transparent";
                              return (
                                <td key={j} style={{padding:"6px 10px",textAlign:"center",fontFamily:"monospace",fontSize:11,background:bg,borderRadius:4,color:C.text}}>
                                  {fmt(val,2)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{fontSize:11,color:C.dim,marginTop:8}}>
                      Red = high positive correlation · Green = negative correlation · Blue = same asset (1.0)
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
