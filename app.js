const { useState, useEffect, useCallback } = React;


// ═══════════════════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════════════════
const FB_KEY  = "AIzaSyAwiHu-MbKKyA9ZJUKefIrAGEd-suF07KE";
const FB_PROJ = "excel-plumbing-e-ticket";
const AUTH_EP = "https://identitytoolkit.googleapis.com/v1";
const FS_EP   = `https://firestore.googleapis.com/v1/projects/${FB_PROJ}/databases/(default)/documents`;

// ═══════════════════════════════════════════════════════
// FIREBASE REST LAYER
// ═══════════════════════════════════════════════════════
let TOKEN = null;
const H = () => ({ "Content-Type":"application/json", ...(TOKEN?{"Authorization":`Bearer ${TOKEN}`}:{}) });

// Firestore value encode/decode
const enc = v => {
  if (v==null)              return { nullValue: null };
  if (typeof v==="boolean") return { booleanValue: v };
  if (typeof v==="number")  return Number.isInteger(v) ? { integerValue:""+v } : { doubleValue: v };
  if (typeof v==="string")  return { stringValue: v };
  if (Array.isArray(v))     return { arrayValue:{ values: v.map(enc) } };
  if (typeof v==="object")  return { mapValue:{ fields: o2f(v) } };
  return { stringValue:""+v };
};
const dec = v => {
  if (!v) return null;
  if ("nullValue"    in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return parseInt(v.integerValue);
  if ("doubleValue"  in v) return v.doubleValue;
  if ("stringValue"  in v) return v.stringValue;
  if ("arrayValue"   in v) return (v.arrayValue.values||[]).map(dec);
  if ("mapValue"     in v) return f2o(v.mapValue.fields||{});
  return null;
};
const o2f = o => Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined).map(([k,v])=>[k,enc(v)]));
const f2o = f => Object.fromEntries(Object.entries(f).map(([k,v])=>[k,dec(v)]));
const toFS   = o => ({ fields: o2f(o) });
const fromFS = d => ({ ...f2o(d.fields||{}), id: d.name?.split("/").pop() });

const fbSignIn = async (email, pass) => {
  const r = await fetch(`${AUTH_EP}/accounts:signInWithPassword?key=${FB_KEY}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({email, password:pass, returnSecureToken:true}) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message.replace(/_/g," "));
  TOKEN = d.idToken;
  return { uid: d.localId, email: d.email };
};

const fbSignUp = async (email, pass) => {
  const r = await fetch(`${AUTH_EP}/accounts:signUp?key=${FB_KEY}`,
    { method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({email, password:pass, returnSecureToken:true}) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message.replace(/_/g," "));
  return { uid: d.localId };
};

const fsGet  = async (col,id) => { const r=await fetch(`${FS_EP}/${col}/${id}`,{headers:H()}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return fromFS(d); };
const fsSet  = async (col,id,o) => { const r=await fetch(`${FS_EP}/${col}/${id}`,{method:"PATCH",headers:H(),body:JSON.stringify(toFS(o))}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return fromFS(d); };
const fsAdd  = async (col,o) => { const r=await fetch(`${FS_EP}/${col}`,{method:"POST",headers:H(),body:JSON.stringify(toFS(o))}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return fromFS(d); };
const fsList = async col => { const r=await fetch(`${FS_EP}/${col}?pageSize=500`,{headers:H()}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return (d.documents||[]).map(fromFS); };
const fsDel  = async (col,id) => { await fetch(`${FS_EP}/${col}/${id}`,{method:"DELETE",headers:H()}); };

// ═══════════════════════════════════════════════════════
// CONSTANTS & UTILITIES
// ═══════════════════════════════════════════════════════
const STATUSES = {
  open:                { label:"Open",                color:"#374151", bg:"#f9fafb", border:"#d1d5db" },
  dispatched:          { label:"Dispatched",          color:"#0369a1", bg:"#e0f2fe", border:"#7dd3fc" },
  in_progress:         { label:"In Progress",         color:"#1e40af", bg:"#eff6ff", border:"#93c5fd" },
  awaiting_supervisor: { label:"Awaiting Supervisor", color:"#92400e", bg:"#fffbeb", border:"#fbbf24" },
  awaiting_accounting: { label:"Awaiting Accounting", color:"#5b21b6", bg:"#f5f3ff", border:"#c4b5fd" },
  closed:              { label:"Closed",              color:"#065f46", bg:"#ecfdf5", border:"#6ee7b7" },
};
const SERVICES = ["Plumbing Repair","Heating Repair","Boiler Service","New Installation",
  "Preventive Maintenance","Emergency Call","Inspection & Report","Drain Cleaning",
  "Water Heater Service","Gas Line","Other"];
const P_COLOR = { Routine:"#059669", Urgent:"#d97706", Emergency:"#dc2626" };

const fmt$    = n => `$${parseFloat(n||0).toFixed(2)}`;
const fmtHrs  = n => `${parseFloat(n||0).toFixed(1)} hrs`;
const fmtDate = d => d ? new Date(d+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";
const todayISO  = () => new Date().toISOString().split("T")[0];
const nowStamp  = () => new Date().toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"});
const genWO     = () => `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
const getMondayOf = d => { const dt=new Date(d+"T12:00:00"); const diff=dt.getDay()===0?-6:1-dt.getDay(); dt.setDate(dt.getDate()+diff); return dt.toISOString().split("T")[0]; };
const addDays   = (d,n) => { const dt=new Date(d+"T12:00:00"); dt.setDate(dt.getDate()+n); return dt.toISOString().split("T")[0]; };
const fmtWeek   = m => { const s=new Date(m+"T12:00:00"); const e=new Date(addDays(m,6)+"T12:00:00"); const o={month:"short",day:"numeric"}; return `${s.toLocaleDateString("en-US",o)} – ${e.toLocaleDateString("en-US",o)}, ${e.getFullYear()}`; };

const calcTotals = (o={}) => {
  const { materials=[], laborLines1=[], laborLines2=[], laborHours=0, laborRate=0, laborHours2=0, laborRate2=0 } = o;
  const mat  = materials.reduce((s,m)=>s+(parseFloat(m.qty)||0)*(parseFloat(m.unitPrice)||0),0);
  // Support both new (laborLines arrays) and legacy (single hours/rate) format
  const lab1 = laborLines1.length>0
    ? laborLines1.reduce((s,l)=>s+(parseFloat(l.hours)||0)*(parseFloat(l.rate)||0),0)
    : (parseFloat(laborHours)||0)*(parseFloat(laborRate)||0);
  const lab2 = laborLines2.length>0
    ? laborLines2.reduce((s,l)=>s+(parseFloat(l.hours)||0)*(parseFloat(l.rate)||0),0)
    : (parseFloat(laborHours2)||0)*(parseFloat(laborRate2)||0);
  const lab  = lab1+lab2;
  const tax  = o.applyTax!==false ? mat*0.08 : 0;
  return { mat, lab1, lab2, lab, tax, sub:mat+lab, total:mat+lab+tax };
};

const blankOrder = () => ({
  woNumber:genWO(), status:"open", priority:"Routine", serviceType:"Plumbing Repair",
  jobName:"",
  createdDate:todayISO(), scheduledDate:todayISO(), createdBy:"", customerName:"",
  customerPhone:"", customerEmail:"", customerAddress:"", jobLocation:"",
  description:"", assignedTech:"", tech2Name:"", workPerformed:"", materials:[],
  applyTax:true,
  laborLines1:[{id:1,description:"",hours:"",rate:"120"}],
  laborLines2:[],
  dispatchedTo:"", dispatchedAt:"", dispatchNotes:"",
  techSigned:false, techSignedBy:"", techSignedAt:"",
  supervisorNotes:"", supervisorSigned:false, supervisorSignedBy:"", supervisorSignedAt:"",
  accountingNotes:"", accountingClosedBy:"", accountingClosedAt:"",
});

// Default team data stored in Firestore config
const DEFAULT_CONFIG = {
  roster: ["Aaron Morris","Ben Rath","Chase Spencer","Mark Easterling"],
  supervisors: ["Eric Braaten","Ryan Raisenan"],
  accountingStaff: ["Ginger Garrett"],
};

// ═══════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════
const Badge  = ({ status }) => { const c=STATUSES[status]||STATUSES.open; return <span style={{padding:"2px 10px",borderRadius:999,fontSize:11,fontWeight:700,color:c.color,background:c.bg,border:`1px solid ${c.border}`}}>{c.label}</span>; };
const PBadge = ({ priority }) => <span style={{fontSize:12,fontWeight:700,color:P_COLOR[priority]||"#374151",display:"inline-flex",alignItems:"center",gap:4}}><span style={{width:7,height:7,borderRadius:"50%",background:P_COLOR[priority]||"#374151",display:"inline-block"}}/>{priority}</span>;
const Lbl = ({ children }) => <label style={{display:"block",fontSize:11,fontWeight:700,color:"#6b7280",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{children}</label>;
const iSt = { width:"100%",padding:"9px 12px",border:"1px solid #d1d5db",borderRadius:8,fontSize:14,fontFamily:"inherit",color:"#111827",background:"white",boxSizing:"border-box" };
const Inp  = ({ label, ...p }) => <div style={{marginBottom:14}}>{label&&<Lbl>{label}</Lbl>}<input style={iSt} {...p}/></div>;
const Sel  = ({ label, options, ...p }) => <div style={{marginBottom:14}}>{label&&<Lbl>{label}</Lbl>}<select style={iSt} {...p}>{options.map(o=><option key={o} value={o}>{o}</option>)}</select></div>;
const Txt  = ({ label, ...p }) => <div style={{marginBottom:14}}>{label&&<Lbl>{label}</Lbl>}<textarea style={{...iSt,resize:"vertical",minHeight:80}} {...p}/></div>;
const vMap = { primary:{background:"#f47c00",color:"white",border:"none"}, navy:{background:"#0f2640",color:"white",border:"none"}, outline:{background:"white",color:"#374151",border:"1px solid #d1d5db"}, success:{background:"#059669",color:"white",border:"none"}, purple:{background:"#6d28d9",color:"white",border:"none"}, sky:{background:"#0369a1",color:"white",border:"none"}, red:{background:"#dc2626",color:"white",border:"none"} };
const Btn  = ({ children, variant="primary", small, style={}, ...p }) => <button style={{...vMap[variant],padding:small?"6px 14px":"9px 20px",borderRadius:8,cursor:p.disabled?"not-allowed":"pointer",fontSize:small?12:14,fontWeight:700,fontFamily:"inherit",opacity:p.disabled?0.5:1,...style}} {...p}>{children}</button>;
const SecHead = ({ children }) => <div style={{fontSize:11,fontWeight:800,color:"#0f2640",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:"2px solid #f47c00",paddingBottom:5,marginBottom:16,display:"inline-block"}}>{children}</div>;
const InfoRow = ({ label, value }) => <div style={{display:"flex",gap:8,marginBottom:8,fontSize:14}}><span style={{color:"#6b7280",fontWeight:600,minWidth:130,flexShrink:0}}>{label}</span><span style={{color:"#111827"}}>{value||"—"}</span></div>;
const HR = () => <div style={{borderBottom:"1px solid #f3f4f6"}}/>;
const Spinner = () => <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40,color:"#9ca3af",fontSize:14}}>Loading…</div>;
const Err = ({ msg }) => msg ? <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#dc2626",marginBottom:14}}>{msg}</div> : null;

const TotalsBox = ({ t, applyTax=true }) => (
  <div style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,padding:"14px 18px",maxWidth:320,marginLeft:"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280",marginBottom:5}}><span>Materials</span><span>{fmt$(t.mat)}</span></div>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280",marginBottom:5}}><span>Labor</span><span>{fmt$(t.lab)}</span></div>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280",borderTop:"1px solid #e5e7eb",paddingTop:6,marginBottom:5}}><span>Subtotal</span><span>{fmt$(t.sub)}</span></div>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:5,
      color:applyTax?"#6b7280":"#9ca3af",fontStyle:applyTax?"normal":"italic"}}>
      <span>{applyTax?"Tax (8% on materials)":"No Sales Tax"}</span>
      <span>{applyTax?fmt$(t.tax):"$0.00"}</span>
    </div>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:17,fontWeight:900,color:"#0f2640",borderTop:"2px solid #0f2640",paddingTop:8}}><span>TOTAL</span><span>{fmt$(t.total)}</span></div>
  </div>
);

const MatTable = ({ materials=[], onUpdate }) => {
  const [row, setRow]     = useState({description:"",qty:"",unitPrice:""});
  const [editId, setEditId] = useState(null);
  const [editVals, setEditVals] = useState({});

  const add = () => {
    if(!row.description) return;
    onUpdate([...materials,{...row,id:Date.now()}]);
    setRow({description:"",qty:"",unitPrice:""});
  };

  const startEdit = (m) => {
    setEditId(m.id);
    setEditVals({description:m.description,qty:m.qty,unitPrice:m.unitPrice});
  };

  const saveEdit = () => {
    onUpdate(materials.map(m=>m.id===editId?{...m,...editVals}:m));
    setEditId(null);
  };

  const cellSt = {padding:"6px 8px"};
  const inpSt  = {...iSt,padding:"5px 8px",fontSize:13};

  return (<>
    {materials.length>0 && (
      <div style={{overflowX:"auto",marginBottom:14}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:420}}>
          <thead>
            <tr style={{background:"#f9fafb"}}>
              {["Description","Qty","Unit Price","Line Total",""].map(h=>(
                <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,color:"#6b7280",fontSize:10,textTransform:"uppercase"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {materials.map(m=>{
              const lt=(parseFloat(m.qty)||0)*(parseFloat(m.unitPrice)||0);
              const isEditing = editId===m.id;
              return (
                <tr key={m.id} style={{borderTop:"1px solid #f3f4f6",background:isEditing?"#fffbeb":"white"}}>
                  <td style={cellSt}>
                    {isEditing
                      ? <input style={{...inpSt,minWidth:160}} value={editVals.description} onChange={e=>setEditVals(p=>({...p,description:e.target.value}))}/>
                      : m.description}
                  </td>
                  <td style={cellSt}>
                    {isEditing
                      ? <input type="number" style={{...inpSt,width:60}} value={editVals.qty} onChange={e=>setEditVals(p=>({...p,qty:e.target.value}))}/>
                      : m.qty}
                  </td>
                  <td style={cellSt}>
                    {isEditing
                      ? <input type="number" style={{...inpSt,width:80}} value={editVals.unitPrice} onChange={e=>setEditVals(p=>({...p,unitPrice:e.target.value}))}/>
                      : fmt$(m.unitPrice)}
                  </td>
                  <td style={{...cellSt,fontWeight:700}}>
                    {isEditing
                      ? fmt$((parseFloat(editVals.qty)||0)*(parseFloat(editVals.unitPrice)||0))
                      : fmt$(lt)}
                  </td>
                  <td style={{...cellSt,whiteSpace:"nowrap"}}>
                    {isEditing ? (
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={saveEdit} style={{background:"#059669",border:"none",borderRadius:5,color:"white",cursor:"pointer",padding:"3px 9px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✓</button>
                        <button onClick={()=>setEditId(null)} style={{background:"none",border:"1px solid #d1d5db",borderRadius:5,color:"#6b7280",cursor:"pointer",padding:"3px 9px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✕</button>
                      </div>
                    ):(
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>startEdit(m)} style={{background:"none",border:"1px solid #93c5fd",borderRadius:5,color:"#1e40af",cursor:"pointer",padding:"3px 9px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✎</button>
                        <button onClick={()=>onUpdate(materials.filter(x=>x.id!==m.id))} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 4px"}}>✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,alignItems:"end"}}>
      <Inp label="Material / Part" value={row.description} placeholder='e.g. Copper pipe ½"' onChange={e=>setRow(p=>({...p,description:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&add()}/>
      <Inp label="Qty" type="number" value={row.qty} placeholder="1" onChange={e=>setRow(p=>({...p,qty:e.target.value}))}/>
      <Inp label="Unit Price $" type="number" value={row.unitPrice} placeholder="0.00" onChange={e=>setRow(p=>({...p,unitPrice:e.target.value}))}/>
      <div style={{marginBottom:14}}><Btn small onClick={add}>+ Add</Btn></div>
    </div>
  </>);
};

// Labor line item table for one technician
const LaborLines = ({ lines=[], defaultRate="120", onChange }) => {
  const addLine = () => onChange([...lines, {id:Date.now(), description:"", hours:"", rate:defaultRate}]);
  const removeLine = (id) => onChange(lines.filter(l=>l.id!==id));
  const setLine = (id,k,v) => onChange(lines.map(l=>l.id===id?{...l,[k]:v}:l));
  const subtotal = lines.reduce((s,l)=>s+(parseFloat(l.hours)||0)*(parseFloat(l.rate)||0),0);
  return (
    <div>
      {lines.length>0 && (
        <div style={{overflowX:"auto",marginBottom:10}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:420}}>
            <thead>
              <tr style={{background:"#f9fafb"}}>
                {["Day / Description","Hours","Rate ($/hr)","Line Total",""].map(h=>(
                  <th key={h} style={{padding:"7px 10px",textAlign:"left",fontWeight:700,color:"#6b7280",fontSize:10,textTransform:"uppercase"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map(l=>{
                const lt=(parseFloat(l.hours)||0)*(parseFloat(l.rate)||0);
                return (
                  <tr key={l.id} style={{borderTop:"1px solid #f3f4f6"}}>
                    <td style={{padding:"6px 8px"}}>
                      <input style={{...iSt,padding:"6px 8px",fontSize:13}} value={l.description} placeholder="e.g. Day 1 - Monday" onChange={e=>setLine(l.id,"description",e.target.value)}/>
                    </td>
                    <td style={{padding:"6px 8px"}}>
                      <input style={{...iSt,padding:"6px 8px",fontSize:13,width:70}} type="number" value={l.hours} placeholder="0.0" onChange={e=>setLine(l.id,"hours",e.target.value)}/>
                    </td>
                    <td style={{padding:"6px 8px"}}>
                      <input style={{...iSt,padding:"6px 8px",fontSize:13,width:80}} type="number" value={l.rate} placeholder={defaultRate} onChange={e=>setLine(l.id,"rate",e.target.value)}/>
                    </td>
                    <td style={{padding:"6px 10px",fontWeight:700,color:"#0f2640",whiteSpace:"nowrap"}}>{fmt$(lt)}</td>
                    <td style={{padding:"6px 8px"}}>
                      <button onClick={()=>removeLine(l.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16,padding:0}}>✕</button>
                    </td>
                  </tr>
                );
              })}
              {lines.length>0 && (
                <tr style={{background:"#f0f9ff",borderTop:"2px solid #93c5fd"}}>
                  <td colSpan={3} style={{padding:"7px 10px",fontWeight:800,color:"#1e40af",fontSize:12,textTransform:"uppercase"}}>Total</td>
                  <td style={{padding:"7px 10px",fontWeight:900,color:"#1e40af"}}>{fmt$(subtotal)}</td>
                  <td/>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <Btn small variant="outline" onClick={addLine}>+ Add {lines.length===0?"Labor Line":"Another Day"}</Btn>
    </div>
  );
};

const LaborPanel = ({ data, onChange }) => {
  const set = (k,v) => onChange({...data,[k]:v});
  const t = calcTotals(data);
  const lines1 = data.laborLines1||[];
  const lines2 = data.laborLines2||[];
  return (<>
    <div style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:"14px 16px",marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:800,color:"#0f2640",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Technician 1</div>
      <Inp label="Tech 1 Name" value={data.assignedTech||""} placeholder="Full name" onChange={e=>set("assignedTech",e.target.value)}/>
      <LaborLines lines={lines1} defaultRate="120" onChange={v=>set("laborLines1",v)}/>
    </div>
    <div style={{background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:8,padding:"14px 16px",marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:800,color:"#0f2640",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>
        Technician 2 <span style={{fontWeight:400,color:"#9ca3af",textTransform:"none",fontSize:11,letterSpacing:0}}>(optional)</span>
      </div>
      <Inp label="Tech 2 Name" value={data.tech2Name||""} placeholder="Full name" onChange={e=>set("tech2Name",e.target.value)}/>
      <LaborLines lines={lines2} defaultRate="80" onChange={v=>set("laborLines2",v)}/>
    </div>
    <TotalsBox t={t} applyTax={data.applyTax!==false}/>
  </>);
};

// ═══════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════
const LoginScreen = ({ onLogin, onSetup }) => {
  const SAVED_KEY = "excel_plumbing_saved_login";
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED_KEY)||"{}"); } catch{ return {}; } })();
  const [email, setEmail]     = useState(saved.email||"");
  const [pass, setPass]       = useState(saved.pass||"");
  const [remember, setRemember] = useState(!!saved.email);
  const [err, setErr]         = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setErr(""); setLoading(true);
    try {
      if (remember) { localStorage.setItem(SAVED_KEY, JSON.stringify({email,pass})); }
      else { localStorage.removeItem(SAVED_KEY); }
      const auth = await fbSignIn(email, pass);
      const profile = await fsGet("users", auth.uid);
      onLogin({ uid: auth.uid, ...profile });
    } catch(e) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#091929 0%,#1a3a5c 100%)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:16,width:"100%",maxWidth:400,overflow:"hidden",boxShadow:"0 25px 60px rgba(0,0,0,0.4)"}}>
        <div style={{background:"linear-gradient(135deg,#091929,#1a3a5c)",padding:"32px 32px 24px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#f47c00",fontWeight:800,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:6}}>⚙ Work Order System</div>
          <div style={{fontSize:22,fontWeight:900,color:"white",lineHeight:1.2}}>EXCEL PLUMBING<br/>& HEATING LLC</div>
        </div>
        <div style={{padding:"28px 32px"}}>
          <div style={{fontSize:16,fontWeight:700,color:"#0f2640",marginBottom:20,textAlign:"center"}}>Sign In</div>
          <Err msg={err}/>
          <Inp label="Email Address" type="email" value={email} placeholder="you@example.com" onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <Inp label="Password" type="password" value={pass} placeholder="••••••••" onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:16,fontSize:14,color:"#374151"}}>
            <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
            Remember me on this device
          </label>
          <Btn style={{width:"100%",justifyContent:"center"}} onClick={handleLogin} disabled={loading||!email||!pass}>
            {loading ? "Signing in…" : "Sign In →"}
          </Btn>
          <div style={{textAlign:"center",marginTop:20}}>
            <button onClick={onSetup} style={{background:"none",border:"none",color:"#9ca3af",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
              First time setup / Add employee accounts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// SETUP SCREEN — Create employee accounts
// ═══════════════════════════════════════════════════════
const TEAM_SETUP = [
  { name:"Mark Easterling",  role:"tech" },
  { name:"Chase Spencer",    role:"tech" },
  { name:"Ben Rath",         role:"tech" },
  { name:"Aaron Morris",     role:"tech" },
  { name:"Eric Braaten",     role:"supervisor" },
  { name:"Ryan Raisenan",    role:"supervisor" },
  { name:"Ginger Garrett",   role:"accounting" },
];

const ROLE_COLORS = { tech:"#0f2640", supervisor:"#92400e", accounting:"#5b21b6" };

const SetupScreen = ({ onBack }) => {
  const [members, setMembers] = useState(TEAM_SETUP.map(m=>({...m,email:"",pass:"Excel2025!",status:""})));
  const [creating, setCreating] = useState(false);

  const setField = (i,k,v) => setMembers(ms=>ms.map((m,idx)=>idx===i?{...m,[k]:v}:m));

  const createAll = async () => {
    setCreating(true);
    for (let i=0; i<members.length; i++) {
      const m = members[i];
      if (!m.email || m.status==="✓ Created") continue;
      setField(i,"status","Creating…");
      try {
        const { uid } = await fbSignUp(m.email, m.pass);
        await fsSet("users", uid, { name:m.name, email:m.email, role:m.role });
        setField(i,"status","✓ Created");
      } catch(e) {
        setField(i,"status","✗ "+e.message.slice(0,30));
      }
    }
    // Save team config to Firestore
    try { await fsSet("config","team", DEFAULT_CONFIG); } catch{}
    setCreating(false);
  };

  const createOne = async (i) => {
    const m = members[i];
    if(!m.email) return;
    setField(i,"status","Creating…");
    try {
      const { uid } = await fbSignUp(m.email, m.pass);
      await fsSet("users", uid, { name:m.name, email:m.email, role:m.role });
      setField(i,"status","✓ Created");
    } catch(e) { setField(i,"status","✗ "+e.message.slice(0,40)); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#e8edf4",padding:20}}>
      <div style={{maxWidth:700,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit"}}>← Back to Login</button>
          <span style={{fontSize:20,fontWeight:900,color:"#0f2640"}}>First Time Setup</span>
        </div>
        <div style={{background:"#eff6ff",border:"1px solid #93c5fd",borderRadius:8,padding:"12px 16px",marginBottom:20,fontSize:13,color:"#1e40af",fontWeight:600}}>
          📋 Enter each team member's email address, then click "Create Account." Default password is Excel2025! — they can change it later.
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {members.map((m,i)=>(
            <div key={i} style={{background:"white",borderRadius:10,padding:"14px 18px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:ROLE_COLORS[m.role],color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>
                  {m.name.split(" ").map(w=>w[0]).join("").slice(0,2)}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#0f2640"}}>{m.name}</div>
                  <div style={{fontSize:11,color:ROLE_COLORS[m.role],fontWeight:700,textTransform:"capitalize"}}>{m.role}</div>
                </div>
                {m.status && <span style={{fontSize:12,fontWeight:700,color:m.status.startsWith("✓")?"#059669":m.status.startsWith("✗")?"#dc2626":"#6b7280"}}>{m.status}</span>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:8,alignItems:"end"}}>
                <Inp label="Email" type="email" value={m.email} placeholder={`${m.name.split(" ")[0].toLowerCase()}@yourcompany.com`} onChange={e=>setField(i,"email",e.target.value)}/>
                <Inp label="Password" type="text" value={m.pass} onChange={e=>setField(i,"pass",e.target.value)}/>
                <div style={{marginBottom:14}}><Btn small variant="sky" onClick={()=>createOne(i)} disabled={!m.email||creating}>Create</Btn></div>
              </div>
            </div>
          ))}
        </div>
        <Btn variant="navy" onClick={createAll} disabled={creating} style={{width:"100%",justifyContent:"center"}}>
          {creating ? "Creating accounts…" : "Create All Accounts at Once"}
        </Btn>
        <div style={{marginTop:14,fontSize:12,color:"#6b7280",textAlign:"center"}}>
          After creating accounts, go back to login and sign in with each person's email and password.
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// WEEKLY HOURS REPORT
// ═══════════════════════════════════════════════════════
const WeeklyReport = ({ orders, onBack }) => {
  const [wk, setWk] = useState(getMondayOf(todayISO()));
  const we = addDays(wk,6);
  const jobs = orders.filter(o=>{ const d=o.scheduledDate||o.createdDate; return d&&d>=wk&&d<=we; });
  const emp = {};
  const addE = (name,hours,rate,job) => {
    const h=parseFloat(hours)||0; if(!name?.trim()||h===0) return;
    const k=name.trim(); if(!emp[k]) emp[k]={hours:0,pay:0,jobs:[]};
    emp[k].hours+=h; emp[k].pay+=h*(parseFloat(rate)||0);
    emp[k].jobs.push({woNumber:job.woNumber,date:job.scheduledDate,hours:h,rate:parseFloat(rate)||0,customer:job.customerName||"(No customer)",service:job.serviceType,status:job.status});
  };
  jobs.forEach(o=>{
    // Support both new (laborLines) and legacy (single hours/rate) format
    const tot1 = (o.laborLines1||[]).length>0 ? (o.laborLines1||[]).reduce((s,l)=>s+(parseFloat(l.hours)||0),0) : (parseFloat(o.laborHours)||0);
    const rate1 = (o.laborLines1||[]).length>0 ? ((o.laborLines1||[])[0]?.rate||"120") : (o.laborRate||"120");
    const tot2 = (o.laborLines2||[]).length>0 ? (o.laborLines2||[]).reduce((s,l)=>s+(parseFloat(l.hours)||0),0) : (parseFloat(o.laborHours2)||0);
    const rate2 = (o.laborLines2||[]).length>0 ? ((o.laborLines2||[])[0]?.rate||"80") : (o.laborRate2||"80");
    addE(o.assignedTech, tot1, rate1, o);
    addE(o.tech2Name, tot2, rate2, o);
  });
  const emps = Object.entries(emp).sort((a,b)=>a[0].localeCompare(b[0]));
  const totalH = emps.reduce((s,[,e])=>s+e.hours,0);
  const totalP = emps.reduce((s,[,e])=>s+e.pay,0);
  const [exp, setExp] = useState({});

  const bar = h => { const pct=Math.min(h/40,1); const c=h>40?"#dc2626":h>=32?"#059669":"#f47c00";
    return <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
      <div style={{flex:1,height:8,background:"#e5e7eb",borderRadius:4,overflow:"hidden"}}><div style={{width:`${pct*100}%`,height:"100%",background:c,borderRadius:4}}/></div>
      <span style={{fontSize:12,fontWeight:700,color:c,minWidth:40,textAlign:"right"}}>{fmtHrs(h)}</span>
    </div>;
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit",padding:0}}>← Back</button>
        <span style={{fontSize:22,fontWeight:900,color:"#0f2640"}}>📊 Weekly Hours Report</span>
      </div>
      <div style={{background:"white",borderRadius:12,padding:"16px 20px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div><div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Week of</div><div style={{fontSize:18,fontWeight:900,color:"#0f2640"}}>{fmtWeek(wk)}</div></div>
        <div style={{display:"flex",gap:8}}><Btn variant="outline" small onClick={()=>setWk(addDays(wk,-7))}>← Prev</Btn><Btn variant="outline" small onClick={()=>setWk(getMondayOf(todayISO()))}>This Week</Btn><Btn variant="outline" small onClick={()=>setWk(addDays(wk,7))}>Next →</Btn></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
        {[["Active Employees",emps.length,"#0f2640"],["Total Hours",fmtHrs(totalH),"#1e40af"],["Total Labor Cost",fmt$(totalP),"#065f46"]].map(([l,v,c])=>(
          <div key={l} style={{background:"white",borderRadius:10,padding:"14px 18px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div>
            <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>{l}</div>
          </div>
        ))}
      </div>
      {emps.length===0 ? <div style={{background:"white",borderRadius:12,padding:"48px 20px",textAlign:"center",color:"#9ca3af"}}><div style={{fontSize:40,marginBottom:10}}>📋</div><div style={{fontSize:15,fontWeight:700,color:"#374151",marginBottom:4}}>No hours logged this week</div></div> : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {emps.map(([name,e])=>(
            <div key={name} style={{background:"white",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",overflow:"hidden"}}>
              <div onClick={()=>setExp(p=>({...p,[name]:!p[name]}))} style={{padding:"14px 20px",display:"flex",alignItems:"center",gap:16,cursor:"pointer",flexWrap:"wrap"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0f2640,#1a3a5c)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,flexShrink:0}}>{name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}</div>
                <div style={{flex:1,minWidth:160}}><div style={{fontSize:15,fontWeight:800,color:"#0f2640",marginBottom:6}}>{name}</div>{bar(e.hours)}</div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:16,fontWeight:900,color:"#059669"}}>{fmt$(e.pay)}</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{e.jobs.length} job{e.jobs.length!==1?"s":""}</div></div>
                <div style={{fontSize:18,color:"#9ca3af"}}>{exp[name]?"▲":"▼"}</div>
              </div>
              {exp[name] && <div style={{borderTop:"1px solid #f3f4f6"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr style={{background:"#f9fafb"}}>{["WO#","Date","Customer","Hours","Rate","Pay","Status"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontWeight:700,color:"#6b7280",fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {e.jobs.map((j,i)=><tr key={i} style={{borderTop:"1px solid #f3f4f6"}}><td style={{padding:"9px 12px",fontWeight:700,color:"#0f2640"}}>{j.woNumber}</td><td style={{padding:"9px 12px"}}>{fmtDate(j.date)}</td><td style={{padding:"9px 12px"}}>{j.customer}</td><td style={{padding:"9px 12px",fontWeight:700}}>{fmtHrs(j.hours)}</td><td style={{padding:"9px 12px"}}>{fmt$(j.rate)}/hr</td><td style={{padding:"9px 12px",fontWeight:700,color:"#059669"}}>{fmt$(j.hours*j.rate)}</td><td style={{padding:"9px 12px"}}><Badge status={j.status}/></td></tr>)}
                    <tr style={{background:"#f0f9ff",borderTop:"2px solid #93c5fd"}}><td colSpan={3} style={{padding:"9px 12px",fontWeight:800,color:"#1e40af",fontSize:12,textTransform:"uppercase"}}>Totals</td><td style={{padding:"9px 12px",fontWeight:900,color:"#1e40af"}}>{fmtHrs(e.hours)}</td><td/><td style={{padding:"9px 12px",fontWeight:900,color:"#059669"}}>{fmt$(e.pay)}</td><td/></tr>
                  </tbody>
                </table>
                {e.hours>40 && <div style={{padding:"10px 20px",background:"#fef2f2",borderTop:"1px solid #fecaca",fontSize:13,color:"#dc2626",fontWeight:700}}>⚠️ Overtime: {fmtHrs(e.hours-40)} over 40 hrs</div>}
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// TEAM VIEW
// ═══════════════════════════════════════════════════════
const TeamView = ({ config, onUpdate, onBack }) => {
  const ROLE_MAP = { roster:"tech", supervisors:"supervisor", accountingStaff:"accounting" };
  const blankNew = { name:"", email:"", pass:"Excel2025!", status:"" };
  const [adding, setAdding] = useState({ roster:false, supervisors:false, accountingStaff:false });
  const [newPerson, setNewPerson] = useState({ roster:{...blankNew}, supervisors:{...blankNew}, accountingStaff:{...blankNew} });

  const toggleAdd = field => setAdding(p=>({...p,[field]:!p[field]}));

  const createPerson = async field => {
    const p = newPerson[field];
    if(!p.name.trim()||!p.email.trim()) return;
    setNewPerson(prev=>({...prev,[field]:{...prev[field],status:"Creating…"}}));
    try {
      try {
        const res = await fbSignUp(p.email.trim(), p.pass);
        await fsSet("users", res.uid, { name:p.name.trim(), email:p.email.trim(), role:ROLE_MAP[field] });
      } catch(signUpErr) {
        // If email already exists just skip account creation and add to roster anyway
        const msg = signUpErr.message.toUpperCase();
        if(!msg.includes("EMAIL") && !msg.includes("EXIST") && !msg.includes("USE") && !msg.includes("TAKEN")) {
          throw signUpErr;
        }
        // Email exists — silently continue and just add to roster
      }
      const updated = {...config,[field]:[...(config[field]||[]),p.name.trim()].sort()};
      await onUpdate(updated);
      setNewPerson(prev=>({...prev,[field]:{...blankNew}}));
      setAdding(prev=>({...prev,[field]:false}));
    } catch(e) {
      setNewPerson(prev=>({...prev,[field]:{...prev[field],status:"✗ "+e.message.slice(0,40)}}));
    }
  };

  const remove = async (field,name) => {
    if(!window.confirm(`Remove ${name} from the team roster? This does not delete their login.`)) return;
    await onUpdate({...config,[field]:config[field].filter(r=>r!==name)});
  };

  const sections = [
    { field:"roster",         label:"Technicians",  bg:"#f0f4ff", border:"#c7d2fe", tag:"tech",       tagColor:"#1e40af", tagBg:"#e0e7ff" },
    { field:"supervisors",    label:"Supervisors",  bg:"#fffbeb", border:"#fde68a", tag:"supervisor", tagColor:"#92400e", tagBg:"#fef3c7" },
    { field:"accountingStaff",label:"Accounting",   bg:"#f5f3ff", border:"#ddd6fe", tag:"accounting", tagColor:"#5b21b6", tagBg:"#ede9fe" },
  ];

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit",padding:0}}>← Back</button>
        <span style={{fontSize:22,fontWeight:900,color:"#0f2640"}}>👷 Team Management</span>
      </div>
      {sections.map(({field,label,bg,border,tag,tagColor,tagBg})=>(
        <div key={field} style={{background:"white",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",overflow:"hidden",marginBottom:14}}>
          <div style={{padding:"16px 24px",background:"#f9fafb",borderBottom:"1px solid #f0f0f0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <SecHead>{label} ({(config[field]||[]).length})</SecHead>
            <Btn small onClick={()=>toggleAdd(field)}>+ Add {label.slice(0,-1)}</Btn>
          </div>
          <div style={{padding:"18px 24px"}}>
            {/* Add new person form */}
            {adding[field] && (
              <div style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:"16px",marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:800,color:tagColor,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>New {label.slice(0,-1)}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                  <Inp label="Full Name" value={newPerson[field].name} placeholder="First Last" onChange={e=>setNewPerson(p=>({...p,[field]:{...p[field],name:e.target.value}}))}/>
                  <Inp label="Email Address" type="email" value={newPerson[field].email} placeholder="email@example.com" onChange={e=>setNewPerson(p=>({...p,[field]:{...p[field],email:e.target.value}}))}/>
                </div>
                <Inp label="Temporary Password" value={newPerson[field].pass} onChange={e=>setNewPerson(p=>({...p,[field]:{...p[field],pass:e.target.value}}))}/>
                {newPerson[field].status && <div style={{fontSize:12,fontWeight:700,color:newPerson[field].status.startsWith("✗")?"#dc2626":"#059669",marginBottom:10}}>{newPerson[field].status}</div>}
                <div style={{display:"flex",gap:8}}>
                  <Btn variant="success" onClick={()=>createPerson(field)} disabled={!newPerson[field].name||!newPerson[field].email}>✓ Create Account & Add</Btn>
                  <Btn variant="outline" onClick={()=>toggleAdd(field)}>Cancel</Btn>
                </div>
              </div>
            )}
            {/* Existing members list */}
            {(config[field]||[]).length===0 ? <div style={{textAlign:"center",padding:"16px 0",color:"#9ca3af",fontSize:13}}>None yet.</div> : (
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {(config[field]||[]).map(name=>(
                  <div key={name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:bg,border:`1px solid ${border}`,borderRadius:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${tagColor},${tagBg})`,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800}}>{name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}</div>
                      <span style={{fontSize:14,fontWeight:700}}>{name}</span>
                      <span style={{fontSize:10,background:tagBg,color:tagColor,borderRadius:20,padding:"2px 8px",fontWeight:700,textTransform:"uppercase"}}>{tag}</span>
                    </div>
                    <button onClick={()=>remove(field,name)} style={{background:"none",border:"1px solid #fecaca",borderRadius:6,color:"#dc2626",cursor:"pointer",padding:"4px 10px",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// TIME CARD SYSTEM
// ═══════════════════════════════════════════════════════

const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true}) : "—";
const fmtDur  = ms => {
  if(!ms||ms<0) return "0h 0m";
  const h = Math.floor(ms/3600000);
  const m = Math.floor((ms%3600000)/60000);
  return `${h}h ${m}m`;
};
const fmtDurDecimal = ms => {
  if(!ms||ms<0) return "0.00";
  return (ms/3600000).toFixed(2);
};

// Tech clock-in/out panel — shown on tech dashboard
const ClockPanel = ({ user, onUpdate }) => {
  const [entry, setEntry]   = useState(null); // current open entry
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  // Load any open clock entry for this user
  useEffect(()=>{
    (async()=>{
      try {
        const entries = await fsList("timeEntries");
        const open = entries.find(e=>e.userName===user.name&&!e.clockOut);
        setEntry(open||null);
      } catch{}
      setLoading(false);
    })();
  },[user.name]);

  // Live elapsed timer
  useEffect(()=>{
    if(!entry?.clockIn) return;
    const t = setInterval(()=>setElapsed(Date.now()-entry.clockIn),10000);
    setElapsed(Date.now()-entry.clockIn);
    return ()=>clearInterval(t);
  },[entry]);

  const clockIn = async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const saved = await fsAdd("timeEntries",{
        userName: user.name,
        uid: user.uid,
        clockIn: now,
        clockInStr: new Date(now).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}),
        clockOut: null,
        clockOutStr: null,
        duration: null,
        date: todayISO(),
      });
      setEntry(saved);
      if(onUpdate) onUpdate();
    } catch(e){ alert("Clock in error: "+e.message); }
    setLoading(false);
  };

  const clockOut = async () => {
    if(!entry) return;
    setLoading(true);
    try {
      const now = Date.now();
      const dur = now - entry.clockIn;
      await fsSet("timeEntries", entry.id, {
        ...entry,
        clockOut: now,
        clockOutStr: new Date(now).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}),
        duration: dur,
        durationStr: fmtDur(dur),
        durationDecimal: fmtDurDecimal(dur),
      });
      setEntry(null);
      if(onUpdate) onUpdate();
    } catch(e){ alert("Clock out error: "+e.message); }
    setLoading(false);
  };

  if(loading) return <div style={{background:"white",borderRadius:12,padding:"16px 20px",marginBottom:16,textAlign:"center",color:"#9ca3af",fontSize:13}}>Loading time card…</div>;

  const isClockedIn = !!entry;
  return (
    <div style={{background:isClockedIn?"linear-gradient(135deg,#ecfdf5,#d1fae5)":"linear-gradient(135deg,#f9fafb,#f3f4f6)",
      border:`2px solid ${isClockedIn?"#34d399":"#e5e7eb"}`,borderRadius:12,padding:"16px 20px",marginBottom:16,
      display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:48,height:48,borderRadius:"50%",background:isClockedIn?"#059669":"#9ca3af",
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
          {isClockedIn?"🟢":"⚪"}
        </div>
        <div>
          <div style={{fontSize:15,fontWeight:800,color:isClockedIn?"#065f46":"#374151"}}>
            {isClockedIn?"Clocked In":"Not Clocked In"}
          </div>
          {isClockedIn && <>
            <div style={{fontSize:12,color:"#059669",marginTop:2}}>Since {fmtTime(entry.clockIn)}</div>
            <div style={{fontSize:13,fontWeight:700,color:"#065f46",marginTop:2}}>⏱ {fmtDur(elapsed)} elapsed</div>
          </>}
          {!isClockedIn && <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Tap Clock In to start your shift</div>}
        </div>
      </div>
      <Btn variant={isClockedIn?"red":"success"} style={{fontSize:15,padding:"11px 28px"}}
        onClick={isClockedIn?clockOut:clockIn} disabled={loading}>
        {isClockedIn?"🔴 Clock Out":"🟢 Clock In"}
      </Btn>
    </div>
  );
};

// Full time card report for supervisors/accounting
const TimeCardReport = ({ onBack, canEdit=false }) => {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [weekStart, setWeekStart] = useState(getMondayOf(todayISO()));
  const [filterName, setFilterName] = useState("all");
  const [editId, setEditId]     = useState(null); // id of row being edited
  const [editVals, setEditVals] = useState({});   // { clockInTime, clockOutTime }

  useEffect(()=>{ loadEntries(); },[]);
  const loadEntries = async () => {
    setLoading(true);
    try { setEntries(await fsList("timeEntries")); } catch{}
    setLoading(false);
  };

  const weekEnd = addDays(weekStart,6);
  const inWeek  = entries.filter(e=>e.date>=weekStart&&e.date<=weekEnd);
  const names   = [...new Set(entries.map(e=>e.userName).filter(Boolean))].sort();

  const filtered = (filterName==="all"?inWeek:inWeek.filter(e=>e.userName===filterName))
    .sort((a,b)=>(b.clockIn||0)-(a.clockIn||0));

  // Group by employee for summary
  const summary = {};
  inWeek.forEach(e=>{
    if(!e.userName) return;
    if(!summary[e.userName]) summary[e.userName]={hours:0,days:0};
    if(e.duration) { summary[e.userName].hours+=e.duration; summary[e.userName].days++; }
  });

  const deleteEntry = async (id) => {
    if(!window.confirm("Delete this time entry?")) return;
    await fsDel("timeEntries",id);
    setEntries(p=>p.filter(e=>e.id!==id));
  };

  const startEdit = (e) => {
    // Convert timestamps to HH:MM string for time inputs
    const toTimeStr = ts => {
      if(!ts) return "";
      const d = new Date(ts);
      return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    };
    setEditId(e.id);
    setEditVals({ clockInTime: toTimeStr(e.clockIn), clockOutTime: toTimeStr(e.clockOut), date: e.date });
  };

  const saveEdit = async (e) => {
    // Reconstruct timestamps from date + time strings
    const toTs = (dateStr, timeStr) => {
      if(!timeStr) return null;
      const [h,m] = timeStr.split(":").map(Number);
      const d = new Date(dateStr+"T12:00:00");
      d.setHours(h,m,0,0);
      return d.getTime();
    };
    const newIn  = toTs(editVals.date, editVals.clockInTime);
    const newOut = editVals.clockOutTime ? toTs(editVals.date, editVals.clockOutTime) : null;
    const dur    = newIn && newOut ? newOut - newIn : null;
    const updated = {
      ...e,
      clockIn:  newIn,
      clockInStr: newIn ? new Date(newIn).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}) : null,
      clockOut: newOut,
      clockOutStr: newOut ? new Date(newOut).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}) : null,
      duration: dur,
      durationStr: dur ? fmtDur(dur) : null,
      durationDecimal: dur ? fmtDurDecimal(dur) : null,
      date: editVals.date,
    };
    await fsSet("timeEntries", e.id, updated);
    setEntries(p=>p.map(x=>x.id===e.id?{...updated,id:e.id}:x));
    setEditId(null);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit",padding:0}}>← Back</button>
        <span style={{fontSize:22,fontWeight:900,color:"#0f2640"}}>🕐 Time Cards</span>
        <Btn variant="outline" small onClick={loadEntries}>⟳ Refresh</Btn>
      </div>

      {/* Week nav */}
      <div style={{background:"white",borderRadius:12,padding:"14px 20px",marginBottom:14,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Week of</div>
          <div style={{fontSize:18,fontWeight:900,color:"#0f2640"}}>{fmtWeek(weekStart)}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="outline" small onClick={()=>setWeekStart(addDays(weekStart,-7))}>← Prev</Btn>
          <Btn variant="outline" small onClick={()=>setWeekStart(getMondayOf(todayISO()))}>This Week</Btn>
          <Btn variant="outline" small onClick={()=>setWeekStart(addDays(weekStart,7))}>Next →</Btn>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:14}}>
        {Object.entries(summary).map(([name,s])=>(
          <div key={name} style={{background:"white",borderRadius:10,padding:"12px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#0f2640,#1a3a5c)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,flexShrink:0}}>
                {name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
              </div>
              <span style={{fontSize:13,fontWeight:700,color:"#0f2640"}}>{name.split(" ")[0]}</span>
            </div>
            <div style={{fontSize:20,fontWeight:900,color:"#059669"}}>{fmtDurDecimal(s.hours)} hrs</div>
            <div style={{fontSize:11,color:"#9ca3af"}}>{s.days} shift{s.days!==1?"s":""} this week</div>
          </div>
        ))}
        {Object.keys(summary).length===0 && (
          <div style={{background:"white",borderRadius:10,padding:"12px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",gridColumn:"1/-1",textAlign:"center",color:"#9ca3af",fontSize:13}}>No time entries this week</div>
        )}
      </div>

      {/* Filter by employee */}
      <div style={{marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:12,fontWeight:700,color:"#6b7280"}}>Filter:</span>
        {["all",...names].map(n=>(
          <button key={n} onClick={()=>setFilterName(n)} style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",
            fontFamily:"inherit",fontSize:12,fontWeight:700,
            background:filterName===n?"#0f2640":"#e5e7eb",color:filterName===n?"white":"#374151"}}>
            {n==="all"?"All Employees":n}
          </button>
        ))}
      </div>

      {/* Entries table */}
      {loading ? <Spinner/> : (
        <div style={{background:"white",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",overflow:"hidden"}}>
          {filtered.length===0 ? (
            <div style={{padding:"40px 20px",textAlign:"center",color:"#9ca3af"}}>
              <div style={{fontSize:36,marginBottom:8}}>🕐</div>
              <div style={{fontSize:15,fontWeight:700,color:"#374151",marginBottom:4}}>No entries found</div>
              <div style={{fontSize:13}}>No time cards for this week{filterName!=="all"?` for ${filterName}`:""}</div>
            </div>
          ):(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:canEdit?650:550}}>
                <thead>
                  <tr style={{background:"#f9fafb"}}>
                    {["Employee","Date","Clock In","Clock Out","Duration","Hours",...(canEdit?["Actions"]:[])].map(h=>(
                      <th key={h} style={{padding:"10px 14px",textAlign:"left",fontWeight:700,color:"#6b7280",fontSize:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e=>{
                    const isEditing = canEdit && editId===e.id;
                    return (
                      <tr key={e.id} style={{borderTop:"1px solid #f3f4f6",background:isEditing?"#fffbeb":"white"}}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{fontWeight:700,color:"#0f2640"}}>{e.userName}</div>
                        </td>
                        <td style={{padding:"8px 14px"}}>
                          {isEditing
                            ? <input type="date" value={editVals.date} onChange={ev=>setEditVals(p=>({...p,date:ev.target.value}))} style={{...iSt,padding:"4px 8px",fontSize:12,width:130}}/>
                            : <span style={{color:"#374151"}}>{fmtDate(e.date)}</span>
                          }
                        </td>
                        <td style={{padding:"8px 14px"}}>
                          {isEditing
                            ? <input type="time" value={editVals.clockInTime} onChange={ev=>setEditVals(p=>({...p,clockInTime:ev.target.value}))} style={{...iSt,padding:"4px 8px",fontSize:12,width:110}}/>
                            : <span style={{color:"#374151"}}>{fmtTime(e.clockIn)}</span>
                          }
                        </td>
                        <td style={{padding:"8px 14px"}}>
                          {isEditing
                            ? <input type="time" value={editVals.clockOutTime} onChange={ev=>setEditVals(p=>({...p,clockOutTime:ev.target.value}))} style={{...iSt,padding:"4px 8px",fontSize:12,width:110}}/>
                            : e.clockOut
                              ? <span style={{color:"#374151"}}>{fmtTime(e.clockOut)}</span>
                              : <span style={{color:"#059669",fontWeight:700,fontSize:11,background:"#ecfdf5",padding:"2px 8px",borderRadius:20}}>🟢 Clocked in</span>
                          }
                        </td>
                        <td style={{padding:"10px 14px",color:"#374151"}}>
                          {isEditing
                            ? <span style={{fontSize:11,color:"#9ca3af"}}>recalculates on save</span>
                            : e.durationStr||"In progress"
                          }
                        </td>
                        <td style={{padding:"10px 14px",fontWeight:700,color:"#059669"}}>
                          {isEditing ? "—" : (e.durationDecimal?`${e.durationDecimal} hrs`:"—")}
                        </td>
                        {canEdit && (
                          <td style={{padding:"8px 14px"}}>
                            {isEditing ? (
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>saveEdit(e)} style={{background:"#059669",border:"none",borderRadius:6,color:"white",cursor:"pointer",padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✓ Save</button>
                                <button onClick={()=>setEditId(null)} style={{background:"none",border:"1px solid #d1d5db",borderRadius:6,color:"#6b7280",cursor:"pointer",padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>Cancel</button>
                              </div>
                            ):(
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>startEdit(e)} style={{background:"none",border:"1px solid #93c5fd",borderRadius:6,color:"#1e40af",cursor:"pointer",padding:"3px 8px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✎ Edit</button>
                                <button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"1px solid #fecaca",borderRadius:6,color:"#dc2626",cursor:"pointer",padding:"3px 8px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✕</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <div style={{marginTop:12,fontSize:12,color:"#9ca3af"}}>
        {canEdit
          ? "💡 Click ✎ Edit on any row to correct clock in/out times or the date. Changes are saved immediately."
          : "💡 Time entries are created when you clock in. Contact your supervisor to correct any mistakes."
        }
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// SUPERVISOR PANEL (editable invoice)
// ═══════════════════════════════════════════════════════
// Each row manages its own local state — no parent re-render while typing
const MaterialRow = ({ m, onSave, onRemove }) => {
  const [desc,  setDesc]  = useState(m.description||"");
  const [qty,   setQty]   = useState(m.qty||"");
  const [price, setPrice] = useState(m.unitPrice||"");
  const lt = (parseFloat(qty)||0)*(parseFloat(price)||0);
  const commit = () => onSave(m.id,{description:desc,qty,unitPrice:price});
  const inpSt = {...iSt,padding:"6px 8px",fontSize:13};
  return (
    <tr style={{borderTop:"1px solid #f3f4f6"}}>
      <td style={{padding:"5px 6px"}}>
        <input style={{...inpSt,minWidth:150}} value={desc}
          onChange={e=>setDesc(e.target.value)} onBlur={commit}/>
      </td>
      <td style={{padding:"5px 6px"}}>
        <input type="number" style={{...inpSt,width:65}} value={qty}
          onChange={e=>setQty(e.target.value)} onBlur={commit}/>
      </td>
      <td style={{padding:"5px 6px"}}>
        <input type="number" style={{...inpSt,width:85}} value={price}
          onChange={e=>setPrice(e.target.value)} onBlur={commit}/>
      </td>
      <td style={{padding:"5px 10px",fontWeight:700,color:"#0f2640",whiteSpace:"nowrap"}}>{fmt$(lt)}</td>
      <td style={{padding:"5px 6px"}}>
        <button onClick={()=>onRemove(m.id)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:16,lineHeight:1}}>✕</button>
      </td>
    </tr>
  );
};

// Always-editable materials table for supervisor
const SupervisorMatTable = ({ materials=[], onUpdate }) => {
  const [newRow, setNewRow] = useState({description:"",qty:"",unitPrice:""});

  const saveRow = (id, vals) => {
    onUpdate(materials.map(m=>m.id===id?{...m,...vals}:m));
  };
  const removeRow = id => onUpdate(materials.filter(m=>m.id!==id));
  const addRow = () => {
    if(!newRow.description) return;
    onUpdate([...materials,{...newRow,id:Date.now()}]);
    setNewRow({description:"",qty:"",unitPrice:""});
  };

  const inpSt = {...iSt,padding:"6px 8px",fontSize:13};
  return (
    <div style={{overflowX:"auto",marginBottom:14}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:460}}>
        <thead>
          <tr style={{background:"#fef3c7"}}>
            {["Description","Qty","Unit Price","Line Total",""].map(h=>(
              <th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,color:"#92400e",fontSize:10,textTransform:"uppercase"}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {materials.length===0 && (
            <tr><td colSpan={5} style={{padding:"12px 10px",color:"#9ca3af",fontSize:13,textAlign:"center"}}>No materials — add a row below</td></tr>
          )}
          {materials.map(m=>(
            <MaterialRow key={m.id} m={m} onSave={saveRow} onRemove={removeRow}/>
          ))}
          {/* New row */}
          <tr style={{borderTop:"2px dashed #e5e7eb",background:"#fafafa"}}>
            <td style={{padding:"5px 6px"}}>
              <input style={{...inpSt,minWidth:150}} value={newRow.description} placeholder="+ New item"
                onChange={e=>setNewRow(p=>({...p,description:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&addRow()}/>
            </td>
            <td style={{padding:"5px 6px"}}>
              <input type="number" style={{...inpSt,width:65}} value={newRow.qty} placeholder="1"
                onChange={e=>setNewRow(p=>({...p,qty:e.target.value}))}/>
            </td>
            <td style={{padding:"5px 6px"}}>
              <input type="number" style={{...inpSt,width:85}} value={newRow.unitPrice} placeholder="0.00"
                onChange={e=>setNewRow(p=>({...p,unitPrice:e.target.value}))}/>
            </td>
            <td style={{padding:"5px 10px",color:"#9ca3af",fontSize:12}}>
              {newRow.qty&&newRow.unitPrice?fmt$((parseFloat(newRow.qty)||0)*(parseFloat(newRow.unitPrice)||0)):"—"}
            </td>
            <td style={{padding:"5px 6px"}}>
              <button onClick={addRow} disabled={!newRow.description}
                style={{background:newRow.description?"#f47c00":"#e5e7eb",border:"none",borderRadius:5,
                  color:newRow.description?"white":"#9ca3af",
                  cursor:newRow.description?"pointer":"default",
                  padding:"4px 10px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>
                + Add
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const SupervisorPanel = ({ sel, onApprove, supervisors=[] }) => {
  const [notes,   setNotes]   = useState("");
  const [supName, setSupName] = useState("");
  const [checked, setChecked] = useState(false);
  return (
    <div style={{padding:"20px 24px",background:"#fffbeb",borderTop:"3px solid #f59e0b"}}>
      <SecHead>Supervisor Approval</SecHead>
      <div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"12px 16px",marginBottom:20,fontSize:13,color:"#92400e"}}>
        <div style={{fontWeight:700,marginBottom:4}}>📝 Need to correct the invoice?</div>
        Use the <strong>✎ Edit Invoice</strong> button at the top right to fix materials, quantities, prices, and labor — then come back here to approve.
      </div>
      <Txt label="Supervisor Notes (optional)" value={notes} rows={2} placeholder="Any notes for accounting…" onChange={e=>setNotes(e.target.value)}/>
      <div style={{marginBottom:14}}>
        <Lbl>Signing Supervisor</Lbl>
        <select style={iSt} value={supName} onChange={e=>setSupName(e.target.value)}>
          <option value="">— Select your name —</option>
          {supervisors.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:16,fontSize:14}}>
        <input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} style={{width:16,height:16}}/>
        I have reviewed this invoice and approve it for accounting.
      </label>
      <Btn variant="success" disabled={!checked||!supName} onClick={()=>onApprove(sel, notes, supName)}>
        ✓ Approve & Send to Accounting
      </Btn>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// DISPATCH MODAL
// ═══════════════════════════════════════════════════════
const DispatchModal = ({ order, roster, onDispatch, onClose }) => {
  const [tech, setTech]   = useState(order.dispatchedTo||"");
  const [notes, setNotes] = useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:14,width:"100%",maxWidth:440,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",overflow:"hidden"}}>
        <div style={{background:"linear-gradient(135deg,#091929,#1a3a5c)",padding:"18px 24px",color:"white"}}>
          <div style={{fontSize:10,color:"#f47c00",fontWeight:800,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4}}>Dispatch Job</div>
          <div style={{fontSize:17,fontWeight:900}}>{order.woNumber} — {order.jobName||order.customerName||"(No customer)"}</div>
          <div style={{fontSize:12,color:"#7eb8e0",marginTop:2}}>{order.serviceType} · 📅 {fmtDate(order.scheduledDate)}</div>
        </div>
        <div style={{padding:"22px 24px"}}>
          <div style={{marginBottom:14}}>
            <Lbl>Assign To</Lbl>
            <select style={iSt} value={tech} onChange={e=>setTech(e.target.value)}>
              <option value="">— Select technician —</option>
              {roster.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{marginBottom:16}}><Lbl>Dispatch Notes (optional)</Lbl><textarea style={{...iSt,resize:"vertical",minHeight:70}} value={notes} placeholder="Special instructions, tools needed, access codes…" onChange={e=>setNotes(e.target.value)}/></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <Btn variant="outline" onClick={onClose}>Cancel</Btn>
            <Btn variant="sky" disabled={!tech} onClick={()=>onDispatch(tech,notes)}>📤 Dispatch Job</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
function App() {
  const [user, setUser]         = useState(null); // { uid, name, role, email }
  const [screen, setScreen]     = useState("login");
  const [orders, setOrders]     = useState([]);
  const [customers, setCustomers] = useState([]);
  const [config, setConfig]     = useState(DEFAULT_CONFIG);
  const [loading, setLoading]   = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [view, setView]         = useState("dashboard");
  const [selId, setSelId]       = useState(null);
  const [filter, setFilter]     = useState("all");
  const [form, setForm]         = useState({});
  const [act, setAct]           = useState({name:"",notes:"",checked:false});
  const [dispOrder, setDispOrder] = useState(null);

  // Load orders + config from Firestore
  const loadData = useCallback(async () => {
    setSyncing(true);
    try {
      const [ords, cfg, custs] = await Promise.all([
        fsList("workOrders"),
        fsGet("config","team").catch(()=>DEFAULT_CONFIG),
        fsList("customers").catch(()=>[]),
      ]);
      setOrders(ords.sort((a,b)=>(b.createdDate||"").localeCompare(a.createdDate||"")));
      setConfig({...DEFAULT_CONFIG,...cfg});
      setCustomers(custs.sort((a,b)=>(a.customerName||"").localeCompare(b.customerName||"")));
    } catch(e) { console.error("Load error:", e); }
    finally { setSyncing(false); }
  }, []);

  useEffect(() => { if(screen==="app") { loadData(); const t=setInterval(loadData,30000); return ()=>clearInterval(t); } }, [screen, loadData]);

  const sel = orders.find(o=>o.id===selId);

  const saveOrder = async (o, isNew=false) => {
    setSyncing(true);
    try {
      let result;
      if (isNew) { result=await fsAdd("workOrders",o); setOrders(p=>[result,...p]); }
      else { await fsSet("workOrders",o.id,o); setOrders(p=>p.map(x=>x.id===o.id?o:x)); result=o; }
      await saveCustomerFromOrder(o);
      return result;
    } finally { setSyncing(false); }
  };

  const deleteOrder = async id => { await fsDel("workOrders",id); setOrders(p=>p.filter(o=>o.id!==id)); };
  const deleteAllClosed = async () => { const closed=orders.filter(o=>o.status==="closed"); await Promise.all(closed.map(o=>fsDel("workOrders",o.id))); setOrders(p=>p.filter(o=>o.status!=="closed")); };

  // Auto-save customer to directory when saving a work order
  const saveCustomerFromOrder = async (o) => {
    if(!o.customerName?.trim()) return;
    const key = o.customerName.trim().toLowerCase().replace(/\s+/g,"_");
    try {
      await fsSet("customers", key, {
        customerName: o.customerName.trim(),
        customerPhone: o.customerPhone||"",
        customerEmail: o.customerEmail||"",
        customerAddress: o.customerAddress||"",
        updatedDate: todayISO(),
      });
      setCustomers(p=>{
        const exists = p.find(c=>c.id===key);
        const updated = { id:key, customerName:o.customerName.trim(), customerPhone:o.customerPhone||"", customerEmail:o.customerEmail||"", customerAddress:o.customerAddress||"", updatedDate:todayISO() };
        return exists ? p.map(c=>c.id===key?updated:c) : [...p, updated].sort((a,b)=>a.customerName.localeCompare(b.customerName));
      });
    } catch(e){ console.error("Customer save error:",e); }
  };

  const deleteCustomer = async (id) => {
    await fsDel("customers", id);
    setCustomers(p=>p.filter(c=>c.id!==id));
  };

  const patch = async (id, delta) => {
    const updated = {...orders.find(o=>o.id===id),...delta};
    await saveOrder(updated);
    setSelId(id); setView("detail"); setAct({name:"",notes:"",checked:false}); setDispOrder(null);
  };

  const handleDispatch = async (techName, notes) => {
    await patch(dispOrder.id,{dispatchedTo:techName,assignedTech:techName,dispatchedAt:nowStamp(),dispatchNotes:notes,status:"dispatched"});
  };

  const updateConfig = async (newConfig) => {
    await fsSet("config","team",newConfig);
    setConfig(newConfig);
  };

  const handleLogin = (profile) => { setUser(profile); setScreen("app"); setLoading(false); };
  const handleLogout = () => { TOKEN=null; setUser(null); setScreen("login"); setOrders([]); };
  const goDash = () => { setView("dashboard"); setDispOrder(null); };
  const setF = (k,v) => setForm(p=>({...p,[k]:v}));

  const visible = (() => {
    let base = orders;
    if(user?.role==="tech") base = base.filter(o=>o.dispatchedTo===user.name||o.assignedTech===user.name);
    if(filter!=="all") base = base.filter(o=>o.status===filter);
    return base;
  })();
  const countOf = s => orders.filter(o=>o.status===s).length;

  // ── HEADER ──
  const Header = () => (
    <div style={{background:"linear-gradient(135deg,#091929 0%,#1a3a5c 100%)",color:"white",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 16px rgba(0,0,0,0.4)"}}>
      <div style={{maxWidth:960,margin:"0 auto",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:9,color:"#f47c00",fontWeight:800,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:2}}>⚙ Work Order System</div>
          <div style={{fontSize:19,fontWeight:900,letterSpacing:"0.02em"}}>EXCEL PLUMBING & HEATING LLC</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {syncing && <span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>⟳ syncing…</span>}
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:13,fontWeight:700,color:"white"}}>{user?.name}</div>
            <div style={{fontSize:10,color:"#7eb8e0",textTransform:"capitalize"}}>{user?.role}</div>
          </div>
          <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:6,color:"white",cursor:"pointer",padding:"5px 10px",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>Sign Out</button>
        </div>
      </div>
    </div>
  );

  // ── SCREENS ──
  if (screen==="login")  return <LoginScreen onLogin={handleLogin} onSetup={()=>setScreen("setup")}/>;
  if (screen==="setup")  return <SetupScreen onBack={()=>setScreen("login")}/>;

  const role = user?.role;

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#e8edf4",minHeight:"100vh",color:"#111827"}}>
      <Header/>
      {dispOrder && <DispatchModal order={dispOrder} roster={config.roster} onDispatch={handleDispatch} onClose={()=>setDispOrder(null)}/>}
      <div style={{maxWidth:960,margin:"0 auto",padding:"20px 16px"}}>

        {/* ── REPORT ── */}
        {view==="report" && <WeeklyReport orders={orders} onBack={goDash}/>}

        {/* ── TIME CARDS ── */}
        {view==="timecards" && <TimeCardReport onBack={goDash} canEdit={role==="supervisor"||role==="accounting"}/>}

        {/* ── CUSTOMER DIRECTORY ── */}
        {view==="customers" && (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,flexWrap:"wrap"}}>
              <button onClick={goDash} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit",padding:0}}>← Back</button>
              <span style={{fontSize:22,fontWeight:900,color:"#0f2640"}}>📋 Customer Directory</span>
              <span style={{fontSize:13,color:"#9ca3af"}}>({customers.length} customers)</span>
            </div>
            {customers.length===0 ? (
              <div style={{background:"white",borderRadius:12,padding:"48px 20px",textAlign:"center",color:"#9ca3af",boxShadow:"0 1px 4px rgba(0,0,0,0.07)"}}>
                <div style={{fontSize:40,marginBottom:10}}>📋</div>
                <div style={{fontSize:16,fontWeight:700,color:"#374151",marginBottom:4}}>No customers yet</div>
                <div style={{fontSize:13}}>Customers are saved automatically when you create work orders.</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {customers.map(c=>(
                  <div key={c.id} style={{background:"white",borderRadius:10,padding:"14px 18px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                    <div style={{width:40,height:40,borderRadius:"50%",background:"linear-gradient(135deg,#0f2640,#1a3a5c)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:800,flexShrink:0}}>
                      {(c.customerName||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:180}}>
                      <div style={{fontSize:15,fontWeight:800,color:"#0f2640",marginBottom:3}}>{c.customerName}</div>
                      <div style={{fontSize:12,color:"#6b7280",display:"flex",gap:12,flexWrap:"wrap"}}>
                        {c.customerPhone && <span>📞 {c.customerPhone}</span>}
                        {c.customerEmail && <span>✉️ {c.customerEmail}</span>}
                      </div>
                      {c.customerAddress && <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>📍 {c.customerAddress}</div>}
                    </div>
                    <button onClick={()=>{ if(window.confirm(`Delete ${c.customerName} from the customer directory?`)) deleteCustomer(c.id); }}
                      style={{background:"none",border:"1px solid #fecaca",borderRadius:6,color:"#dc2626",cursor:"pointer",padding:"5px 12px",fontSize:12,fontWeight:700,fontFamily:"inherit",flexShrink:0}}>
                      🗑 Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view==="team" && <TeamView config={config} onUpdate={updateConfig} onBack={goDash}/>}

        {/* ── DASHBOARD ── */}
        {view==="dashboard" && (
          <div>
            {/* Tech welcome banner */}
            {role==="tech" && (
              <div>
                <div style={{background:"linear-gradient(135deg,#0f2640,#1a3a5c)",borderRadius:12,padding:"14px 20px",marginBottom:12,display:"flex",alignItems:"center",gap:12,color:"white"}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:"#f47c00",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,flexShrink:0}}>{user?.name?.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase()}</div>
                  <div><div style={{fontSize:15,fontWeight:800}}>Hi, {user?.name?.split(" ")[0]}! 👋</div><div style={{fontSize:12,color:"#7eb8e0",marginTop:2}}>Showing jobs assigned to you · {visible.length} active</div></div>
                  <Btn variant="outline" small onClick={loadData} style={{marginLeft:"auto",color:"white",border:"1px solid rgba(255,255,255,0.3)",background:"transparent"}}>⟳ Refresh</Btn>
                </div>
                <ClockPanel user={user}/>
              </div>
            )}

            {/* Status counts */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:18}}>
              {Object.entries(STATUSES).map(([key,cfg])=>(
                <div key={key} onClick={()=>setFilter(filter===key?"all":key)}
                  style={{background:"white",borderRadius:10,padding:"10px 6px",textAlign:"center",cursor:"pointer",
                    border:`2px solid ${filter===key?cfg.border:"transparent"}`,boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
                  <div style={{fontSize:22,fontWeight:900,color:cfg.color}}>{countOf(key)}</div>
                  <div style={{fontSize:8,fontWeight:700,color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.03em",marginTop:3,lineHeight:1.3}}>{cfg.label}</div>
                </div>
              ))}
            </div>

            {/* Toolbar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>setFilter("all")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:filter==="all"?"#0f2640":"#e5e7eb",color:filter==="all"?"white":"#374151"}}>All ({orders.length})</button>
                {role==="supervisor" && <>
                  <button onClick={()=>setFilter("awaiting_supervisor")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:filter==="awaiting_supervisor"?"#92400e":"#fef3c7",color:filter==="awaiting_supervisor"?"white":"#92400e"}}>Review Queue ({countOf("awaiting_supervisor")})</button>
                  <button onClick={()=>setView("report")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:"#1e40af",color:"white"}}>📊 Hours</button>
                  <button onClick={()=>setView("team")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:"#065f46",color:"white"}}>👷 Team</button>
                  <button onClick={()=>setView("customers")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:"#92400e",color:"white"}}>📋 Customers ({customers.length})</button>
                  <button onClick={()=>setView("timecards")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:"#0369a1",color:"white"}}>🕐 Time Cards</button>
                </>}
                {role==="accounting" && <button onClick={()=>setFilter("awaiting_accounting")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:filter==="awaiting_accounting"?"#5b21b6":"#ede9fe",color:filter==="awaiting_accounting"?"white":"#5b21b6"}}>My Queue ({countOf("awaiting_accounting")})</button>}
                {role==="accounting" && <button onClick={()=>setView("timecards")} style={{padding:"5px 14px",borderRadius:20,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:"#0369a1",color:"white"}}>🕐 Time Cards</button>}
                {(role==="supervisor"||role==="accounting") && countOf("closed")>0 && (
                  <button onClick={()=>{ if(window.confirm(`Delete all ${countOf("closed")} closed work orders?`)) deleteAllClosed(); }} style={{padding:"5px 14px",borderRadius:20,border:"1px solid #fca5a5",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:"white",color:"#dc2626"}}>🗑 Delete All Closed ({countOf("closed")})</button>
                )}
              </div>
              <div style={{display:"flex",gap:8}}>
                {role!=="tech" && <Btn variant="outline" small onClick={loadData}>⟳ Refresh</Btn>}
                {(role==="supervisor"||role==="accounting") && <Btn onClick={()=>{ setForm(blankOrder()); setView("create"); }}>+ New Work Order</Btn>}
                {role==="tech" && <Btn onClick={()=>{ setForm(blankOrder()); setView("create"); }}>+ New Work Order</Btn>}
              </div>
            </div>

            {/* Job list */}
            {visible.length===0 ? (
              <div style={{background:"white",borderRadius:12,padding:"50px 20px",textAlign:"center",color:"#9ca3af"}}>
                <div style={{fontSize:48,marginBottom:12}}>🔧</div>
                <div style={{fontSize:17,fontWeight:700,color:"#374151",marginBottom:4}}>{role==="tech"?"No jobs assigned to you yet":"No work orders"}</div>
                <div style={{fontSize:13}}>{role==="tech"?"Check back after your supervisor dispatches a job.":"Hit \"+ New Work Order\" to get started."}</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {visible.map(o=>{
                  const t=calcTotals(o); const sc=STATUSES[o.status];
                  const canDispatch = role==="supervisor" && (o.status==="open"||o.status==="dispatched");
                  return (
                    <div key={o.id} style={{background:"white",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",borderLeft:`4px solid ${sc?.color||"#d1d5db"}`,overflow:"hidden"}}>
                      <div onClick={()=>{setSelId(o.id);setView("detail");setAct({name:"",notes:"",checked:false});}} style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
                        <div style={{flex:1,minWidth:180}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:5}}>
                            <span style={{fontSize:16,fontWeight:900,color:"#0f2640"}}>{o.woNumber}</span>
                            <Badge status={o.status}/><PBadge priority={o.priority}/>
                          </div>
                          {o.jobName && <div style={{fontSize:15,fontWeight:800,color:"#f47c00",marginBottom:3}}>{o.jobName}</div>}
                          <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{o.customerName||"(No customer)"}</div>
                          <div style={{fontSize:12,color:"#6b7280"}}>{o.serviceType} · {o.customerAddress||"No address"}</div>
                          {o.dispatchedTo && <div style={{fontSize:12,color:"#0369a1",fontWeight:600,marginTop:3}}>📤 {o.dispatchedTo}{o.dispatchNotes&&<span style={{color:"#6b7280",fontWeight:400}}> — {o.dispatchNotes.slice(0,50)}</span>}</div>}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:18,fontWeight:900,color:"#0f2640"}}>{fmt$(t.total)}</div>
                          <div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>📅 {fmtDate(o.scheduledDate)}</div>
                          <div style={{fontSize:11,color:"#9ca3af"}}>👷 {o.assignedTech||"Unassigned"}</div>
                        </div>
                      </div>
                      {canDispatch && (
                        <div style={{borderTop:"1px solid #e0f2fe",background:"#f0f9ff",padding:"8px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:12,color:"#0369a1",fontWeight:600}}>{o.dispatchedTo?`Reassign from ${o.dispatchedTo}?`:"Not yet dispatched"}</span>
                          <Btn variant="sky" small onClick={e=>{e.stopPropagation();setDispOrder(o);}}>📤 {o.dispatchedTo?"Reassign":"Dispatch"}</Btn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CREATE / EDIT ── */}
        {(view==="create"||view==="edit") && (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
              <button onClick={goDash} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit",padding:0}}>← Back</button>
              <span style={{fontSize:20,fontWeight:900,color:"#0f2640"}}>{view==="create"?`New Work Order · ${form.woNumber}`:`Edit · ${form.woNumber}`}{form.jobName&&<span style={{color:"#f47c00"}}> · {form.jobName}</span>}</span>
            </div>
            <div style={{background:"white",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",overflow:"hidden"}}>
              <div style={{padding:"22px 24px"}}>
                <SecHead>Job Info</SecHead>
                <Inp label="Job Name / Description" value={form.jobName||""} placeholder="e.g. Smith Boiler Repair, Johnson New Install, 123 Main St Leak…" onChange={e=>setF("jobName",e.target.value)}/>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"0 20px"}}>
                  <Sel label="Service Type" value={form.serviceType} options={SERVICES} onChange={e=>setF("serviceType",e.target.value)}/>
                  <Sel label="Priority" value={form.priority} options={["Routine","Urgent","Emergency"]} onChange={e=>setF("priority",e.target.value)}/>
                  <Inp label="Scheduled Date" type="date" value={form.scheduledDate} onChange={e=>setF("scheduledDate",e.target.value)}/>
                </div>
                <Inp label="Created By" value={form.createdBy||""} placeholder="Your name" onChange={e=>setF("createdBy",e.target.value)}/>
              </div>
              <HR/>
              <div style={{padding:"22px 24px"}}>
                <SecHead>Customer Information</SecHead>
                {/* Customer picker */}
                {customers.length>0 && (
                  <div style={{marginBottom:16}}>
                    <Lbl>Select Existing Customer (auto-fills fields below)</Lbl>
                    <select style={{...iSt,border:"2px solid #f47c00"}} value=""
                      onChange={e=>{
                        const c=customers.find(x=>x.id===e.target.value);
                        if(c){ setF("customerName",c.customerName); setF("customerPhone",c.customerPhone); setF("customerEmail",c.customerEmail); setF("customerAddress",c.customerAddress); }
                      }}>
                      <option value="">— Pick a customer to auto-fill —</option>
                      {customers.map(c=><option key={c.id} value={c.id}>{c.customerName}{c.customerPhone?` · ${c.customerPhone}`:""}</option>)}
                    </select>
                    <div style={{fontSize:11,color:"#9ca3af",marginTop:4}}>Or fill in manually below to add a new customer.</div>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 20px"}}>
                  <Inp label="Customer Name / Company" value={form.customerName||""} placeholder="John Smith" onChange={e=>setF("customerName",e.target.value)}/>
                  <Inp label="Phone Number" value={form.customerPhone||""} placeholder="(555) 000-0000" onChange={e=>setF("customerPhone",e.target.value)}/>
                </div>
                <Inp label="Email Address" value={form.customerEmail||""} placeholder="email@example.com" onChange={e=>setF("customerEmail",e.target.value)}/>
                <Inp label="Billing Address" value={form.customerAddress||""} placeholder="123 Main St, City, State, ZIP" onChange={e=>setF("customerAddress",e.target.value)}/>
                <Inp label="Job Site (if different)" value={form.jobLocation||""} placeholder="Leave blank if same" onChange={e=>setF("jobLocation",e.target.value)}/>
              </div>
              <HR/>
              <div style={{padding:"22px 24px"}}>
                <SecHead>Work Description</SecHead>
                <Txt label="Work Requested" value={form.description||""} placeholder="Describe the issue or work to be performed…" onChange={e=>setF("description",e.target.value)}/>
                {view==="edit" && <Txt label="Work Performed (Field Notes)" value={form.workPerformed||""} placeholder="What was done on site…" onChange={e=>setF("workPerformed",e.target.value)}/>}
              </div>
              <HR/>
              <div style={{padding:"22px 24px"}}>
                <SecHead>Materials & Parts</SecHead>
                <MatTable materials={form.materials||[]} onUpdate={m=>setF("materials",m)}/>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginTop:8,padding:"10px 14px",background:form.applyTax!==false?"#f0fdf4":"#fef2f2",border:`1px solid ${form.applyTax!==false?"#86efac":"#fecaca"}`,borderRadius:8,fontSize:14,color:form.applyTax!==false?"#166534":"#dc2626",fontWeight:600}}>
                  <input type="checkbox" checked={form.applyTax!==false} onChange={e=>setF("applyTax",e.target.checked)} style={{width:18,height:18,cursor:"pointer",flexShrink:0}}/>
                  {form.applyTax!==false ? "✓ Sales Tax (8%) applied to materials" : "✗ No sales tax on this job"}
                </label>
              </div>
              <HR/>
              <div style={{padding:"22px 24px"}}>
                <SecHead>Labor</SecHead>
                <LaborPanel data={form} onChange={updated=>setForm(updated)}/>
              </div>
              <div style={{padding:"16px 24px",background:"#f9fafb",borderTop:"1px solid #f0f0f0",display:"flex",gap:10,justifyContent:"flex-end"}}>
                <Btn variant="outline" onClick={()=>{ if(view==="edit"&&selId){ setView("detail"); } else { goDash(); } }}>Cancel</Btn>
                <Btn variant="navy" disabled={syncing} onClick={async()=>{
                  const o={...form};
                  if(view==="create"){const saved=await saveOrder(o,true);setSelId(saved.id);}
                  else{await saveOrder(o);setSelId(o.id);}
                  setView("detail"); setAct({name:"",notes:"",checked:false});
                }}>💾 {syncing?"Saving…":"Save Work Order"}</Btn>
              </div>
            </div>
          </div>
        )}

        {/* ── DETAIL VIEW ── */}
        {view==="detail" && sel && (()=>{
          const t = calcTotals(sel);
          return (
            <div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <button onClick={goDash} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,fontWeight:700,color:"#6b7280",fontFamily:"inherit",padding:0}}>← Back</button>
                  <span style={{fontSize:20,fontWeight:900,color:"#0f2640"}}>{sel.woNumber}</span>
                  {sel.jobName && <span style={{fontSize:18,fontWeight:800,color:"#f47c00"}}>· {sel.jobName}</span>}
                  <Badge status={sel.status}/><PBadge priority={sel.priority}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {role==="supervisor" && (sel.status==="open"||sel.status==="dispatched") && <Btn variant="sky" small onClick={()=>setDispOrder(sel)}>📤 {sel.dispatchedTo?"Reassign":"Dispatch"}</Btn>}
                  {/* Only supervisors/accounting can edit — techs use the action panels below */}
                  {(role==="supervisor"||role==="accounting") && (sel.status==="open"||sel.status==="dispatched"||sel.status==="awaiting_supervisor") && <Btn variant="outline" small onClick={()=>{setForm({...sel});setSelId(sel.id);setView("edit");}}>✎ Edit Invoice</Btn>}
                </div>
              </div>

              <div style={{background:"white",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",overflow:"hidden"}}>
                <div style={{background:"linear-gradient(135deg,#091929 0%,#1a3a5c 100%)",padding:"16px 24px",color:"white"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:14}}>
                    {[["Service",sel.serviceType],["Scheduled",fmtDate(sel.scheduledDate)],["Tech 1",sel.assignedTech||"—"],["Tech 2",sel.tech2Name||"—"],["Created By",sel.createdBy||"—"]].map(([l,v])=>(
                      <div key={l}><div style={{fontSize:9,color:"#7eb8e0",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:2}}>{l}</div><div style={{fontSize:14,fontWeight:600}}>{v}</div></div>
                    ))}
                  </div>
                </div>

                {sel.dispatchedTo && <div style={{padding:"10px 24px",background:"#e0f2fe",borderBottom:"1px solid #7dd3fc",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><span style={{fontSize:13,fontWeight:700,color:"#0369a1"}}>📤 Dispatched to {sel.dispatchedTo}</span><span style={{fontSize:12,color:"#0369a1"}}>{sel.dispatchedAt}</span>{sel.dispatchNotes&&<span style={{fontSize:12,color:"#374151",fontStyle:"italic"}}>— "{sel.dispatchNotes}"</span>}</div>}

                {/* ── TECH ACTION BANNERS — shown if role is tech, OR if supervisor is assigned to this job ── */}
                {(()=>{
                  const isAssignedToMe = user?.name && (sel.dispatchedTo===user.name || sel.assignedTech===user.name || sel.tech2Name===user.name);
                  const showTechPanels = role==="tech" || (role==="supervisor" && isAssignedToMe);
                  const isSupervisorDoingOwnJob = role==="supervisor" && isAssignedToMe;
                  return (<>
                    {showTechPanels && (sel.status==="open"||sel.status==="dispatched") && (
                      <div style={{padding:"20px 24px",background:"linear-gradient(135deg,#fffbeb,#fef9ec)",borderBottom:"3px solid #f59e0b"}}>
                        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                          <span style={{fontSize:32}}>🔧</span>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:800,fontSize:16,color:"#92400e",marginBottom:4}}>Job assigned to you — ready to start?</div>
                            <div style={{fontSize:13,color:"#78350f"}}>Tap Start Job when you arrive on site. You'll log the work when finished.</div>
                          </div>
                          <Btn style={{fontSize:16,padding:"12px 24px"}} onClick={()=>patch(sel.id,{status:"in_progress"})}>▶ Start Job</Btn>
                        </div>
                      </div>
                    )}
                    {showTechPanels && sel.status==="in_progress" && (
                      <div style={{padding:"20px 24px",background:"linear-gradient(135deg,#f0f9ff,#e0f2fe)",borderBottom:"3px solid #0369a1"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <span style={{fontSize:24}}>✍️</span>
                            <div style={{fontWeight:800,fontSize:15,color:"#0369a1"}}>
                              {isSupervisorDoingOwnJob ? "Log your work then approve directly below" : "Job in progress — fill in details then submit to supervisor"}
                            </div>
                          </div>
                          <Btn variant="outline" small onClick={()=>{setForm({...sel});setSelId(sel.id);setView("edit");}}>
                            ✎ Edit Materials & Labor
                          </Btn>
                        </div>
                        <Txt label="Work Performed *" value={act.notes} rows={4} placeholder="Describe exactly what was done — parts replaced, repairs made, findings…" onChange={e=>setAct(p=>({...p,notes:e.target.value}))}/>
                        <Inp label="Your Name *" value={act.name} placeholder="Your full name" onChange={e=>setAct(p=>({...p,name:e.target.value}))}/>
                        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:20,fontSize:14,color:"#374151",background:"#fff",border:"1px solid #d1d5db",borderRadius:8,padding:"12px 14px"}}>
                          <input type="checkbox" checked={act.checked} onChange={e=>setAct(p=>({...p,checked:e.target.checked}))} style={{width:18,height:18,cursor:"pointer",flexShrink:0}}/>
                          <span><strong>I confirm this job is complete.</strong></span>
                        </label>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                          {!isSupervisorDoingOwnJob && (
                            <Btn style={{fontSize:15,padding:"12px 28px"}} disabled={!act.checked||!act.name}
                              onClick={()=>patch(sel.id,{status:"awaiting_supervisor",workPerformed:act.notes||sel.workPerformed,techSigned:true,techSignedBy:act.name,techSignedAt:nowStamp()})}>
                              ✓ Submit to Supervisor
                            </Btn>
                          )}
                          {isSupervisorDoingOwnJob && (<>
                            <Btn variant="outline" style={{fontSize:14,padding:"11px 20px"}} disabled={!act.checked||!act.name}
                              onClick={()=>patch(sel.id,{status:"awaiting_supervisor",workPerformed:act.notes||sel.workPerformed,techSigned:true,techSignedBy:act.name,techSignedAt:nowStamp()})}>
                              ⏳ Save for Supervisor Review
                            </Btn>
                            <Btn variant="success" style={{fontSize:14,padding:"11px 20px"}} disabled={!act.checked||!act.name}
                              onClick={()=>patch(sel.id,{status:"awaiting_accounting",workPerformed:act.notes||sel.workPerformed,techSigned:true,techSignedBy:act.name,techSignedAt:nowStamp(),supervisorSigned:true,supervisorSignedBy:act.name,supervisorSignedAt:nowStamp(),supervisorNotes:"Supervisor completed and approved own job."})}>
                              ✓ Approve & Send to Accounting
                            </Btn>
                          </>)}
                        </div>
                        {isSupervisorDoingOwnJob && act.checked && act.name && (
                          <div style={{fontSize:12,color:"#6b7280",marginTop:10,lineHeight:1.5}}>
                            <strong>Save for Supervisor Review</strong> — puts it in the queue for Eric or Ryan to double-check before it goes to accounting.<br/>
                            <strong>Approve & Send to Accounting</strong> — you're signing off yourself and sending it straight to Ginger.
                          </div>
                        )}
                        {(!act.notes||!act.name) && <div style={{fontSize:12,color:"#9ca3af",marginTop:10}}>Fill in Work Performed and your name to enable submit.</div>}
                      </div>
                    )}
                    {showTechPanels && !isSupervisorDoingOwnJob && sel.status==="awaiting_supervisor" && (
                      <div style={{padding:"18px 24px",background:"#fffbeb",borderBottom:"3px solid #fbbf24",display:"flex",gap:12,alignItems:"center"}}>
                        <span style={{fontSize:28}}>⏳</span>
                        <div>
                          <div style={{fontSize:14,fontWeight:800,color:"#92400e"}}>Submitted — awaiting supervisor review</div>
                          <div style={{fontSize:12,color:"#92400e",marginTop:2}}>You're all done. Your supervisor will review and approve.</div>
                        </div>
                      </div>
                    )}
                  </>);
                })()}

                <div style={{padding:"22px 24px"}}>
                  <SecHead>Customer</SecHead>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 40px"}}>
                    <div><InfoRow label="Name" value={sel.customerName}/><InfoRow label="Phone" value={sel.customerPhone}/><InfoRow label="Email" value={sel.customerEmail}/></div>
                    <div><InfoRow label="Billing Address" value={sel.customerAddress}/><InfoRow label="Job Location" value={sel.jobLocation||sel.customerAddress}/></div>
                  </div>
                </div>
                <HR/>
                <div style={{padding:"22px 24px"}}>
                  <SecHead>Work Description</SecHead>
                  <div style={{fontSize:14,color:"#374151",lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:sel.workPerformed?20:0}}>{sel.description||"—"}</div>
                  {sel.workPerformed && <><SecHead>Work Performed</SecHead><div style={{fontSize:14,color:"#374151",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{sel.workPerformed}</div></>}
                </div>
                <HR/>
                <div style={{padding:"22px 24px"}}>
                  <SecHead>Materials & Labor</SecHead>
                  {(sel.materials||[]).length>0 ? (
                    <div style={{overflowX:"auto",marginBottom:12}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:360}}>
                        <thead><tr style={{background:"#f9fafb"}}>{["Description","Qty","Unit Price","Line Total"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontWeight:700,color:"#6b7280",fontSize:10,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
                        <tbody>
                          {sel.materials.map(m=><tr key={m.id} style={{borderTop:"1px solid #f3f4f6"}}><td style={{padding:"8px 10px"}}>{m.description}</td><td style={{padding:"8px 10px"}}>{m.qty}</td><td style={{padding:"8px 10px"}}>{fmt$(m.unitPrice)}</td><td style={{padding:"8px 10px",fontWeight:700}}>{fmt$((parseFloat(m.qty)||0)*(parseFloat(m.unitPrice)||0))}</td></tr>)}
                          {/* Tech 1 labor lines */}
                          {(sel.laborLines1||[]).length>0
                            ? (sel.laborLines1||[]).map((l,i)=>(parseFloat(l.hours)||0)>0&&<tr key={l.id||i} style={{borderTop:"1px solid #e5e7eb",background:"#fafafa"}}><td style={{padding:"8px 10px",fontWeight:600,color:"#6b7280"}}>Tech 1 — {sel.assignedTech||"—"}</td><td style={{padding:"8px 10px",color:"#374151"}}>{l.description||`Day ${i+1}`}</td><td style={{padding:"8px 10px",color:"#374151"}}>{l.hours} hrs × {fmt$(l.rate)}/hr</td><td style={{padding:"8px 10px",fontWeight:700}}>{fmt$((parseFloat(l.hours)||0)*(parseFloat(l.rate)||0))}</td></tr>)
                            : (parseFloat(sel.laborHours)||0)>0&&<tr style={{borderTop:"1px solid #e5e7eb",background:"#fafafa"}}><td colSpan={3} style={{padding:"8px 10px",fontWeight:600,color:"#6b7280"}}>Tech 1 ({sel.assignedTech||"—"}) — {sel.laborHours} hrs × {fmt$(sel.laborRate)}/hr</td><td style={{padding:"8px 10px",fontWeight:700}}>{fmt$(t.lab1)}</td></tr>
                          }
                          {/* Tech 2 labor lines */}
                          {(sel.laborLines2||[]).length>0
                            ? (sel.laborLines2||[]).map((l,i)=>(parseFloat(l.hours)||0)>0&&<tr key={l.id||i} style={{borderTop:"1px solid #e5e7eb",background:"#fafafa"}}><td style={{padding:"8px 10px",fontWeight:600,color:"#6b7280"}}>Tech 2 — {sel.tech2Name||"—"}</td><td style={{padding:"8px 10px",color:"#374151"}}>{l.description||`Day ${i+1}`}</td><td style={{padding:"8px 10px",color:"#374151"}}>{l.hours} hrs × {fmt$(l.rate)}/hr</td><td style={{padding:"8px 10px",fontWeight:700}}>{fmt$((parseFloat(l.hours)||0)*(parseFloat(l.rate)||0))}</td></tr>)
                            : (parseFloat(sel.laborHours2)||0)>0&&<tr style={{borderTop:"1px solid #e5e7eb",background:"#fafafa"}}><td colSpan={3} style={{padding:"8px 10px",fontWeight:600,color:"#6b7280"}}>Tech 2 ({sel.tech2Name||"—"}) — {sel.laborHours2} hrs × {fmt$(sel.laborRate2)}/hr</td><td style={{padding:"8px 10px",fontWeight:700}}>{fmt$(t.lab2)}</td></tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  ):<p style={{fontSize:13,color:"#9ca3af",marginBottom:12}}>No materials logged.</p>}
                  <TotalsBox t={t} applyTax={sel.applyTax!==false}/>
                </div>

                {(sel.techSigned||sel.supervisorSigned||sel.accountingClosedBy) && <>
                  <HR/>
                  <div style={{padding:"22px 24px"}}>
                    <SecHead>Approval Trail</SecHead>
                    <div style={{display:"flex",flexDirection:"column",gap:12}}>
                      {sel.techSigned && <div style={{display:"flex",gap:12,alignItems:"flex-start",fontSize:13}}><span style={{width:24,height:24,borderRadius:"50%",background:"#dcfce7",color:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0,fontSize:12}}>✓</span><div><strong>Tech:</strong> {sel.techSignedBy} <span style={{color:"#9ca3af",marginLeft:6}}>{sel.techSignedAt}</span></div></div>}
                      {sel.supervisorSigned && <div style={{display:"flex",gap:12,alignItems:"flex-start",fontSize:13}}><span style={{width:24,height:24,borderRadius:"50%",background:"#dcfce7",color:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0,fontSize:12}}>✓</span><div><div><strong>Supervisor:</strong> {sel.supervisorSignedBy} <span style={{color:"#9ca3af",marginLeft:6}}>{sel.supervisorSignedAt}</span></div>{sel.supervisorNotes&&<div style={{color:"#374151",marginTop:2}}>Note: {sel.supervisorNotes}</div>}</div></div>}
                      {sel.accountingClosedBy && <div style={{display:"flex",gap:12,alignItems:"flex-start",fontSize:13}}><span style={{width:24,height:24,borderRadius:"50%",background:"#dcfce7",color:"#16a34a",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0,fontSize:12}}>✓</span><div><div><strong>Accounting:</strong> {sel.accountingClosedBy} <span style={{color:"#9ca3af",marginLeft:6}}>{sel.accountingClosedAt}</span></div>{sel.accountingNotes&&<div style={{color:"#374151",marginTop:2}}>Note: {sel.accountingNotes}</div>}</div></div>}
                    </div>
                  </div>
                </>}

                {/* Supervisor actions */}
                {role==="supervisor" && sel.status==="awaiting_supervisor" && (
                  <SupervisorPanel sel={sel} supervisors={config.supervisors||[]}
                    onApprove={(draft, notes, supName)=>patch(sel.id,{...draft,status:"awaiting_accounting",supervisorNotes:notes,supervisorSigned:true,supervisorSignedBy:supName,supervisorSignedAt:nowStamp()})}/>
                )}
                {role==="supervisor" && sel.status==="awaiting_accounting" && (
                  <div style={{padding:"18px 24px",background:"#f5f3ff",borderTop:"3px solid #8b5cf6",display:"flex",gap:10,alignItems:"center"}}>
                    <span style={{fontSize:20}}>📤</span><div style={{fontSize:14,color:"#5b21b6",fontWeight:600}}>Approved — in accounting queue.</div>
                  </div>
                )}

                {/* Accounting actions */}
                {role==="accounting" && sel.status==="awaiting_accounting" && (
                  <div style={{padding:"20px 24px",background:"#f5f3ff",borderTop:"3px solid #8b5cf6"}}>
                    <SecHead>Process & Close Job</SecHead>
                    <div style={{background:"#ede9fe",border:"1px solid #c4b5fd",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#5b21b6",fontWeight:600}}>
                      💰 Total: {fmt$(t.total)} &nbsp;·&nbsp; {sel.applyTax!==false?`Materials tax (8%): ${fmt$(t.tax)}`:"No sales tax"} &nbsp;·&nbsp; Labor (untaxed): {fmt$(t.lab)}
                    </div>
                    <Txt label="Accounting Notes" value={act.notes} rows={2} placeholder="Invoice #, payment received…" onChange={e=>setAct(p=>({...p,notes:e.target.value}))}/>
                    <div style={{marginBottom:14}}>
                      <Lbl>Processed By</Lbl>
                      <select style={iSt} value={act.name} onChange={e=>setAct(p=>({...p,name:e.target.value}))}>
                        <option value="">— Select your name —</option>
                        {(config.accountingStaff||[]).map(s=><option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <Btn variant="purple" disabled={!act.name} onClick={()=>patch(sel.id,{status:"closed",accountingNotes:act.notes,accountingClosedBy:act.name,accountingClosedAt:nowStamp()})}>✓ Close & Archive Job</Btn>
                  </div>
                )}

                {/* Closed */}
                {sel.status==="closed" && (
                  <div style={{padding:"20px 24px",background:"#ecfdf5",borderTop:"3px solid #34d399",display:"flex",gap:14,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
                    <div style={{display:"flex",gap:14,alignItems:"center"}}>
                      <span style={{fontSize:32}}>✅</span>
                      <div><div style={{fontWeight:800,fontSize:15,color:"#065f46"}}>Job Fully Closed</div><div style={{fontSize:13,color:"#047857",marginTop:2}}>Processed by accounting and archived.</div></div>
                    </div>
                    {(role==="supervisor"||role==="accounting") && (
                      <button onClick={()=>{ if(window.confirm(`Permanently delete ${sel.woNumber}?`)){ deleteOrder(sel.id); goDash(); } }} style={{background:"none",border:"1px solid #fca5a5",borderRadius:8,color:"#dc2626",cursor:"pointer",padding:"7px 14px",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>🗑 Delete Record</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>
      <div style={{textAlign:"center",padding:"20px 16px",fontSize:11,color:"#9ca3af",fontWeight:600,letterSpacing:"0.05em"}}>
        EXCEL PLUMBING & HEATING LLC · Work Order System · Live on Firebase
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
