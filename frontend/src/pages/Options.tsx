import { useState, useEffect } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
  ComposedChart, Area
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  bg:"#0a0e1a", bg2:"#111827", bg3:"#1a2235",
  border:"#2a3a52", text:"#e2e8f0", muted:"#8fa3bf",
  dim:"#4a6080", green:"#00d084", red:"#ff4d6d",
  blue:"#3b82f6", amber:"#f59e0b", teal:"#14b8a6", purple:"#8b5cf6",
};

function fmt(n: number|null|undefined, dec=4) {
  if (n==null) return "—";
  return n.toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}

function GreekCard({label, value, color, desc}: {label:string; value:string; color?:string; desc:string}) {
  return (
    <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <div style={{fontSize:16,fontWeight:500,color:color||C.text,fontFamily:"monospace"}}>{label}</div>
        <div style={{fontFamily:"monospace",fontSize:20,fontWeight:500,color:color||C.text}}>{value}</div>
      </div>
      <div style={{fontSize:11,color:C.dim,lineHeight:1.4}}>{desc}</div>
    </div>
  );
}

function ResultRow({label, value, color}: {label:string; value:string; color?:string}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid rgba(42,58,82,.3)`}}>
      <span style={{fontSize:13,color:C.muted}}>{label}</span>
      <span style={{fontFamily:"monospace",fontSize:13,fontWeight:500,color:color||C.text}}>{value}</span>
    </div>
  );
}

export default function Options() {
  const [spot,       setSpot]       = useState(150);
  const [strike,     setStrike]     = useState(155);
  const [expiry,     setExpiry]     = useState(0.25);
  const [rate,       setRate]       = useState(4.5);
  const [vol,        setVol]        = useState(28);
  const [optType,    setOptType]    = useState<"call"|"put">("call");
  const [result,     setResult]     = useState<any>(null);
  const [payoff,     setPayoff]     = useState<any>(null);
  const [surface,    setSurface]    = useState<any>(null);
  const [ivInput,    setIvInput]    = useState(5.0);
  const [ivResult,   setIvResult]   = useState<number|null>(null);
  const [loading,    setLoading]    = useState(false);

  // Auto-calculate whenever inputs change
  useEffect(() => {
    calculate();
  }, [spot, strike, expiry, rate, vol, optType]);

  const calculate = async () => {
    if (spot<=0||strike<=0||expiry<=0||vol<=0) return;
    setLoading(true);
    try {
      const body = { spot, strike, expiry, rate, volatility: vol, option_type: optType };
      const [priceRes, payoffRes, surfaceRes] = await Promise.all([
        axios.post(`${API}/api/options/price`,   body),
        axios.post(`${API}/api/options/payoff`,  body),
        axios.post(`${API}/api/options/surface`, {spot, rate, volatility:vol, option_type:optType}),
      ]);
      setResult(priceRes.data);
      setPayoff(payoffRes.data);
      setSurface(surfaceRes.data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  const calcIV = async () => {
    try {
      const res = await axios.post(`${API}/api/options/implied-volatility`, {
        spot, strike, expiry, rate, market_price: ivInput, option_type: optType
      });
      setIvResult(res.data.implied_volatility);
    } catch { setIvResult(null); }
  };

  const inp: React.CSSProperties = {
    background:C.bg3, border:`1px solid ${C.border}`, color:C.text,
    padding:"8px 12px", borderRadius:6, fontSize:13, outline:"none",
    width:"100%", fontFamily:"monospace"
  };

  const moneyColor = result?.moneyness === "ITM" ? C.green :
                     result?.moneyness === "OTM" ? C.red : C.amber;

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',system-ui,sans-serif",padding:20,fontSize:14}}>
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16}}>

        {/* Inputs */}
        <div>
          <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
            <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Black-Scholes Inputs</div>
            <div style={{padding:"16px 18px"}}>

              {/* Call / Put toggle */}
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {(["call","put"] as const).map(t=>(
                  <button key={t} onClick={()=>setOptType(t)}
                    style={{flex:1,padding:"8px 0",borderRadius:6,fontSize:12,fontWeight:500,cursor:"pointer",textTransform:"capitalize",
                      border:`1px solid ${optType===t?(t==="call"?C.green:C.red):C.border}`,
                      background:optType===t?(t==="call"?"rgba(0,208,132,.15)":"rgba(255,77,109,.15)"):"transparent",
                      color:optType===t?(t==="call"?C.green:C.red):C.muted}}>
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Input fields */}
              {[
                ["Spot Price (S)", spot, setSpot, 1, "Current stock price"],
                ["Strike Price (K)", strike, setStrike, 1, "Option exercise price"],
                ["Time to Expiry (years)", expiry, setExpiry, 0.01, "0.25 = 3 months"],
                ["Risk-free Rate (%)", rate, setRate, 0.1, "Annual rate e.g. 4.5"],
                ["Volatility / IV (%)", vol, setVol, 0.5, "Annual volatility e.g. 28"],
              ].map(([label, val, setter, step, hint]: any) => (
                <div key={label} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",fontWeight:500}}>{label}</div>
                    <div style={{fontSize:10,color:C.dim}}>{hint}</div>
                  </div>
                  <input style={inp} type="number" value={val} step={step}
                    onChange={e=>setter(parseFloat(e.target.value)||0)} />
                </div>
              ))}
            </div>
          </div>

          {/* IV Calculator */}
          <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
            <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Implied Volatility Solver</div>
            <div style={{padding:"16px 18px"}}>
              <div style={{fontSize:11,color:C.dim,marginBottom:8}}>Enter market price → get implied volatility</div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:4,fontWeight:500}}>Market Price ($)</div>
                <input style={inp} type="number" value={ivInput} step="0.1"
                  onChange={e=>setIvInput(parseFloat(e.target.value)||0)} />
              </div>
              <button onClick={calcIV}
                style={{background:C.purple,color:"#fff",border:"none",borderRadius:6,padding:"8px 0",fontSize:12,fontWeight:500,cursor:"pointer",width:"100%"}}>
                Solve IV
              </button>
              {ivResult!=null&&(
                <div style={{marginTop:10,padding:"10px 12px",background:"rgba(139,92,246,.1)",border:`1px solid rgba(139,92,246,.3)`,borderRadius:6,textAlign:"center"}}>
                  <div style={{fontSize:11,color:C.dim,marginBottom:2}}>Implied Volatility</div>
                  <div style={{fontFamily:"monospace",fontSize:22,fontWeight:500,color:C.purple}}>{fmt(ivResult,2)}%</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {result&&(
            <>
              {/* Price banner */}
              <div style={{background:optType==="call"?"rgba(0,208,132,.08)":"rgba(255,77,109,.08)",
                border:`1px solid ${optType==="call"?C.green:C.red}30`,
                borderRadius:8,padding:"16px 20px",marginBottom:14,
                display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:12,color:C.muted,marginBottom:4}}>{optType.toUpperCase()} Option Price</div>
                  <div style={{fontFamily:"monospace",fontSize:36,fontWeight:500,color:optType==="call"?C.green:C.red}}>
                    ${fmt(result.price,2)}
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{padding:"4px 12px",borderRadius:4,fontSize:12,fontWeight:500,
                    background:`${moneyColor}18`,color:moneyColor,border:`1px solid ${moneyColor}40`,marginBottom:6}}>
                    {result.moneyness}
                  </div>
                  <div style={{fontSize:12,color:C.muted}}>Breakeven: <span style={{fontFamily:"monospace",color:C.text}}>${fmt(result.breakeven,2)}</span></div>
                </div>
              </div>

              {/* Price breakdown */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"13px 16px"}}>
                  <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:8,fontWeight:500}}>Price Breakdown</div>
                  <ResultRow label="Total Premium"  value={"$"+fmt(result.price,2)} />
                  <ResultRow label="Intrinsic Value" value={"$"+fmt(result.intrinsic,2)} color={result.intrinsic>0?C.green:C.dim} />
                  <ResultRow label="Time Value"      value={"$"+fmt(result.time_value,2)} color={C.amber} />
                  <ResultRow label="d1"              value={fmt(result.d1,4)} />
                  <ResultRow label="d2"              value={fmt(result.d2,4)} />
                </div>
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"13px 16px"}}>
                  <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:8,fontWeight:500}}>Key Stats</div>
                  <ResultRow label="Spot / Strike"   value={`$${spot} / $${strike}`} />
                  <ResultRow label="Expiry"          value={`${expiry}y (${Math.round(expiry*365)}d)`} />
                  <ResultRow label="Volatility"      value={`${vol}%`} />
                  <ResultRow label="Risk-free Rate"  value={`${rate}%`} />
                  <ResultRow label="Moneyness"       value={result.moneyness} color={moneyColor} />
                </div>
              </div>

              {/* Greeks */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".8px",marginBottom:10,fontWeight:500}}>The Greeks</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  <GreekCard label="Δ Delta" value={fmt(result.delta,4)} color={C.blue}
                    desc="Price change per $1 move in spot" />
                  <GreekCard label="Γ Gamma" value={fmt(result.gamma,6)} color={C.teal}
                    desc="Rate of change of Delta" />
                  <GreekCard label="Θ Theta" value={fmt(result.theta,4)} color={C.red}
                    desc="Time decay per day (usually negative)" />
                  <GreekCard label="ν Vega"  value={fmt(result.vega,4)} color={C.purple}
                    desc="Price change per 1% volatility move" />
                  <GreekCard label="ρ Rho"   value={fmt(result.rho,4)} color={C.amber}
                    desc="Price change per 1% rate move" />
                  <GreekCard label="λ Lambda" value={fmt(result.lambda,4)} color={C.green}
                    desc="Leverage ratio (elasticity)" />
                </div>
              </div>

              {/* Payoff diagram */}
              {payoff&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontSize:13,fontWeight:500}}>Payoff Diagram at Expiry</div>
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>P&L for option buyer · Premium paid: ${fmt(payoff.premium,2)}</div>
                  </div>
                  <div style={{padding:"16px 18px"}}>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={payoff.data}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="spot" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false}
                          tickFormatter={v=>"$"+v.toFixed(0)} interval={Math.floor(payoff.data.length/6)} />
                        <YAxis tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={55}
                          tickFormatter={v=>"$"+v.toFixed(1)} />
                        <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}
                          labelStyle={{color:C.muted}} labelFormatter={v=>"Spot: $"+v}
                          formatter={(v:number,n:string)=>["$"+fmt(v,2), n==="pnl"?"P&L":n==="bs_price"?"BS Price":"Intrinsic"]} />
                        <ReferenceLine y={0}      stroke={C.border} strokeWidth={1} />
                        <ReferenceLine x={strike} stroke={C.dim}   strokeDasharray="4 4" strokeWidth={1} />
                        <ReferenceLine x={spot}   stroke={C.muted} strokeDasharray="4 4" strokeWidth={1} />
                        <Area type="monotone" dataKey="pnl" stroke={optType==="call"?C.green:C.red}
                          fill={optType==="call"?"rgba(0,208,132,.1)":"rgba(255,77,109,.1)"}
                          strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="bs_price" stroke={C.blue} strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div style={{display:"flex",gap:16,marginTop:6,fontSize:11,color:C.dim}}>
                      <span style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{width:10,height:2,background:optType==="call"?C.green:C.red,display:"inline-block"}} /> P&L at expiry
                      </span>
                      <span style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{width:10,height:2,background:C.blue,display:"inline-block"}} /> BS price now
                      </span>
                      <span style={{display:"flex",alignItems:"center",gap:4,marginLeft:"auto"}}>
                        Dashed vertical = Strike / Current spot
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Greeks surface */}
              {surface&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontSize:13,fontWeight:500}}>Greeks vs Spot Price</div>
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>How each Greek changes as spot price moves</div>
                  </div>
                  <div style={{padding:"16px 18px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                      {[
                        {key:"delta",label:"Delta (Δ)",color:C.blue},
                        {key:"gamma",label:"Gamma (Γ)",color:C.teal},
                        {key:"theta",label:"Theta (Θ)",color:C.red},
                        {key:"vega", label:"Vega (ν)", color:C.purple},
                      ].map(({key,label,color})=>(
                        <div key={key}>
                          <div style={{fontSize:11,color:C.dim,marginBottom:6}}>{label}</div>
                          <ResponsiveContainer width="100%" height={100}>
                            <LineChart data={surface.data}>
                              <XAxis dataKey="spot" hide />
                              <YAxis hide />
                              <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:4,fontSize:10}}
                                formatter={(v:number)=>[fmt(v,4),label]} labelFormatter={v=>"$"+v} />
                              <ReferenceLine x={spot} stroke={C.dim} strokeDasharray="3 3" />
                              <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {!result&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:400,gap:10,color:C.muted}}>
              <div style={{fontSize:36}}>🔢</div>
              <div style={{fontSize:15,color:C.text,fontWeight:500}}>Adjust inputs to price an option</div>
              <div style={{fontSize:13}}>Results update automatically</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
