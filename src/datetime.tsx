import { useEffect, useState } from "react";
export function WheelDateTime({value,onChange,optional=false}:{value:string;onChange:(value:string)=>void;optional?:boolean}){
  const d=value?new Date(value):new Date(),[enabled,setEnabled]=useState(!optional||!!value);
  const [p,setP]=useState({year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate(),hour:d.getHours(),minute:Math.floor(d.getMinutes()/5)*5});
  useEffect(()=>{if(!enabled)return onChange("");const n=new Date(p.year,p.month-1,p.day,p.hour,p.minute);onChange(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}T${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`)},[p,enabled]);
  const c=[["year",Array.from({length:7},(_,i)=>new Date().getFullYear()-1+i)],["month",Array.from({length:12},(_,i)=>i+1)],["day",Array.from({length:31},(_,i)=>i+1)],["hour",Array.from({length:24},(_,i)=>i)],["minute",Array.from({length:12},(_,i)=>i*5)]] as const;
  return <div className="wheel-datetime-wrap">{optional&&<label className="wheel-enable"><input type="checkbox" checked={enabled} onChange={(e)=>setEnabled(e.target.checked)}/>{enabled?"已设置":"不限制"}</label>}{enabled&&<div className="wheel-datetime">{c.map(([k,v])=><select key={k} aria-label={k} value={p[k]} onChange={(e)=>setP({...p,[k]:Number(e.target.value)})}>{v.map((x)=><option key={x} value={x}>{String(x).padStart(2,"0")}</option>)}</select>)}</div>}</div>;
}
