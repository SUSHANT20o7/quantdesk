import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  bg:"#0a0e1a", bg2:"#111827", bg3:"#1a2235",
  border:"#2a3a52", text:"#e2e8f0", muted:"#8fa3bf",
  dim:"#4a6080", green:"#00d084", red:"#ff4d6d",
  blue:"#3b82f6", amber:"#f59e0b", teal:"#14b8a6", purple:"#8b5cf6",
};

// Popular suggestions
const POPULAR = [
  "AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","AMD","INTC","NFLX",
  "JPM","BAC","GS","V","MA","PYPL","JNJ","PFE","XOM","CVX",
  "SPY","QQQ","INFY","WIT","TCS","RELIANCE","BABA","NIO",
];

function fmt(n: number|null|undefined, dec=4) {
  if (n==null) return "—";
  return n.toLocaleString("en-US",{minimumFractionDigits:dec,maximumFractionDigits:dec});
}

function SentimentBadge({label}:{label:string}) {
  const map:Record<string,{bg:string;color:string}> = {
    positive:{bg:"rgba(0,208,132,.15)",  color:C.green},
    negative:{bg:"rgba(255,77,109,.15)", color:C.red},
    neutral: {bg:"rgba(245,158,11,.15)", color:C.amber},
  };
  const s = map[label]||map.neutral;
  return <span style={{background:s.bg,color:s.color,padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:500,textTransform:"capitalize"}}>{label}</span>;
}

function FearGreedMeter({index,label}:{index:number;label:string}) {
  const color = index<20?C.red:index<40?C.amber:index<60?C.muted:index<80?C.teal:C.green;
  return (
    <div style={{padding:"16px",textAlign:"center"}}>
      <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".8px",marginBottom:10,fontWeight:500}}>Fear & Greed Index</div>
      <div style={{position:"relative",height:8,background:C.bg3,borderRadius:4,marginBottom:12,overflow:"visible"}}>
        <div style={{height:"100%",background:`linear-gradient(90deg,${C.red},${C.amber},${C.green})`,borderRadius:4}} />
        <div style={{position:"absolute",top:-3,width:14,height:14,borderRadius:"50%",background:color,border:`2px solid ${C.bg2}`,left:`calc(${Math.min(Math.max(index,2),98)}% - 7px)`}} />
      </div>
      <div style={{fontFamily:"monospace",fontSize:32,fontWeight:500,color,marginBottom:4}}>{index}</div>
      <div style={{fontSize:13,color,fontWeight:500}}>{label}</div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.dim,marginTop:6}}>
        <span>Fear</span><span>Neutral</span><span>Greed</span>
      </div>
    </div>
  );
}

// Search bar with suggestions
function SearchBar({onSearch}:{onSearch:(s:string)=>void}) {
  const [val,     setVal]     = useState("AAPL");
  const [showDrop,setShowDrop]= useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(wrapRef.current&&!wrapRef.current.contains(e.target as Node))setShowDrop(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const filtered = POPULAR.filter(s=>s.startsWith(val.toUpperCase())||s.includes(val.toUpperCase())).slice(0,8);

  const go=(sym?:string)=>{
    const s=(sym||val).trim().toUpperCase();
    if(s){setVal(s);onSearch(s);setShowDrop(false);}
  };

  return (
    <div ref={wrapRef} style={{position:"relative",display:"flex",gap:6}}>
      <div style={{position:"relative",flex:1}}>
        <input value={val}
          onChange={e=>{setVal(e.target.value.toUpperCase());setShowDrop(true);}}
          onFocus={()=>setShowDrop(true)}
          onKeyDown={e=>{if(e.key==="Enter")go();if(e.key==="Escape")setShowDrop(false);}}
          placeholder="Search any stock…"
          style={{width:"100%",background:C.bg3,border:`1px solid ${C.border}`,color:C.text,
            padding:"8px 12px",borderRadius:6,fontSize:13,outline:"none",fontFamily:"monospace"}} />
        {showDrop&&val.length>0&&filtered.length>0&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:999,marginTop:4,
            background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,overflow:"hidden",
            boxShadow:"0 8px 24px rgba(0,0,0,.5)"}}>
            {filtered.map(s=>(
              <div key={s} onClick={()=>go(s)}
                style={{padding:"8px 12px",cursor:"pointer",fontSize:12,fontFamily:"monospace",
                  color:C.text,borderBottom:`1px solid ${C.border}`}}
                onMouseEnter={e=>(e.currentTarget.style.background="rgba(59,130,246,.12)")}
                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                {s}
              </div>
            ))}
          </div>
        )}
      </div>
      <button onClick={()=>go()}
        style={{background:C.blue,color:"#fff",border:"none",borderRadius:6,
          padding:"0 16px",fontSize:12,fontWeight:500,cursor:"pointer"}}>
        Analyze
      </button>
    </div>
  );
}

export default function Sentiment() {
  const [symbol,  setSymbol]  = useState("AAPL");
  const [data,    setData]    = useState<any>(null);
  const [overview,setOverview]= useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string|null>(null);

  useEffect(()=>{
    axios.get(`${API}/api/sentiment/market/overview`)
      .then(r=>setOverview(r.data)).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(!symbol)return;
    setLoading(true);setError(null);setData(null);
    axios.get(`${API}/api/sentiment/${symbol}`)
      .then(r=>setData(r.data))
      .catch(e=>setError(e.response?.data?.detail||e.message))
      .finally(()=>setLoading(false));
  },[symbol]);

  const scoreColor=(s:number)=>s>=0.05?C.green:s<=-0.05?C.red:C.amber;

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans',system-ui,sans-serif",padding:20,fontSize:14}}>

      {/* Search bar */}
      <div style={{marginBottom:16}}>
        <SearchBar onSearch={s=>{setSymbol(s);}} />
      </div>

      {/* Market overview strip */}
      {overview?.stocks&&(
        <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12,overflowX:"auto"}}>
          <div style={{fontSize:11,color:C.dim,fontWeight:600,textTransform:"uppercase",letterSpacing:".8px",flexShrink:0}}>Market</div>
          {overview.stocks.map((s:any)=>(
            <div key={s.symbol} onClick={()=>setSymbol(s.symbol)}
              style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,cursor:"pointer",
                padding:"5px 10px",borderRadius:6,flexShrink:0,
                border:`1px solid ${s.score>=0.05?C.green:s.score<=-0.05?C.red:C.border}30`,
                background:s.score>=0.05?"rgba(0,208,132,.06)":s.score<=-0.05?"rgba(255,77,109,.06)":"transparent"}}>
              <div style={{fontSize:11,fontFamily:"monospace",fontWeight:500}}>{s.symbol}</div>
              <div style={{fontFamily:"monospace",fontSize:12,fontWeight:500,color:scoreColor(s.score)}}>
                {s.score>=0?"+":""}{fmt(s.score,3)}
              </div>
              <SentimentBadge label={s.label} />
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:16}}>

        {/* Left */}
        <div>
          {data&&(
            <>
              <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                <FearGreedMeter index={data.fg_index||50} label={data.fg_label||"Neutral"} />
              </div>

              {data.summary&&data.summary.total>0&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px"}}>
                  <div style={{fontSize:11,color:C.dim,textTransform:"uppercase",letterSpacing:".7px",marginBottom:10,fontWeight:500}}>
                    {symbol} · {data.analyzed} headlines
                  </div>
                  {[["Positive",data.summary.positive,C.green],["Negative",data.summary.negative,C.red],["Neutral",data.summary.neutral,C.amber]].map(([l,v,c]:any)=>(
                    <div key={l} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,fontSize:12}}>
                        <span style={{color:c}}>{l}</span>
                        <span style={{fontFamily:"monospace",color:c}}>{v}</span>
                      </div>
                      <div style={{height:6,background:C.bg3,borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",background:c,borderRadius:3,width:`${(v/data.summary.total)*100}%`,transition:"width .5s"}} />
                      </div>
                    </div>
                  ))}
                  <div style={{marginTop:14,padding:"10px 0",borderTop:`1px solid ${C.border}`,textAlign:"center"}}>
                    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>Aggregate Score</div>
                    <div style={{fontFamily:"monospace",fontSize:26,fontWeight:500,color:scoreColor(data.score)}}>
                      {data.score>=0?"+":""}{fmt(data.score,4)}
                    </div>
                    <div style={{marginTop:6}}><SentimentBadge label={data.label} /></div>
                  </div>
                </div>
              )}
            </>
          )}

          {!data&&!loading&&(
            <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"30px 20px",textAlign:"center",color:C.muted}}>
              <div style={{fontSize:24,marginBottom:8}}>💬</div>
              <div style={{fontSize:13}}>Search any stock to analyze sentiment</div>
            </div>
          )}
        </div>

        {/* Right */}
        <div>
          {loading&&(
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300,color:C.muted,fontSize:13}}>
              Fetching and analyzing {symbol} headlines…
            </div>
          )}

          {error&&<div style={{color:C.red,padding:20,fontSize:13}}>Error: {error}</div>}

          {data&&!loading&&(
            <>
              {/* Sentiment bar chart */}
              {data.trend?.length>1&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontSize:13,fontWeight:500}}>Sentiment per Headline</div>
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>{data.vader_used?"VADER NLP":"Keyword"} scoring · Green = positive · Red = negative</div>
                  </div>
                  <div style={{padding:"16px 18px"}}>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={data.trend}>
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} interval={Math.floor(data.trend.length/5)} />
                        <YAxis domain={[-1,1]} tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} width={35} />
                        <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}
                          formatter={(v:number)=>[fmt(v,4),"Score"]} />
                        <Bar dataKey="score" radius={[2,2,0,0]}>
                          {data.trend.map((_:any,i:number)=>(
                            <Cell key={i} fill={data.trend[i].score>=0.05?C.green:data.trend[i].score<=-0.05?C.red:C.amber} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Market comparison */}
              {overview?.stocks&&(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,marginBottom:14}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`,fontSize:13,fontWeight:500}}>Market Sentiment Comparison</div>
                  <div style={{padding:"16px 18px"}}>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={overview.stocks} layout="vertical">
                        <CartesianGrid stroke={C.border} strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" domain={[-1,1]} tick={{fontSize:10,fill:C.dim}} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="symbol" tick={{fontSize:11,fill:C.muted,fontFamily:"monospace"}} tickLine={false} axisLine={false} width={40} />
                        <Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11}}
                          formatter={(v:number)=>[fmt(v,4),"Score"]} />
                        <Bar dataKey="score" radius={[0,3,3,0]}>
                          {overview.stocks.map((s:any,i:number)=>(
                            <Cell key={i} fill={s.score>=0.05?C.green:s.score<=-0.05?C.red:C.amber} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Headlines */}
              {data.headlines?.length>0?(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8}}>
                  <div style={{padding:"13px 18px",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{fontSize:13,fontWeight:500}}>Headlines — NLP Analysis</div>
                    <div style={{fontSize:11,color:C.dim,marginTop:2}}>{data.vader_used?"VADER NLP":"Keyword-based"} scoring</div>
                  </div>
                  {data.headlines.map((h:any,i:number)=>(
                    <div key={i} style={{padding:"12px 18px",borderBottom:`1px solid rgba(42,58,82,.3)`,display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:4,borderRadius:2,flexShrink:0,alignSelf:"stretch",minHeight:36,
                        background:h.score>=0.05?C.green:h.score<=-0.05?C.red:C.amber}} />
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,color:C.text,marginBottom:5,lineHeight:1.4}}>
                          {h.url?(
                            <a href={h.url} target="_blank" rel="noopener noreferrer"
                              style={{color:C.text,textDecoration:"none"}}
                              onMouseEnter={e=>(e.currentTarget.style.color=C.blue)}
                              onMouseLeave={e=>(e.currentTarget.style.color=C.text)}>
                              {h.title}
                            </a>
                          ):h.title}
                        </div>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:11,color:C.dim}}>{h.publisher}</span>
                          <span style={{fontSize:11,color:C.dim}}>{h.date}</span>
                          <SentimentBadge label={h.label} />
                          <span style={{fontFamily:"monospace",fontSize:11,color:scoreColor(h.score),marginLeft:"auto"}}>
                            {h.score>=0?"+":""}{fmt(h.score,4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ):(
                <div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"40px 20px",textAlign:"center",color:C.muted}}>
                  <div style={{fontSize:24,marginBottom:8}}>📰</div>
                  <div style={{fontSize:13,marginBottom:4}}>No recent headlines found for {symbol}</div>
                  <div style={{fontSize:12}}>Try AAPL, TSLA, NVDA, MSFT or AMZN</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
