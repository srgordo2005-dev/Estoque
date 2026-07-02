import { useState, useEffect, useRef, useCallback } from "react";

/* ═══ FIREBASE ═══════════════════════════════════════════════════ */
const PID="estoque-11264";
const FB=`https://firestore.googleapis.com/v1/projects/${PID}/databases/(default)/documents`;
const BUCKET="estoque-11264.firebasestorage.app";
const ST=`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(BUCKET)}/o`;

function toFS(o){const f={};for(const[k,v]of Object.entries(o)){if(v===null||v===undefined)f[k]={nullValue:null};else if(typeof v==="boolean")f[k]={booleanValue:v};else if(typeof v==="number")f[k]=Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};else if(typeof v==="string")f[k]={stringValue:v};else if(Array.isArray(v))f[k]={arrayValue:{values:v.map(i=>typeof i==="object"&&i?{mapValue:{fields:toFS(i)}}:typeof i==="number"?{integerValue:String(i)}:{stringValue:String(i??"")})}};else if(typeof v==="object")f[k]={mapValue:{fields:toFS(v)}}}return f;}
function fromFS(d){if(!d?.fields)return{};const o={};for(const[k,v]of Object.entries(d.fields)){if("stringValue"in v)o[k]=v.stringValue;else if("integerValue"in v)o[k]=Number(v.integerValue);else if("doubleValue"in v)o[k]=v.doubleValue;else if("booleanValue"in v)o[k]=v.booleanValue;else if("nullValue"in v)o[k]=null;else if("arrayValue"in v)o[k]=(v.arrayValue.values||[]).map(i=>"mapValue"in i?fromFS(i.mapValue):"integerValue"in i?Number(i.integerValue):i.stringValue??null);else if("mapValue"in v)o[k]=fromFS(v.mapValue)}return o;}
async function fbList(c){let docs=[],pt=null;do{const r=await fetch(`${FB}/${c}?pageSize=300${pt?"&pageToken="+pt:""}`);const d=await r.json();if(d.documents)docs=[...docs,...d.documents.map(x=>({...fromFS(x),_id:x.name.split("/").pop()}))];pt=d.nextPageToken}while(pt);return docs;}
async function fbGet(c,id){try{const r=await fetch(`${FB}/${c}/${id}`);if(!r.ok)return null;const d=await r.json();return d.fields?{...fromFS(d),_id:id}:null}catch{return null}}
async function fbSet(c,id,data){await fetch(`${FB}/${c}/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({fields:toFS(data)})})}
async function fbDel(c,id){await fetch(`${FB}/${c}/${id}`,{method:"DELETE"})}
async function fbBatch(writes){
  // Use individual PATCHes to avoid batchWrite auth issues
  const chunks=[];for(let i=0;i<writes.length;i+=50)chunks.push(writes.slice(i,i+50));
  for(const chunk of chunks){await Promise.all(chunk.map(w=>fbSet(w.c,w.id,w.d)));}
}
const markChanged=k=>fbSet("_meta",k,{ts:Date.now()});
const stamp=()=>new Date().toISOString();
const audit=(u,e={})=>({...e,_by:u._id,_byName:u.name,_at:stamp()});

/* ═══ STORAGE ════════════════════════════════════════════════════ */
async function uploadPhoto(b64,path){try{const res=await fetch(b64);const blob=await res.blob();const enc=encodeURIComponent(path);const r=await fetch(`${ST}?name=${enc}`,{method:"POST",headers:{"Content-Type":"image/jpeg"},body:blob});const d=await r.json();if(d.downloadTokens)return`${ST}/${enc}?alt=media&token=${d.downloadTokens}`;return null}catch{return null}}
let wQ=[],wT=null;
function syncSheet(url,action,payload){if(!url)return;wQ.push({action,payload});clearTimeout(wT);wT=setTimeout(()=>{if(!wQ.length)return;const b=[...wQ];wQ=[];fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({batch:b}),mode:"no-cors"}).catch(()=>{})},1500);}
async function importMachinesFromSheet(url,onProgress){
  if(onProgress)onProgress(0,0);
  const r=await fetch(`${url}?action=getMachines`);
  const d=await r.json();
  if(d.error)throw new Error(d.error);
  const machines=d.machines||[];
  if(onProgress)onProgress(machines.length,machines.length);
  return machines;
}
async function importHashesFromSheet(url){
  const r=await fetch(`${url}?action=getHashes`);
  const d=await r.json();
  if(d.error)throw new Error(d.error);
  return d.hashes||[];
}
async function importFromSheet(url){const r=await fetch(url+"?action=getMachines");const d=await r.json();return d.machines||[];}
const compress=f=>new Promise(res=>{const rd=new FileReader();rd.onload=e=>{const img=new Image();img.onload=()=>{const M=720,r=Math.min(M/img.width,M/img.height,1),c=document.createElement("canvas");c.width=img.width*r;c.height=img.height*r;c.getContext("2d").drawImage(img,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.65))};img.src=e.target.result};rd.readAsDataURL(f)});

/* ═══ CONSTANTS ═════════════════════════════════════════════════ */
const DEF_MODELS=[{m:"E9 Pro",th:3680},{m:"E9 Pro+",th:3880},{m:"KS5",th:21},{m:"KS5L",th:14},{m:"KS3",th:8},{m:"S19JPRO+",th:120},{m:"S19KPRO",th:77},{m:"S21XP",th:270},{m:"M20S",th:68},{m:"M30S",th:86},{m:"M30S+",th:100},{m:"M30S++",th:104},{m:"M31S",th:74},{m:"M31S+",th:80},{m:"M50",th:114},{m:"M50S",th:126},{m:"M50S+",th:136},{m:"M50S++",th:158},{m:"M53",th:226},{m:"M53S",th:230},{m:"M56",th:185},{m:"M56S",th:212},{m:"M60",th:160},{m:"M60S",th:178},{m:"M60S+",th:200},{m:"M60S++",th:218},{m:"M63",th:372},{m:"M63S",th:408},{m:"M63S++",th:464},{m:"M66",th:276},{m:"M66S",th:288},{m:"M70S",th:300},{m:"M73S",th:380},{m:"S9",th:13},{m:"S9i",th:14},{m:"S9j",th:14},{m:"S9k",th:13},{m:"S9 SE",th:16},{m:"T17",th:40},{m:"T17+",th:64},{m:"T17e",th:53},{m:"S17 Pro",th:53},{m:"S17+",th:73},{m:"T19",th:84},{m:"S19",th:95},{m:"S19 Pro",th:110},{m:"S19j",th:90},{m:"S19j Pro",th:104},{m:"S19j Pro+",th:120},{m:"S19k Pro",th:136},{m:"S19 XP",th:140},{m:"S19 XP Hyd",th:255},{m:"T21",th:190},{m:"S21",th:200},{m:"S21 Pro",th:234},{m:"S21 XP",th:270},{m:"S21 XP Hyd",th:495},{m:"S23",th:318},{m:"S23 Hyd",th:580}];
const SIT_OPTS=["STOCK","BOA","AGUARD. REVISÃO","REVISAR","ENTRADA OFICINA","LIGADA","VENDIDA","PREPARANDO","SAIDA","EXPORTADA","CASTANHAO"];
const HST_OPTS=["ON","OFF","TESTAR","REPARO","STOCK","SAIDA","IRREPARAVEL"];
const SIT_C={"STOCK":"#d97706","BOA":"#16a34a","AGUARD. REVISÃO":"#2563eb","REVISAR":"#dc2626","ENTRADA OFICINA":"#0ea5e9","LIGADA":"#8b5cf6","VENDIDA":"#dc2626","PREPARANDO":"#2563eb","SAIDA":"#dc2626","EXPORTADA":"#dc2626","CASTANHAO":"#92400e"};
const HST_C={ON:"#16a34a",OFF:"#dc2626",TESTAR:"#d97706",REPARO:"#8b5cf6",STOCK:"#64748b",SAIDA:"#ea580c",IRREPARAVEL:"#374151"};
const TODAY=()=>new Date().toISOString().split("T")[0];
const fmtDate=d=>d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"—";
const fmtTS=s=>s?new Date(s).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const fmtTime=s=>s?new Date(s).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"";
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const PERMS=[{key:"repairs",label:"Conserto de HASHs"},{key:"testing",label:"Teste de Máquinas"},{key:"machines",label:"Estoque de Máquinas"},{key:"hashes",label:"Estoque de HASHs"},{key:"admin",label:"Admin (acesso total)"}];

/* ═══ UI PRIMITIVES ═════════════════════════════════════════════ */
const C={bg:"#080e17",card:"#0f1923",border:"#1a2d42",accent:"#f97316",blue:"#0ea5e9",green:"#16a34a",red:"#dc2626",purple:"#7c3aed",amber:"#d97706",text:"#e2e8f0",muted:"#64748b",subtle:"#94a3b8"};
const inp={width:"100%",background:"#080e17",border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box",outline:"none"};
const Inp=({label,err,...p})=><div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<input {...p} style={{...inp,borderColor:err?C.red:C.border,...p.style}}/>{err&&<div style={{color:C.red,fontSize:11,marginTop:3}}>⚠️ {err}</div>}</div>;
const Sel=({label,children,...p})=><div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<select {...p} style={{...inp,...p.style}}>{children}</select></div>;
const Btn=({v="o",children,...p})=>{const vs={o:{bg:C.accent,c:"#fff"},s:{bg:"#1a2d42",c:C.text},d:{bg:C.red,c:"#fff"},g:{bg:C.green,c:"#fff"},b:{bg:"#0c2a3a",c:C.blue},p:{bg:C.purple,c:"#fff"},y:{bg:C.amber,c:"#fff"}};const st=vs[v]||vs.o;return<button {...p} style={{background:st.bg,color:st.c,border:"none",borderRadius:8,padding:"10px 16px",fontWeight:700,fontSize:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,opacity:p.disabled?.5:1,...p.style}}>{children}</button>};
const Modal=({title,onClose,children})=><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"flex-end"}}><div style={{background:C.card,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:640,margin:"0 auto",maxHeight:"92vh",overflow:"auto",padding:20,boxSizing:"border-box"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div style={{fontWeight:800,fontSize:16,color:C.text}}>{title}</div><button onClick={onClose} style={{background:"#1a2d42",border:"none",color:C.subtle,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:18}}>✕</button></div>{children}</div></div>;
const Card=({accent,onClick,children,style})=><div onClick={onClick} style={{background:C.card,borderRadius:12,padding:14,marginBottom:10,cursor:onClick?"pointer":"default",borderLeft:accent?`3px solid ${accent}`:undefined,...style}}>{children}</div>;
const Tag=({color,children,small})=><span style={{background:color,color:"#fff",borderRadius:6,padding:small?"1px 7px":"3px 9px",fontSize:small?10:11,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
const SL=({children,mt})=><div style={{color:C.subtle,fontSize:10,fontWeight:800,letterSpacing:1,marginBottom:8,marginTop:mt||0}}>{children}</div>;
const HP=({s})=><span style={{background:HST_C[s]||C.muted,color:"#fff",borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:800}}>{s||"—"}</span>;
const SP=({s})=><span style={{background:SIT_C[s]||C.muted,color:"#fff",borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:700}}>{s||"—"}</span>;
const By=({by,at})=>by?<div style={{fontSize:10,color:C.muted,marginTop:3}}>✏️ {by} · {fmtTS(at)}</div>:null;
const Alrt=({type,children})=>{const m={ok:{bg:"#0c2a0f",b:C.green,c:C.green},err:{bg:"#2a0c0c",b:C.red,c:C.red},warn:{bg:"#2a1a00",b:C.amber,c:C.amber}};const s=m[type]||m.warn;return<div style={{background:s.bg,border:`1px solid ${s.b}`,borderRadius:10,padding:12,marginBottom:12,color:s.c,fontWeight:700,fontSize:13}}>{children}</div>};

/* ═══ BARCODE SCANNER ══════════════════════════════════════════ */
function BarcodeScanner({onScan,onClose}){
  const vRef=useRef(),sRef=useRef(),rRef=useRef();
  const[err,setErr]=useState(""),[ok,setOk]=useState(false);
  useEffect(()=>{(async()=>{try{if(!("BarcodeDetector"in window)){setErr("Scanner não suportado.\nUse Chrome no Android.");return}const det=new window.BarcodeDetector({formats:["qr_code","code_128","code_39","code_93","ean_13","data_matrix"]});const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1920}}});sRef.current=stream;vRef.current.srcObject=stream;await vRef.current.play();setOk(true);const scan=async()=>{try{const f=await det.detect(vRef.current);if(f.length>0){stream.getTracks().forEach(t=>t.stop());onScan(f[0].rawValue);return}}catch{}rRef.current=requestAnimationFrame(scan)};rRef.current=requestAnimationFrame(scan)}catch(e){setErr("Câmera:\n"+e.message)}})();return()=>{if(sRef.current)sRef.current.getTracks().forEach(t=>t.stop());if(rRef.current)cancelAnimationFrame(rRef.current)};},[]);
  return<div style={{position:"fixed",inset:0,background:"#000",zIndex:500}}>{err?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"#fff",padding:24,textAlign:"center",gap:16}}><div style={{fontSize:52}}>📵</div><div style={{whiteSpace:"pre-line"}}>{err}</div><Btn onClick={onClose}>Fechar</Btn></div>:<><video ref={vRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} playsInline muted/><div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)"}}/><div style={{position:"relative",zIndex:1,width:290,height:150,borderRadius:12,boxShadow:"0 0 0 9999px rgba(0,0,0,.55)"}}><div style={{position:"absolute",top:"50%",left:4,right:4,height:2,background:"#f97316",borderRadius:2}}/></div><div style={{position:"relative",zIndex:1,color:"#fff",marginTop:20,fontSize:14,fontWeight:700}}>{ok?"🔍 Aponte para o código...":"⏳ Iniciando..."}</div></div><button onClick={onClose} style={{position:"absolute",top:20,right:20,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:20,padding:"8px 18px",cursor:"pointer",fontWeight:700,zIndex:2}}>✕</button></>}</div>;
}

function SNInput({label,value,onChange,placeholder,list,onEnter,autoFocus,err}){
  const[sc,setSc]=useState(false);
  return<div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<div style={{display:"flex",gap:8}}><input list={list} value={value} onChange={e=>onChange(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&onEnter?.()} placeholder={placeholder||"SN"} autoFocus={autoFocus} style={{...inp,flex:1,borderColor:err?C.red:C.border}}/><button onClick={()=>setSc(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:20,flexShrink:0}} title="Escanear">📷</button></div>{err&&<div style={{color:C.red,fontSize:11,marginTop:3}}>⚠️ {err}</div>}{sc&&<BarcodeScanner onScan={v=>{onChange(v.toUpperCase());setSc(false);onEnter?.()}} onClose={()=>setSc(false)}/>}</div>;
}

/* ═══ PHOTO ═════════════════════════════════════════════════════ */
function PhotoCapture({label,photoKey,onChange,folder="photos",required}){
  const[src,setSrc]=useState(null),[up,setUp]=useState(false);const ref=useRef();
  useEffect(()=>{if(!photoKey){setSrc(null);return}if(photoKey.startsWith("http")||photoKey.startsWith("data:"))setSrc(photoKey);else setSrc(localStorage.getItem("ph:"+photoKey))},[photoKey]);
  const pick=async f=>{setUp(true);const b64=await compress(f);setSrc(b64);const url=await uploadPhoto(b64,`${folder}/${uid()}.jpg`);onChange(url||b64);setUp(false)};
  return<div style={{marginBottom:14}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>{label}{required&&<span style={{color:C.red}}> *</span>}</div>}{up&&<div style={{color:C.amber,fontSize:12,marginBottom:6}}>⏳ Enviando...</div>}{src?<div style={{position:"relative"}}><img src={src} alt="" style={{width:"100%",borderRadius:10,maxHeight:220,objectFit:"cover"}}/><button onClick={()=>{setSrc(null);onChange(null)}} style={{position:"absolute",top:6,right:6,background:C.red,border:"none",color:"#fff",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontWeight:700}}>✕</button></div>:<div style={{display:"flex",gap:8}}><button onClick={()=>ref.current.click()} style={{flex:1,background:"#080e17",border:`2px dashed ${C.border}`,color:C.muted,borderRadius:10,padding:16,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📷 {required?"(Obrigatória)":"Foto"}</button><button onClick={async()=>{try{const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>t.startsWith("image/"));if(type){const blob=await item.getType(type);const file=new File([blob],"paste.jpg",{type});await pick(file);return}}alert("Nenhuma imagem no clipboard")}catch{alert("Copie uma imagem (print screen) e toque Colar")}}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.blue,borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}} title="Colar print">📋 Colar</button></div>}<input ref={ref} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>e.target.files[0]&&pick(e.target.files[0])}/></div>;
}
function PhotoView({photoKey,style}){
  const[src,setSrc]=useState(null);
  useEffect(()=>{if(!photoKey)return;if(photoKey.startsWith("http")||photoKey.startsWith("data:"))setSrc(photoKey);else setSrc(localStorage.getItem("ph:"+photoKey))},[photoKey]);
  if(!src)return null;
  return<img src={src} alt="" style={{width:"100%",borderRadius:8,objectFit:"cover",...style}}/>;
}

/* ═══ REPORT ════════════════════════════════════════════════════ */
function generateReport(user,repairs,tests,date){
  const dr=repairs.filter(r=>r.employeeId===user._id&&r.date===date&&r.type!=="already_good");
  const dg=repairs.filter(r=>r.employeeId===user._id&&r.date===date&&r.type==="already_good");
  const dt=tests.filter(t=>t.employeeId===user._id&&t.date===date);
  const d=new Date(date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});
  const lines=[`📋 Relatório — ${user.name} #${user.code}`,`📅 ${d}`,``];
  if(dr.length){lines.push(`🔧 HASHs Consertadas (${dr.length}):`);dr.forEach(r=>{let obs="";if(r.chips)obs+=` | Chips:${r.chips}`;if(r.sensores)obs+=` | Sens:${r.sensores}`;if(r.ldos)obs+=` | LDOs:${r.ldos}`;if(r.obsManual)obs+=` | ${r.obsManual}`;lines.push(`• ${r.hashSN||"SEM SN"} — ${r.model}${obs} — ${fmtTime(r._at)}`)});lines.push("")}
  if(dg.length){lines.push(`✅ Já Estavam Boas (${dg.length}):`);dg.forEach(r=>lines.push(`• ${r.hashSN||"SEM SN"} — ${r.model} — ${fmtTime(r._at)}`));lines.push("")}
  if(dt.length){lines.push(`🧪 Máquinas Testadas (${dt.length}):`);dt.forEach(t=>{const st=t.status==="pending"?"Aguard. Revisão":t.overallResult==="good"?"BOA":"RUIM";lines.push(`• ${t.machineSN||"SEM SN"} — ${t.model} — ${st} — ${fmtTime(t._at)}`)});lines.push("")}
  lines.push(`✅ Total consertos: ${dr.length} | Testes: ${dt.length}`);
  return lines.join("\n");
}
function copyReport(user,repairs,tests,date){const txt=generateReport(user,repairs,tests,date);navigator.clipboard.writeText(txt).then(()=>alert("✓ Relatório copiado! Cole no WhatsApp.")).catch(()=>alert(txt));}

/* ═══ APP ROOT ══════════════════════════════════════════════════ */
export default function App(){
  const[user,setUser]=useState(null);
  const[data,setData]=useState({employees:[],machines:[],hashes:[],repairs:[],tests:[],feedbacks:[],approvals:[],customModels:[],pallets:[],clients:[]});
  const[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[tab,setTab]=useState("home"),[modal,setModal]=useState(null),[camOpen,setCamOpen]=useState(false);
  const[webhookUrl,setWebhookUrl]=useState(()=>localStorage.getItem("webhookUrl")||"");
  const lastMeta=useRef({});
  const setCol=(col,val)=>setData(d=>({...d,[col]:val}));
  const mutate=(col,fn)=>setData(d=>({...d,[col]:fn(d[col])}));
  const allModels=useCallback(()=>[...DEF_MODELS,...data.customModels].sort((a,b)=>a.m.localeCompare(b.m)),[data.customModels]);
  const gTH=useCallback(m=>{const f=[...DEF_MODELS,...data.customModels].find(x=>x.m===m);return f?.th||0},[data.customModels]);
  const loadAll=useCallback(async()=>{const[e,m,h,r,t,f,a,cm,p,cl]=await Promise.all([fbList("employees"),fbList("machines"),fbList("hashes"),fbList("repairs"),fbList("tests"),fbList("feedbacks"),fbList("pendingApprovals"),fbList("customModels"),fbList("pallets"),fbList("clients")]);setData({employees:e.length?e:data.employees,machines:m,hashes:h,repairs:r,tests:t,feedbacks:f,approvals:a,customModels:cm,pallets:p,clients:cl})},[]);

  useEffect(()=>{(async()=>{setLoading(true);const emps=await fbList("employees");if(emps.length===0){const id=uid();const adm={code:"00",name:"Admin",role:"admin",permissions:{repairs:true,testing:true,machines:true,hashes:true,admin:true},canSeeAll:true};await fbSet("employees",id,adm);setCol("employees",[{...adm,_id:id}])}else setCol("employees",emps);const[m,h,r,t,f,a,cm,p,cl]=await Promise.all([fbList("machines"),fbList("hashes"),fbList("repairs"),fbList("tests"),fbList("feedbacks"),fbList("pendingApprovals"),fbList("customModels"),fbList("pallets"),fbList("clients")]);setData(d=>({...d,machines:m,hashes:h,repairs:r,tests:t,feedbacks:f,approvals:a,customModels:cm,pallets:p,clients:cl}));setLoading(false)})()},[]);
  useEffect(()=>{const poll=async()=>{try{const r=await fetch(`${FB}/_meta?pageSize=20`);const d=await r.json();const docs=d.documents||[];let changed=false;docs.forEach(doc=>{const id=doc.name.split("/").pop();const ts=doc.fields?.ts?.integerValue;if(ts&&lastMeta.current[id]!==ts){lastMeta.current[id]=ts;changed=true}});if(changed){setSyncing(true);await loadAll();setSyncing(false)}}catch{}};const iv=setInterval(poll,15000);return()=>clearInterval(iv)},[loadAll]);

  const ctx={user,data,setCol,mutate,setModal,setTab,loadAll,webhookUrl,setWebhookUrl,allModels,gTH};
  if(loading)return<Splash/>;
  if(!user)return<LoginPage employees={data.employees} onLogin={setUser}/>;

  const p=user.permissions||{};const isAdmin=p.admin;
  const canSeeEmp=id=>isAdmin||(user.allowedEmployees||[]).includes(id);
  const pendingApprs=data.approvals.filter(a=>a.status==="pending");
  const myFdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===user._id);
  const myRevisit=data.machines.filter(m=>m.situacao==="REVISAR"&&m.lastTesterId===user._id);

  const TABS=[
    {id:"home",icon:"🏠",label:"Início"},
    ...(p.machines||isAdmin?[{id:"mac",icon:"🖥️",label:"Máquinas"}]:[]),
    ...(p.hashes||isAdmin?[{id:"hsh",icon:"⚡",label:"HASHs"}]:[]),
    ...(p.repairs&&!isAdmin?[{id:"conserto",icon:"🔧",label:"Conserto"}]:[]),
    ...(p.testing&&!isAdmin?[{id:"teste",icon:"🧪",label:"Teste"}]:[]),
    ...((p.repairs||p.testing)&&!isAdmin?[{id:"hist",icon:"📋",label:"Histórico"}]:[]),
    ...(p.machines||p.hashes||isAdmin?[{id:"pal",icon:"📦",label:"Paletes"}]:[]),...(isAdmin?[{id:"cli",icon:"👥",label:"Clientes"}]:[]),...(isAdmin?[{id:"approvals",icon:"✅",label:"Revisão"},{id:"team",icon:"👷",label:"Equipe"},{id:"cfg",icon:"⚙️",label:"Config"}]:[]),
  ];

  return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text,maxWidth:680,margin:"0 auto"}}>
    <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:20}}>⛏️</span>
      <div style={{flex:1}}><div style={{fontWeight:900,fontSize:14,color:C.accent}}>HashStock</div><div style={{fontSize:10,color:C.muted}}>{user.name} #{user.code}{syncing?" · 🔄":""}</div></div>
      <div style={{display:"flex",gap:6}}>
        {myFdbs.length>0&&<Tag color={C.red}>⚠️{myFdbs.length}</Tag>}
        {myRevisit.length>0&&<Tag color={C.red}>🔁{myRevisit.length}</Tag>}
        {isAdmin&&pendingApprs.length>0&&<Tag color={C.blue}>✅{pendingApprs.length}</Tag>}
      </div>
      <button onClick={()=>setUser(null)} style={{background:"#1a2d42",border:"none",color:C.subtle,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12}}>Sair</button>
    </div>
    <div style={{padding:"14px 12px 100px"}}>
      {tab==="home"&&<HomePage ctx={ctx} isAdmin={isAdmin} myFdbs={myFdbs} myRevisit={myRevisit} pendingApprs={pendingApprs} canSeeEmp={canSeeEmp}/>}
      {tab==="mac"&&<MacPage ctx={ctx}/>}
      {tab==="hsh"&&<HashPage ctx={ctx}/>}
      {tab==="conserto"&&<ConsertaPage ctx={ctx}/>}
      {tab==="teste"&&<TestePage ctx={ctx}/>}
      {tab==="hist"&&<HistPage ctx={ctx}/>}
      {tab==="approvals"&&<ApprovalsPage ctx={ctx}/>}
      {tab==="team"&&<TeamPage ctx={ctx} canSeeEmp={canSeeEmp}/>}
      {tab==="cfg"&&<CfgPage ctx={ctx}/>}
    </div>
    <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:680,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100}}>
      {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",padding:"8px 2px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===t.id?C.accent:C.muted}}><span style={{fontSize:17}}>{t.icon}</span><span style={{fontSize:8,fontWeight:800}}>{t.label}</span></button>)}
    </nav>
    <button onClick={()=>setCamOpen(true)} style={{position:"fixed",right:16,bottom:72,width:52,height:52,borderRadius:"50%",background:C.accent,border:"none",cursor:"pointer",fontSize:22,zIndex:99,boxShadow:"0 4px 16px rgba(249,115,22,.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>
    {camOpen&&<CamModal ctx={ctx} onClose={()=>setCamOpen(false)}/>}
    {modal}
  </div>;
}

const Splash=()=><div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{fontSize:52}}>⛏️</div><div style={{fontWeight:900,color:C.text,fontSize:18,marginTop:8}}>HashStock</div><div style={{color:C.muted,fontSize:12,marginTop:4}}>Conectando...</div></div></div>;

/* ═══ LOGIN ═════════════════════════════════════════════════════ */
function LoginPage({employees,onLogin}){
  const[pin,setPin]=useState(""),[err,setErr]=useState("");
  const go=()=>{const e=employees.find(x=>x.code===pin.trim());if(e)onLogin(e);else setErr("Código inválido")};
  return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><div style={{width:"100%",maxWidth:320,textAlign:"center"}}><div style={{fontSize:56}}>⛏️</div><div style={{fontWeight:900,fontSize:24,color:C.accent,marginTop:8}}>HashStock</div><div style={{color:C.muted,fontSize:12,marginBottom:28}}>Sistema de Gestão</div><div style={{background:C.card,borderRadius:16,padding:24}}><div style={{color:C.subtle,fontSize:10,fontWeight:800,letterSpacing:1,marginBottom:10}}>CÓDIGO DE ACESSO</div><input value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} maxLength={2} placeholder="00" style={{...inp,fontSize:42,textAlign:"center",letterSpacing:16,fontWeight:900,marginBottom:14,padding:"14px 0"}}/>{err&&<div style={{color:C.red,fontSize:13,marginBottom:10}}>{err}</div>}<Btn onClick={go} style={{width:"100%",justifyContent:"center"}}>Entrar</Btn></div></div></div>;
}

/* ═══ CAMERA MODAL ══════════════════════════════════════════════ */
function CamModal({ctx,onClose}){
  const{data,mutate,setModal,user}=ctx;
  const[sn,setSn]=useState(""),[photoKey,setPhotoKey]=useState(null),[result,setResult]=useState(null);
  const lookup=()=>{
    const s=sn.toUpperCase().trim();if(!s)return;
    const mac=data.machines.find(m=>m.sn===s);
    const hsh=data.hashes.find(h=>h.sn===s);
    // Check if exists as SEM SN
    const noSNHash=!hsh&&data.hashes.find(h=>!h.sn&&h.model);
    if(mac)setResult({type:"mac",item:mac});
    else if(hsh)setResult({type:"hsh",item:hsh});
    else setResult({type:"new",sn:s});
  };
  const linkSN=async(hash)=>{
    const upd={...hash,sn:sn.toUpperCase().trim(),...audit(user)};
    mutate("hashes",h=>h.map(x=>x._id===hash._id?upd:x));
    await fbSet("hashes",hash._id,upd);await markChanged("hashes");
    setResult({type:"hsh",item:upd});
  };
  return<Modal title="📷 Scanner SN" onClose={onClose}>
    <PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey}/>
    <SNInput value={sn} onChange={setSn} placeholder="Bipe, escaneie ou digite" onEnter={lookup}/>
    <Btn onClick={lookup} style={{width:"100%",justifyContent:"center",marginBottom:16}}>🔍 Buscar</Btn>
    {result&&<div style={{background:"#080e17",borderRadius:12,padding:16}}>
      {result.type==="new"&&<div>
        <div style={{color:C.amber,fontWeight:700,marginBottom:10}}>🆕 SN novo: {result.sn}</div>
        {/* Check if there's a SEM SN hash to link */}
        {data.hashes.filter(h=>!h.sn).length>0&&<div style={{marginBottom:12}}>
          <div style={{color:C.subtle,fontSize:12,marginBottom:8}}>Ou vincular a uma HASH sem SN:</div>
          {data.hashes.filter(h=>!h.sn).slice(0,3).map(h=><div key={h._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:12,color:C.blue}}>⚡ SEM SN — {h.model} <HP s={h.status}/></span>
            <Btn v="b" onClick={()=>linkSN(h)} style={{padding:"4px 10px",fontSize:11}}>Vincular</Btn>
          </div>)}
        </div>}
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={()=>{onClose();setModal(<Modal title="Nova Máquina" onClose={()=>setModal(null)}><AddMachineForm ctx={ctx} initSN={result.sn} initPhoto={photoKey} onClose={()=>setModal(null)}/></Modal>)}} style={{flex:1}}>🖥️ Máquina</Btn>
          <Btn v="b" onClick={()=>{onClose();setModal(<Modal title="Nova HASH" onClose={()=>setModal(null)}><AddHashForm ctx={ctx} initSN={result.sn} initPhoto={photoKey} onClose={()=>setModal(null)}/></Modal>)}} style={{flex:1}}>⚡ HASH</Btn>
        </div>
      </div>}
      {result.type==="mac"&&<QMacEdit item={result.item} ctx={ctx} onUpdate={u=>setResult({...result,item:u})}/>}
      {result.type==="hsh"&&<QHashEdit item={result.item} ctx={ctx} onUpdate={u=>setResult({...result,item:u})} photoKey={photoKey}/>}
    </div>}
  </Modal>;
}
function QMacEdit({item,ctx,onUpdate}){const{mutate,user}=ctx;const save=async s=>{const u={...item,situacao:s,...audit(user)};mutate("machines",m=>m.map(x=>x._id===item._id?u:x));await fbSet("machines",item._id,u);await markChanged("machines");onUpdate(u)};return<div><div style={{fontWeight:800,fontSize:15,color:C.accent}}>🖥️ {item.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12,marginBottom:8}}>{item.model} · {item.type==="shell"?"Carcaça":"Completa"}</div><SP s={item.situacao}/><div style={{marginTop:10}}><SL>SITUAÇÃO</SL><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{SIT_OPTS.map(s=><button key={s} onClick={()=>save(s)} style={{background:item.situacao===s?SIT_C[s]:"#1a2d42",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>)}</div></div><By by={item._byName} at={item._at}/></div>}
function QHashEdit({item,ctx,onUpdate,photoKey}){
  const{mutate,user}=ctx;
  const save=async s=>{const u={...item,status:s,...audit(user)};mutate("hashes",h=>h.map(x=>x._id===item._id?u:x));await fbSet("hashes",item._id,u);await markChanged("hashes");onUpdate(u)};
  const updateSN=async()=>{if(!item._pendingSN)return;const u={...item,sn:item._pendingSN,...audit(user),_pendingSN:undefined};mutate("hashes",h=>h.map(x=>x._id===item._id?u:x));await fbSet("hashes",item._id,u);await markChanged("hashes");onUpdate(u)};
  return<div>
    <div style={{fontWeight:800,fontSize:15,color:C.blue}}>⚡ {item.sn||"SEM SN"}</div>
    <div style={{color:C.muted,fontSize:12,marginBottom:8}}>{item.model}</div>
    <HP s={item.status}/>
    {!item.sn&&<div style={{marginTop:8}}><Inp label="ADICIONAR SN" value={item._pendingSN||""} onChange={e=>onUpdate({...item,_pendingSN:e.target.value.toUpperCase()})} placeholder="Digite o SN"/><Btn v="g" onClick={updateSN} style={{width:"100%",marginBottom:8}}>✓ Vincular SN</Btn></div>}
    <div style={{marginTop:10}}><SL>STATUS</SL><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{HST_OPTS.map(s=><button key={s} onClick={()=>save(s)} style={{background:item.status===s?HST_C[s]:"#1a2d42",color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>)}</div></div>
    <By by={item._byName} at={item._at}/>
  </div>;
}

/* ═══ HOME ══════════════════════════════════════════════════════ */
function HomePage({ctx,isAdmin,myFdbs,myRevisit,pendingApprs}){
  const{user,data,setTab}=ctx;const today=TODAY();
  const toTest=data.hashes.filter(h=>h.status==="TESTAR");
  return<div>
    <div style={{fontWeight:900,fontSize:22,marginBottom:4}}>Olá, {user.name.split(" ")[0]} 👋</div>
    <div style={{color:C.muted,fontSize:12,marginBottom:18}}>#{user.code} · {new Date().toLocaleDateString("pt-BR",{weekday:"long"})}</div>
    {isAdmin&&pendingApprs.length>0&&<Card accent={C.blue} onClick={()=>setTab("approvals")} style={{marginBottom:14}}><div style={{fontWeight:800,color:C.blue,fontSize:15}}>✅ {pendingApprs.length} máquina(s) aguardando revisão</div><div style={{fontSize:12,color:C.muted,marginTop:4}}>Toque para revisar e autorizar</div></Card>}
    {myFdbs.length>0&&<div style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>⚠️ Para Re-consertar ({myFdbs.length})</div>{myFdbs.map(f=><Card key={f._id} accent={C.red}><div style={{fontWeight:800,color:C.red}}>⚡ {f.hashSN||"SEM SN"}</div><div style={{fontSize:12,marginTop:4}}>{f.notes||"Ver log"}</div><By by={f._byName} at={f._at}/>{f.logPhotoKey&&<PhotoView photoKey={f.logPhotoKey} style={{marginTop:8,maxHeight:100}}/>}</Card>)}</div>}
    {myRevisit.length>0&&<div style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>🔁 Para Revisar ({myRevisit.length})</div>{myRevisit.map(m=><Card key={m._id} accent={C.red}><div style={{fontWeight:800}}>🖥️ {m.sn||"SEM SN"} — {m.model}</div><div style={{fontSize:12,color:C.red,marginTop:4}}>{m.adminNote||"Admin solicitou revisão"}</div></Card>)}</div>}
    {user.permissions?.testing&&!isAdmin&&<div style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontWeight:800,fontSize:14}}>⏳ Para Testar</div><Tag color={toTest.length>0?C.amber:"#1a2d42"}>{toTest.length}</Tag></div>{toTest.slice(0,3).map(h=>{const rep=data.employees.find(e=>e._id===h.repairedBy);return<div key={h._id} style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700,fontSize:13,color:C.blue}}>⚡ {h.sn||"SEM SN"}</div><div style={{fontSize:11,color:C.muted}}>{h.model}{rep?` · 👷 ${rep.name}`:""}</div></div><HP s={h.status}/></div>})}<Btn v="g" onClick={()=>setTab("teste")} style={{width:"100%",justifyContent:"center",marginTop:8}}>🧪 Iniciar Teste</Btn></div>}
    {isAdmin&&<AdminSummary data={data}/>}
    <div style={{marginTop:16}}><Btn v="s" onClick={()=>copyReport(user,data.repairs,data.tests,today)} style={{width:"100%",justifyContent:"center"}}>📋 Copiar Relatório do Dia</Btn></div>
  </div>;
}
function AdminSummary({data}){
  const today=TODAY();const ms={};
  data.machines.forEach(m=>{if(!ms[m.model])ms[m.model]={model:m.model,boa:0,ruim:0,shell:0,conserto:0};if(m.type==="shell")ms[m.model].shell++;else if(["BOA","STOCK","LIGADA"].includes(m.situacao))ms[m.model].boa++;else if(m.situacao==="ENTRADA OFICINA")ms[m.model].conserto++;else ms[m.model].ruim++});
  const irrep=data.hashes.filter(h=>h.status==="IRREPARAVEL").length;
  return<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>{[{label:"Máquinas",v:data.machines.filter(m=>m.type==="complete").length,sub:`${data.machines.filter(m=>["BOA","STOCK"].includes(m.situacao)).length} ok`,c:C.accent},{label:"HASHs",v:data.hashes.length,sub:`${data.hashes.filter(h=>h.status==="TESTAR").length} p/ testar · ${irrep} irrep.`,c:C.blue},{label:"Consertos Hoje",v:data.repairs.filter(r=>r.date===today&&r.type!=="already_good").length,sub:"HASHs",c:C.green},{label:"Testes Hoje",v:data.tests.filter(t=>t.date===today).length,sub:"máquinas",c:C.purple}].map(s=><Card key={s.label} accent={s.c} style={{margin:0}}><div style={{fontSize:26,fontWeight:900,color:s.c}}>{s.v}</div><div style={{fontWeight:700,fontSize:12,marginTop:4}}>{s.label}</div><div style={{fontSize:10,color:C.muted}}>{s.sub}</div></Card>)}</div>
  <Card><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>📊 Por Modelo</div>{Object.values(ms).sort((a,b)=>(b.boa+b.ruim)-(a.boa+a.ruim)).map(s=><div key={s.model} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><div style={{fontWeight:700,fontSize:13}}>{s.model}</div><div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>{s.boa>0&&<Tag color={C.green} small>{s.boa} boas</Tag>}{s.ruim>0&&<Tag color={C.red} small>{s.ruim} ruins</Tag>}{s.shell>0&&<Tag color="#475569" small>{s.shell} carc.</Tag>}{s.conserto>0&&<Tag color={C.amber} small>{s.conserto} cons.</Tag>}</div></div>)}</Card></>;
}

/* ═══ MACHINES ══════════════════════════════════════════════════ */
function MacPage({ctx}){
  const{data,setModal}=ctx;
  const[search,setSearch]=useState(""),[fSit,setFSit]=useState("all"),[fType,setFType]=useState("all");
  const filtered=data.machines.filter(m=>{const ms=(m.sn||"").toLowerCase().includes(search.toLowerCase())||m.model?.toLowerCase().includes(search.toLowerCase());const typOk=fType==="all"||(fType==="complete"&&m.type==="complete")||(fType==="shell"&&m.type==="shell")||(fType==="nosn"&&!m.sn);return ms&&(fSit==="all"||m.situacao===fSit)&&typOk});const sitCounts={};[...SIT_OPTS].forEach(s=>sitCounts[s]=data.machines.filter(m=>m.situacao===s).length);
  const openAdd=()=>setModal(<Modal title="Adicionar" onClose={()=>setModal(null)}><AddModeSelect ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=m=>setModal(<Modal title={`🖥️ ${m.sn||"SEM SN"}`} onClose={()=>setModal(null)}><MachineDetail ctx={ctx} machine={m}/></Modal>);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><div style={{fontWeight:900,fontSize:18}}>Máquinas</div><div style={{color:C.muted,fontSize:12}}>{data.machines.length} cadastradas</div></div><Btn onClick={openAdd}>+ Adicionar</Btn></div>
    <div style={{background:C.card,borderRadius:10,padding:"8px 12px",display:"flex",gap:8,marginBottom:10}}>🔍<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SN ou modelo..." style={{background:"none",border:"none",color:C.text,fontSize:13,flex:1,outline:"none"}}/></div>
    <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:2}}>
      {[["all","Todas"],["complete","Completas"],["shell","Carcaças"]].map(([id,l])=><button key={id} onClick={()=>setFType(id)} style={{background:fType===id?C.accent:C.card,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{l}</button>)}
      {["BOA","AGUARD. REVISÃO","REVISAR","STOCK","ENTRADA OFICINA"].map(s=><button key={s} onClick={()=>setFSit(fSit===s?"all":s)} style={{background:fSit===s?SIT_C[s]:C.card,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{s}</button>)}
    </div>
    {filtered.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>🖥️</div>Nenhuma máquina</div>
      :filtered.map(m=><Card key={m._id} accent={SIT_C[m.situacao]||C.border} onClick={()=>openDetail(m)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><div><div style={{fontWeight:800,fontSize:14,color:!m.sn?C.red:C.text}}>{m.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12}}>{m.model} · {m.th}TH</div><By by={m._byName} at={m._at}/></div><SP s={m.situacao}/></div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><HP s={m.hash0}/><HP s={m.hash1}/><HP s={m.hash2}/>{m.controladora&&<span style={{fontSize:10,color:C.subtle}}>CTR:{m.controladora}</span>}{m.fans&&<span style={{fontSize:10,color:C.subtle}}>FAN:{m.fans}</span>}</div>
      </Card>)}
  </div>;
}

function AddModeSelect({ctx,onClose}){
  const[mode,setMode]=useState(null);
  if(!mode)return<div><div style={{color:C.subtle,fontSize:13,marginBottom:18,textAlign:"center"}}>Como deseja adicionar?</div><div style={{display:"flex",flexDirection:"column",gap:10}}><Btn onClick={()=>setMode("single")} style={{justifyContent:"center",padding:"14px 0"}}>🖥️ Individual</Btn><Btn v="b" onClick={()=>setMode("batch-sn")} style={{justifyContent:"center",padding:"14px 0"}}>📋 Lote COM SN</Btn><Btn v="p" onClick={()=>setMode("batch-nosn")} style={{justifyContent:"center",padding:"14px 0"}}>📦 Lote SEM SN</Btn></div></div>;
  if(mode==="single")return<AddMachineForm ctx={ctx} onClose={onClose}/>;
  if(mode==="batch-sn")return<BatchSNForm ctx={ctx} onClose={onClose}/>;
  return<BatchNoSNForm ctx={ctx} onClose={onClose}/>;
}

function BatchSNForm({ctx,onClose}){
  const{data,mutate,user,allModels,gTH}=ctx;const models=allModels();
  const[model,setModel]=useState(models[0]?.m||"M30S"),[th,setTh]=useState(gTH(models[0]?.m||"M30S")),[type,setType]=useState("complete"),[sit,setSit]=useState("STOCK"),[pending,setPending]=useState([]),[input,setInput]=useState(""),[saving,setSaving]=useState(false);
  const addSN=()=>{const s=input.toUpperCase().trim();if(!s||pending.includes(s))return;setPending(p=>[...p,s]);setInput("")};
  const saveAll=async()=>{if(!pending.length)return;setSaving(true);const writes=pending.map(sn=>{const id=uid();return{c:"machines",id,d:{sn,model,th:Number(th),type,situacao:sit,hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",ref:user.code,location:location||"",...audit(user),addedAt:TODAY(),destino:""}}});await fbBatch(writes);mutate("machines",m=>[...m,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("machines");setSaving(false);onClose()};
  return<div><div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div><Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:70}}/></div><div style={{display:"flex",gap:8}}><Sel label="TIPO" value={type} onChange={e=>setType(e.target.value)} style={{flex:1}}><option value="complete">Completa</option><option value="shell">Carcaça</option></Sel><Sel label="SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)} style={{flex:1}}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel></div><div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}><SL>BIPE OU ESCANEIE → ENTER</SL><SNInput value={input} onChange={setInput} placeholder="SN..." autoFocus onEnter={addSN}/><div style={{maxHeight:160,overflow:"auto"}}>{pending.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN</div>:pending.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,fontFamily:"monospace",color:C.blue}}>{s}</span><button onClick={()=>setPending(pending.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button></div>)}</div></div><div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={saveAll} disabled={saving||!pending.length} style={{flex:1}}>{saving?"...":"💾 Salvar "+pending.length}</Btn></div></div>;
}

function BatchNoSNForm({ctx,onClose}){
  const{data,mutate,user,allModels,gTH}=ctx;const models=allModels();
  const[itemType,setItemType]=useState("machine"),[model,setModel]=useState(models[0]?.m||"M30S"),[th,setTh]=useState(gTH(models[0]?.m||"M30S")),[sit,setSit]=useState("STOCK"),[qty,setQty]=useState("10"),[saving,setSaving]=useState(false),[prog,setProg]=useState(0);
  const save=async()=>{const n=parseInt(qty);if(!n||n<1||n>1000)return;setSaving(true);const isHash=itemType==="hash";const writes=Array.from({length:n},()=>{const id=uid();const d=isHash?{sn:"",model,status:"REPARO",machineSN:"",slot:-1,location:location||"",...audit(user),addedAt:TODAY()}:{sn:"",model,th:Number(th),type:itemType==="shell"?"shell":"complete",situacao:sit,hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",ref:user.code,location:location||"",...audit(user),addedAt:TODAY(),destino:""};return{c:isHash?"hashes":"machines",id,d}});for(let i=0;i<writes.length;i+=500){await fbBatch(writes.slice(i,i+500));setProg(Math.min(i+500,writes.length))}mutate(isHash?"hashes":"machines",arr=>[...arr,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged(isHash?"hashes":"machines");setSaving(false);onClose()};
  return<div><SL>TIPO</SL><div style={{display:"flex",gap:8,marginBottom:14}}>{[["machine","🖥️ Máq."],["shell","📦 Carc."],["hash","⚡ HASH"]].map(([v,l])=><button key={v} onClick={()=>setItemType(v)} style={{flex:1,background:itemType===v?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div><div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div>{itemType!=="hash"&&<Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:70}}/>}</div>{itemType!=="hash"&&<Sel label="SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>}<Inp label="QUANTIDADE" type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Ex: 300"/>{saving&&<div style={{background:"#0c2a0f",borderRadius:8,padding:10,marginBottom:12}}><div style={{color:C.green,fontWeight:700,marginBottom:4}}>Salvando {prog}/{qty}...</div><div style={{background:"#1a2d42",borderRadius:4,height:6}}><div style={{background:C.green,borderRadius:4,height:6,width:`${(prog/parseInt(qty||1))*100}%`,transition:"width .3s"}}/></div></div>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={save} disabled={saving} style={{flex:1}}>{saving?"...":"📦 Criar "+qty}</Btn></div></div>;
}

function AddMachineForm({ctx,onClose,initSN="",initPhoto=null}){
  const{data,mutate,user,allModels,gTH}=ctx;const models=allModels();
  const[f,setF]=useState({sn:initSN,model:models[0]?.m||"M30S",th:gTH(models[0]?.m||"M30S"),type:"complete",hash0:"OFF",hash1:"OFF",hash2:"OFF",hashSN0:"",hashSN1:"",hashSN2:"",controladora:"OFF",fonte:"OFF",fans:"OFF",situacao:"STOCK",destino:""});
  const[photoKey,setPhotoKey]=useState(initPhoto),[saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);const id=uid();const d={...f,th:Number(f.th),sn:f.sn.toUpperCase().trim(),...audit(user),addedAt:TODAY(),photoKey:photoKey||""};await fbSet("machines",id,d);mutate("machines",m=>[...m,{...d,_id:id}]);await markChanged("machines");setSaving(false);onClose()};
  return<div>
    <SNInput label="SN" value={f.sn} onChange={v=>set("sn",v)} placeholder="Deixe vazio se não tiver"/>
    <div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={f.model} onChange={e=>{set("model",e.target.value);set("th",gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div><Inp label="T/H" type="number" value={f.th} onChange={e=>set("th",e.target.value)} style={{width:70}}/></div>
    <div style={{display:"flex",gap:8}}><Sel label="TIPO" value={f.type} onChange={e=>set("type",e.target.value)} style={{flex:1}}><option value="complete">Completa</option><option value="shell">Carcaça</option></Sel><Sel label="SITUAÇÃO" value={f.situacao} onChange={e=>set("situacao",e.target.value)} style={{flex:1}}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel></div>
    {f.type==="complete"&&<>{[0,1,2].map(i=><div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}><span style={{color:C.subtle,fontSize:11,width:50}}>HASH {i}</span><input value={f[`hashSN${i}`]} onChange={e=>set(`hashSN${i}`,e.target.value.toUpperCase())} placeholder="SN" style={{...inp,flex:1,fontSize:12,padding:"7px 10px"}}/><select value={f[`hash${i}`]} onChange={e=>set(`hash${i}`,e.target.value)} style={{...inp,width:85,padding:"7px 8px",fontSize:12}}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</select></div>)}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]].map(([k,l])=><Sel key={k} label={l} value={f[k]} onChange={e=>set(k,e.target.value)} style={{marginBottom:0}}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>)}</div></>}
    <PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey}/>
    <div style={{display:"flex",gap:8,marginTop:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={saving} style={{flex:1}}>{saving?"...":"💾 Salvar"}</Btn></div>
  </div>;
}

function MachineDetail({ctx,machine}){
  const{data,mutate,setModal,user}=ctx;
  const[m,setM]=useState(machine);
  const upd=async(k,v)=>{const u={...m,[k]:v,...audit(user)};setM(u);mutate("machines",arr=>arr.map(x=>x._id===m._id?u:x));await fbSet("machines",m._id,u);await markChanged("machines")};
  const history=[];
  data.tests.filter(t=>t.machineSN===m.sn&&m.sn).forEach(t=>{const emp=data.employees.find(e=>e._id===t.employeeId);history.push({date:t._at||t.date,text:"Testada por "+(emp?.name||"?")+" — "+(t.status==="pending"?"Aguard.Revisão":t.overallResult==="good"?"BOA":"RUIM"),photoKey:t.testPhoto})});
  history.sort((a,b)=>a.date<b.date?-1:1);
  const exitSits=["SAIDA","EXPORTADA","VENDIDA"];
  const setSituacao=async(s)=>{
    if(exitSits.includes(s)&&!exitSits.includes(m.situacao)){
      const mHashes=data.hashes.filter(h=>h.machineSN===m.sn&&m.sn);
      if(mHashes.length>0){
        const ok=window.confirm(mHashes.length+" HASH(s) nesta máquina.\nAo marcar como "+s+", elas vão para SAIDA junto.\nContinuar?");
        if(!ok)return;
        for(const h of mHashes){
          const u={...h,status:"SAIDA",location:s+" com "+m.sn+" em "+TODAY(),...audit(user)};
          mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));
          await fbSet("hashes",h._id,u);
        }
        await markChanged("hashes");
      }
    }
    await upd("situacao",s);
  };
  return(
    <div>
      <div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}>
        <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><SP s={m.situacao}/>{m.type==="shell"&&<Tag color={C.muted}>CARCAÇA</Tag>}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
          <div><div style={{color:C.muted,fontSize:10}}>MODELO</div><div style={{fontWeight:700}}>{m.model}</div></div>
          <div><div style={{color:C.muted,fontSize:10}}>T/H</div><div style={{fontWeight:700}}>{m.th}</div></div>
        </div>
        <By by={m._byName} at={m._at}/>
      </div>
      <SL>Situação</SL>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        {SIT_OPTS.map(s=>(
          <button key={s} onClick={()=>setSituacao(s)} style={{background:m.situacao===s?(SIT_C[s]||"#1a2d42"):"#080e17",color:m.situacao===s?"#fff":C.text,border:"1px solid "+(m.situacao===s?(SIT_C[s]||C.accent):C.border),borderRadius:8,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>
        ))}
      </div>
      {m.type==="complete"&&(
        <div style={{marginBottom:14}}>
          <SL>Slots</SL>
          {[0,1,2].map(i=>{
            const slotSN=m["hashSN"+i]||"";
            const slotHash=slotSN?data.hashes.find(h=>h.sn===slotSN):null;
            return(
              <div key={i} style={{marginBottom:8}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{color:C.subtle,fontSize:10,width:50,flexShrink:0,fontWeight:800}}>SLOT {i+1}</span>
                  <input value={slotSN} onChange={e=>upd("hashSN"+i,e.target.value.toUpperCase())} placeholder="SN da HASH" style={{...inp,flex:1,fontSize:12,padding:"7px 8px"}}/>
                  <select value={m["hash"+i]||"OFF"} onChange={e=>upd("hash"+i,e.target.value)} style={{...inp,width:78,padding:"7px 6px",fontSize:10}}>
                    {HST_OPTS.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                {slotHash&&(
                  <button onClick={()=>setModal(<Modal title={"⚡ "+slotHash.sn} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={slotHash}/></Modal>)} style={{background:HST_C[slotHash.status]+"15",border:"1px solid "+HST_C[slotHash.status]+"44",borderRadius:8,padding:"5px 12px",cursor:"pointer",width:"calc(100% - 58px)",marginLeft:58,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:HST_C[slotHash.status],fontWeight:700}}>{"⚡ "+slotHash.model+" — "+(slotHash.sn||"").slice(0,14)}</span>
                    <span style={{fontSize:10,color:C.muted}}>{"ver →"}</span>
                  </button>
                )}
              </div>
            );
          })}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:8}}>
            {[["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]].map(([k,l])=>(
              <div key={k}>
                <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4}}>{l}</div>
                <select value={m[k]||"OFF"} onChange={e=>upd(k,e.target.value)} style={{...inp,padding:"7px 8px",fontSize:12}}>
                  {HST_OPTS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      <SNInput label="SN (editar)" value={m.sn||""} onChange={v=>upd("sn",v)} placeholder="Digite o SN" err=""/>
      {history.length>0&&(
        <><SL mt={12}>📋 HISTÓRICO</SL>
        {history.map((ev,i)=>(
          <div key={i} style={{padding:"6px 0",borderBottom:"1px solid "+C.border,fontSize:12}}>
            <div style={{fontWeight:700}}>{ev.text}</div>
            <div style={{color:C.muted,fontSize:10}}>{fmtTS(ev.date)}</div>
            {ev.photoKey&&<PhotoView photoKey={ev.photoKey} style={{marginTop:6,maxHeight:80}}/>}
          </div>
        ))}</>
      )}
      <Btn v="d" onClick={async()=>{mutate("machines",arr=>arr.filter(x=>x._id!==m._id));await fbDel("machines",m._id);await markChanged("machines");setModal(null)}} style={{width:"100%",marginTop:14}}>🗑 Remover</Btn>
    </div>
  );
}

/* ═══ HASHES ════════════════════════════════════════════════════ */
function HashPage({ctx}){
  const{data,setModal}=ctx;const[search,setSearch]=useState(""),[fS,setFS]=useState("all");
  const filtered=data.hashes.filter(h=>(h.sn||"").toLowerCase().includes(search.toLowerCase())||h.model?.toLowerCase().includes(search.toLowerCase())).filter(h=>fS==="all"||h.status===fS);
  const openAdd=()=>setModal(<Modal title="Adicionar HASH" onClose={()=>setModal(null)}><HashAddMode ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=h=>setModal(<Modal title={`⚡ ${h.sn||"SEM SN"}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={h}/></Modal>);
  const counts=Object.fromEntries(HST_OPTS.map(s=>[s,data.hashes.filter(h=>h.status===s).length]));
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><div style={{fontWeight:900,fontSize:18}}>HASHboards</div><div style={{color:C.muted,fontSize:12}}>{data.hashes.length} cadastradas</div></div><Btn onClick={openAdd}>+ Adicionar</Btn></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>{[["TESTAR",C.amber,"Testar"],["REPARO",C.purple,"Reparo"],["ON",C.green,"ON"],["OFF",C.red,"OFF"]].map(([s,c,l])=><div key={s} style={{background:C.card,borderRadius:10,padding:"10px 6px",textAlign:"center",borderTop:`2px solid ${c}`}}><div style={{fontSize:22,fontWeight:900,color:c}}>{counts[s]||0}</div><div style={{fontSize:9,color:C.muted,fontWeight:700}}>{l}</div></div>)}</div>
    <div style={{background:C.card,borderRadius:10,padding:"8px 12px",display:"flex",gap:8,marginBottom:10}}>🔍<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SN ou modelo..." style={{background:"none",border:"none",color:C.text,fontSize:13,flex:1,outline:"none"}}/></div>
    <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:2}}><button onClick={()=>setFS("all")} style={{background:fS==="all"?C.accent:C.card,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Todas</button>{HST_OPTS.map(s=><button key={s} onClick={()=>setFS(s)} style={{background:fS===s?HST_C[s]:C.card,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{s}</button>)}</div>
    {filtered.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>⚡</div>Nenhuma HASH</div>
      :filtered.map(h=>{const mac=data.machines.find(m=>m.sn===h.machineSN);const rep=data.employees.find(e=>e._id===h.repairedBy);return<Card key={h._id} accent={HST_C[h.status]||C.border} onClick={()=>openDetail(h)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:800,fontSize:14,color:h.status==="IRREPARAVEL"?"#9ca3af":C.blue}}>⚡ {h.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12}}>{h.model}</div></div><HP s={h.status}/></div>
        <div style={{display:"flex",gap:10,fontSize:11,color:C.muted,marginTop:5}}>{mac?<span style={{color:C.accent}}>🖥️ Slot {h.slot>=0?h.slot+1:"?"}</span>:<span>📦 Solta</span>}{rep&&<span>👷 {rep.name}</span>}</div>
        <By by={h._byName} at={h._at}/>
      </Card>})}
  </div>;
}

function HashAddMode({ctx,onClose}){const[mode,setMode]=useState(null);if(!mode)return<div><div style={{display:"flex",flexDirection:"column",gap:10}}><Btn onClick={()=>setMode("single")} style={{justifyContent:"center",padding:"14px 0"}}>⚡ Individual</Btn><Btn v="p" onClick={()=>setMode("batch-nosn")} style={{justifyContent:"center",padding:"14px 0"}}>📦 Lote SEM SN</Btn></div></div>;if(mode==="single")return<AddHashForm ctx={ctx} onClose={onClose}/>;return<BatchNoSNForm ctx={ctx} onClose={onClose}/>;}

function AddHashForm({ctx,onClose,initSN="",initPhoto=null}){
  const{data,mutate,user,allModels}=ctx;const models=allModels();
  const[f,setF]=useState({sn:initSN,model:models[0]?.m||"M30S",status:"REPARO"}),[photoKey,setPhotoKey]=useState(initPhoto);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{const id=uid();const d={...f,sn:f.sn.toUpperCase().trim(),...audit(user),addedAt:TODAY(),machineSN:"",slot:-1,repairedBy:"",photoKey:photoKey||""};await fbSet("hashes",id,d);mutate("hashes",h=>[...h,{...d,_id:id}]);await markChanged("hashes");onClose()};
  return<div><SNInput label="SN (deixe vazio se não tiver)" value={f.sn} onChange={v=>set("sn",v)} placeholder="SN da HASH"/><Sel label="MODELO" value={f.model} onChange={e=>set("model",e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel><Sel label="STATUS" value={f.status} onChange={e=>set("status",e.target.value)}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel><PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey}/><div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} style={{flex:1}}>Salvar</Btn></div></div>;
}

function HashDetail({ctx,hash}){
  const{data,mutate,setModal,user}=ctx;const[h,setH]=useState(hash),[confirmIrrep,setConfirmIrrep]=useState(false),[editLoc,setEditLoc]=useState(false),[locVal,setLocVal]=useState(hash.location||"");
  const upd=async(k,v)=>{const u={...h,[k]:v,...audit(user)};setH(u);mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes")};
  const history=[];
  data.repairs.filter(r=>r.hashSN===h.sn&&h.sn).forEach(r=>{const emp=data.employees.find(e=>e._id===r.employeeId);let obs="";if(r.chips)obs+=` · Chips:${r.chips}`;if(r.sensores)obs+=` · Sens:${r.sensores}`;if(r.ldos)obs+=` · LDOs:${r.ldos}`;if(r.obsManual)obs+=` · ${r.obsManual}`;history.push({icon:r.type==="already_good"?"✅":"🔧",date:r._at||r.date,text:r.type==="already_good"?`Verificada OK por ${emp?.name||"?"} (já estava boa)`:`Consertada por ${emp?.name||"?"}${obs}`,notes:r.notes,photoKey:r.photoKey})});
  data.tests.forEach(t=>{const si=[t.slot0HashSN,t.slot1HashSN,t.slot2HashSN].indexOf(h.sn);if(si<0||!h.sn)return;const emp=data.employees.find(e=>e._id===t.employeeId);const res=si===0?t.slot0Result:si===1?t.slot1Result:t.slot2Result;history.push({icon:"🧪",date:t._at||t.date,text:`Testada por ${emp?.name||"?"} — Máq.${t.machineSN||"s/n"} Slot${si+1} — ${res==="good"?"BOA ✓":"RUIM ✗"}`,photoKey:si===0?t.slot0Photo:si===1?t.slot1Photo:t.slot2Photo})});
  data.feedbacks.filter(f=>f.hashSN===h.sn&&h.sn).forEach(f=>{const emp=data.employees.find(e=>e._id===f.originalRepairerId);history.push({icon:"⚠️",date:f._at||f.date,text:`Devolvida para ${emp?.name||"?"}`,notes:f.notes,photoKey:f.logPhotoKey})});
  history.sort((a,b)=>a.date<b.date?-1:1);
  const mac=data.machines.find(m=>m.sn===h.machineSN);
  return<div>
    <div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}>
      <HP s={h.status}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10,fontSize:12}}>
        <div><div style={{color:C.muted,fontSize:10}}>MODELO</div><div style={{fontWeight:700}}>{h.model}</div></div>
        <div><div style={{color:C.muted,fontSize:10}}>LOCALIZAÇÃO</div>
          {mac?<button onClick={()=>setModal(<Modal title={`🖥️ ${mac.sn}`} onClose={()=>setModal(null)}><MachineDetail ctx={ctx} machine={mac}/></Modal>)} style={{background:"none",border:"none",color:C.green,fontWeight:700,fontSize:12,cursor:"pointer",padding:0,textAlign:"left"}}>🖥️ Slot{h.slot>=0?h.slot+1:"?"} → {mac.sn?.slice(0,10)} ↗</button>
          :<div style={{color:C.muted,fontSize:11}}>
            {editLoc?<div style={{display:"flex",gap:4}}><input value={locVal} onChange={e=>setLocVal(e.target.value.toUpperCase())} style={{...inp,fontSize:11,padding:"4px 8px",flex:1}} placeholder="Ex: PRATELEIRA 1"/><button onClick={async()=>{await upd("location",locVal);setEditLoc(false)}} style={{background:C.green,border:"none",borderRadius:6,color:"#fff",padding:"4px 8px",cursor:"pointer",fontWeight:700}}>✓</button></div>
            :<button onClick={()=>{setEditLoc(true);setLocVal(h.location||"")}} style={{background:"none",border:`1px dashed ${C.border}`,borderRadius:6,color:h.location?C.text:C.muted,padding:"3px 8px",cursor:"pointer",fontSize:11,width:"100%",textAlign:"left"}}>{h.location||"⊕ Definir local..."}</button>}
          </div>}
        </div>
      </div>
      {mac&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}><SP s={mac.situacao}/><span style={{fontSize:11,color:C.muted}}>{mac.model} · {mac.th}TH</span></div>}
      {(data.pallets||[]).filter(pl=>(pl.machinesSN||[]).includes(h.sn)).map(pl=><div key={pl._id} style={{fontSize:11,color:C.blue,marginTop:4}}>📦 {pl.name}{pl.location?` — ${pl.location}`:""}</div>)}
      <By by={h._byName} at={h._at}/>
    </div>
    <SL>STATUS</SL><div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{["ON","OFF","TESTAR","REPARO","STOCK"].map(s=><button key={s} onClick={()=>upd("status",s)} style={{background:h.status===s?HST_C[s]:"#080e17",color:"#fff",border:`1px solid ${HST_C[s]}`,borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer"}}>{s}</button>)}</div>
    <SNInput label="SN (editar)" value={h.sn||""} onChange={v=>upd("sn",v)} placeholder="Digite o SN" err=""/>
    {!confirmIrrep?<Btn v="d" onClick={()=>setConfirmIrrep(true)} style={{width:"100%",marginBottom:12}}>💀 Marcar como Irreparável</Btn>:<div style={{background:"#1a0a0a",border:`1px solid ${C.red}`,borderRadius:10,padding:14,marginBottom:12}}><div style={{fontWeight:800,color:C.red,marginBottom:8}}>⚠️ Confirmar Irreparável?</div><div style={{fontSize:12,color:C.text,marginBottom:12}}>Marcada para retirada de peças.</div><div style={{display:"flex",gap:8}}><Btn v="s" onClick={()=>setConfirmIrrep(false)} style={{flex:1}}>Cancelar</Btn><Btn v="d" onClick={async()=>{await upd("status","IRREPARAVEL");setConfirmIrrep(false)}} style={{flex:1}}>Confirmar</Btn></div></div>}
    <SL mt={8}>📋 HISTÓRICO COMPLETO</SL>
    {history.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Sem histórico</div>:history.map((ev,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:12}}><div style={{display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:C.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{ev.icon}</div>{i<history.length-1&&<div style={{width:2,flex:1,background:C.border,marginTop:4}}/>}</div><div style={{flex:1,paddingBottom:8}}><div style={{fontSize:12,fontWeight:700}}>{ev.text}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(ev.date)}</div>{ev.notes&&<div style={{fontSize:11,color:C.subtle,marginTop:2}}>{ev.notes}</div>}{ev.photoKey&&<PhotoView photoKey={ev.photoKey} style={{marginTop:6,maxHeight:100}}/>}</div></div>)}
    <Btn v="d" onClick={async()=>{mutate("hashes",arr=>arr.filter(x=>x._id!==h._id));await fbDel("hashes",h._id);await markChanged("hashes");setModal(null)}} style={{width:"100%",marginTop:8}}>🗑 Remover</Btn>
  </div>;
}

/* ═══ CONSERTO ══════════════════════════════════════════════════ */
function ConsertaPage({ctx}){
  const{data,mutate,user,allModels,webhookUrl}=ctx;const models=allModels();
  const[f,setF]=useState({hashSN:"",model:models[0]?.m||"M30S",obsType:"quantity",chips:"",sensores:"",ldos:"",obsManual:"",notes:""});
  const[photoKey,setPhotoKey]=useState(null),[saved,setSaved]=useState(null),[photoErr,setPhotoErr]=useState("");
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  const doSubmit=async(type)=>{
    if(!f.hashSN.trim())return;
    if(!photoKey){setPhotoErr("Foto obrigatória!");return}
    setPhotoErr("");
    const sn=f.hashSN.toUpperCase().trim();const id=uid();
    const rec={hashSN:sn,model:f.model,type,photoKey:photoKey||"",...audit(user),date:TODAY(),status:"TESTAR"};
    if(type==="repair"){Object.assign(rec,{chips:f.chips||"",sensores:f.sensores||"",ldos:f.ldos||"",obsManual:f.obsType==="manual"?f.obsManual:"",notes:f.notes})}
    await fbSet("repairs",id,rec);mutate("repairs",r=>[...r,{...rec,_id:id}]);
    // Hash → TESTAR
    const ex=data.hashes.find(h=>h.sn===sn);
    if(ex){const u={...ex,status:"TESTAR",repairedBy:type==="repair"?user._id:ex.repairedBy,...audit(user)};mutate("hashes",h=>h.map(x=>x._id===ex._id?u:x));await fbSet("hashes",ex._id,u)}
    else{const hid=uid();const hd={sn,model:f.model,status:"TESTAR",repairedBy:type==="repair"?user._id:"",...audit(user),addedAt:TODAY(),machineSN:"",slot:-1,photoKey:photoKey||""};await fbSet("hashes",hid,hd);mutate("hashes",h=>[...h,{...hd,_id:hid}])}
    syncSheet(webhookUrl,type==="repair"?"repair":"alreadyGood",{...rec,employeeCode:user.code,employeeName:user.name});
    await markChanged("repairs");await markChanged("hashes");
    setF({hashSN:"",model:f.model,obsType:"quantity",chips:"",sensores:"",ldos:"",obsManual:"",notes:""});setPhotoKey(null);
    setSaved(type);setTimeout(()=>setSaved(null),2500);
  };

  const myFdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===user._id);
  return<div>
    {saved==="repair"&&<Alrt type="ok">✓ Conserto registrado! HASH vai para fila de teste.</Alrt>}
    {saved==="already_good"&&<Alrt type="ok">✅ Registrada como já estava boa! Vai para fila de teste.</Alrt>}
    {myFdbs.length>0&&<div style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>⚠️ Para Re-consertar</div>{myFdbs.map(f=><Card key={f._id} accent={C.red}><div style={{fontWeight:800,color:C.red}}>⚡ {f.hashSN||"SEM SN"}</div><div style={{fontSize:12,marginTop:4}}>{f.notes}</div><By by={f._byName} at={f._at}/>{f.logPhotoKey&&<PhotoView photoKey={f.logPhotoKey} style={{marginTop:8,maxHeight:100}}/>}</Card>)}</div>}
    <Card>
      <SL>REGISTRAR CONSERTO DE HASH</SL>
      <SNInput label="SN DA HASHBOARD" value={f.hashSN} onChange={v=>set("hashSN",v)} placeholder="Bipe, escaneie ou digite" list="hsh-rep"/>
      <datalist id="hsh-rep">{data.hashes.filter(h=>["REPARO","OFF"].includes(h.status)).map(h=><option key={h._id} value={h.sn||""}>{h.sn||"SEM SN"} — {h.model}</option>)}</datalist>
      <Sel label="MODELO" value={f.model} onChange={e=>set("model",e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
      {/* Observation type */}
      <SL mt={4}>TIPO DE OBSERVAÇÃO DO CONSERTO</SL>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button onClick={()=>set("obsType","quantity")} style={{flex:1,background:f.obsType==="quantity"?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>Por Quantidade</button>
        <button onClick={()=>set("obsType","manual")} style={{flex:1,background:f.obsType==="manual"?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>Descrição Livre</button>
      </div>
      {f.obsType==="quantity"?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Inp label="CHIPS" type="number" value={f.chips} onChange={e=>set("chips",e.target.value)} placeholder="0"/>
        <Inp label="SENSORES" type="number" value={f.sensores} onChange={e=>set("sensores",e.target.value)} placeholder="0"/>
        <Inp label="LDOs" type="number" value={f.ldos} onChange={e=>set("ldos",e.target.value)} placeholder="0"/>
      </div>:<Inp label="DESCRIÇÃO DO CONSERTO" value={f.obsManual} onChange={e=>set("obsManual",e.target.value)} placeholder="Ex: 3 chips U3 trocados, reballing..."/>}
      <Inp label="OBSERVAÇÃO ADICIONAL" value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="Opcional..."/>
      <PhotoCapture label="FOTO / PRINT (obrigatória)" photoKey={photoKey} onChange={k=>{setPhotoKey(k);setPhotoErr("")}} folder="consertos" required/>
      {photoErr&&<Alrt type="err">{photoErr}</Alrt>}
      <div style={{display:"flex",gap:8}}>
        <Btn v="y" onClick={()=>doSubmit("already_good")} style={{flex:1}}>✅ Já Estava Boa</Btn>
        <Btn onClick={()=>doSubmit("repair")} style={{flex:1}}>🔧 Consertada</Btn>
      </div>
      <div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:8}}>Ambas vão para fila de Teste</div>
    </Card>
    <div style={{marginTop:14}}><Btn v="s" onClick={()=>copyReport(user,data.repairs,data.tests,TODAY())} style={{width:"100%",justifyContent:"center"}}>📋 Copiar Relatório do Dia</Btn></div>
  </div>;
}

/* ═══ TESTE ═════════════════════════════════════════════════════ */
function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH}=ctx;const models=allModels();
  const[session,setSession]=useState(null),[macInput,setMacInput]=useState(""),[slotModal,setSlotModal]=useState(null),[submitting,setSubmitting]=useState(false),[done,setDone]=useState(false),[err,setErr]=useState("");
  useEffect(()=>{fbGet("sessions",user._id).then(s=>{if(s)setSession(s)})},[user._id]);
  const saveSession=async s=>{setSession(s);await fbSet("sessions",user._id,s)};
  const loadMachine=async()=>{const sn=macInput.toUpperCase().trim();if(!sn)return;const ex=data.machines.find(m=>m.sn===sn);const s={machineSN:sn,model:ex?.model||models[0]?.m||"M30S",th:ex?.th||gTH(ex?.model||"M30S"),slots:[{hashSN:ex?.hashSN0||"",model:models[0]?.m||"M30S",status:"",photoKey:null},{hashSN:ex?.hashSN1||"",model:models[0]?.m||"M30S",status:"",photoKey:null},{hashSN:ex?.hashSN2||"",model:models[0]?.m||"M30S",status:"",photoKey:null}],controladora:"",fonte:"",fans:"",photoKey:null,updatedAt:stamp()};await saveSession(s)};
  const submitForApproval=async()=>{
    if(!session)return;if(!session.photoKey){setErr("Foto da tela obrigatória!");return}if(!session.controladora||!session.fonte||!session.fans){setErr("Marque controladora, fonte e cooler!");return}
    setErr("");setSubmitting(true);const id=uid();
    const rec={machineSN:session.machineSN,model:session.model,th:session.th,employeeId:user._id,...audit(user),date:TODAY(),status:"pending",slot0HashSN:session.slots[0].hashSN||"",slot0Result:session.slots[0].status||"",slot0Photo:session.slots[0].photoKey||"",slot1HashSN:session.slots[1].hashSN||"",slot1Result:session.slots[1].status||"",slot1Photo:session.slots[1].photoKey||"",slot2HashSN:session.slots[2].hashSN||"",slot2Result:session.slots[2].status||"",slot2Photo:session.slots[2].photoKey||"",controladora:session.controladora,fonte:session.fonte,fans:session.fans,testPhoto:session.photoKey,overallResult:"pending"};
    await fbSet("tests",id,rec);mutate("tests",t=>[...t,{...rec,_id:id}]);
    const apprId=uid();await fbSet("pendingApprovals",apprId,{testId:id,machineSN:session.machineSN,model:session.model,th:session.th,employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)});mutate("approvals",a=>[...a,{testId:id,machineSN:session.machineSN,model:session.model,th:session.th,employeeId:user._id,employeeName:user.name,date:TODAY(),status:"pending",_id:apprId}]);
    const exMac=data.machines.find(m=>m.sn===session.machineSN);if(exMac){const u={...exMac,situacao:"AGUARD. REVISÃO",lastTesterId:user._id,...audit(user)};mutate("machines",m=>m.map(x=>x._id===exMac._id?u:x));await fbSet("machines",exMac._id,u)}
    await markChanged("tests");await markChanged("approvals");await markChanged("machines");
    syncSheet(webhookUrl,"test",{...rec,employeeCode:user.code,employeeName:user.name});
    await fbDel("sessions",user._id);setSession(null);setMacInput("");setSubmitting(false);setDone(true);setTimeout(()=>setDone(false),3000);
  };
  const compOk=session&&session.controladora&&session.fonte&&session.fans;const photoOk=session&&session.photoKey;
  return<div>
    {done&&<Alrt type="ok">✓ Enviado para revisão do admin!</Alrt>}{err&&<Alrt type="err">{err}</Alrt>}
    <Card style={{marginBottom:14}}>
      <SNInput label="SN DA CARCAÇA" value={macInput} onChange={setMacInput} placeholder="Bipe, escaneie ou digite" list="mac-tst" onEnter={loadMachine}/>
      <datalist id="mac-tst">{data.machines.map(m=><option key={m._id} value={m.sn||""}>{m.sn||"SEM SN"} — {m.model}</option>)}</datalist>
      <Btn onClick={loadMachine} style={{width:"100%",justifyContent:"center"}}>→ Carregar Máquina</Btn>
      {session&&<div style={{marginTop:10,padding:"8px 12px",background:"#080e17",borderRadius:8,display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:800,color:C.accent}}>{session.machineSN}</span><span style={{color:C.muted,fontSize:12}}>{session.model} · {session.th}TH</span></div>}
    </Card>
    {session&&<>
      {[0,1,2].map(i=>{const slot=session.slots[i];const hsh=slot.hashSN?data.hashes.find(h=>h.sn===slot.hashSN):null;const rep=hsh?data.employees.find(e=>e._id===hsh?.repairedBy):null;
        return<div key={i} onClick={()=>setSlotModal(i)} style={{background:C.card,borderRadius:12,padding:14,marginBottom:10,cursor:"pointer",borderLeft:`3px solid ${slot.status==="good"?C.green:slot.status==="bad"?C.red:C.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:800,fontSize:13,color:C.subtle}}>SLOT {i+1}</div>{slot.hashSN?<span style={{background:slot.status==="good"?C.green:slot.status==="bad"?C.red:C.amber,color:"#fff",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700}}>{slot.status==="good"?"✓ BOA":slot.status==="bad"?"✗ RUIM":"⏳ Pendente"}</span>:<span style={{color:C.muted,fontSize:12}}>Toque para adicionar HASH</span>}</div>
          {slot.hashSN&&<><div style={{fontWeight:700,fontSize:14,color:C.blue,marginTop:6}}>⚡ {slot.hashSN}</div><div style={{fontSize:12,color:C.muted}}>{slot.model}{rep?` · 👷 ${rep.name}`:""}</div></>}
        </div>})}
      <Card style={{marginBottom:14}}>
        <SL>COMPONENTES</SL>
        {[["controladora","Controladora"],["fonte","Fonte"],["fans","Cooler"]].map(([k,l])=><div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,fontWeight:700}}>{l}</span><div style={{display:"flex",gap:6}}>{[["ON","Bom",C.green],["OFF","Ruim",C.red]].map(([v,lbl,c])=><button key={v} onClick={()=>saveSession({...session,[k]:v,updatedAt:stamp()})} style={{background:session[k]===v?c:"#1a2d42",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{lbl}</button>)}</div></div>)}
      </Card>
      <Card style={{marginBottom:14}}>
        <PhotoCapture label="📸 FOTO DA TELA DO TESTADOR (obrigatória)" photoKey={session.photoKey||null} onChange={k=>saveSession({...session,photoKey:k,updatedAt:stamp()})} folder="testes" required/>
      </Card>
      <Btn v="g" onClick={submitForApproval} disabled={submitting||!compOk||!photoOk} style={{width:"100%",justifyContent:"center",padding:"16px 0",fontSize:15}}>
        {submitting?"Enviando...":"✅ Enviar para Revisão do Admin"}
      </Btn>
      {(!compOk||!photoOk)&&<div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:6}}>{!photoOk?"Foto obrigatória":""}{!compOk?" · Complete todos os componentes":""}</div>}
    </>}
    {slotModal!==null&&<SlotModal ctx={ctx} session={session} slotIndex={slotModal} onSave={saveSession} onClose={()=>setSlotModal(null)}/>}
  </div>;
}

function SlotModal({ctx,session,slotIndex,onSave,onClose}){
  const{data,mutate,user,allModels}=ctx;const models=allModels();
  const slot=session.slots[slotIndex];
  const[sn,setSN]=useState(slot.hashSN||""),[model,setModel]=useState(slot.model||models[0]?.m||"M30S"),[photoKey,setPhotoKey]=useState(slot.photoKey||null),[logPhotoKey,setLogPhotoKey]=useState(null),[logNotes,setLogNotes]=useState(""),[showBad,setShowBad]=useState(false),[saving,setSaving]=useState(false),[photoErr,setPhotoErr]=useState("");
  const hsh=sn?data.hashes.find(h=>h.sn===sn.toUpperCase()):null;const rep=hsh?data.employees.find(e=>e._id===hsh?.repairedBy):null;
  const confirmSlot=async()=>{if(!photoKey){setPhotoErr("Foto da tela obrigatória!");return}setPhotoErr("");const newSlots=[...session.slots];newSlots[slotIndex]={hashSN:sn.toUpperCase().trim(),model,status:"good",photoKey:photoKey||""};await onSave({...session,slots:newSlots,updatedAt:stamp()});if(sn.trim()){const ex=data.hashes.find(h=>h.sn===sn.toUpperCase());if(ex){const u={...ex,machineSN:session.machineSN,slot:slotIndex,...audit(user)};mutate("hashes",h=>h.map(x=>x._id===ex._id?u:x));await fbSet("hashes",ex._id,u)}}await markChanged("hashes");onClose()};
  const markBad=async()=>{if(!logPhotoKey&&!logNotes){setPhotoErr("Adicione foto ou descrição do erro!");return}setSaving(true);setPhotoErr("");const snUp=sn.toUpperCase().trim();const newSlots=[...session.slots];newSlots[slotIndex]={hashSN:"",model:models[0]?.m||"M30S",status:"",photoKey:null};await onSave({...session,slots:newSlots,updatedAt:stamp()});const ex=data.hashes.find(h=>h.sn===snUp);if(ex){const u={...ex,status:"REPARO",machineSN:"",...audit(user)};mutate("hashes",h=>h.map(x=>x._id===ex._id?u:x));await fbSet("hashes",ex._id,u)}const lastRep=[...data.repairs].reverse().find(r=>r.hashSN===snUp);if(lastRep?.employeeId){const fid=uid();const fdb={hashSN:snUp,machineSN:session.machineSN,originalRepairerId:lastRep.employeeId,testedBy:user._id,...audit(user),date:TODAY(),logPhotoKey:logPhotoKey||"",notes:logNotes,resolved:false};await fbSet("feedbacks",fid,fdb);mutate("feedbacks",f=>[...f,{...fdb,_id:fid}])}await markChanged("hashes");await markChanged("feedbacks");setSaving(false);onClose()};
  return<Modal title={`Slot ${slotIndex+1}`} onClose={onClose}>
    <SNInput label="SN DA HASH" value={sn} onChange={setSN} placeholder="Bipe, escaneie ou digite" list="hsh-sl"/>
    <datalist id="hsh-sl">{data.hashes.filter(h=>["TESTAR","ON"].includes(h.status)).map(h=><option key={h._id} value={h.sn||""}>{h.sn||"SEM SN"} — {h.model}</option>)}</datalist>
    {hsh&&<div style={{background:"#080e17",borderRadius:10,padding:12,marginBottom:12}}><div style={{color:C.blue,fontWeight:700}}>⚡ {hsh.sn||"SEM SN"}</div><HP s={hsh.status}/>{rep&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>👷 {rep.name}</div>}</div>}
    <Sel label="MODELO" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <PhotoCapture label="📸 FOTO DA TELA / APP FABRICANTE (obrigatória)" photoKey={photoKey} onChange={k=>{setPhotoKey(k);setPhotoErr("")}} folder="testes" required/>
    {photoErr&&<Alrt type="err">{photoErr}</Alrt>}
    {!showBad?<div style={{display:"flex",gap:8}}><Btn v="d" onClick={()=>setShowBad(true)} style={{flex:1}}>✗ RUIM</Btn><Btn v="g" onClick={confirmSlot} style={{flex:1}}>✓ BOA</Btn></div>
      :<div style={{background:"#2a0c0c",borderRadius:10,padding:14}}>
        <div style={{fontWeight:800,color:C.red,marginBottom:10}}>⚠️ Marcar RUIM — {sn}</div>
        <PhotoCapture label="📸 FOTO DO LOG DE ERRO" photoKey={logPhotoKey} onChange={setLogPhotoKey} folder="logs"/>
        <Inp label="DESCRIÇÃO DO ERRO" value={logNotes} onChange={e=>setLogNotes(e.target.value)} placeholder="Ex: Hash 0 not detected..."/>
        {photoErr&&<Alrt type="err">{photoErr}</Alrt>}
        <div style={{color:C.amber,fontSize:12,marginBottom:10}}>{rep?`${rep.name} será notificado.`:"Slot ficará vazio."}</div>
        <div style={{display:"flex",gap:8}}><Btn v="s" onClick={()=>setShowBad(false)} style={{flex:1}}>Cancelar</Btn><Btn v="d" onClick={markBad} disabled={saving} style={{flex:1}}>{saving?"...":"Confirmar RUIM"}</Btn></div>
      </div>}
  </Modal>;
}

/* ═══ HISTÓRICO ═════════════════════════════════════════════════ */
function HistPage({ctx}){
  const{data,user}=ctx;const[filter,setFilter]=useState("mine");
  const reps=filter==="mine"?data.repairs.filter(r=>r.employeeId===user._id):data.repairs;
  const tsts=filter==="mine"?data.tests.filter(t=>t.employeeId===user._id):data.tests;
  const all=[...reps.map(r=>({...r,_type:"repair"})),...tsts.map(t=>({...t,_type:"test"}))].sort((a,b)=>a.date<b.date?1:-1);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontWeight:900,fontSize:18}}>Histórico</div><Btn v="s" onClick={()=>copyReport(user,data.repairs,data.tests,TODAY())}>📋 Relatório</Btn></div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>{[["mine","Meus"],["all","Todos"]].map(([id,l])=><button key={id} onClick={()=>setFilter(id)} style={{background:filter===id?C.accent:C.card,color:filter===id?"#fff":C.muted,border:"none",borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>)}</div>
    {all.slice(0,50).map(item=>{const emp=data.employees.find(e=>e._id===item.employeeId);
      if(item._type==="repair")return<Card key={item._id} accent={item.type==="already_good"?C.green:C.blue}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13,color:item.type==="already_good"?C.green:C.blue}}>{item.type==="already_good"?"✅":"🔧"} {item.hashSN||"SEM SN"}</div><div style={{fontSize:11,color:C.muted}}>👷 {emp?.name} · {fmtTS(item._at)}</div>{item.type!=="already_good"&&(item.chips||item.sensores||item.ldos)&&<div style={{fontSize:10,color:C.subtle}}>Chips:{item.chips||0} Sens:{item.sensores||0} LDOs:{item.ldos||0}</div>}</div><Tag color={item.type==="already_good"?C.green:C.purple} small>{item.type==="already_good"?"JÁ BOA":"CONSERTO"}</Tag></div><By by={item._byName} at={item._at}/></Card>;
      const stC=item.status==="pending"?C.blue:item.overallResult==="good"?C.green:C.red;
      const stL=item.status==="pending"?"Aguard.Revisão":item.overallResult==="good"?"BOA":"RUIM";
      return<Card key={item._id} accent={stC}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13}}>🧪 {item.machineSN||"s/máq"}</div><div style={{fontSize:11,color:C.muted}}>👷 {emp?.name} · {fmtTS(item._at)}</div></div><Tag color={stC} small>{stL}</Tag></div><By by={item._byName} at={item._at}/></Card>;
    })}
  </div>;
}

/* ═══ APPROVALS ════════════════════════════════════════════════ */
function ApprovalsPage({ctx}){
  const{data,mutate,user,webhookUrl}=ctx;
  const[notes,setNotes]=useState({}),[processing,setProcessing]=useState(null);
  const pending=data.approvals.filter(a=>a.status==="pending");
  const approve=async(appr)=>{
    setProcessing(appr._id);const test=data.tests.find(t=>t._id===appr.testId);if(!test){setProcessing(null);return}
    const tUpd={...test,status:"approved",overallResult:"good",...audit(user)};await fbSet("tests",test._id,tUpd);mutate("tests",t=>t.map(x=>x._id===test._id?tUpd:x));
    const exMac=data.machines.find(m=>m.sn===appr.machineSN);
    if(exMac){const mUpd={...exMac,situacao:"BOA",hash0:test.slot0HashSN?"ON":"OFF",hash1:test.slot1HashSN?"ON":"OFF",hash2:test.slot2HashSN?"ON":"OFF",hashSN0:test.slot0HashSN,hashSN1:test.slot1HashSN,hashSN2:test.slot2HashSN,...audit(user)};await fbSet("machines",exMac._id,mUpd);mutate("machines",m=>m.map(x=>x._id===exMac._id?mUpd:x))}
    let newH=[...data.hashes];
    for(const sn of[test.slot0HashSN,test.slot1HashSN,test.slot2HashSN].filter(Boolean)){const h=newH.find(x=>x.sn===sn);if(h){const u={...h,status:"ON",machineSN:appr.machineSN,...audit(user)};newH=newH.map(x=>x._id===h._id?u:x);await fbSet("hashes",h._id,u)}}
    mutate("hashes",()=>newH);
    await fbSet("pendingApprovals",appr._id,{...appr,status:"approved",...audit(user)});mutate("approvals",a=>a.map(x=>x._id===appr._id?{...x,status:"approved"}:x));
    syncSheet(webhookUrl,"test",{...test,overallResult:"good",employeeCode:appr.employeeCode,employeeName:appr.employeeName});
    await markChanged("approvals");await markChanged("machines");await markChanged("hashes");await markChanged("tests");setProcessing(null);
  };
  const reject=async(appr)=>{
    const n=notes[appr._id]||"";setProcessing(appr._id);
    const exMac=data.machines.find(m=>m.sn===appr.machineSN);
    if(exMac){const u={...exMac,situacao:"REVISAR",adminNote:n||"Admin solicitou revisão",_reviewedByName:user.name,_reviewedAt:stamp(),...audit(user)};await fbSet("machines",exMac._id,u);mutate("machines",m=>m.map(x=>x._id===exMac._id?u:x))}
    await fbSet("pendingApprovals",appr._id,{...appr,status:"rejected",adminNote:n,...audit(user)});mutate("approvals",a=>a.map(x=>x._id===appr._id?{...x,status:"rejected"}:x));
    await markChanged("approvals");await markChanged("machines");setProcessing(null);
  };
  return<div>
    <div style={{fontWeight:900,fontSize:18,marginBottom:4}}>Revisão de Testes</div>
    <div style={{color:C.muted,fontSize:12,marginBottom:16}}>{pending.length} aguardando aprovação</div>
    {pending.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>✅</div><div>Nenhuma revisão pendente</div></div>
      :pending.map(appr=>{const test=data.tests.find(t=>t._id===appr.testId);return<Card key={appr._id} accent={C.blue}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>🖥️ {appr.machineSN||"SEM SN"}</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:8}}>{appr.model} · {appr.th}TH · 👷 {appr.employeeName} · {fmtDate(appr.date)}</div>
        {test&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{[test.slot0HashSN,test.slot1HashSN,test.slot2HashSN].map((sn,i)=>sn&&<span key={i} style={{background:"#0c1a2e",border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 8px",fontSize:10,color:C.blue}}>S{i}: {sn}</span>)}</div>}
        {test?.testPhoto&&<PhotoView photoKey={test.testPhoto} style={{marginBottom:10,maxHeight:150}}/>}
        <Inp label="Observação para rejeição (opcional)" value={notes[appr._id]||""} onChange={e=>setNotes({...notes,[appr._id]:e.target.value})} placeholder="Ex: rever HASH 2..."/>
        <div style={{display:"flex",gap:8}}><Btn v="d" onClick={()=>reject(appr)} disabled={processing===appr._id} style={{flex:1}}>✗ Reprovar</Btn><Btn v="g" onClick={()=>approve(appr)} disabled={processing===appr._id} style={{flex:1}}>{processing===appr._id?"...":"✓ Aprovar → BOA"}</Btn></div>
      </Card>})}
    {data.approvals.filter(a=>a.status!=="pending").length>0&&<><SL mt={16}>PROCESSADAS</SL>{data.approvals.filter(a=>a.status!=="pending").slice(-5).reverse().map(a=><div key={a._id} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}><span>🖥️ {a.machineSN||"SEM SN"}</span><Tag color={a.status==="approved"?C.green:C.red} small>{a.status==="approved"?"Aprovada":"Reprovada"}</Tag></div>)}</>}
  </div>;
}

/* ═══ TEAM ══════════════════════════════════════════════════════ */
function TeamPage({ctx,canSeeEmp}){
  const{data,mutate,setModal}=ctx;const today=TODAY();
  const openAdd=()=>setModal(<Modal title="Novo Funcionário" onClose={()=>setModal(null)}><AddEmpForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openProfile=e=>setModal(<Modal title={`${e.name} #${e.code}`} onClose={()=>setModal(null)}><EmpProfile ctx={ctx} emp={e}/></Modal>);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><div style={{fontWeight:900,fontSize:18}}>Equipe</div><div style={{color:C.muted,fontSize:12}}>{data.employees.length} funcionários</div></div><Btn onClick={openAdd}>+ Funcionário</Btn></div>
    {data.employees.map(e=>{
      if(!canSeeEmp(e._id)&&!data.employees.find(x=>x._id===ctx.user._id)?.permissions?.admin)return null;
      const rT=data.repairs.filter(r=>r.employeeId===e._id&&r.date===today&&r.type!=="already_good").length;
      const gT=data.repairs.filter(r=>r.employeeId===e._id&&r.date===today&&r.type==="already_good").length;
      const tT=data.tests.filter(t=>t.employeeId===e._id&&t.date===today).length;
      const fdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===e._id).length;
      return<Card key={e._id}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:"#1a2d42",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.accent,fontSize:18,flexShrink:0}}>{e.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:14}}>{e.name} <Tag color={C.accent} small>#{e.code}</Tag>{fdbs>0&&<> <Tag color={C.red} small>⚠️{fdbs}</Tag></>}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{[e.permissions?.repairs&&"Conserto",e.permissions?.testing&&"Teste",e.permissions?.admin&&"Admin"].filter(Boolean).join(" · ")}</div>
            <div style={{fontSize:10,color:C.subtle}}>Hoje: {rT} consertos · {gT>0?`${gT} já ok · `:""}{tT} testes</div>
          </div>
          <div style={{textAlign:"right"}}><div style={{fontWeight:900,fontSize:22,color:(rT+tT)>0?C.green:C.border}}>{rT+gT+tT}</div><div style={{fontSize:9,color:C.muted}}>HOJE</div></div>
        </div>
      </Card>
    })}
  </div>;
}

function EmpProfile({ctx,emp}){
  const{data,mutate,setModal,user}=ctx;const[dateFilter,setDateFilter]=useState(TODAY());
  const allR=data.repairs.filter(r=>r.employeeId===emp._id);const allT=data.tests.filter(t=>t.employeeId===emp._id);
  const fdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===emp._id);
  const dayR=allR.filter(r=>r.date===dateFilter);const dayT=allT.filter(t=>t.date===dateFilter);
  const byDate={};[...allR.map(r=>r.date),...allT.map(t=>t.date)].forEach(d=>{byDate[d]=(byDate[d]||0)+1});
  const totalRepairs=allR.filter(r=>r.type!=="already_good").length;
  const totalGood=allR.filter(r=>r.type==="already_good").length;
  return<div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
      {[[totalRepairs,"Consertos",C.accent],[allT.length,"Testes",C.blue],[fdbs.length,"Pendências",C.red]].map(([v,l,c])=><div key={l} style={{background:"#080e17",borderRadius:10,padding:12,textAlign:"center"}}><div style={{fontSize:24,fontWeight:900,color:c}}>{v}</div><div style={{fontSize:10,color:C.muted}}>{l}</div></div>)}
    </div>
    {totalGood>0&&<div style={{background:"#0c2a0f",borderRadius:10,padding:10,marginBottom:14,color:C.green,fontSize:12,textAlign:"center"}}>✅ {totalGood} HASHs verificadas como "já estavam boas"</div>}
    {/* Access control — admin can configure which employees this person can see */}
    <div style={{marginBottom:14}}>
      <SL>PERMISSÕES DE ACESSO A PERFIS</SL>
      <div style={{fontSize:12,color:C.subtle,marginBottom:8}}>Funcionários que {emp.name} pode ver:</div>
      {data.employees.filter(e=>e._id!==emp._id).map(e=>{
        const allowed=(emp.allowedEmployees||[]).includes(e._id);
        return<div key={e._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:13}}>{e.name} #{e.code}</span>
          <button onClick={async()=>{const list=emp.allowedEmployees||[];const newList=allowed?list.filter(x=>x!==e._id):[...list,e._id];const u={...emp,allowedEmployees:newList};mutate("employees",arr=>arr.map(x=>x._id===emp._id?u:x));await fbSet("employees",emp._id,u);await markChanged("employees")}} style={{background:allowed?C.green:"#1a2d42",border:"none",color:"#fff",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{allowed?"ON":"OFF"}</button>
        </div>})}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"flex-end"}}>
      <div style={{flex:1}}><Inp label="FILTRAR DATA" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div>
      <Btn v="s" onClick={()=>copyReport(emp,data.repairs,data.tests,dateFilter)} style={{marginBottom:12}}>📋</Btn>
    </div>
    {dayR.length===0&&dayT.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sem registros nesta data</div>:<>
      {dayR.map(r=><Card key={r._id} accent={r.type==="already_good"?C.green:C.blue}><div style={{fontWeight:700,fontSize:13,color:r.type==="already_good"?C.green:C.blue}}>{r.type==="already_good"?"✅":"🔧"} {r.hashSN||"SEM SN"} — {r.model}</div><div style={{fontSize:11,color:C.muted}}>{fmtTS(r._at)}</div>{r.type!=="already_good"&&<div style={{fontSize:10,color:C.subtle}}>Chips:{r.chips||0} Sens:{r.sensores||0} LDOs:{r.ldos||0}{r.obsManual?` · ${r.obsManual}`:""}</div>}</Card>)}
      {dayT.map(t=>{const stC=t.status==="pending"?C.blue:t.overallResult==="good"?C.green:C.red;return<Card key={t._id} accent={stC}><div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div><div style={{fontSize:11,color:C.muted}}>{fmtTS(t._at)}</div><Tag color={stC} small>{t.status==="pending"?"Aguard.Revisão":t.overallResult==="good"?"BOA":"RUIM"}</Tag></Card>})}
    </>}
    <SL mt={12}>HISTÓRICO</SL>
    {Object.keys(byDate).sort().reverse().slice(0,20).map(d=><div key={d} onClick={()=>setDateFilter(d)} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13,cursor:"pointer"}}><span style={{color:d===dateFilter?C.accent:C.text}}>{fmtDate(d)}</span><span style={{fontWeight:700,color:C.accent}}>{byDate[d]} itens</span></div>)}
    {fdbs.length>0&&<><SL mt={12}>PENDÊNCIAS</SL>{fdbs.map(f=><Card key={f._id} accent={C.red}><div style={{color:C.red,fontWeight:700}}>⚡ {f.hashSN}</div><div style={{fontSize:12}}>{f.notes}</div></Card>)}</>}
    <SL mt={12}>PERMISSÕES</SL>
    {PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{label}</span><button onClick={async()=>{const u={...emp,permissions:{...emp.permissions,[key]:!emp.permissions?.[key]}};mutate("employees",arr=>arr.map(x=>x._id===emp._id?u:x));await fbSet("employees",emp._id,u)}} style={{background:emp.permissions?.[key]?C.green:"#1a2d42",border:"none",color:"#fff",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{emp.permissions?.[key]?"ON":"OFF"}</button></div>)}
    <Btn v="d" onClick={async()=>{mutate("employees",arr=>arr.filter(x=>x._id!==emp._id));await fbDel("employees",emp._id);await markChanged("employees");setModal(null)}} style={{width:"100%",marginTop:16}}>🗑 Remover</Btn>
  </div>;
}

function AddEmpForm({ctx,onClose}){
  const{data,mutate}=ctx;const[f,setF]=useState({name:"",code:"",permissions:{repairs:true,testing:false,machines:false,hashes:false,admin:false},allowedEmployees:[]});
  const set=(k,v)=>setF(p=>({...p,[k]:v}));const setPerm=(k,v)=>setF(p=>({...p,permissions:{...p.permissions,[k]:v}}));
  const save=async()=>{if(!f.name.trim()||!f.code.trim())return;if(data.employees.find(e=>e.code===f.code)){alert("Código já existe");return}const id=uid();const d={...f,code:f.code.padStart(2,"0"),role:"technician"};await fbSet("employees",id,d);mutate("employees",e=>[...e,{...d,_id:id}]);await markChanged("employees");onClose()};
  return<div><Inp label="NOME" value={f.name} onChange={e=>set("name",e.target.value)} placeholder="Ex: João Silva"/><Inp label="CÓDIGO (2 dígitos)" value={f.code} onChange={e=>set("code",e.target.value.slice(0,2))} placeholder="01" maxLength={2}/><SL mt={8}>PERMISSÕES</SL>{PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{label}</span><button onClick={()=>setPerm(key,!f.permissions[key])} style={{background:f.permissions[key]?C.green:"#1a2d42",border:"none",color:"#fff",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{f.permissions[key]?"ON":"OFF"}</button></div>)}<div style={{display:"flex",gap:8,marginTop:16}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} style={{flex:1}}>Salvar</Btn></div></div>;
}

/* ═══ CONFIG ════════════════════════════════════════════════════ */
function CfgPage({ctx}){
  const{data,mutate,webhookUrl,setWebhookUrl}=ctx;
  const[url,setUrl]=useState(webhookUrl),[testRes,setTestRes]=useState(null),[importing,setImporting]=useState(false),[importRes,setImportRes]=useState(null),[newModel,setNewModel]=useState(""),[newTH,setNewTH]=useState("");
  const saveWh=()=>{localStorage.setItem("webhookUrl",url);setWebhookUrl(url);alert("✓ Webhook salvo!")};
  const testWh=async()=>{try{const r=await fetch(url+"?action=test");const d=await r.json();setTestRes(d.status==="ok"?"✓ Conectado! "+d.time:"✗ "+JSON.stringify(d))}catch(e){setTestRes("✗ Falha: "+e.message)}};
  const[importProg,setImportProg]=useState("");
const doImportMachines=async()=>{if(!url){alert("Configure o webhook");return}setImporting(true);setImportRes(null);setImportProg("Buscando...");try{const machines=await importMachinesFromSheet(url,(cur,total)=>setImportProg(`${cur}/${total} recebidas...`));if(!machines.length){setImportRes("Nenhuma máquina.");setImporting(false);return}setImportProg(`Salvando ${machines.length}...`);const writes=machines.map(m=>{const id=uid();return{c:"machines",id,d:{...m,_id:undefined,type:m.type||"complete",addedAt:m.addedAt||TODAY()}}});for(let i=0;i<writes.length;i+=500){await fbBatch(writes.slice(i,i+500));setImportProg(`${Math.min(i+500,writes.length)}/${writes.length} salvas...`)}mutate("machines",existing=>[...existing,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("machines");setImportRes(`✓ ${machines.length} máquinas importadas!`)}catch(e){setImportRes("✗ "+e.message)}setImporting(false);setImportProg("")};
const doImportHashes=async()=>{if(!url){alert("Configure o webhook");return}setImporting(true);setImportRes(null);try{const hashes=await importHashesFromSheet(url);if(!hashes.length){setImportRes("Nenhuma HASH na aba REPARO DE HASH.");setImporting(false);return}const writes=hashes.map(h=>{const id=uid();let status="REPARO";const sit=String(h.situacao||"").toUpperCase();if(sit==="BOA")status="ON";else if(sit==="TESTAR")status="TESTAR";else if(sit==="STOCK")status="STOCK";return{c:"hashes",id,d:{sn:h.sn||"",model:h.model||"",status,chips:h.chips||0,defeito:h.defeito||"",tecnico:h.tecnico||"",machineSN:"",slot:-1,repairedBy:"",addedAt:h.addedAt||TODAY()}}});for(let i=0;i<writes.length;i+=500)await fbBatch(writes.slice(i,i+500));mutate("hashes",existing=>[...existing,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("hashes");setImportRes(`✓ ${hashes.length} HASHs importadas!`)}catch(e){setImportRes("✗ "+e.message)}setImporting(false)};
  const addModel=async()=>{if(!newModel.trim()||!newTH)return;const id=uid();const d={m:newModel.trim(),th:Number(newTH)};await fbSet("customModels",id,d);mutate("customModels",m=>[...m,{...d,_id:id}]);setNewModel("");setNewTH("")};
  const delModel=async m=>{await fbDel("customModels",m._id);mutate("customModels",arr=>arr.filter(x=>x._id!==m._id))};
  return<div>
    <div style={{fontWeight:900,fontSize:18,marginBottom:18}}>⚙️ Configurações</div>
    <Card style={{marginBottom:14}}><SL>GOOGLE SHEETS WEBHOOK</SL><Inp value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..."/>{testRes&&<Alrt type={testRes.startsWith("✓")?"ok":"err"}>{testRes}</Alrt>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={testWh} style={{flex:1}}>🔗 Testar</Btn><Btn onClick={saveWh} style={{flex:1}}>💾 Salvar</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>IMPORTAR PLANILHA EXISTENTE</SL>{importRes&&<Alrt type={importRes.startsWith("✓")?"ok":"err"}>{importRes}</Alrt>}{importProg&&<div style={{color:C.blue,fontSize:12,marginBottom:8}}>⏳ {importProg}</div>}<div style={{display:"flex",gap:8}}><Btn v="b" onClick={doImportMachines} disabled={importing} style={{flex:1,fontSize:12}}>{importing?"...":"📥 Máquinas"}</Btn><Btn v="p" onClick={doImportHashes} disabled={importing} style={{flex:1,fontSize:12}}>{importing?"...":"⚡ HASHs (REPARO)"}</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>MODELOS CUSTOMIZADOS</SL>{data.customModels.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontWeight:700}}>{m.m}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:C.muted,fontSize:12}}>{m.th}TH</span><button onClick={()=>delModel(m)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button></div></div>)}<div style={{display:"flex",gap:8,marginTop:12}}><Inp value={newModel} onChange={e=>setNewModel(e.target.value)} placeholder="Ex: M30S Pro" style={{flex:2,marginBottom:0}}/><Inp type="number" value={newTH} onChange={e=>setNewTH(e.target.value)} placeholder="TH" style={{width:70,marginBottom:0}}/><Btn onClick={addModel}>+</Btn></div></Card>
    <Card><div style={{fontWeight:800,color:C.blue,marginBottom:10}}>📖 Como configurar</div>{[["1","Abra sua planilha no Google Sheets"],["2","Extensões → Apps Script"],["3","Cole o código do arquivo hashstock-apps-script.js"],["4","Implantar → App da Web → Qualquer pessoa"],["5","Copie a URL e cole acima"]].map(([n,t])=><div key={n} style={{display:"flex",gap:10,marginBottom:8}}><div style={{width:22,height:22,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:11,flexShrink:0,color:"#fff"}}>{n}</div><div style={{fontSize:13,paddingTop:2}}>{t}</div></div>)}</Card>
  </div>;
}

function PalletsPage({ctx}){
  const{data,mutate,setModal,user}=ctx;const pallets=data.pallets||[];
  const openAdd=()=>setModal(<Modal title="Novo Palete" onClose={()=>setModal(null)}><AddPalletForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=p=>setModal(<Modal title={`📦 ${p.name}`} onClose={()=>setModal(null)}><PalletDetail ctx={ctx} pallet={p}/></Modal>);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}><div><div style={{fontWeight:900,fontSize:18}}>Paletes</div><div style={{color:C.muted,fontSize:12}}>{pallets.length} paletes · {pallets.reduce((s,p)=>(p.machinesSN?.length||0)+s,0)} máquinas</div></div><Btn onClick={openAdd}>+ Palete</Btn></div>
    {pallets.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>📦</div><div>Nenhum palete criado</div><div style={{fontSize:12,marginTop:8}}>Agrupe máquinas por palete ou localização</div></div>
      :pallets.map(p=>{const macs=(p.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);return<Card key={p._id} onClick={()=>openDetail(p)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:800,fontSize:15}}>📦 {p.name}</div>{p.location&&<div style={{color:C.muted,fontSize:12}}>📍 {p.location}</div>}{p.notes&&<div style={{color:C.subtle,fontSize:11,marginTop:2}}>{p.notes}</div>}</div><Tag color={C.blue}>{p.machinesSN?.length||0} máq.</Tag></div>
        {macs.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>{macs.slice(0,4).map(m=><span key={m._id} style={{background:C.card2||"#111f2d",borderRadius:6,padding:"2px 6px",fontSize:10}}>{m.sn?.slice(0,12)} <SP s={m.situacao}/></span>)}{macs.length>4&&<span style={{color:C.muted,fontSize:10}}>+{macs.length-4}</span>}</div>}
      </Card>})}
  </div>;
}
function AddPalletForm({ctx,onClose}){
  const{mutate,user}=ctx;const[name,setName]=useState(""),[location,setLocation]=useState(""),[notes,setNotes]=useState("");
  const save=async()=>{if(!name.trim())return;const id=uid();const d={name:name.trim(),location,notes,machinesSN:[],...audit(user),createdAt:TODAY()};await fbSet("pallets",id,d);mutate("pallets",p=>[...p,{...d,_id:id}]);await markChanged("pallets");onClose()};
  return<div><Inp label="Nome" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Palete 01, Lote A..." autoFocus/><Inp label="Localização" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Ex: Galpão 2, Prateleira B3..."/><Inp label="Observações" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional..."/><div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={!name.trim()} style={{flex:1}}>Criar</Btn></div></div>;
}
function PalletDetail({ctx,pallet}){
  const{data,mutate,setModal,user,allModels}=ctx;const models=allModels();
  const[p,setP]=useState(pallet),[input,setInput]=useState(""),[scanning,setScanning]=useState(false),[log,setLog]=useState([]),[mode,setMode]=useState("list"),[uploading,setUploading]=useState(false),[uploadProg,setUploadProg]=useState("");
  const fileRef=useRef();
  const macs=(p.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);

  const addSN=async(snRaw,allMachines,allPallet)=>{
    const sn=snRaw.toUpperCase().trim();if(!sn)return null;
    const curSNs=allPallet||p.machinesSN||[];
    if(curSNs.includes(sn))return{sn,status:"dup",msg:"Já está no palete"};
    const ex=(allMachines||data.machines).find(m=>m.sn===sn);
    if(!ex){
      const id=uid();
      const d={sn,model:models[0]?.m||"M30S",th:models[0]?.th||86,type:"complete",situacao:"STOCK",hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",...audit(user),addedAt:TODAY(),destino:""};
      await fbSet("machines",id,d);
      mutate("machines",m=>[...m,{...d,_id:id}]);
      await markChanged("machines");
      return{sn,status:"new",msg:"🆕 Nova — criada no estoque"};
    }
    return{sn,status:"ok",msg:`✓ ${ex.model} · ${ex.situacao}`};
  };

  const doAddSingle=async()=>{
    const res=await addSN(input);if(!res)return;
    const newSNs=[...(p.machinesSN||[]),res.sn];
    const upd={...p,machinesSN:newSNs,...audit(user)};
    setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));
    await fbSet("pallets",p._id,upd);await markChanged("pallets");
    setLog(l=>[res,...l]);setInput("");
  };

  const uploadSheet=async(file)=>{
    setUploading(true);setUploadProg("Lendo planilha...");setLog([]);
    try{
      const text=await file.text();
      // Parse CSV or TSV — get first column (SN)
      const lines=text.split(/
?
/).filter(l=>l.trim());
      const sns=[];
      for(const line of lines){
        const cols=line.split(/[,;	]/);
        const sn=(cols[0]||"").replace(/['"]/g,"").toUpperCase().trim();
        if(sn&&sn!=="SN"&&sn!=="SN/MAC"&&sn.length>5)sns.push(sn);
      }
      if(!sns.length){setUploadProg("Nenhum SN encontrado na planilha.");setUploading(false);return;}
      setUploadProg(`${sns.length} SNs encontrados. Processando...`);
      const newResults=[];const curSNs=[...(p.machinesSN||[])];
      for(let i=0;i<sns.length;i++){
        const sn=sns[i];
        if(curSNs.includes(sn)){newResults.push({sn,status:"dup",msg:"Já no palete"});continue;}
        const res=await addSN(sn,data.machines,curSNs);
        if(res){newResults.push(res);curSNs.push(res.sn);}
        if(i%10===0)setUploadProg(`${i+1}/${sns.length} processados...`);
      }
      // Save all new SNs at once
      const upd={...p,machinesSN:curSNs,...audit(user)};
      setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));
      await fbSet("pallets",p._id,upd);await markChanged("pallets");
      setLog(newResults);
      const novas=newResults.filter(r=>r.status==="new").length;
      const exist=newResults.filter(r=>r.status==="ok").length;
      const dups=newResults.filter(r=>r.status==="dup").length;
      setUploadProg(`✓ Concluído! ${novas} novas · ${exist} existentes · ${dups} duplicadas`);
    }catch(e){setUploadProg("Erro: "+e.message);}
    setUploading(false);
  };

  const exportSheet=()=>{
    const rows=["SN,Modelo,Situação,T/H"];
    macs.forEach(m=>rows.push(`${m.sn||""},${m.model||""},${m.situacao||""},${m.th||""}`));
    const blob=new Blob([rows.join("
")],{type:"text/csv"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`palete-${p.name.replace(/\s/g,"-")}.csv`;a.click();
  };

  const remSN=async(sn)=>{const newSNs=(p.machinesSN||[]).filter(s=>s!==sn);const upd={...p,machinesSN:newSNs,...audit(user)};setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));await fbSet("pallets",p._id,upd);await markChanged("pallets")};
  const del=async()=>{if(!confirm("Remover palete?"))return;mutate("pallets",arr=>arr.filter(x=>x._id!==p._id));await fbDel("pallets",p._id);await markChanged("pallets");setModal(null)};

  return<div>
    <div style={{background:"#111f2d",borderRadius:12,padding:12,marginBottom:12}}>
      {p.location&&<div style={{color:C.muted,fontSize:12}}>📍 {p.location}</div>}
      {p.notes&&<div style={{color:C.subtle,fontSize:12}}>{p.notes}</div>}
      <div style={{fontWeight:700,marginTop:4,color:C.accent}}>{p.machinesSN?.length||0} máquinas</div>
    </div>

    <SL>Adicionar Máquinas</SL>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[["single","✍️ Manual"],["scan","📷 Câmera"],["upload","📄 Planilha"]].map(([id,l])=>
        <button key={id} onClick={()=>setMode(id)} style={{flex:1,background:mode===id?C.accent:C.card2,color:"#fff",border:"none",borderRadius:10,padding:"9px 4px",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>
      )}
    </div>

    {mode==="single"&&<>
      <SNInput value={input} onChange={setInput} placeholder="SN da máquina..." onEnter={doAddSingle}/>
      <Btn onClick={doAddSingle} style={{width:"100%",marginBottom:10}}>+ Adicionar</Btn>
    </>}

    {mode==="scan"&&<>
      {scanning&&<BarcodeScanner onScan={async v=>{const res=await addSN(v);if(!res)return;const newSNs=[...(p.machinesSN||[]),res.sn];const upd={...p,machinesSN:newSNs,...audit(user)};setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));await fbSet("pallets",p._id,upd);await markChanged("pallets");setLog(l=>[res,...l])}} onClose={()=>setScanning(false)}/>}
      <Btn v="b" onClick={()=>setScanning(true)} style={{width:"100%",marginBottom:10}}>📷 Iniciar Câmera Contínua</Btn>
      <div style={{color:C.muted,fontSize:11,textAlign:"center",marginBottom:10}}>Cada SN bipado é adicionado automaticamente</div>
    </>}

    {mode==="upload"&&<>
      <div style={{background:"#111f2d",borderRadius:10,padding:14,marginBottom:10}}>
        <div style={{color:C.text,fontSize:13,fontWeight:700,marginBottom:6}}>📄 Subir Planilha CSV</div>
        <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Formato: 1ª coluna = SN das máquinas (com ou sem cabeçalho)<br/>Máquinas existentes: associa ao palete<br/>Máquinas novas: cria no estoque e associa</div>
        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadSheet(e.target.files[0])}/>
        <Btn onClick={()=>fileRef.current.click()} disabled={uploading} style={{width:"100%",marginBottom:8}}>{uploading?"⏳ Processando...":"📂 Escolher Arquivo CSV"}</Btn>
        {macs.length>0&&<Btn v="s" onClick={exportSheet} style={{width:"100%",fontSize:12}}>⬇️ Exportar Planilha deste Palete</Btn>}
        {uploadProg&&<div style={{color:uploadProg.startsWith("✓")?C.green:C.blue,fontSize:12,marginTop:8,fontWeight:700}}>{uploadProg}</div>}
      </div>
    </>}

    {log.length>0&&<div style={{background:"#111f2d",borderRadius:10,padding:10,marginBottom:12,maxHeight:130,overflow:"auto"}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4}}>LOG ({log.length})</div>
      {log.map((l,i)=><div key={i} style={{fontSize:11,color:l.status==="new"?C.green:l.status==="dup"?C.amber:C.blue,padding:"2px 0",borderBottom:`1px solid ${C.border}`}}>{l.sn} — {l.msg}</div>)}
    </div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <SL style={{margin:0}}>Máquinas ({macs.length})</SL>
      {macs.length>0&&<button onClick={exportSheet} style={{background:"none",border:"none",color:C.blue,fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ Exportar CSV</button>}
    </div>
    {macs.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:16}}>Nenhuma máquina. Use os modos acima.</div>
      :macs.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
        <div><div style={{fontWeight:700,fontSize:12,color:C.text}}>{m.sn}</div><div style={{fontSize:10,color:C.muted}}>{m.model} · <SP s={m.situacao}/></div></div>
        <button onClick={()=>remSN(m.sn)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16,padding:"4px 8px"}}>✕</button>
      </div>)}
    <Btn v="d" onClick={del} style={{width:"100%",marginTop:16}}>🗑 Remover Palete</Btn>
  </div>;
}

function EmpHistory({ctx,emp}){
  const{data}=ctx;const[dateFilter,setDateFilter]=useState(TODAY());
  const allR=data.repairs.filter(r=>r.employeeId===emp._id);const allT=data.tests.filter(t=>t.employeeId===emp._id);
  const dayR=allR.filter(r=>r.date===dateFilter);const dayT=allT.filter(t=>t.date===dateFilter);
  const byDate={};[...allR.map(r=>r.date),...allT.map(t=>t.date)].forEach(d=>{byDate[d]=(byDate[d]||0)+1});
  const totalR=allR.filter(r=>r.type!=="already_good").length,totalG=allR.filter(r=>r.type==="already_good").length;
  return<div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      {[[totalR,"Consertos",C.accent],[allT.length,"Testes",C.blue],[data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===emp._id).length,"Pendências",C.red]].map(([v,l,c])=><div key={l} style={{background:"#111f2d",borderRadius:10,padding:10,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div><div style={{fontSize:10,color:C.muted}}>{l}</div></div>)}
    </div>
    {totalG>0&&<div style={{color:C.green,fontSize:12,textAlign:"center",marginBottom:10}}>✅ {totalG} "já estavam boas"</div>}
    <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"flex-end"}}><div style={{flex:1}}><Inp label="Data" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div><Btn v="s" onClick={()=>copyReport(emp,data.repairs,data.tests,dateFilter)} style={{marginBottom:12}}>📤</Btn></div>
    {dayR.length===0&&dayT.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sem registros nesta data</div>:<>
      {dayR.map(r=><Card key={r._id} accent={r.type==="already_good"?C.green:C.blue}><div style={{fontWeight:700,fontSize:13}}>{r.type==="already_good"?"✅":"🔧"} {r.hashSN||"SEM SN"} — {r.model}</div>{r.type!=="already_good"&&<div style={{fontSize:10,color:C.subtle}}>Chips:{r.chips||0} Sens:{r.sensores||0} LDOs:{r.ldos||0}{r.obsManual?` · ${r.obsManual}`:""}</div>}<div style={{fontSize:10,color:C.muted}}>{fmtTS(r._at)}</div></Card>)}
      {dayT.map(t=>{const stC=t.status==="pending"?C.blue:t.overallResult==="good"?C.green:C.red;return<Card key={t._id} accent={stC}><div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(t._at)}</div></Card>})}
    </>}
    <SL mt={12}>Histórico por Dia</SL>
    {Object.keys(byDate).sort().reverse().slice(0,20).map(d=><div key={d} onClick={()=>setDateFilter(d)} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:12,cursor:"pointer"}}><span style={{color:d===dateFilter?C.accent:C.text}}>{fmtDate(d)}</span><Tag color={C.accent} small>{byDate[d]}</Tag></div>)}
  </div>;
}

function EmpEdit({ctx,emp,onClose}){
  const{data,mutate}=ctx;const[e,setE]=useState({...emp});
  const setPerm=(k,v)=>setE(p=>({...p,permissions:{...p.permissions,[k]:v}}));
  const save=async()=>{mutate("employees",arr=>arr.map(x=>x._id===e._id?e:x));await fbSet("employees",e._id,e);await markChanged("employees");onClose()};
  const del=async()=>{if(!confirm("Remover "+e.name+"?"))return;mutate("employees",arr=>arr.filter(x=>x._id!==e._id));await fbDel("employees",e._id);await markChanged("employees");onClose()};
  return<div>
    <Inp label="Nome" value={e.name} onChange={ev=>setE(p=>({...p,name:ev.target.value}))}/>
    <Inp label="Código" value={e.code} onChange={ev=>setE(p=>({...p,code:ev.target.value.slice(0,2)}))} maxLength={2}/>
    <SL mt={8}>Permissões</SL>
    {PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{label}</span><button onClick={()=>setPerm(key,!e.permissions?.[key])} style={{background:e.permissions?.[key]?C.green+"22":"#1a2d42",color:e.permissions?.[key]?C.green:C.muted,border:`1px solid ${e.permissions?.[key]?C.green:C.border}`,borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{e.permissions?.[key]?"ON":"OFF"}</button></div>)}
    <SL mt={12}>Pode Ver Histórico de</SL>
    {data.employees.filter(x=>x._id!==e._id).map(x=>{const allowed=(e.allowedEmployees||[]).includes(x._id);return<div key={x._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{x.name} #{x.code}</span><button onClick={()=>{const list=e.allowedEmployees||[];setE(p=>({...p,allowedEmployees:allowed?list.filter(id=>id!==x._id):[...list,x._id]}))}} style={{background:allowed?C.blue+"22":"#1a2d42",color:allowed?C.blue:C.muted,border:`1px solid ${allowed?C.blue:C.border}`,borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{allowed?"ON":"OFF"}</button></div>})}
    <div style={{display:"flex",gap:8,marginTop:16}}><Btn v="d" onClick={del} style={{flex:1}}>🗑 Remover</Btn><Btn v="g" onClick={save} style={{flex:2}}>💾 Salvar</Btn></div>
  </div>;
}

/* ═══ CLIENTES ══════════════════════════════════════════════════ */
function ClientesPage({ctx}){
  const{data,mutate,setModal}=ctx;
  const clients=data.clients||[];
  const openAdd=()=>setModal(<Modal title="Novo Cliente" onClose={()=>setModal(null)}><AddClientForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=c=>setModal(<Modal title={"👤 "+c.name} onClose={()=>setModal(null)}><ClientDetail ctx={ctx} client={c}/></Modal>);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div><div style={{fontWeight:900,fontSize:18}}>Clientes</div><div style={{color:C.muted,fontSize:12}}>{clients.length} clientes</div></div>
      <Btn onClick={openAdd}>+ Cliente</Btn>
    </div>
    {clients.length===0
      ?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>👥</div><div>Nenhum cliente</div><div style={{fontSize:12,marginTop:8}}>Registre clientes e vincule as máquinas vendidas</div></div>
      :clients.map(c=>{
        const macs=(c.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
        return<Card key={c._id} onClick={()=>openDetail(c)}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:800,fontSize:15}}>👤 {c.name}</div>
              {c.phone&&<div style={{color:C.muted,fontSize:12}}>📱 {c.phone}</div>}
              {c.notes&&<div style={{color:C.subtle,fontSize:11,marginTop:2}}>{c.notes}</div>}
            </div>
            <Tag color={C.accent}>{c.machinesSN?.length||0} máq.</Tag>
          </div>
          {macs.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:8}}>
            {macs.slice(0,4).map(m=><span key={m._id} style={{background:(SIT_C[m.situacao]||C.muted)+"22",border:"1px solid "+(SIT_C[m.situacao]||C.muted)+"44",borderRadius:6,padding:"2px 6px",fontSize:10,color:SIT_C[m.situacao]||C.muted}}>{m.sn?.slice(0,10)||"s/sn"}</span>)}
            {macs.length>4&&<span style={{color:C.muted,fontSize:10}}>+{macs.length-4}</span>}
          </div>}
          <By by={c._byName} at={c._at}/>
        </Card>;
      })}
  </div>;
}

function AddClientForm({ctx,onClose}){
  const{mutate,user}=ctx;
  const[name,setName]=useState("");
  const[phone,setPhone]=useState("");
  const[notes,setNotes]=useState("");
  const save=async()=>{
    if(!name.trim())return;
    const id=uid();
    const d={name:name.trim(),phone,notes,machinesSN:[],...audit(user),createdAt:TODAY()};
    await fbSet("clients",id,d);
    mutate("clients",c=>[...c,{...d,_id:id}]);
    await markChanged("clients");
    onClose();
  };
  return<div>
    <Inp label="Nome" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: João Silva" autoFocus/>
    <Inp label="Telefone / WhatsApp" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(47) 99999-9999"/>
    <Inp label="Observações" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Endereço, empresa..."/>
    <div style={{display:"flex",gap:8}}>
      <Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn>
      <Btn onClick={save} disabled={!name.trim()} style={{flex:1}}>Criar</Btn>
    </div>
  </div>;
}

function ClientDetail({ctx,client}){
  const{data,mutate,setModal,user,allModels}=ctx;
  const models=allModels();
  const[c,setC]=useState(client);
  const[input,setInput]=useState("");
  const[scanning,setScanning]=useState(false);
  const[log,setLog]=useState([]);
  const macs=(c.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
  const saidaCount=macs.filter(m=>["SAIDA","VENDIDA","EXPORTADA"].includes(m.situacao)).length;

  const addMac=async(snRaw)=>{
    const sn=snRaw.toUpperCase().trim();
    if(!sn){return;}
    if((c.machinesSN||[]).includes(sn)){setLog(l=>[{sn,msg:"⚠️ Já vinculada"},...l]);setInput("");return;}
    const ex=data.machines.find(m=>m.sn===sn);
    let msg="";
    if(!ex){
      const id=uid();
      const d={sn,model:models[0]?.m||"M30S",th:models[0]?.th||86,type:"complete",situacao:"SAIDA",hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",...audit(user),addedAt:TODAY(),destino:c.name};
      await fbSet("machines",id,d);
      mutate("machines",m=>[...m,{...d,_id:id}]);
      await markChanged("machines");
      msg="🆕 Criada como SAIDA";
    } else {
      if(!["SAIDA","VENDIDA","EXPORTADA"].includes(ex.situacao)){
        const mHashes=data.hashes.filter(h=>h.machineSN===sn);
        for(const h of mHashes){
          const u={...h,status:"SAIDA",location:"Vendida ao cliente "+c.name+" em "+TODAY(),...audit(user)};
          mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));
          await fbSet("hashes",h._id,u);
        }
        const u={...ex,situacao:"SAIDA",destino:c.name,...audit(user)};
        mutate("machines",m=>m.map(x=>x._id===ex._id?u:x));
        await fbSet("machines",ex._id,u);
        await markChanged("machines");
        await markChanged("hashes");
        msg="✓ "+ex.model+" → SAIDA"+(mHashes.length>0?" ("+mHashes.length+" HASHs)":"");
      } else {
        msg="✓ "+ex.model+" (já em "+ex.situacao+")";
      }
    }
    const newSNs=[...(c.machinesSN||[]),sn];
    const upd={...c,machinesSN:newSNs,...audit(user)};
    setC(upd);
    mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));
    await fbSet("clients",c._id,upd);
    await markChanged("clients");
    setLog(l=>[{sn,msg},...l]);
    setInput("");
  };

  const remMac=async(sn)=>{
    const newSNs=(c.machinesSN||[]).filter(s=>s!==sn);
    const upd={...c,machinesSN:newSNs,...audit(user)};
    setC(upd);
    mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));
    await fbSet("clients",c._id,upd);
    await markChanged("clients");
  };

  const del=async()=>{
    if(!confirm("Remover cliente "+c.name+"?"))return;
    mutate("clients",arr=>arr.filter(x=>x._id!==c._id));
    await fbDel("clients",c._id);
    await markChanged("clients");
    setModal(null);
  };

  const exportCSV=()=>{
    const rows=["SN,Modelo,TH,Situação,Data"];
    macs.forEach(m=>rows.push((m.sn||"")+","+(m.model||"")+","+(m.th||"")+","+(m.situacao||"")+","+(m.addedAt||"")));
    const blob=new Blob([rows.join("\n")],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="cliente-"+c.name.replace(/\s/g,"-")+".csv";
    a.click();
  };

  return<div>
    <div style={{background:C.card2,borderRadius:12,padding:14,marginBottom:14}}>
      <div style={{fontWeight:900,fontSize:16,marginBottom:4}}>👤 {c.name}</div>
      {c.phone&&<div style={{color:C.blue,fontSize:13}}>📱 {c.phone}</div>}
      {c.notes&&<div style={{color:C.subtle,fontSize:12,marginTop:4}}>{c.notes}</div>}
      <div style={{marginTop:10,display:"flex",gap:8}}>
        <div style={{background:C.accent+"22",borderRadius:8,padding:"6px 12px",textAlign:"center",flex:1}}>
          <div style={{fontWeight:900,color:C.accent,fontSize:20}}>{c.machinesSN?.length||0}</div>
          <div style={{fontSize:10,color:C.muted}}>Total</div>
        </div>
        <div style={{background:C.red+"22",borderRadius:8,padding:"6px 12px",textAlign:"center",flex:1}}>
          <div style={{fontWeight:900,color:C.red,fontSize:20}}>{saidaCount}</div>
          <div style={{fontSize:10,color:C.muted}}>Saídas</div>
        </div>
      </div>
    </div>

    <SL>Vincular Máquinas</SL>
    <div style={{color:C.amber,fontSize:11,marginBottom:8}}>⚠️ Ao vincular, máquina e HASHs internas vão para SAIDA</div>
    <SNInput value={input} onChange={setInput} placeholder="SN da máquina..." onEnter={()=>addMac(input)}/>
    {scanning&&<BarcodeScanner onScan={v=>{addMac(v)}} onClose={()=>setScanning(false)}/>}
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <Btn onClick={()=>addMac(input)} style={{flex:1}}>+ Vincular</Btn>
      <Btn v="b" onClick={()=>setScanning(true)} style={{flex:1}}>📷 Scanner</Btn>
    </div>

    {log.length>0&&<div style={{background:C.card2,borderRadius:10,padding:10,marginBottom:12,maxHeight:100,overflow:"auto"}}>
      {log.map((l,i)=><div key={i} style={{fontSize:11,color:C.text,padding:"2px 0"}}>{l.sn} — {l.msg}</div>)}
    </div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <SL style={{margin:0}}>Máquinas ({macs.length})</SL>
      {macs.length>0&&<button onClick={exportCSV} style={{background:"none",border:"none",color:C.blue,fontSize:11,cursor:"pointer",fontWeight:700}}>⬇️ CSV</button>}
    </div>
    {macs.length===0
      ?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:16}}>Nenhuma máquina vinculada</div>
      :macs.map(m=>{
        const mHashes=data.hashes.filter(h=>h.machineSN===m.sn&&m.sn);
        return<div key={m._id} style={{borderBottom:"1px solid "+C.border,padding:"10px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13}}>{m.sn||"SEM SN"} <SP s={m.situacao}/></div>
              <div style={{fontSize:11,color:C.muted}}>{m.model} · {m.th}TH</div>
              {mHashes.length>0&&<div style={{fontSize:10,color:C.subtle}}>⚡ {mHashes.length} HASH(s)</div>}
            </div>
            <button onClick={()=>remMac(m.sn||"")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:4}}>✕</button>
          </div>
        </div>;
      })}
    <Btn v="d" onClick={del} style={{width:"100%",marginTop:16}}>🗑 Remover Cliente</Btn>
  </div>;
}
