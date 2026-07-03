import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ═══ SUPABASE ═══════════════════════════════════════════════════ */
const SUPABASE_URL="https://paelbarlmayswqilhoxa.supabase.co";
const SUPABASE_KEY="sb_publishable_6Kz2o4DWlxhBgc7oyDt2AA_KmphGK-h"; // sb_publishable_...
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);

// Nome da coleção (usado no resto do app, igual antes) → nome da tabela real no Postgres
const TABLE_MAP={pendingApprovals:"pending_approvals",customModels:"custom_models"};
const tableName=c=>TABLE_MAP[c]||c;

// Mapa de campos: nome usado no app (camelCase/Firestore) → coluna no Postgres (snake_case).
// Mantendo essa tradução aqui, o resto do arquivo (todas as telas) não precisa
// mudar NADA — continuam lendo/escrevendo os mesmos nomes de sempre.
const FIELD_MAP={
  _by:"by_id",_byName:"by_name",_at:"at",addedAt:"added_at",createdAt:"created_at_app",
  photoKey:"photo_key",changeLog:"change_log",
  hashSN0:"hash_sn0",hashSN1:"hash_sn1",hashSN2:"hash_sn2",
  adminNote:"admin_note",lastTesterId:"last_tester_id",
  _reviewedByName:"reviewed_by_name",_reviewedAt:"reviewed_at",
  machineSN:"machine_sn",repairedBy:"repaired_by",repairedByName:"repaired_by_name",
  hashSN:"hash_sn",obsManual:"obs_manual",employeeId:"employee_id",
  slot0HashSN:"slot0_hash_sn",slot0Result:"slot0_result",slot0Photo:"slot0_photo",
  slot1HashSN:"slot1_hash_sn",slot1Result:"slot1_result",slot1Photo:"slot1_photo",
  slot2HashSN:"slot2_hash_sn",slot2Result:"slot2_result",slot2Photo:"slot2_photo",
  testPhoto:"test_photo",overallResult:"overall_result",
  originalRepairerId:"original_repairer_id",testedBy:"tested_by",logPhotoKey:"log_photo_key",
  testId:"test_id",employeeName:"employee_name",employeeCode:"employee_code",
  machinesSN:"machines_sn",hashesSN:"hashes_sn",
  canSeeAll:"can_see_all",passwordHash:"password_hash",allowedEmployees:"allowed_employees",
  updatedAt:"updated_at",
};
const FIELD_MAP_REV=Object.fromEntries(Object.entries(FIELD_MAP).map(([js,db])=>[db,js]));
function toDBRow(obj){const row={};for(const[k,v]of Object.entries(obj)){if(v===undefined)continue;row[FIELD_MAP[k]||k]=v}return row}
function fromDBRow(row){
  if(!row)return null;
  const obj={};
  for(const[k,v]of Object.entries(row)){
    if(k==="id"){obj._id=v;continue}
    if(k==="created_at")continue; // coluna interna do Supabase (timestamp da linha), não é usada pelo app
    obj[FIELD_MAP_REV[k]||k]=v;
  }
  return obj;
}

// BLINDAGEM: Postgres/Supabase por padrão só devolve até 1000 linhas por
// pedido — sem paginar isso aqui, cairíamos EXATAMENTE no mesmo bug de
// "600 de 1290" que tínhamos no Firebase. Por isso sempre pagina até acabar.
async function fbList(c){
  const table=tableName(c);
  const pageSize=1000;
  let all=[],from=0;
  while(true){
    const{data,error}=await supabase.from(table).select("*").range(from,from+pageSize-1);
    if(error)throw new Error(`fbList(${c}): ${error.message}`);
    if(!data||data.length===0)break;
    all=all.concat(data);
    if(data.length<pageSize)break;
    from+=pageSize;
  }
  return all.map(fromDBRow);
}
async function fbGet(c,id){
  const table=tableName(c);
  const{data,error}=await supabase.from(table).select("*").eq("id",id).maybeSingle();
  if(error||!data)return null;
  return fromDBRow(data);
}
async function fbSet(c,id,obj){
  const table=tableName(c);
  const row={id,...toDBRow(obj)};
  const{error}=await supabase.from(table).upsert(row,{onConflict:"id"});
  if(error){console.error(`fbSet(${c},${id}):`,error.message);throw new Error(`fbSet(${c}): ${error.message}`)}
}
async function fbDel(c,id){
  const table=tableName(c);
  const{error}=await supabase.from(table).delete().eq("id",id);
  if(error){console.warn(`fbDel(${c},${id}):`,error.message);throw new Error(`fbDel(${c}): ${error.message}`)}
}
async function fbBatch(writes){
  const byCol={};
  for(const w of writes){(byCol[w.c]=byCol[w.c]||[]).push({id:w.id,...toDBRow(w.d)})}
  const errors=[];
  for(const[c,rows]of Object.entries(byCol)){
    const table=tableName(c);
    for(let i=0;i<rows.length;i+=500){
      const{error}=await supabase.from(table).upsert(rows.slice(i,i+500),{onConflict:"id"});
      if(error){console.error(`fbBatch(${c}):`,error.message);errors.push(`${c}: ${error.message}`)}
    }
  }
  if(errors.length)throw new Error(errors.join(" | "));
}
// Supabase Realtime substitui o sistema de polling + carimbo de tempo (_meta)
// que existia no Firebase — não precisa mais "marcar" nada manualmente.
const markChanged=()=>{};
const stamp=()=>new Date().toISOString();

/* ═══ FIRESTORE (LEGADO — só usado 1x pra migrar os dados antigos) ══ */
const LEGACY_PID="hashstock-prod";
const LEGACY_FB=`https://firestore.googleapis.com/v1/projects/${LEGACY_PID}/databases/(default)/documents`;
function legacyFromFS(d){if(!d?.fields)return{};const o={};for(const[k,v]of Object.entries(d.fields)){if("stringValue"in v)o[k]=v.stringValue;else if("integerValue"in v)o[k]=Number(v.integerValue);else if("doubleValue"in v)o[k]=v.doubleValue;else if("booleanValue"in v)o[k]=v.booleanValue;else if("nullValue"in v)o[k]=null;else if("arrayValue"in v)o[k]=(v.arrayValue.values||[]).map(i=>"mapValue"in i?legacyFromFS(i.mapValue):"integerValue"in i?Number(i.integerValue):i.stringValue??null);else if("mapValue"in v)o[k]=legacyFromFS(v.mapValue)}return o;}
async function legacyFbList(c){
  let docs=[],pt=null,pages=0;
  do{
    const r=await fetch(`${LEGACY_FB}/${c}?pageSize=300${pt?"&pageToken="+pt:""}`);
    const d=await r.json();
    if(d.error)throw new Error(`legacyFbList(${c}): ${d.error.message}`);
    if(d.documents)docs=[...docs,...d.documents.map(x=>({...legacyFromFS(x),_id:x.name.split("/").pop()}))];
    pt=d.nextPageToken;pages++;
    if(pages>500)break;
  }while(pt);
  return docs;
}
async function hashPwd(pwd){
  const enc=new TextEncoder();
  const data=enc.encode(pwd+"hs2026salt");
  const buf=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
const audit=(u,e={})=>({...e,_by:u._id,_byName:u.name,_at:stamp()});

/* ═══ STORAGE ════════════════════════════════════════════════════ */
// Fotos agora vão pro Google Drive de vocês (via Apps Script), não mais pro
// Supabase Storage — evita estourar o limite de 1GB grátis do Supabase.
let DRIVE_UPLOAD_URL=localStorage.getItem("driveUploadUrl")||"";
async function uploadPhoto(b64,path){
  if(!DRIVE_UPLOAD_URL){console.warn("Configure a URL do Drive em Config antes de enviar fotos.");return null}
  try{
    const r=await fetch(DRIVE_UPLOAD_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"uploadPhoto",base64:b64,filename:path.replace(/\//g,"_")})});
    const d=await r.json();
    if(d.error){console.error("Upload Drive error:",d.error);return null}
    return d.url||null;
  }catch(e){console.error("uploadPhoto:",e);return null}
}
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
const HST_OPTS=["ON","OFF","TESTAR","REPARO","STOCK","SAIDA","IRREPARAVEL","NA MAQUINA"];
const SIT_C={"STOCK":"#d97706","BOA":"#16a34a","AGUARD. REVISÃO":"#2563eb","REVISAR":"#dc2626","ENTRADA OFICINA":"#0ea5e9","LIGADA":"#8b5cf6","VENDIDA":"#dc2626","PREPARANDO":"#2563eb","SAIDA":"#dc2626","EXPORTADA":"#dc2626","CASTANHAO":"#92400e"};
const HST_C={ON:"#16a34a",OFF:"#dc2626",TESTAR:"#d97706",REPARO:"#8b5cf6",STOCK:"#64748b",SAIDA:"#ea580c",IRREPARAVEL:"#374151","NA MAQUINA":"#0ea5e9"};
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

/* ═══ BIPAGEM INTELIGENTE EM LOTE ══════════════════════════════
   Componente reutilizável usado em Clientes, Paletes e Lote de HASHs/Máquinas.
   Detecta pela velocidade das teclas se o SN está sendo BIPADO (leitor de
   código de barras — rajada de caracteres em poucos milissegundos) ou
   DIGITADO manualmente devagar:
   - Bipado: assim que a rajada para (pequena pausa), confirma sozinho e
     limpa o campo pra já poder bipar o próximo, sem precisar Enter/clique.
   - Manual: espera Enter ou o botão "+", pra não atrapalhar quem digita.
*/
function SmartScanInput({onDetect,placeholder,autoFocus,disabled}){
  const[val,setVal]=useState("");
  const lastKeyTime=useRef(0);
  const wasFast=useRef(true);
  const pauseTimer=useRef(null);
  const commit=(v,fast)=>{
    const s=v.trim();
    if(!s)return;
    onDetect(s,fast);
    setVal("");
    wasFast.current=true;
    lastKeyTime.current=0;
  };
  const handleChange=e=>{
    const now=Date.now();
    const gap=lastKeyTime.current?now-lastKeyTime.current:0;
    lastKeyTime.current=now;
    if(gap>150&&val.length>0)wasFast.current=false; // pausa grande = digitação manual
    const v=e.target.value.toUpperCase();
    setVal(v);
    clearTimeout(pauseTimer.current);
    // Se a digitação inteira foi rápida (bipe) e agora parou por um instante, confirma sozinho
    pauseTimer.current=setTimeout(()=>{if(wasFast.current&&v.trim().length>=4)commit(v,true)},200);
  };
  const handleKeyDown=e=>{if(e.key==="Enter"){clearTimeout(pauseTimer.current);commit(val,wasFast.current)}};
  return<input value={val} onChange={handleChange} onKeyDown={handleKeyDown} onFocus={()=>{wasFast.current=true;lastKeyTime.current=0}} placeholder={placeholder||"Bipe ou digite o SN e Enter..."} autoFocus={autoFocus} disabled={disabled} style={{...inp}}/>;
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

class SafeTab extends React.Component{
  constructor(p){super(p);this.state={err:null};}
  static getDerivedStateFromError(e){return{err:e};}
  render(){
    if(this.state.err)return<div style={{padding:20,color:"#ef4444",background:"#1c0a0a",borderRadius:12,margin:12}}><div style={{fontWeight:800,marginBottom:8}}>⚠️ Erro no componente</div><div style={{fontSize:12,fontFamily:"monospace"}}>{this.state.err?.message||"Erro desconhecido"}</div></div>;
    return this.props.children;
  }
}

export default function App(){
  const[user,setUser]=useState(null);
  const[data,setData]=useState({employees:[],machines:[],hashes:[],repairs:[],tests:[],feedbacks:[],approvals:[],customModels:[],pallets:[],clients:[]});
  const[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[tab,setTab]=useState("home"),[modal,setModal]=useState(null),[camOpen,setCamOpen]=useState(false);
  const[webhookUrl,setWebhookUrl]=useState(()=>localStorage.getItem("webhookUrl")||"");
  const setCol=(col,val)=>setData(d=>({...d,[col]:val}));
  const mutate=(col,fn)=>setData(d=>({...d,[col]:fn(d[col])}));
  const allModels=useCallback(()=>[...DEF_MODELS,...data.customModels].sort((a,b)=>a.m.localeCompare(b.m)),[data.customModels]);
  const gTH=useCallback(m=>{const f=[...DEF_MODELS,...data.customModels].find(x=>x.m===m);return f?.th||0},[data.customModels]);
  const[dataWarnings,setDataWarnings]=useState([]);

  // BLINDAGEM CONTRA PERDA DE DADOS:
  // Guarda o maior número de itens já visto por coleção. Se uma nova leitura
  // vier com MUITO menos itens que o máximo já confirmado (ex: 600 vs 1290),
  // isso é tratado como leitura suspeita/incompleta — os dados antigos são
  // mantidos na tela e um aviso fica registrado pro Admin, em vez de sumir
  // silenciosamente com o estoque.
  const guardCount=(col,freshArr,prevArr)=>{
    const maxKey="hs_maxcount_"+col;
    const knownMax=Number(localStorage.getItem(maxKey)||0);
    const freshLen=freshArr.length;
    if(freshLen>=knownMax){localStorage.setItem(maxKey,String(freshLen));return{use:freshArr,warn:null}}
    // Fresh leitura veio menor que o máximo já visto
    if(knownMax>0&&freshLen<knownMax*0.9){
      const msg=`⚠️ Leitura de "${col}" retornou ${freshLen} itens, mas já vimos ${knownMax} antes. Mantendo os ${Math.max(prevArr.length,freshLen)} dados atuais na tela — nada foi apagado, só a exibição foi protegida.`;
      console.warn(msg);
      return{use:prevArr.length>=freshLen?prevArr:freshArr,warn:msg};
    }
    return{use:freshArr,warn:null};
  };

  // Mapeia a chave usada em markChanged() para o nome real da coleção no Firestore
  const META_TO_COL={machines:"machines",hashes:"hashes",repairs:"repairs",tests:"tests",feedbacks:"feedbacks",approvals:"pendingApprovals",customModels:"customModels",pallets:"pallets",clients:"clients"};
  const fetchAllCollections=async(onlyKeys)=>{
    const allCols=["machines","hashes","repairs","tests","feedbacks","pendingApprovals","customModels","pallets","clients"];
    const cols=onlyKeys?onlyKeys.map(k=>META_TO_COL[k]).filter(Boolean):allCols;
    // Espaça o INÍCIO de cada leitura em 120ms — evita disparar tudo junto
    // de uma vez (rajada), o que ajuda a não estourar limites por minuto
    // além do limite diário.
    const _res=await Promise.allSettled(cols.map((c,i)=>new Promise(res=>setTimeout(res,i*120)).then(()=>fbList(c))));
    const out={};const errs=[];
    cols.forEach((c,i)=>{if(_res[i].status==="fulfilled")out[c]=_res[i].value;else{out[c]=[];errs.push(`${c}: ${_res[i].reason?.message||"falha"}`)}});
    return{out,errs};
  };

  const loadAll=useCallback(async(onlyKeys)=>{
    const{out,errs}=await fetchAllCollections(onlyKeys);
    setData(prev=>{
      const warnings=[...errs];
      const merge=(col,freshRaw)=>{
        if(freshRaw===undefined)return prev[col]; // coleção não pedida nesta leitura — mantém como estava
        const{use,warn}=guardCount(col,freshRaw,prev[col]);
        if(warn)warnings.push(warn);
        return use;
      };
      const next={
        ...prev,
        machines:merge("machines",out.machines),
        hashes:merge("hashes",out.hashes),
        repairs:out.repairs!==undefined?(out.repairs.length?out.repairs:prev.repairs):prev.repairs,
        tests:out.tests!==undefined?(out.tests.length?out.tests:prev.tests):prev.tests,
        feedbacks:out.feedbacks!==undefined?(out.feedbacks.length?out.feedbacks:prev.feedbacks):prev.feedbacks,
        approvals:out.pendingApprovals!==undefined?(out.pendingApprovals.length?out.pendingApprovals:prev.approvals):prev.approvals,
        customModels:out.customModels!==undefined?(out.customModels.length?out.customModels:prev.customModels):prev.customModels,
        pallets:out.pallets!==undefined?(out.pallets.length?out.pallets:prev.pallets):prev.pallets,
        clients:out.clients!==undefined?(out.clients.length?out.clients:prev.clients):prev.clients,
      };
      if(next.machines.length)localStorage.setItem("hs_machines",JSON.stringify(next.machines));
      if(next.hashes.length)localStorage.setItem("hs_hashes",JSON.stringify(next.hashes));
      if(warnings.length)setDataWarnings(w=>[...warnings.map(m=>({msg:m,at:stamp()})),...w].slice(0,20));
      return next;
    });
  },[]);

  const CACHE_FRESH_MS=3*60*1000; // 3 minutos — dentro desse tempo, reabrir o app não gasta leitura nova
  const bootLoad=useCallback(async()=>{
    setLoading(true);
    const cachedEmps=JSON.parse(localStorage.getItem("hs_employees")||"[]");
    const lastFetch=Number(localStorage.getItem("hs_lastFullFetch")||0);
    const isFresh=Date.now()-lastFetch<CACHE_FRESH_MS;
    if(isFresh&&cachedEmps.length>0){
      // Já buscamos tudo há pouquíssimo tempo (ex: reabriu a aba, trocou de
      // tela) — usa o que já está salvo neste aparelho em vez de gastar
      // leitura nova do Firebase. O polling (a cada 15min) mantém tudo
      // atualizado depois disso.
      setCol("employees",cachedEmps);
      setData(d=>({
        ...d,
        machines:JSON.parse(localStorage.getItem("hs_machines")||"[]"),
        hashes:JSON.parse(localStorage.getItem("hs_hashes")||"[]"),
      }));
      setLoading(false);
      return;
    }
    try{
      let emps=[];
      let empsFailed=false;
      try{emps=await fbList("employees")}catch(e){empsFailed=true;console.error("Falha ao carregar funcionários:",e)}
      if(empsFailed){
        // Falha na leitura: NUNCA recriar admin nem apagar a lista — usa o
        // cache local (se existir) e avisa o Admin, sem mexer no Firebase.
        setCol("employees",cachedEmps);
        setDataWarnings(w=>[{msg:"⚠️ Não consegui carregar a lista de funcionários do Firebase agora. Mostrando a última cópia salva neste aparelho ("+cachedEmps.length+" pessoas). Recarregue a página em instantes.",at:stamp()},...w]);
      }else if(emps.length===0&&cachedEmps.length>0){
        // Veio vazio mas já tínhamos gente cadastrada antes — provável leitura
        // incompleta, NÃO cria admin novo. Usa o cache e avisa.
        setCol("employees",cachedEmps);
        setDataWarnings(w=>[{msg:"⚠️ Leitura de funcionários voltou vazia, mas já existiam "+cachedEmps.length+" cadastrados. Mantendo a cópia salva por segurança — nada foi apagado.",at:stamp()},...w]);
      }else if(emps.length===0){
        // Realmente não existe ninguém cadastrado ainda (primeira vez) — cria o admin padrão
        const id=uid();const pwHash=await hashPwd("018");const adm={code:"019",name:"Admin",role:"admin",permissions:{repairs:true,testing:true,machines:true,hashes:true,admin:true},canSeeAll:true,passwordHash:pwHash};
        await fbSet("employees",id,adm);setCol("employees",[{...adm,_id:id}]);
        localStorage.setItem("hs_employees",JSON.stringify([{...adm,_id:id}]));
      }else{
        setCol("employees",emps);
        localStorage.setItem("hs_employees",JSON.stringify(emps));
      }
      const{out,errs}=await fetchAllCollections();
      const cachedM=JSON.parse(localStorage.getItem("hs_machines")||"[]");
      const cachedH=JSON.parse(localStorage.getItem("hs_hashes")||"[]");
      const gM=guardCount("machines",out.machines,cachedM);
      const gH=guardCount("hashes",out.hashes,cachedH);
      const warnings=[...errs,gM.warn,gH.warn].filter(Boolean);
      setData(d=>({
        ...d,
        machines:gM.use.length?gM.use:cachedM,
        hashes:gH.use.length?gH.use:cachedH,
        repairs:out.repairs.length?out.repairs:d.repairs,
        tests:out.tests.length?out.tests:d.tests,
        feedbacks:out.feedbacks.length?out.feedbacks:d.feedbacks,
        approvals:out.pendingApprovals.length?out.pendingApprovals:d.approvals,
        customModels:out.customModels.length?out.customModels:d.customModels,
        pallets:out.pallets.length?out.pallets:d.pallets,
        clients:out.clients.length?out.clients:d.clients,
      }));
      if(gM.use.length)localStorage.setItem("hs_machines",JSON.stringify(gM.use));
      if(gH.use.length)localStorage.setItem("hs_hashes",JSON.stringify(gH.use));
      localStorage.setItem("hs_lastFullFetch",String(Date.now()));
      if(warnings.length)setDataWarnings(w=>[...warnings.map(m=>({msg:m,at:stamp()})),...w].slice(0,20));
    }catch(e){
      console.error("Erro crítico no boot:",e);
      setCol("employees",cachedEmps);
      setDataWarnings(w=>[{msg:"⚠️ Falha ao carregar dados iniciais: "+e.message+". Usando última cópia salva.",at:stamp()},...w]);
    }
    setLoading(false);
  },[]);
  useEffect(()=>{bootLoad()},[bootLoad]);
  // Supabase Realtime: qualquer mudança em qualquer tabela avisa todo mundo
  // na hora (substitui o polling de 15 em 15 minutos do Firebase). Como o
  // Supabase não cobra por leitura, não tem problema reler a coleção inteira
  // sempre que algo mudar.
  useEffect(()=>{
    const TABLE_TO_META={machines:"machines",hashes:"hashes",repairs:"repairs",tests:"tests",feedbacks:"feedbacks",pending_approvals:"approvals",custom_models:"customModels",pallets:"pallets",clients:"clients"};
    const debounceTimers={};
    const channel=supabase.channel("hashstock-realtime");
    Object.keys(TABLE_TO_META).forEach(table=>{
      channel.on("postgres_changes",{event:"*",schema:"public",table},()=>{
        const metaKey=TABLE_TO_META[table];
        clearTimeout(debounceTimers[table]);
        debounceTimers[table]=setTimeout(async()=>{
          setSyncing(true);
          try{await loadAll([metaKey])}catch(e){console.error("Realtime refresh falhou:",e)}
          setSyncing(false);
        },500);
      });
    });
    channel.subscribe();
    return()=>{supabase.removeChannel(channel)};
  },[loadAll]);

  useEffect(()=>{if(data.employees.length)localStorage.setItem("hs_employees",JSON.stringify(data.employees))},[data.employees]);

  const ctx={user,data,setCol,mutate,setModal,setTab,loadAll,webhookUrl,setWebhookUrl,allModels,gTH,dataWarnings};
  if(loading)return<Splash/>;
  if(!user&&data.employees.length===0)return<BootErrorScreen onRetry={bootLoad} warnings={dataWarnings}/>;
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
        {isAdmin&&dataWarnings.length>0&&<Tag color={C.red} title="Avisos de integridade de dados">🛡️{dataWarnings.length}</Tag>}
      </div>
      <button onClick={()=>setUser(null)} style={{background:"#1a2d42",border:"none",color:C.subtle,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12}}>Sair</button>
    </div>
    {isAdmin&&dataWarnings.length>0&&<div style={{background:"#2a0c0c",borderBottom:`1px solid ${C.red}`,padding:"8px 16px",fontSize:11,color:"#ff9b9b"}}>🛡️ {dataWarnings[0].msg} <span style={{color:C.muted}}>· ver mais em Config</span></div>}
    <div style={{padding:"14px 12px 100px"}}>
      {tab==="home"&&<HomePage ctx={ctx} isAdmin={isAdmin} myFdbs={myFdbs} myRevisit={myRevisit} pendingApprs={pendingApprs} canSeeEmp={canSeeEmp}/>}
      {tab==="mac"&&<MacPage ctx={ctx}/>}
      {tab==="hsh"&&<HashPage ctx={ctx}/>}
      {tab==="conserto"&&<ConsertaPage ctx={ctx}/>}
      {tab==="teste"&&<TestePage ctx={ctx}/>}
      {tab==="hist"&&<HistPage ctx={ctx}/>}
      {tab==="pal"&&<SafeTab><PalletsPage ctx={ctx}/></SafeTab>}{tab==="cli"&&<SafeTab><ClientesPage ctx={ctx}/></SafeTab>}{tab==="approvals"&&<ApprovalsPage ctx={ctx}/>}
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

// Mostrado apenas se, mesmo após todas as tentativas e o cache local, não foi
// possível carregar NENHUM funcionário. Evita mostrar a tela de login normal
// (que erroneamente parece dizer "usuário não existe") quando na verdade é
// uma falha de conexão com o Firebase.
function BootErrorScreen({onRetry,warnings}){
  const[retrying,setRetrying]=useState(false);
  return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{width:"100%",maxWidth:360,textAlign:"center"}}>
      <div style={{fontSize:52,marginBottom:12}}>🛡️⚠️</div>
      <div style={{fontWeight:900,fontSize:18,color:C.red,marginBottom:8}}>Não consegui carregar os usuários</div>
      <div style={{color:C.muted,fontSize:13,marginBottom:20,lineHeight:1.5}}>Isso normalmente é uma falha temporária de conexão com o Firebase — nenhum dado foi apagado. Verifique sua internet e tente de novo.</div>
      {warnings?.[0]&&<div style={{background:"#2a0c0c",border:`1px solid ${C.red}`,borderRadius:10,padding:12,marginBottom:16,fontSize:11,color:"#ff9b9b",textAlign:"left"}}>{warnings[0].msg}</div>}
      <Btn onClick={async()=>{setRetrying(true);await onRetry();setRetrying(false)}} disabled={retrying} style={{width:"100%",padding:"13px",fontSize:14,justifyContent:"center"}}>{retrying?"Tentando...":"🔄 Tentar de novo"}</Btn>
    </div>
  </div>;
}

/* ═══ LOGIN ═════════════════════════════════════════════════════ */
function LoginPage({employees,onLogin}){
  const[usr,setUsr]=useState(""),[pwd,setPwd]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false),[showPwd,setShowPwd]=useState(false);
  const go=async()=>{
    if(!usr.trim()||!pwd.trim()){setErr("Preencha usuário e senha");return}
    setBusy(true);setErr("");
    const hash=await hashPwd(pwd);
    const emp=employees.find(e=>(e.code===usr.trim()||e.name.toLowerCase()===usr.trim().toLowerCase()));
    if(!emp){setErr("Usuário não encontrado");setBusy(false);return}
    if(emp.passwordHash===hash){onLogin(emp);}
    else if(!emp.passwordHash){setErr("Sem senha. Peça ao Admin para cadastrar sua senha.");}
    else{setErr("Senha incorreta");}
    setBusy(false);
  };
  return<div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{width:"100%",maxWidth:360,textAlign:"center"}}>
      <div style={{fontSize:56,marginBottom:6}}>⛏️</div>
      <div style={{fontWeight:900,fontSize:24,color:C.accent,marginBottom:4}}>HashStock</div>
      <div style={{color:C.muted,fontSize:12,marginBottom:28}}>Sistema de Gestão</div>
      <div style={{background:C.card,borderRadius:20,padding:28,border:`1px solid ${C.border}`,textAlign:"left"}}>
        <div style={{color:C.subtle,fontSize:11,fontWeight:800,letterSpacing:1,marginBottom:16,textAlign:"center",textTransform:"uppercase"}}>🔐 Acesso Seguro</div>
        <Inp label="Usuário (nome ou código)" value={usr} onChange={e=>setUsr(e.target.value)} placeholder="Ex: João ou 019" autoFocus/>
        <div style={{marginBottom:12}}>
          <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:5,letterSpacing:1,textTransform:"uppercase"}}>Senha</div>
          <div style={{display:"flex",gap:8}}>
            <input type={showPwd?"text":"password"} value={pwd} onChange={e=>setPwd(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} placeholder="••••••" style={{...inp,flex:1}}/>
            <button onClick={()=>setShowPwd(s=>!s)} style={{background:C.card2,border:`1px solid ${C.border}`,borderRadius:10,padding:"0 14px",cursor:"pointer",color:C.muted,fontSize:16}}>{showPwd?"🙈":"👁️"}</button>
          </div>
        </div>
        {err&&<div style={{color:C.red,fontSize:12,marginBottom:12,textAlign:"center"}}>⚠️ {err}</div>}
        <Btn onClick={go} disabled={busy} style={{width:"100%",padding:"13px",fontSize:14}}>{busy?"...":"→ Entrar"}</Btn>

      </div>
    </div>
  </div>;
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
    {user.permissions?.testing&&!isAdmin&&<div style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontWeight:800,fontSize:14}}>⏳ Para Testar</div><Tag color={toTest.length>0?C.amber:"#1a2d42"}>{toTest.length}</Tag></div>{toTest.slice(0,3).map(h=>{const rep=data.employees.find(e=>e._id===h.repairedBy);const repName=rep?.name||h.repairedByName;return<div key={h._id} style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700,fontSize:13,color:C.blue}}>⚡ {h.sn||"SEM SN"}</div><div style={{fontSize:11,color:C.muted}}>{h.model}{repName?` · 👷 ${repName}`:""}</div></div><HP s={h.status}/></div>})}<Btn v="g" onClick={()=>setTab("teste")} style={{width:"100%",justifyContent:"center",marginTop:8}}>🧪 Iniciar Teste</Btn></div>}
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
function FilterBar({filters,active,onToggle,counts,label}){
  const[open,setOpen]=useState(false);
  const activeList=Object.entries(active).filter(([,v])=>v).map(([k])=>k);
  return<div style={{position:"relative",marginBottom:10}}>
    <button onClick={()=>setOpen(o=>!o)} style={{background:C.card,border:`1px solid ${open?C.accent:C.border}`,borderRadius:10,padding:"8px 14px",color:C.text,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontSize:12,fontWeight:700,width:"100%",justifyContent:"space-between"}}>
      <span>🔍 {label||"Filtros"} {activeList.length>0&&<Tag color={C.accent} small>{activeList.length} ativo</Tag>}</span>
      <span style={{color:C.muted}}>{open?"▲":"▼"}</span>
    </button>
    {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,marginTop:4,padding:10,maxHeight:300,overflow:"auto"}}>
      {filters.map(f=>{
        const cnt=counts?.[f.id]||0;
        return<div key={f.id} onClick={()=>{onToggle(f.id);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",cursor:"pointer",borderRadius:8,background:active[f.id]?(f.color||C.accent)+"22":"transparent",marginBottom:2}}>
          <span style={{fontSize:13,color:active[f.id]?(f.color||C.accent):C.text,fontWeight:active[f.id]?700:400}}>{f.label}</span>
          <span style={{background:C.card2,borderRadius:20,padding:"1px 8px",fontSize:11,color:C.muted,fontWeight:700}}>{cnt}</span>
        </div>;
      })}
      <button onClick={()=>{filters.forEach(f=>active[f.id]&&onToggle(f.id));setOpen(false)}} style={{width:"100%",background:"none",border:"none",color:C.muted,cursor:"pointer",padding:"6px",fontSize:11,marginTop:4}}>Limpar filtros</button>
    </div>}
  </div>;
}

function LastMove({log}){
  if(!log||!log.length)return null;
  const l=log[0];
  return<div style={{fontSize:10,color:C.subtle,marginTop:3}}>🕓 {l.label}: "{l.from||"—"}"→"{l.to||"—"}" · {l.by} · {fmtTS(l.at)}</div>;
}

function MacPage({ctx}){
  const{data,setModal,mutate,user}=ctx;
  const[search,setSearch]=useState(""),[activeFilters,setActiveFilters]=useState({}),[modelFilters,setModelFilters]=useState(new Set()),[selected,setSelected]=useState(new Set()),[selMode,setSelMode]=useState(false),[bulkAction,setBulkAction]=useState(null);
  const toggleFilter=id=>setActiveFilters(f=>({...f,[id]:!f[id]}));
  const toggleModel=mo=>setModelFilters(s=>{const n=new Set(s);n.has(mo)?n.delete(mo):n.add(mo);return n});
  const allModelsUsed=[...new Set(data.machines.map(m=>m.model).filter(Boolean))].sort();
  const q=search.toLowerCase();
  const filtered=data.machines.filter(m=>{
    const ms=!q||(m.sn||"").toLowerCase().includes(q)||m.model?.toLowerCase().includes(q)||m.location?.toLowerCase().includes(q)||m.destino?.toLowerCase().includes(q)||m.ref?.toLowerCase().includes(q);
    const sitF=Object.entries(activeFilters).filter(([k,v])=>v&&SIT_OPTS.includes(k));
    const typF=Object.entries(activeFilters).filter(([k,v])=>v&&["complete","shell","nosn","withHash","noHash"].includes(k));
    const sitOk=sitF.length===0||sitF.some(([k])=>m.situacao===k);
    const typOk=typF.length===0||typF.some(([k])=>(k==="complete"&&m.type==="complete")||(k==="shell"&&m.type==="shell")||(k==="nosn"&&!m.sn)||(k==="withHash"&&(m.hash0==="ON"||m.hash1==="ON"||m.hash2==="ON"))||(k==="noHash"&&m.hash0!=="ON"&&m.hash1!=="ON"&&m.hash2!=="ON"));
    const modelOk=modelFilters.size===0||modelFilters.has(m.model);
    return ms&&sitOk&&typOk&&modelOk;
  });
  const macFilters=[
    ...SIT_OPTS.map(s=>({id:s,label:s,color:SIT_C[s]})),
    {id:"complete",label:"Completas",color:C.blue},
    {id:"shell",label:"Carcaças",color:C.muted},
    {id:"nosn",label:"Sem SN",color:C.red},
    {id:"withHash",label:"Com HASH ON",color:C.green},
    {id:"noHash",label:"Sem HASH",color:C.amber},
  ];
  const macCounts=Object.fromEntries(macFilters.map(f=>[f.id,data.machines.filter(m=>
    f.id==="complete"?m.type==="complete":f.id==="shell"?m.type==="shell":f.id==="nosn"?!m.sn:
    f.id==="withHash"?(m.hash0==="ON"||m.hash1==="ON"||m.hash2==="ON"):
    f.id==="noHash"?(m.hash0!=="ON"&&m.hash1!=="ON"&&m.hash2!=="ON"):m.situacao===f.id
  ).length]));
  const openAdd=()=>setModal(<Modal title="Adicionar" onClose={()=>setModal(null)}><AddModeSelect ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=m=>setModal(<Modal title={`🖥️ ${m.sn||"SEM SN"}`} onClose={()=>setModal(null)}><MachineDetail ctx={ctx} machine={m}/></Modal>);
  const selMachines=filtered.filter(m=>selected.has(m._id));
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><div style={{fontWeight:900,fontSize:18}}>Máquinas</div><div style={{color:C.muted,fontSize:12}}>{data.machines.length} cadastradas</div></div><div style={{display:"flex",gap:6}}><Btn v={selMode?"d":"s"} onClick={()=>{setSelMode(s=>!s);setSelected(new Set())}} style={{fontSize:12,padding:"8px 10px"}}>{selMode?"✕":"☑️"}</Btn><Btn onClick={openAdd}>+ Adicionar</Btn></div></div>
    <div style={{background:C.card,borderRadius:10,padding:"8px 12px",display:"flex",gap:8,marginBottom:10}}>🔍<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SN, modelo, local, destino, ref..." style={{background:"none",border:"none",color:C.text,fontSize:13,flex:1,outline:"none"}}/></div>
    <FilterBar filters={macFilters} active={activeFilters} onToggle={toggleFilter} counts={macCounts} label={"Situação/Tipo ("+filtered.length+"/"+data.machines.length+")"}/>
    {allModelsUsed.length>0&&<div style={{marginBottom:10}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>MODELO (múltipla escolha){modelFilters.size>0&&<button onClick={()=>setModelFilters(new Set())} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:10,marginLeft:8}}>limpar</button>}</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allModelsUsed.map(mo=><button key={mo} onClick={()=>toggleModel(mo)} style={{background:modelFilters.has(mo)?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{mo}</button>)}</div>
    </div>}
    {selMode&&selected.size>0&&<div style={{background:C.card2,border:`1px solid ${C.accent}`,borderRadius:10,padding:10,marginBottom:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <Tag color={C.accent}>{selected.size} selecionadas</Tag>
      <Btn v="b" onClick={()=>setBulkAction("status")} style={{fontSize:11,padding:"6px 10px"}}>🏷️ Mudar Status</Btn>
      <Btn v="p" onClick={()=>setBulkAction("pallet")} style={{fontSize:11,padding:"6px 10px"}}>📦 Mover p/ Palete</Btn>
      <Btn v="y" onClick={()=>setBulkAction("client")} style={{fontSize:11,padding:"6px 10px"}}>👤 Enviar p/ Cliente</Btn>
    </div>}
    {filtered.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>🖥️</div>Nenhuma máquina</div>
      :filtered.map(m=><div key={m._id} style={{position:"relative"}}>
      {selMode&&<div style={{position:"absolute",top:10,left:10,zIndex:5}}><input type="checkbox" checked={selected.has(m._id)} onChange={e=>{const s=new Set(selected);e.target.checked?s.add(m._id):s.delete(m._id);setSelected(s)}} style={{width:18,height:18,cursor:"pointer"}}/></div>}
      <Card accent={SIT_C[m.situacao]||C.border} onClick={()=>!selMode&&openDetail(m)} style={{paddingLeft:selMode?36:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}><div><div style={{fontWeight:800,fontSize:14,color:!m.sn?C.red:C.text}}>{m.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12}}>{m.model} · {m.th}TH</div><By by={m._byName} at={m._at}/><LastMove log={m.changeLog}/></div><SP s={m.situacao}/></div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><HP s={m.hash0}/><HP s={m.hash1}/><HP s={m.hash2}/>{m.controladora&&<span style={{fontSize:10,color:C.subtle}}>CTR:{m.controladora}</span>}{m.fans&&<span style={{fontSize:10,color:C.subtle}}>FAN:{m.fans}</span>}</div>
      </Card></div>)}
    {bulkAction&&<Modal title={bulkAction==="status"?"🏷️ Mudar Status em Lote":bulkAction==="pallet"?"📦 Mover p/ Palete":"👤 Enviar p/ Cliente"} onClose={()=>setBulkAction(null)}>
      <BulkMachineAction ctx={ctx} action={bulkAction} machines={selMachines} onDone={()=>{setBulkAction(null);setSelected(new Set());setSelMode(false)}}/>
    </Modal>}
  </div>;
}

function BulkMachineAction({ctx,action,machines,onDone}){
  const{data,mutate,user,webhookUrl}=ctx;
  const[sit,setSit]=useState("BOA"),[palletId,setPalletId]=useState(""),[clientId,setClientId]=useState(""),[saving,setSaving]=useState(false);
  const apply=async()=>{
    setSaving(true);
    if(action==="status"){
      for(const m of machines){const u={...m,situacao:sit,changeLog:[{field:"situacao",label:"Situação",from:m.situacao,to:sit,by:user.name,at:stamp()},...(m.changeLog||[])].slice(0,80),...audit(user)};mutate("machines",arr=>arr.map(x=>x._id===m._id?u:x));await fbSet("machines",m._id,u);syncSheet(webhookUrl,"updateMachine",{sn:u.sn,field:"situacao",to:sit,employeeName:user.name,employeeCode:user.code})}
      await markChanged("machines");
    }else if(action==="pallet"&&palletId){
      const pl=data.pallets.find(p=>p._id===palletId);if(pl){const sns=machines.map(m=>m.sn).filter(Boolean);const ns=[...new Set([...(pl.machinesSN||[]),...sns])];const upd={...pl,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===palletId?upd:x));await fbSet("pallets",palletId,upd);await markChanged("pallets")}
    }else if(action==="client"&&clientId){
      const cl=data.clients.find(c=>c._id===clientId);if(cl){
        const sns=machines.map(m=>m.sn).filter(Boolean);
        for(const m of machines){const mHashes=data.hashes.filter(h=>h.machineSN===m.sn);for(const h of mHashes){const uh={...h,status:"SAIDA",location:"Vendida: "+cl.name,...audit(user)};mutate("hashes",arr=>arr.map(x=>x._id===h._id?uh:x));await fbSet("hashes",h._id,uh)}const um={...m,situacao:"SAIDA",destino:cl.name,...audit(user)};mutate("machines",arr=>arr.map(x=>x._id===m._id?um:x));await fbSet("machines",m._id,um)}
        const ns=[...new Set([...(cl.machinesSN||[]),...sns])];const updc={...cl,machinesSN:ns,...audit(user)};mutate("clients",arr=>arr.map(x=>x._id===clientId?updc:x));await fbSet("clients",clientId,updc);
        await markChanged("machines");await markChanged("hashes");await markChanged("clients");
      }
    }
    setSaving(false);onDone();
  };
  return<div>
    <div style={{color:C.muted,fontSize:12,marginBottom:14}}>{machines.length} máquina(s) selecionada(s)</div>
    {action==="status"&&<Sel label="NOVA SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>}
    {action==="pallet"&&<Sel label="PALETE DESTINO" value={palletId} onChange={e=>setPalletId(e.target.value)}><option value="">Selecionar...</option>{(data.pallets||[]).map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</Sel>}
    {action==="client"&&<><Sel label="CLIENTE DESTINO" value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">Selecionar...</option>{(data.clients||[]).map(c=><option key={c._id} value={c._id}>{c.name}</option>)}</Sel><div style={{color:C.amber,fontSize:11,marginBottom:10}}>⚠️ Máquinas e HASHs internas vão para SAIDA</div></>}
    <Btn v="g" onClick={apply} disabled={saving||(action==="pallet"&&!palletId)||(action==="client"&&!clientId)} style={{width:"100%"}}>{saving?"Aplicando...":"✓ Aplicar a "+machines.length}</Btn>
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
  const{data,mutate,user,allModels,gTH,webhookUrl}=ctx;const models=allModels();
  const[model,setModel]=useState(models[0]?.m||"M30S"),[th,setTh]=useState(gTH(models[0]?.m||"M30S")),[type,setType]=useState("complete"),[sit,setSit]=useState("STOCK"),[pending,setPending]=useState([]),[input,setInput]=useState(""),[saving,setSaving]=useState(false);
  const addSN=()=>{const s=input.toUpperCase().trim();if(!s||pending.includes(s))return;setPending(p=>[...p,s]);setInput("")};
  const saveAll=async()=>{if(!pending.length)return;setSaving(true);const writes=pending.map(sn=>{const id=uid();return{c:"machines",id,d:{sn,model,th:Number(th),type,situacao:sit,hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",ref:user.code,location:"",...audit(user),addedAt:TODAY(),destino:""}}});await fbBatch(writes);mutate("machines",m=>[...m,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("machines");writes.forEach(w=>syncSheet(webhookUrl,"addMachine",{sn:w.d.sn,model:w.d.model,th:w.d.th,situacao:w.d.situacao,employeeName:user.name,employeeCode:user.code}));setSaving(false);onClose()};
  return<div><div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div><Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:70}}/></div><div style={{display:"flex",gap:8}}><Sel label="TIPO" value={type} onChange={e=>setType(e.target.value)} style={{flex:1}}><option value="complete">Completa</option><option value="shell">Carcaça</option></Sel><Sel label="SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)} style={{flex:1}}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel></div><div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}><SL>BIPE OU ESCANEIE → ENTER</SL><SNInput value={input} onChange={setInput} placeholder="SN..." autoFocus onEnter={addSN}/><div style={{maxHeight:160,overflow:"auto"}}>{pending.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN</div>:pending.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13,fontFamily:"monospace",color:C.blue}}>{s}</span><button onClick={()=>setPending(pending.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button></div>)}</div></div><div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={saveAll} disabled={saving||!pending.length} style={{flex:1}}>{saving?"...":"💾 Salvar "+pending.length}</Btn></div></div>;
}

function BatchNoSNForm({ctx,onClose}){
  const{data,mutate,user,allModels,gTH,webhookUrl}=ctx;const models=allModels();
  const[itemType,setItemType]=useState("machine"),[model,setModel]=useState(models[0]?.m||"M30S"),[th,setTh]=useState(gTH(models[0]?.m||"M30S")),[sit,setSit]=useState("STOCK"),[qty,setQty]=useState("10"),[saving,setSaving]=useState(false),[prog,setProg]=useState(0);
  const save=async()=>{const n=parseInt(qty);if(!n||n<1||n>1000)return;setSaving(true);const isHash=itemType==="hash";const writes=Array.from({length:n},()=>{const id=uid();const d=isHash?{sn:"",model,status:"REPARO",machineSN:"",slot:-1,location:"",...audit(user),addedAt:TODAY()}:{sn:"",model,th:Number(th),type:itemType==="shell"?"shell":"complete",situacao:sit,hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",ref:user.code,location:"",...audit(user),addedAt:TODAY(),destino:""};return{c:isHash?"hashes":"machines",id,d}});for(let i=0;i<writes.length;i+=500){await fbBatch(writes.slice(i,i+500));setProg(Math.min(i+500,writes.length))}mutate(isHash?"hashes":"machines",arr=>[...arr,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged(isHash?"hashes":"machines");syncSheet(webhookUrl,isHash?"addHashBatch":"addMachineBatch",{count:n,model,employeeName:user.name,employeeCode:user.code});setSaving(false);onClose()};
  return<div><SL>TIPO</SL><div style={{display:"flex",gap:8,marginBottom:14}}>{[["machine","🖥️ Máq."],["shell","📦 Carc."],["hash","⚡ HASH"]].map(([v,l])=><button key={v} onClick={()=>setItemType(v)} style={{flex:1,background:itemType===v?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div><div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div>{itemType!=="hash"&&<Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:70}}/>}</div>{itemType!=="hash"&&<Sel label="SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>}<Inp label="QUANTIDADE" type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Ex: 300"/>{saving&&<div style={{background:"#0c2a0f",borderRadius:8,padding:10,marginBottom:12}}><div style={{color:C.green,fontWeight:700,marginBottom:4}}>Salvando {prog}/{qty}...</div><div style={{background:"#1a2d42",borderRadius:4,height:6}}><div style={{background:C.green,borderRadius:4,height:6,width:`${(prog/parseInt(qty||1))*100}%`,transition:"width .3s"}}/></div></div>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={save} disabled={saving} style={{flex:1}}>{saving?"...":"📦 Criar "+qty}</Btn></div></div>;
}

function AddMachineForm({ctx,onClose,initSN="",initPhoto=null}){
  const{data,mutate,user,allModels,gTH,webhookUrl}=ctx;const models=allModels();
  const[f,setF]=useState({sn:initSN,model:models[0]?.m||"M30S",th:gTH(models[0]?.m||"M30S"),type:"complete",hash0:"OFF",hash1:"OFF",hash2:"OFF",hashSN0:"",hashSN1:"",hashSN2:"",controladora:"OFF",fonte:"OFF",fans:"OFF",situacao:"STOCK",destino:""});
  const[photoKey,setPhotoKey]=useState(initPhoto),[saving,setSaving]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);const id=uid();const d={...f,th:Number(f.th),sn:f.sn.toUpperCase().trim(),...audit(user),addedAt:TODAY(),photoKey:photoKey||""};await fbSet("machines",id,d);mutate("machines",m=>[...m,{...d,_id:id}]);await markChanged("machines");syncSheet(webhookUrl,"addMachine",{sn:d.sn,model:d.model,th:d.th,situacao:d.situacao,employeeName:user.name,employeeCode:user.code});setSaving(false);onClose()};
  return<div>
    <SNInput label="SN" value={f.sn} onChange={v=>set("sn",v)} placeholder="Deixe vazio se não tiver"/>
    <div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={f.model} onChange={e=>{set("model",e.target.value);set("th",gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div><Inp label="T/H" type="number" value={f.th} onChange={e=>set("th",e.target.value)} style={{width:70}}/></div>
    <div style={{display:"flex",gap:8}}><Sel label="TIPO" value={f.type} onChange={e=>set("type",e.target.value)} style={{flex:1}}><option value="complete">Completa</option><option value="shell">Carcaça</option></Sel><Sel label="SITUAÇÃO" value={f.situacao} onChange={e=>set("situacao",e.target.value)} style={{flex:1}}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel></div>
    {f.type==="complete"&&<>{[0,1,2].map(i=><div key={i} style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}><span style={{color:C.subtle,fontSize:11,width:50}}>HASH {i}</span><input value={f[`hashSN${i}`]} onChange={e=>set(`hashSN${i}`,e.target.value.toUpperCase())} placeholder="SN" style={{...inp,flex:1,fontSize:12,padding:"7px 10px"}}/><select value={f[`hash${i}`]} onChange={e=>set(`hash${i}`,e.target.value)} style={{...inp,width:85,padding:"7px 8px",fontSize:12}}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</select></div>)}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]].map(([k,l])=><Sel key={k} label={l} value={f[k]} onChange={e=>set(k,e.target.value)} style={{marginBottom:0}}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>)}</div></>}
    <PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey}/>
    <div style={{display:"flex",gap:8,marginTop:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={saving} style={{flex:1}}>{saving?"...":"💾 Salvar"}</Btn></div>
  </div>;
}

const FIELD_LABELS={situacao:"Situação",sn:"SN",location:"Localização",model:"Modelo",th:"T/H",hash0:"Hash slot 1",hash1:"Hash slot 2",hash2:"Hash slot 3",hashSN0:"SN slot 1",hashSN1:"SN slot 2",hashSN2:"SN slot 3",controladora:"Controladora",fonte:"Fonte",fans:"Fans",status:"Status",destino:"Destino"};
function MachineDetail({ctx,machine}){
  const{data,mutate,setModal,user,webhookUrl}=ctx;
  const[m,setM]=useState(machine);
  const upd=async(k,v)=>{
    if(m[k]===v)return;
    const logEntry={field:k,label:FIELD_LABELS[k]||k,from:m[k]??"",to:v??"",by:user.name,at:stamp()};
    const newLog=[logEntry,...(m.changeLog||[])].slice(0,80);
    const u={...m,[k]:v,changeLog:newLog,...audit(user)};
    setM(u);mutate("machines",arr=>arr.map(x=>x._id===m._id?u:x));
    await fbSet("machines",m._id,u);await markChanged("machines");
    syncSheet(webhookUrl,"updateMachine",{sn:u.sn,field:k,from:logEntry.from,to:v,employeeName:user.name,employeeCode:user.code});
  };
  const history=[];
  data.tests.filter(t=>t.machineSN===m.sn&&m.sn).forEach(t=>{const emp=data.employees.find(e=>e._id===t.employeeId);history.push({date:t._at||t.date,text:"Testada por "+(emp?.name||"?")+" — "+(t.status==="pending"?"Aguard.Revisão":t.overallResult==="good"?"BOA":"RUIM"),photoKey:t.testPhoto})});
  (m.changeLog||[]).forEach(l=>history.push({date:l.at,text:`${l.label} alterado por ${l.by}: "${l.from||"—"}" → "${l.to||"—"}"`}));
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
                  <div style={{width:"calc(100% - 58px)",marginLeft:58,marginTop:4}}>
                    <div style={{background:HST_C[slotHash.status]+"15",border:"1px solid "+HST_C[slotHash.status]+"44",borderRadius:8,padding:"5px 12px",marginBottom:4}}>
                      <span style={{fontSize:11,color:HST_C[slotHash.status],fontWeight:700}}>{"⚡ "+slotHash.model+" — "+(slotHash.sn||"").slice(0,14)}</span>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setModal(<Modal title={"📋 Histórico "+(slotHash.sn||"SEM SN")} onClose={()=>setModal(null)}><HashHistoryOnly ctx={ctx} hash={slotHash}/></Modal>)} style={{flex:1,background:"#1a2d42",border:"none",color:C.text,borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>📋 Histórico</button>
                      <button onClick={()=>setModal(<Modal title={"📷 Foto "+(slotHash.sn||"SEM SN")} onClose={()=>setModal(null)}><HashPhotoQuick ctx={ctx} hash={slotHash}/></Modal>)} style={{flex:1,background:"#1a2d42",border:"none",color:C.text,borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>📷 Foto</button>
                    </div>
                  </div>
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
      <Inp label="Localização" value={m.location||""} onChange={e=>upd("location",e.target.value.toUpperCase())} placeholder="Ex: PALETE 01 · PRATELEIRA B3"/>
      {(()=>{const paletsComMac=(data.pallets||[]).filter(p=>(p.machinesSN||[]).includes(m.sn));const outrosPalets=(data.pallets||[]).filter(p=>!(p.machinesSN||[]).includes(m.sn));return<div>
        {paletsComMac.length>0&&<><SL>📦 Paletes desta máquina</SL>{paletsComMac.map(p=><div key={p._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+C.border,fontSize:12}}><span style={{color:C.blue}}>📦 {p.name}{p.location?" · "+p.location:""}</span><button onClick={async()=>{const ns=(p.machinesSN||[]).filter(s=>s!==m.sn);const upd2={...p,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd2:x));await fbSet("pallets",p._id,upd2);await markChanged("pallets");}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12}}>✕</button></div>)}</>}
        {outrosPalets.length>0&&<><SL mt={8}>Adicionar ao Palete</SL><select onChange={async e=>{const pid=e.target.value;if(!pid||!m.sn)return;const pl=data.pallets.find(x=>x._id===pid);if(!pl)return;const ns=[...(pl.machinesSN||[]),m.sn];const upd2={...pl,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===pid?upd2:x));await fbSet("pallets",pid,upd2);await markChanged("pallets");e.target.value="";}} style={{...inp,marginBottom:8}}><option value="">📦 Selecionar palete...</option>{outrosPalets.map(p=><option key={p._id} value={p._id}>{p.name}{p.location?" · "+p.location:""} ({p.machinesSN?.length||0})</option>)}</select></>}
      </div>})()}
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
  const{data,setModal,mutate,user}=ctx;const[search,setSearch]=useState(""),[fS,setFS]=useState("all"),[modelFilters,setModelFilters]=useState(new Set()),[selected,setSelected]=useState(new Set()),[selMode,setSelMode]=useState(false),[bulkAction,setBulkAction]=useState(null);
  const toggleModel=mo=>setModelFilters(s=>{const n=new Set(s);n.has(mo)?n.delete(mo):n.add(mo);return n});
  const allModelsUsed=[...new Set(data.hashes.map(h=>h.model).filter(Boolean))].sort();
  const q=search.toLowerCase();
  const filtered=data.hashes.filter(h=>(!q||(h.sn||"").toLowerCase().includes(q)||h.model?.toLowerCase().includes(q)||h.location?.toLowerCase().includes(q)))
    .filter(h=>fS==="all"||h.status===fS)
    .filter(h=>modelFilters.size===0||modelFilters.has(h.model));
  const openAdd=()=>setModal(<Modal title="Adicionar HASH" onClose={()=>setModal(null)}><HashAddMode ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=h=>setModal(<Modal title={`⚡ ${h.sn||"SEM SN"}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={h}/></Modal>);
  const counts=Object.fromEntries(HST_OPTS.map(s=>[s,data.hashes.filter(h=>h.status===s).length]));
  const selHashes=filtered.filter(h=>selected.has(h._id));
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><div style={{fontWeight:900,fontSize:18}}>HASHboards</div><div style={{color:C.muted,fontSize:12}}>{data.hashes.length} cadastradas</div></div><div style={{display:"flex",gap:6}}><Btn v={selMode?"d":"s"} onClick={()=>{setSelMode(s=>!s);setSelected(new Set())}} style={{fontSize:12,padding:"8px 10px"}}>{selMode?"✕":"☑️"}</Btn><Btn onClick={openAdd}>+ Adicionar</Btn></div></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:14}}>{[["TESTAR",C.amber,"Testar"],["REPARO",C.purple,"Reparo"],["ON",C.green,"ON"],["NA MAQUINA",C.blue,"Na Máq."],["OFF",C.red,"OFF"]].map(([s,c,l])=><div key={s} style={{background:C.card,borderRadius:10,padding:"10px 4px",textAlign:"center",borderTop:`2px solid ${c}`}}><div style={{fontSize:20,fontWeight:900,color:c}}>{counts[s]||0}</div><div style={{fontSize:8,color:C.muted,fontWeight:700}}>{l}</div></div>)}</div>
    <div style={{background:C.card,borderRadius:10,padding:"8px 12px",display:"flex",gap:8,marginBottom:10}}>🔍<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SN, modelo ou local..." style={{background:"none",border:"none",color:C.text,fontSize:13,flex:1,outline:"none"}}/></div>
    <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:2}}><button onClick={()=>setFS("all")} style={{background:fS==="all"?C.accent:C.card,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Todas</button>{HST_OPTS.map(s=><button key={s} onClick={()=>setFS(s)} style={{background:fS===s?HST_C[s]:C.card,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{s}</button>)}</div>
    {allModelsUsed.length>0&&<div style={{marginBottom:10}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>MODELO (múltipla escolha){modelFilters.size>0&&<button onClick={()=>setModelFilters(new Set())} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:10,marginLeft:8}}>limpar</button>}</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allModelsUsed.map(mo=><button key={mo} onClick={()=>toggleModel(mo)} style={{background:modelFilters.has(mo)?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{mo}</button>)}</div>
    </div>}
    {selMode&&selected.size>0&&<div style={{background:C.card2,border:`1px solid ${C.accent}`,borderRadius:10,padding:10,marginBottom:10,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <Tag color={C.accent}>{selected.size} selecionadas</Tag>
      <Btn v="b" onClick={()=>setBulkAction("status")} style={{fontSize:11,padding:"6px 10px"}}>🏷️ Mudar Status</Btn>
      <Btn v="p" onClick={()=>setBulkAction("location")} style={{fontSize:11,padding:"6px 10px"}}>📍 Mudar Local</Btn>
    </div>}
    {filtered.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>⚡</div>Nenhuma HASH</div>
      :filtered.map(h=>{const mac=data.machines.find(m=>m.sn===h.machineSN);const rep=data.employees.find(e=>e._id===h.repairedBy);const repName=rep?.name||h.repairedByName;return<div key={h._id} style={{position:"relative"}}>
      {selMode&&<div style={{position:"absolute",top:10,left:10,zIndex:5}}><input type="checkbox" checked={selected.has(h._id)} onChange={e=>{const s=new Set(selected);e.target.checked?s.add(h._id):s.delete(h._id);setSelected(s)}} style={{width:18,height:18,cursor:"pointer"}}/></div>}
      <Card accent={HST_C[h.status]||C.border} onClick={()=>!selMode&&openDetail(h)} style={{paddingLeft:selMode?36:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:800,fontSize:14,color:h.status==="IRREPARAVEL"?"#9ca3af":C.blue}}>⚡ {h.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12}}>{h.model}</div></div><HP s={h.status}/></div>
        <div style={{display:"flex",gap:10,fontSize:11,color:C.muted,marginTop:5}}>{mac?<span style={{color:C.accent}}>🖥️ {mac.sn||"SEM SN"} · Slot {h.slot>=0?h.slot+1:"?"}</span>:<span>📦 Solta</span>}{repName&&<span>👷 {repName}</span>}</div>
        <By by={h._byName} at={h._at}/><LastMove log={h.changeLog}/>
      </Card></div>})}
    {bulkAction&&<Modal title={bulkAction==="status"?"🏷️ Mudar Status em Lote":"📍 Mudar Local em Lote"} onClose={()=>setBulkAction(null)}>
      <BulkHashAction ctx={ctx} action={bulkAction} hashes={selHashes} onDone={()=>{setBulkAction(null);setSelected(new Set());setSelMode(false)}}/>
    </Modal>}
  </div>;
}

function BulkHashAction({ctx,action,hashes,onDone}){
  const{mutate,user,webhookUrl}=ctx;
  const[status,setStatus]=useState("STOCK"),[loc,setLoc]=useState(""),[saving,setSaving]=useState(false);
  const apply=async()=>{
    setSaving(true);
    for(const h of hashes){
      const patch=action==="status"?{status}:{location:loc.toUpperCase()};
      const field=action==="status"?"status":"location";
      const to=action==="status"?status:loc.toUpperCase();
      const u={...h,...patch,changeLog:[{field,label:FIELD_LABELS[field]||field,from:h[field],to,by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
      mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);
      syncSheet(webhookUrl,"updateHash",{sn:u.sn,model:u.model,status:u.status,location:u.location,employeeName:user.name,employeeCode:user.code});
    }
    await markChanged("hashes");setSaving(false);onDone();
  };
  return<div>
    <div style={{color:C.muted,fontSize:12,marginBottom:14}}>{hashes.length} HASH(s) selecionada(s)</div>
    {action==="status"?<Sel label="NOVO STATUS" value={status} onChange={e=>setStatus(e.target.value)}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>
      :<Inp label="NOVA LOCALIZAÇÃO" value={loc} onChange={e=>setLoc(e.target.value)} placeholder="Ex: PRATELEIRA B3"/>}
    <Btn v="g" onClick={apply} disabled={saving} style={{width:"100%"}}>{saving?"Aplicando...":"✓ Aplicar a "+hashes.length}</Btn>
  </div>;
}

function HashAddMode({ctx,onClose}){
  const[mode,setMode]=useState(null);
  if(!mode)return<div><div style={{display:"flex",flexDirection:"column",gap:10}}>
    <Btn onClick={()=>setMode("single")} style={{justifyContent:"center",padding:"14px 0"}}>⚡ Individual</Btn>
    <Btn v="b" onClick={()=>setMode("batch-sn")} style={{justifyContent:"center",padding:"14px 0"}}>📋 Lote COM SN</Btn>
    <Btn v="p" onClick={()=>setMode("batch-nosn")} style={{justifyContent:"center",padding:"14px 0"}}>📦 Lote SEM SN</Btn>
  </div></div>;
  if(mode==="single")return<AddHashForm ctx={ctx} onClose={onClose}/>;
  if(mode==="batch-sn")return<HashBatchSNForm ctx={ctx} onClose={onClose}/>;
  return<BatchNoSNForm ctx={ctx} onClose={onClose}/>;
}

// Lote de HASHs COM SN: bipa vários, o sistema já identifica se é nova ou se
// já existe (mostrando modelo/status), e ao Salvar define de uma vez o status
// e a localização de todas.
function HashBatchSNForm({ctx,onClose}){
  const{data,mutate,user,allModels,webhookUrl}=ctx;const models=allModels();
  const[model,setModel]=useState(models[0]?.m||"M30S"),[status,setStatus]=useState("REPARO"),[loc,setLoc]=useState(""),[rows,setRows]=useState([]),[saving,setSaving]=useState(false);
  const addSN=(raw)=>{
    const sn=raw.toUpperCase().trim();if(!sn||rows.some(r=>r.sn===sn))return;
    const existing=data.hashes.find(h=>h.sn===sn);
    setRows(r=>[...r,existing?{sn,existing:true,model:existing.model,status:existing.status,_id:existing._id}:{sn,existing:false,model,status:"novo"}]);
  };
  const removeRow=sn=>setRows(r=>r.filter(x=>x.sn!==sn));
  const saveAll=async()=>{
    if(!rows.length)return;setSaving(true);
    for(const row of rows){
      if(row.existing){
        const h=data.hashes.find(x=>x._id===row._id);if(!h)continue;
        const u={...h,status,location:loc.toUpperCase(),changeLog:[{field:"status",label:"Status",from:h.status,to:status,by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
        mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);
        syncSheet(webhookUrl,"updateHash",{sn:u.sn,model:u.model,status,location:loc,employeeName:user.name,employeeCode:user.code});
      }else{
        const id=uid();const d={sn:row.sn,model,status,location:loc.toUpperCase(),...audit(user),addedAt:TODAY(),machineSN:"",slot:-1,repairedBy:""};
        await fbSet("hashes",id,d);mutate("hashes",h=>[...h,{...d,_id:id}]);
        syncSheet(webhookUrl,"addHash",{sn:row.sn,model,status,location:loc,employeeName:user.name,employeeCode:user.code});
      }
    }
    await markChanged("hashes");setSaving(false);onClose();
  };
  return<div>
    <Sel label="MODELO (usado para os SNs novos)" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}>
      <SL>BIPE OU DIGITE → detecta sozinho se foi bipado</SL>
      <SmartScanInput onDetect={addSN} placeholder="SN da HASH..." autoFocus/>
      <div style={{maxHeight:220,overflow:"auto",marginTop:10}}>
        {rows.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN ainda</div>:rows.map(r=><div key={r.sn} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
          <div><span style={{fontSize:13,fontFamily:"monospace",color:C.blue}}>{r.sn}</span>{r.existing?<Tag color={C.amber} small style={{marginLeft:6}}>já existe · {r.model} · {r.status}</Tag>:<Tag color={C.green} small style={{marginLeft:6}}>🆕 novo</Tag>}</div>
          <button onClick={()=>removeRow(r.sn)} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button>
        </div>)}
      </div>
    </div>
    <Sel label="STATUS FINAL (aplicado a todos)" value={status} onChange={e=>setStatus(e.target.value)}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>
    <Inp label="LOCALIZAÇÃO (aplicada a todos)" value={loc} onChange={e=>setLoc(e.target.value)} placeholder="Ex: PRATELEIRA B3"/>
    <div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={saveAll} disabled={saving||!rows.length} style={{flex:1}}>{saving?"...":"💾 Salvar "+rows.length}</Btn></div>
  </div>;
}

function AddHashForm({ctx,onClose,initSN="",initPhoto=null}){
  const{data,mutate,user,allModels,webhookUrl}=ctx;const models=allModels();
  const[sn,setSN]=useState(initSN),[model,setModel]=useState(models[0]?.m||"M30S"),[status,setStatus]=useState("REPARO"),[photoKey,setPhotoKey]=useState(initPhoto),[obs,setObs]=useState(""),[snInfo,setSnInfo]=useState(null);
  const checkSN=v=>{setSN(v);const s=v.toUpperCase().trim();if(!s){setSnInfo(null);return}const ex=data.hashes.find(h=>h.sn===s);if(ex)setSnInfo({type:"exists",item:ex});else{const mac=data.machines.find(m=>m.sn===s);if(mac)setSnInfo({type:"mac",item:mac});else setSnInfo(null)}};
  const save=async()=>{
    const s=sn.toUpperCase().trim();
    if(s&&data.hashes.find(h=>h.sn===s)){alert("SN já cadastrado!");return}
    const id=uid();
    const d={sn:s,model,status,obs,...audit(user),addedAt:TODAY(),machineSN:"",slot:-1,repairedBy:"",photoKey:photoKey||""};
    await fbSet("hashes",id,d);
    mutate("hashes",h=>[...h,{...d,_id:id}]);
    await markChanged("hashes");
    if(webhookUrl)syncSheet(webhookUrl,"addHash",{sn:s,model,status,obs,employeeName:user.name,employeeCode:user.code});
    onClose();
  };
  return<div>
    <SNInput label="SN (deixe vazio se não tiver)" value={sn} onChange={checkSN} placeholder="SN da HASH"/>
    {snInfo?.type==="exists"&&<div style={{background:"#3a0a0a",border:"1px solid "+C.red,borderRadius:10,padding:10,marginBottom:10}}><div style={{color:C.red,fontWeight:800}}>⚠️ SN já existe!</div><div style={{fontSize:12,color:C.muted}}>{snInfo.item.model} · <HP s={snInfo.item.status}/></div></div>}
    {snInfo?.type==="mac"&&<div style={{background:"#3a2a0a",border:"1px solid "+C.amber,borderRadius:10,padding:10,marginBottom:10}}><div style={{color:C.amber,fontWeight:800}}>📌 SN é de uma Máquina</div><div style={{fontSize:12,color:C.muted}}>{snInfo.item.model} · <SP s={snInfo.item.situacao}/></div></div>}
    <Sel label="MODELO" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <Sel label="STATUS" value={status} onChange={e=>setStatus(e.target.value)}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>
    <Inp label="Observação" value={obs} onChange={e=>setObs(e.target.value)} placeholder="Ex: Chip U3 trocado, Chain Break corrigida..."/>
    <PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey}/>
    <div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={snInfo?.type==="exists"} style={{flex:1}}>Salvar</Btn></div>
  </div>;
}

// Histórico "somente leitura" de uma HASH, usado quando acessado a partir da
// tela de Máquina (item 15) — mesma lógica de montagem do histórico do HashDetail.
function buildHashHistory(data,h){
  const history=[];
  data.repairs.filter(r=>r.hashSN===h.sn&&h.sn).forEach(r=>{const emp=data.employees.find(e=>e._id===r.employeeId);let obs="";if(r.chips)obs+=` · Chips:${r.chips}`;if(r.sensores)obs+=` · Sens:${r.sensores}`;if(r.ldos)obs+=` · LDOs:${r.ldos}`;if(r.obsManual)obs+=` · ${r.obsManual}`;history.push({icon:r.type==="already_good"?"✅":"🔧",date:r._at||r.date,text:r.type==="already_good"?`Verificada OK por ${emp?.name||"?"} (já estava boa)`:`Consertada por ${emp?.name||"?"}${obs}`,notes:r.notes,photoKey:r.photoKey})});
  data.tests.forEach(t=>{const si=[t.slot0HashSN,t.slot1HashSN,t.slot2HashSN].indexOf(h.sn);if(si<0||!h.sn)return;const emp=data.employees.find(e=>e._id===t.employeeId);const res=si===0?t.slot0Result:si===1?t.slot1Result:t.slot2Result;history.push({icon:"🧪",date:t._at||t.date,text:`Testada por ${emp?.name||"?"} — Máq.${t.machineSN||"s/n"} Slot${si+1} — ${res==="good"?"BOA ✓":"RUIM ✗"}`,photoKey:si===0?t.slot0Photo:si===1?t.slot1Photo:t.slot2Photo})});
  data.feedbacks.filter(f=>f.hashSN===h.sn&&h.sn).forEach(f=>{const emp=data.employees.find(e=>e._id===f.originalRepairerId);history.push({icon:"⚠️",date:f._at||f.date,text:`Devolvida para ${emp?.name||"?"}`,notes:f.notes,photoKey:f.logPhotoKey})});
  (h.changeLog||[]).forEach(l=>history.push({icon:"✏️",date:l.at,text:`${l.label} alterado por ${l.by}: "${l.from||"—"}" → "${l.to||"—"}"`}));
  history.sort((a,b)=>a.date<b.date?-1:1);
  return history;
}
function HashHistoryOnly({ctx,hash}){
  const{data}=ctx;const history=buildHashHistory(data,hash);
  return<div>
    <div style={{background:"#080e17",borderRadius:10,padding:12,marginBottom:12}}><HP s={hash.status}/><span style={{marginLeft:8,fontWeight:700,color:C.blue}}>{hash.model}</span></div>
    {history.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Sem histórico</div>:history.map((ev,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:12}}><div style={{display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:C.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{ev.icon}</div>{i<history.length-1&&<div style={{width:2,flex:1,background:C.border,marginTop:4}}/>}</div><div style={{flex:1,paddingBottom:8}}><div style={{fontSize:12,fontWeight:700}}>{ev.text}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(ev.date)}</div>{ev.notes&&<div style={{fontSize:11,color:C.subtle,marginTop:2}}>{ev.notes}</div>}{ev.photoKey&&<PhotoView photoKey={ev.photoKey} style={{marginTop:6,maxHeight:100}}/>}</div></div>)}
  </div>;
}
// Visualização rápida da foto salva da HASH, com opção de adicionar se não tiver (não obrigatório)
function HashPhotoQuick({ctx,hash}){
  const{mutate,user}=ctx;const[h,setH]=useState(hash),[adding,setAdding]=useState(false);
  const savePhoto=async k=>{const u={...h,photoKey:k,...audit(user)};setH(u);mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes");setAdding(false)};
  return<div>
    <div style={{background:"#080e17",borderRadius:10,padding:12,marginBottom:12}}><HP s={h.status}/><span style={{marginLeft:8,fontWeight:700,color:C.blue}}>{h.model} · {h.sn||"SEM SN"}</span></div>
    {h.photoKey?<PhotoView photoKey={h.photoKey} style={{maxHeight:320}}/>:adding?<PhotoCapture label="Adicionar foto" photoKey={null} onChange={savePhoto}/>:<div style={{textAlign:"center",padding:24}}><div style={{color:C.muted,fontSize:12,marginBottom:12}}>Sem foto salva</div><button onClick={()=>setAdding(true)} style={{background:"#080e17",border:`2px dashed ${C.border}`,color:C.muted,borderRadius:10,padding:16,cursor:"pointer",fontSize:24,width:60,height:60}}>+</button></div>}
  </div>;
}

function HashDetail({ctx,hash}){
  const{data,mutate,setModal,user,webhookUrl}=ctx;const[h,setH]=useState(hash),[confirmIrrep,setConfirmIrrep]=useState(false),[editLoc,setEditLoc]=useState(false),[locVal,setLocVal]=useState(hash.location||"");
  const upd=async(k,v)=>{
    if(h[k]===v)return;
    const logEntry={field:k,label:FIELD_LABELS[k]||k,from:h[k]??"",to:v??"",by:user.name,at:stamp()};
    const newLog=[logEntry,...(h.changeLog||[])].slice(0,80);
    const u={...h,[k]:v,changeLog:newLog,...audit(user)};
    setH(u);mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes");
    syncSheet(webhookUrl,"updateHash",{sn:u.sn,model:u.model,status:u.status,location:u.location,field:k,from:logEntry.from,to:v,employeeName:user.name,employeeCode:user.code});
  };
  const history=[];
  data.repairs.filter(r=>r.hashSN===h.sn&&h.sn).forEach(r=>{const emp=data.employees.find(e=>e._id===r.employeeId);let obs="";if(r.chips)obs+=` · Chips:${r.chips}`;if(r.sensores)obs+=` · Sens:${r.sensores}`;if(r.ldos)obs+=` · LDOs:${r.ldos}`;if(r.obsManual)obs+=` · ${r.obsManual}`;history.push({icon:r.type==="already_good"?"✅":"🔧",date:r._at||r.date,text:r.type==="already_good"?`Verificada OK por ${emp?.name||"?"} (já estava boa)`:`Consertada por ${emp?.name||"?"}${obs}`,notes:r.notes,photoKey:r.photoKey})});
  data.tests.forEach(t=>{const si=[t.slot0HashSN,t.slot1HashSN,t.slot2HashSN].indexOf(h.sn);if(si<0||!h.sn)return;const emp=data.employees.find(e=>e._id===t.employeeId);const res=si===0?t.slot0Result:si===1?t.slot1Result:t.slot2Result;history.push({icon:"🧪",date:t._at||t.date,text:`Testada por ${emp?.name||"?"} — Máq.${t.machineSN||"s/n"} Slot${si+1} — ${res==="good"?"BOA ✓":"RUIM ✗"}`,photoKey:si===0?t.slot0Photo:si===1?t.slot1Photo:t.slot2Photo})});
  data.feedbacks.filter(f=>f.hashSN===h.sn&&h.sn).forEach(f=>{const emp=data.employees.find(e=>e._id===f.originalRepairerId);history.push({icon:"⚠️",date:f._at||f.date,text:`Devolvida para ${emp?.name||"?"}`,notes:f.notes,photoKey:f.logPhotoKey})});
  (h.changeLog||[]).forEach(l=>history.push({icon:"✏️",date:l.at,text:`${l.label} alterado por ${l.by}: "${l.from||"—"}" → "${l.to||"—"}"`}));
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
    <SL>STATUS</SL><div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{["ON","OFF","TESTAR","REPARO","STOCK","NA MAQUINA"].map(s=><button key={s} onClick={()=>upd("status",s)} style={{background:h.status===s?HST_C[s]:"#080e17",color:"#fff",border:`1px solid ${HST_C[s]}`,borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer"}}>{s}</button>)}</div>
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
    if(ex){const u={...ex,status:"TESTAR",repairedBy:type==="repair"?user._id:ex.repairedBy,repairedByName:type==="repair"?user.name:ex.repairedByName,...audit(user)};mutate("hashes",h=>h.map(x=>x._id===ex._id?u:x));await fbSet("hashes",ex._id,u)}
    else{const hid=uid();const hd={sn,model:f.model,status:"TESTAR",repairedBy:type==="repair"?user._id:"",repairedByName:type==="repair"?user.name:"",...audit(user),addedAt:TODAY(),machineSN:"",slot:-1,photoKey:photoKey||""};await fbSet("hashes",hid,hd);mutate("hashes",h=>[...h,{...hd,_id:hid}])}
    syncSheet(webhookUrl,type==="repair"?"repair":"alreadyGood",{...rec,employeeCode:user.code,employeeName:user.name,tecnico:user.name});
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
  // Item 10: agora o testador pode ter VÁRIAS máquinas em teste ao mesmo tempo.
  // Cada sessão é um documento próprio (não fica mais 1 sessão por usuário).
  const[sessions,setSessions]=useState([]),[activeId,setActiveId]=useState(null),[macInput,setMacInput]=useState(""),[err,setErr]=useState(""),[submitting,setSubmitting]=useState(false),[done,setDone]=useState(false),[ruimModal,setRuimModal]=useState(null),[scanning,setScanning]=useState(false);
  useEffect(()=>{fbList("sessions").then(all=>setSessions(all.filter(s=>s.employeeId===user._id)))},[user._id]);
  const session=sessions.find(s=>s._id===activeId)||null;
  const saveSession=async s=>{
    await fbSet("sessions",s._id,s);
    setSessions(prev=>prev.some(x=>x._id===s._id)?prev.map(x=>x._id===s._id?s:x):[...prev,s]);
  };

  const loadMachine=async(snParam)=>{
    const sn=(snParam||macInput).toUpperCase().trim();if(!sn)return;
    const existing=sessions.find(s=>s.machineSN===sn);
    if(existing){setActiveId(existing._id);setMacInput(sn);return}
    const ex=data.machines.find(m=>m.sn===sn);
    const id=uid();
    const s={_id:id,employeeId:user._id,machineSN:sn,model:ex?.model||models[0]?.m||"M30S",th:ex?.th||0,
      slots:[
        {hashSN:ex?.hashSN0||"",status:"",photoKey:null},
        {hashSN:ex?.hashSN1||"",status:"",photoKey:null},
        {hashSN:ex?.hashSN2||"",status:"",photoKey:null}
      ],controladora:"",fonte:"",fans:"",photoKey:null,updatedAt:stamp()};
    await saveSession(s);setActiveId(id);
  };

  const closeSession=async(id)=>{await fbDel("sessions",id);setSessions(prev=>prev.filter(x=>x._id!==id));if(activeId===id){setActiveId(null);setMacInput("")}};

  const setSlotSN=async(i,sn)=>{
    if(!session)return;
    const newSlots=[...session.slots];newSlots[i]={...newSlots[i],hashSN:sn};
    await saveSession({...session,slots:newSlots,updatedAt:stamp()});
  };

  const markAllGood=async()=>{
    if(!session)return;
    if(!session.photoKey){setErr("Adicione a foto da tela primeiro!");return}
    const newSlots=session.slots.map(s=>({...s,status:"good"}));
    const s={...session,slots:newSlots,controladora:"ON",fonte:"ON",fans:"ON",updatedAt:stamp()};
    await saveSession(s);
    await doSubmit(s);
  };

  const doSubmit=async(s)=>{
    const sess=s||session;if(!sess)return;
    setSubmitting(true);const id=uid();
    const rec={machineSN:sess.machineSN,model:sess.model,th:sess.th,employeeId:user._id,...audit(user),date:TODAY(),status:"pending",
      slot0HashSN:sess.slots[0].hashSN||"",slot0Result:sess.slots[0].status||"",slot0Photo:sess.slots[0].photoKey||"",
      slot1HashSN:sess.slots[1].hashSN||"",slot1Result:sess.slots[1].status||"",slot1Photo:sess.slots[1].photoKey||"",
      slot2HashSN:sess.slots[2].hashSN||"",slot2Result:sess.slots[2].status||"",slot2Photo:sess.slots[2].photoKey||"",
      controladora:sess.controladora,fonte:sess.fonte,fans:sess.fans,testPhoto:sess.photoKey,overallResult:"pending"};
    await fbSet("tests",id,rec);mutate("tests",t=>[...t,{...rec,_id:id}]);
    const apprId=uid();const appr={testId:id,machineSN:sess.machineSN,model:sess.model,th:sess.th,employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};
    await fbSet("pendingApprovals",apprId,appr);mutate("approvals",a=>[...a,{...appr,_id:apprId}]);
    const exMac=data.machines.find(m=>m.sn===sess.machineSN);
    if(exMac){const u={...exMac,situacao:"AGUARD. REVISÃO",lastTesterId:user._id,...audit(user)};mutate("machines",m=>m.map(x=>x._id===exMac._id?u:x));await fbSet("machines",exMac._id,u);}
    await markChanged("tests");await markChanged("approvals");await markChanged("machines");
    syncSheet(webhookUrl,"test",{...rec,employeeCode:user.code,employeeName:user.name});
    await closeSession(sess._id);setSubmitting(false);setDone(true);setTimeout(()=>setDone(false),3000);
  };

  // HASHs waiting to test
  const hashesWaiting=data.hashes.filter(h=>h.status==="TESTAR");
  const otherSessions=sessions.filter(s=>s._id!==activeId);

  return<div>
    {scanning&&<BarcodeScanner onScan={v=>{setMacInput(v.toUpperCase());setScanning(false);loadMachine(v)}} onClose={()=>setScanning(false)}/>}
    {done&&<Alrt type="ok">✓ Enviado para revisão do admin!</Alrt>}
    {err&&<Alrt type="err">{err}</Alrt>}

    {/* Sessões em aberto — pode ter várias máquinas em teste ao mesmo tempo */}
    {sessions.length>0&&<div style={{marginBottom:12}}>
      <SL>🖥️ MÁQUINAS EM TESTE ({sessions.length})</SL>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {sessions.map(s=><button key={s._id} onClick={()=>{setActiveId(s._id);setMacInput(s.machineSN)}} style={{background:s._id===activeId?C.accent:C.card,color:"#fff",border:`1px solid ${s._id===activeId?C.accent:C.border}`,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          🖥️ {s.machineSN} {s.slots.filter(sl=>sl.status).length}/3
          <span onClick={e=>{e.stopPropagation();closeSession(s._id)}} style={{color:s._id===activeId?"#fff":C.red,fontWeight:900}}>✕</span>
        </button>)}
      </div>
    </div>}

    {/* Waiting HASHs */}
    {hashesWaiting.length>0&&<div style={{background:C.amber+"11",border:"1px solid "+C.amber+"44",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
      <div style={{fontWeight:800,color:C.amber,marginBottom:6}}>⏳ HASHs aguardando teste ({hashesWaiting.length})</div>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{hashesWaiting.slice(0,6).map(h=><span key={h._id} style={{background:C.card2,borderRadius:6,padding:"2px 8px",fontSize:11,color:C.blue}}>⚡ {h.sn||"SEM SN"} — {h.model}</span>)}{hashesWaiting.length>6&&<span style={{color:C.muted,fontSize:11}}>+{hashesWaiting.length-6}</span>}</div>
    </div>}

    {/* Machine input — sempre inicia uma NOVA máquina (ou retoma se já tiver sessão pro SN) */}
    <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>SN DA MÁQUINA {session?"(sessão ativa)":"(nova)"}</div>
      <div style={{display:"flex",gap:8}}>
        <input value={macInput} onChange={e=>{setMacInput(e.target.value.toUpperCase());clearTimeout(window._lt);window._lt=setTimeout(()=>loadMachine(e.target.value),1000)}} onKeyDown={e=>e.key==="Enter"&&loadMachine(macInput)} placeholder="Bipe ou escaneie o SN..." list="mac-list" style={{...inp,flex:1}}/>
        <button onClick={()=>setScanning(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:18}}>📷</button>
      </div>
      <datalist id="mac-list">{data.machines.map(m=><option key={m._id} value={m.sn||""}>{m.model}</option>)}</datalist>
      {session&&<div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:800,color:C.accent}}>{session.machineSN}</span><span style={{color:C.muted,fontSize:12}}>{session.model} · {session.th}TH</span></div>}
      {!session&&macInput===""&&otherSessions.length>0&&<div style={{color:C.muted,fontSize:11,marginTop:6}}>Bipe outro SN pra abrir uma nova máquina em paralelo, sem perder as outras.</div>}
    </div>

    {session&&<>
      {/* Slots */}
      {[0,1,2].map(i=>{
        const slot=session.slots[i];
        const h=slot.hashSN?data.hashes.find(x=>x.sn===slot.hashSN.toUpperCase()):null;
        const modelMismatch=h&&h.model&&session.model&&h.model!==session.model;
        return<div key={i} style={{background:C.card,borderRadius:14,padding:14,marginBottom:8,border:"1px solid "+(slot.status==="bad"?C.red:slot.status==="good"?C.green:C.border)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:800,fontSize:12,color:C.subtle}}>SLOT {i+1}</div>
            {slot.status==="good"&&<Tag color={C.green}>✓ BOA</Tag>}
            {slot.status==="bad"&&<Tag color={C.red}>✗ RUIM</Tag>}
            {!slot.status&&<Tag color={C.muted}>Aguardando</Tag>}
          </div>
          <input value={slot.hashSN||""} onChange={e=>setSlotSN(i,e.target.value.toUpperCase())} placeholder="Bipe o SN da HASH..." list={"hash-list-"+i} style={{...inp,marginBottom:6}}/>
          <datalist id={"hash-list-"+i}>{data.hashes.map(x=><option key={x._id} value={x.sn||""}>{x.model} — {x.status}</option>)}</datalist>
          {h&&<div style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",background:C.card2,borderRadius:8,marginBottom:6}}>
            <HP s={h.status}/><span style={{fontSize:12,fontWeight:700,color:C.blue}}>⚡ {h.model}</span>
            {h.location&&<span style={{fontSize:10,color:C.muted}}>📍{h.location}</span>}
          </div>}
          {modelMismatch&&<div style={{background:C.amber+"22",border:"1px solid "+C.amber+"44",borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.amber}}>⚠️ HASH é <b>{h.model}</b> mas máquina é <b>{session.model}</b></div>}
          {slot.status!=="bad"&&slot.hashSN&&<button onClick={()=>setRuimModal(i)} style={{background:C.red+"22",border:"1px solid "+C.red+"44",color:C.red,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700,width:"100%"}}>✗ Marcar como RUIM</button>}
        </div>;
      })}

      {/* Componentes */}
      <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
        <SL>Componentes</SL>
        {[["controladora","Controladora"],["fonte","Fonte"],["fans","Cooler"]].map(([k,l])=><div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+C.border}}><span style={{fontSize:13}}>{l}</span><div style={{display:"flex",gap:6}}>{["ON","OFF"].map(v=><button key={v} onClick={()=>saveSession({...session,[k]:v,updatedAt:stamp()})} style={{background:session[k]===v?(v==="ON"?C.green:C.red)+"22":C.card2,color:session[k]===v?(v==="ON"?C.green:C.red):C.muted,border:"1px solid "+(session[k]===v?(v==="ON"?C.green:C.red):C.border),borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{v==="ON"?"Bom":"Ruim"}</button>)}</div></div>)}
      </div>

      {/* Foto */}
      <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
        <PhotoCapture label="📸 Foto da Tela / App Fabricante (obrigatória)" photoKey={session.photoKey||null} onChange={k=>saveSession({...session,photoKey:k,updatedAt:stamp()})} folder="testes" required/>
      </div>

      <Btn v="g" onClick={markAllGood} disabled={submitting||!session.photoKey} style={{width:"100%",padding:"16px",fontSize:15,marginBottom:8}}>
        {submitting?"Enviando...":"✅ TUDO BOA — Enviar para Revisão"}
      </Btn>
      <div style={{display:"flex",gap:8}}>
        <Btn v="s" onClick={()=>{setActiveId(null);setMacInput("")}} style={{flex:1,fontSize:12}}>👋 Deixar na fila e trocar de máquina</Btn>
        <Btn v="d" onClick={()=>closeSession(session._id)} style={{flex:1,fontSize:12}}>🗑 Cancelar esta</Btn>
      </div>
      {!session.photoKey&&<div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:6}}>⚠️ Adicione a foto para enviar</div>}
    </>}

    {/* RUIM Modal */}
    {ruimModal!==null&&<Modal title={"✗ Slot "+(ruimModal+1)+" RUIM"} onClose={()=>setRuimModal(null)}>
      <RuimSlotForm ctx={ctx} session={session} slotIndex={ruimModal} onSave={async(s)=>{await saveSession(s);setRuimModal(null)}}/>
    </Modal>}
  </div>;
}

function RuimSlotForm({ctx,session,slotIndex,onSave}){
  const{data,mutate,user}=ctx;
  const[logPhoto,setLogPhoto]=useState(null),[notes,setNotes]=useState(""),[saving,setSaving]=useState(false),[err,setErr]=useState("");
  const slot=session.slots[slotIndex];
  const h=slot.hashSN?data.hashes.find(x=>x.sn===slot.hashSN.toUpperCase()):null;
  const lastRep=slot.hashSN?[...data.repairs].reverse().find(r=>r.hashSN===slot.hashSN):null;
  const repairer=lastRep?data.employees.find(e=>e._id===lastRep.employeeId):null;
  const confirm=async()=>{
    if(!logPhoto&&!notes){setErr("Adicione foto ou descrição do erro");return}
    setSaving(true);
    const newSlots=[...session.slots];newSlots[slotIndex]={...slot,status:"bad",logPhoto:logPhoto||"",logNotes:notes};
    // Update hash status
    if(h){const u={...h,status:"REPARO",...audit(user)};mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes");}
    // Notify repairer
    if(lastRep?.employeeId&&slot.hashSN){const fid=uid();const fdb={hashSN:slot.hashSN,machineSN:session.machineSN,originalRepairerId:lastRep.employeeId,testedBy:user._id,...audit(user),date:TODAY(),logPhotoKey:logPhoto||"",notes,resolved:false};await fbSet("feedbacks",fid,fdb);mutate("feedbacks",f=>[...f,{...fdb,_id:fid}]);}
    await onSave({...session,slots:newSlots,updatedAt:stamp()});
    setSaving(false);
  };
  return<div>
    <div style={{background:C.card2,borderRadius:10,padding:12,marginBottom:12}}>
      <div style={{fontWeight:700,color:C.red,marginBottom:4}}>⚡ {slot.hashSN||"SEM SN"} — Slot {slotIndex+1}</div>
      {h&&<HP s={h.status}/>}
      {repairer&&<div style={{color:C.amber,fontSize:12,marginTop:4}}>⚠️ {repairer.name} será notificado do erro</div>}
    </div>
    <PhotoCapture label="📸 Foto do Log de Erro" photoKey={logPhoto} onChange={setLogPhoto} folder="logs-teste"/>
    <Inp label="Descrição do Erro" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex: Hash 0 not detected, Chain Break..."/>
    {err&&<Alrt type="err">{err}</Alrt>}
    <div style={{display:"flex",gap:8}}>
      <Btn v="s" onClick={()=>onSave(session)} style={{flex:1}}>Cancelar</Btn>
      <Btn v="d" onClick={confirm} disabled={saving} style={{flex:1}}>{saving?"...":"✗ Confirmar RUIM"}</Btn>
    </div>
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
    // Quando a máquina é aprovada com as 3 HASHs boas, o status da HASH vira
    // "NA MAQUINA" — ela deixa de aparecer como "solta" no estoque de HASHs,
    // porque agora está fisicamente dentro dessa máquina específica.
    for(const sn of[test.slot0HashSN,test.slot1HashSN,test.slot2HashSN].filter(Boolean)){const h=newH.find(x=>x.sn===sn);if(h){const u={...h,status:"NA MAQUINA",machineSN:appr.machineSN,slot:[test.slot0HashSN,test.slot1HashSN,test.slot2HashSN].indexOf(sn),changeLog:[{field:"status",label:"Status",from:h.status,to:"NA MAQUINA",by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};newH=newH.map(x=>x._id===h._id?u:x);await fbSet("hashes",h._id,u);syncSheet(webhookUrl,"updateHash",{sn:u.sn,model:u.model,status:"NA MAQUINA",machineSN:appr.machineSN,employeeName:user.name,employeeCode:user.code})}}
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
  const{data,mutate,setModal,user}=ctx;const today=TODAY();
  const[subTab,setSubTab]=useState("list");
  const isSuper=user.code==="019";const openAdd=()=>setModal(<Modal title="Novo Funcionário" onClose={()=>setModal(null)}><AddEmpForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openProfile=e=>setModal(<Modal title={`${e.name} #${e.code}`} onClose={()=>setModal(null)}><EmpProfile ctx={ctx} emp={e}/></Modal>);
  return<div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[["list","👷 Equipe"],["daily","📅 Relatório do Dia"]].map(([id,l])=><button key={id} onClick={()=>setSubTab(id)} style={{flex:1,background:subTab===id?C.accent:C.card2,color:"#fff",border:"none",borderRadius:10,padding:"9px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}
    </div>
    {subTab==="daily"?<DailyTeamReport ctx={ctx}/>:<>
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
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <Btn v="s" onClick={()=>setModal(<Modal title={"📋 "+e.name} onClose={()=>setModal(null)}><EmpHistory ctx={ctx} emp={e}/></Modal>)} style={{flex:1,fontSize:11,padding:"7px"}}>📋 Histórico</Btn>
          {isSuper&&<Btn v="s" onClick={()=>setModal(<Modal title={"✏️ "+e.name} onClose={()=>setModal(null)}><EmpEdit ctx={ctx} emp={e} onClose={()=>setModal(null)}/></Modal>)} style={{flex:1,fontSize:11,padding:"7px"}}>✏️ Editar</Btn>}
          <Btn v="s" onClick={()=>copyReport(e,data.repairs,data.tests,TODAY())} style={{fontSize:11,padding:"7px"}}>📤</Btn>
        </div>
      </Card>
    })}
    </>}
  </div>;
}

// Item 8: relatório com filtro por data mostrando TUDO que foi feito por
// TODO MUNDO junto naquele dia, com data/hora de cada movimentação.
function DailyTeamReport({ctx}){
  const{data}=ctx;const[date,setDate]=useState(TODAY());
  const dayRepairs=data.repairs.filter(r=>r.date===date);
  const dayTests=data.tests.filter(t=>t.date===date);
  const machineLogs=[];data.machines.forEach(m=>(m.changeLog||[]).forEach(l=>{if((l.at||"").slice(0,10)===date)machineLogs.push({...l,sn:m.sn,kind:"machine"})}));
  const hashLogs=[];data.hashes.forEach(h=>(h.changeLog||[]).forEach(l=>{if((l.at||"").slice(0,10)===date)hashLogs.push({...l,sn:h.sn,kind:"hash"})}));
  const items=[
    ...dayRepairs.map(r=>({at:r._at,text:`🔧 ${r._byName||"?"} ${r.type==="already_good"?"verificou (já boa)":"consertou"} a HASH ${r.hashSN||"SEM SN"} (${r.model})`})),
    ...dayTests.map(t=>({at:t._at,text:`🧪 ${t._byName||"?"} testou a máquina ${t.machineSN||"SEM SN"} — ${t.status==="pending"?"aguardando revisão":t.overallResult==="good"?"BOA":"RUIM"}`})),
    ...machineLogs.map(l=>({at:l.at,text:`✏️ ${l.by} alterou ${l.label} da máquina ${l.sn||"SEM SN"}: "${l.from||"—"}" → "${l.to||"—"}"`})),
    ...hashLogs.map(l=>({at:l.at,text:`✏️ ${l.by} alterou ${l.label} da HASH ${l.sn||"SEM SN"}: "${l.from||"—"}" → "${l.to||"—"}"`})),
  ].sort((a,b)=>(a.at||"")<(b.at||"")?1:-1);
  return<div>
    <Inp label="DATA" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
    <div style={{color:C.muted,fontSize:12,marginBottom:12}}>{items.length} movimentações nesse dia, de todos os funcionários</div>
    {items.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:24}}>Nada registrado nesta data</div>
      :items.map((it,i)=><div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:13}}>{it.text}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(it.at)}</div></div>)}
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
  const{data,mutate}=ctx;
  const[name,setName]=useState(""),[code,setCode]=useState(""),[pwd,setPwd]=useState(""),[perms,setPerms]=useState({repairs:true,testing:false,machines:false,hashes:false,admin:false});
  const toggle=(k)=>setPerms(p=>({...p,[k]:!p[k]}));
  const save=async()=>{
    if(!name.trim()||!code.trim())return alert("Preencha nome e código");
    if(!pwd||pwd.length<4)return alert("Senha deve ter mínimo 4 caracteres");
    if(data.employees.find(e=>e.code===code))return alert("Código já existe");
    const hash=await hashPwd(pwd);
    const id=uid();
    const d={name:name.trim(),code,role:"technician",permissions:perms,allowedEmployees:[],passwordHash:hash};
    await fbSet("employees",id,d);mutate("employees",e=>[...e,{...d,_id:id}]);
    await markChanged("employees");onClose();
  };
  return<div>
    <Inp label="Nome Completo" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: João Silva" autoFocus/>
    <Inp label="Código" value={code} onChange={e=>setCode(e.target.value.slice(0,3))} placeholder="001" maxLength={3}/>
    <Inp label="Senha (você define)" type="password" value={pwd} onChange={e=>setPwd(e.target.value)} placeholder="Mínimo 4 caracteres"/>
    <SL mt={8}>Permissões</SL>
    {PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
      <span style={{fontSize:13}}>{label}</span>
      <button onClick={()=>toggle(key)} style={{background:perms[key]?C.green+"22":"#1a2d42",color:perms[key]?C.green:C.muted,border:`1px solid ${perms[key]?C.green:C.border}`,borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{perms[key]?"ON":"OFF"}</button>
    </div>)}
    <div style={{display:"flex",gap:8,marginTop:16}}>
      <Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn>
      <Btn onClick={save} style={{flex:1}}>💾 Criar Funcionário</Btn>
    </div>
  </div>;
}

/* ═══ CONFIG ════════════════════════════════════════════════════ */
// Painel temporário pra trazer os dados que já existiam no Firebase pro
// Supabase, uma vez só. O Firebase continua no ar até você confirmar que
// migrou tudo certinho — nada é apagado de lá nesse processo.
const MIGRATION_COLLECTIONS=["employees","machines","hashes","repairs","tests","feedbacks","pendingApprovals","customModels","pallets","clients","sessions"];
function MigrationPanel({ctx}){
  const{loadAll}=ctx;
  const[running,setRunning]=useState(false),[log,setLog]=useState([]),[done,setDone]=useState(false);
  const migrate=async()=>{
    setRunning(true);setLog([]);setDone(false);
    for(const c of MIGRATION_COLLECTIONS){
      try{
        setLog(l=>[...l,{c,msg:"Buscando no Firebase..."}]);
        let docs=await legacyFbList(c);
        // Ignora as "sobras fantasma" do jeito antigo de deletar no Firebase
        // (docs marcados com _deleted, criados como tombstone antes de apagar de verdade)
        docs=docs.filter(d=>!d._deleted);
        if(!docs.length){setLog(l=>l.map(x=>x.c===c?{c,msg:"Nenhum registro (ok, coleção vazia)"}:x));continue}
        if(c==="employees"){
          // Limpa qualquer funcionário "provisório" que o app possa ter criado
          // sozinho no Supabase (ex: admin padrão) antes da migração de verdade,
          // pra não colidir com o código (ex: "019") do funcionário real do Firebase.
          const existing=await fbList("employees");
          for(const e of existing)await fbDel("employees",e._id);
        }
        setLog(l=>l.map(x=>x.c===c?{c,msg:`Encontrados ${docs.length}. Salvando no Supabase...`}:x));
        const writes=docs.map(d=>{const{_id,_deleted,_deletedAt,_originalId,...rest}=d;return{c,id:_id,d:rest}});
        for(let i=0;i<writes.length;i+=500)await fbBatch(writes.slice(i,i+500));
        setLog(l=>l.map(x=>x.c===c?{c,msg:`✓ ${docs.length} migrados com sucesso`}:x));
      }catch(e){
        setLog(l=>l.map(x=>x.c===c?{c,msg:"✗ Erro: "+e.message}:x));
      }
    }
    setRunning(false);setDone(true);
    await loadAll();
  };
  return<Card style={{marginBottom:14,border:`1px solid ${C.blue}`}}>
    <SL>🔄 MIGRAÇÃO FIREBASE → SUPABASE (fazer uma vez só)</SL>
    <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Traz tudo que já existe no Firebase (máquinas, HASHs, funcionários, histórico) pro Supabase. Pode rodar mais de uma vez sem problema — só atualiza os registros, não duplica. O Firebase não é apagado nesse processo.</div>
    {log.length>0&&<div style={{background:C.card2,borderRadius:10,padding:10,marginBottom:10,maxHeight:200,overflow:"auto"}}>
      {log.map((l,i)=><div key={i} style={{fontSize:11,padding:"3px 0",color:l.msg.startsWith("✓")?C.green:l.msg.startsWith("✗")?C.red:C.muted}}><b>{l.c}</b>: {l.msg}</div>)}
    </div>}
    {done&&<Alrt type="ok">✓ Migração concluída! Confira as telas de Máquinas, HASHs e Equipe pra conferir se bateu com o Firebase antes de desativar ele.</Alrt>}
    <Btn v="b" onClick={migrate} disabled={running} style={{width:"100%"}}>{running?"Migrando...":"🔄 Migrar dados do Firebase agora"}</Btn>
  </Card>;
}

function CfgPage({ctx}){
  const{data,mutate,webhookUrl,setWebhookUrl,dataWarnings}=ctx;
  const[url,setUrl]=useState(webhookUrl),[testRes,setTestRes]=useState(null),[importing,setImporting]=useState(false),[importRes,setImportRes]=useState(null),[newModel,setNewModel]=useState(""),[newTH,setNewTH]=useState("");
  const[driveUrl,setDriveUrl]=useState(DRIVE_UPLOAD_URL),[driveTestRes,setDriveTestRes]=useState(null);
  const saveDriveUrl=()=>{localStorage.setItem("driveUploadUrl",driveUrl);DRIVE_UPLOAD_URL=driveUrl;alert("✓ URL do Drive salva!")};
  const testDriveUrl=async()=>{try{const r=await fetch(driveUrl+"?action=test");const d=await r.json();setDriveTestRes(d.status==="ok"?"✓ Conectado! "+d.time:"✗ "+JSON.stringify(d))}catch(e){setDriveTestRes("✗ Falha: "+e.message)}};
  const saveWh=()=>{localStorage.setItem("webhookUrl",url);setWebhookUrl(url);alert("✓ Webhook salvo!")};
  const testWh=async()=>{try{const r=await fetch(url+"?action=test");const d=await r.json();setTestRes(d.status==="ok"?"✓ Conectado! "+d.time:"✗ "+JSON.stringify(d))}catch(e){setTestRes("✗ Falha: "+e.message)}};
  const[importProg,setImportProg]=useState("");
const doImportMachines=async()=>{if(!url){alert("Configure o webhook");return}setImporting(true);setImportRes(null);setImportProg("Buscando...");try{const machines=await importMachinesFromSheet(url,(cur,total)=>setImportProg(`${cur}/${total} recebidas...`));if(!machines.length){setImportRes("Nenhuma máquina.");setImporting(false);return}setImportProg(`Salvando ${machines.length}...`);const writes=machines.map(m=>{const id=uid();return{c:"machines",id,d:{...m,_id:undefined,type:m.type||"complete",addedAt:m.addedAt||TODAY()}}});for(let i=0;i<writes.length;i+=500){await fbBatch(writes.slice(i,i+500));setImportProg(`${Math.min(i+500,writes.length)}/${writes.length} salvas...`)}mutate("machines",existing=>[...existing,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("machines");setImportRes(`✓ ${machines.length} máquinas importadas!`)}catch(e){setImportRes("✗ "+e.message)}setImporting(false);setImportProg("")};
const doImportHashes=async()=>{if(!url){alert("Configure o webhook");return}setImporting(true);setImportRes(null);try{const hashes=await importHashesFromSheet(url);if(!hashes.length){setImportRes("Nenhuma HASH na aba REPARO DE HASH.");setImporting(false);return}const writes=hashes.map(h=>{const id=uid();let status="REPARO";const sit=String(h.situacao||"").toUpperCase();if(sit==="BOA")status="ON";else if(sit==="TESTAR")status="TESTAR";else if(sit==="STOCK")status="STOCK";return{c:"hashes",id,d:{sn:h.sn||"",model:h.model||"",status,chips:h.chips||0,defeito:h.defeito||"",tecnico:h.tecnico||"",machineSN:"",slot:-1,repairedBy:"",addedAt:h.addedAt||TODAY()}}});for(let i=0;i<writes.length;i+=500)await fbBatch(writes.slice(i,i+500));mutate("hashes",existing=>[...existing,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("hashes");setImportRes(`✓ ${hashes.length} HASHs importadas!`)}catch(e){setImportRes("✗ "+e.message)}setImporting(false)};
  const addModel=async()=>{if(!newModel.trim()||!newTH)return;const id=uid();const d={m:newModel.trim(),th:Number(newTH)};await fbSet("customModels",id,d);mutate("customModels",m=>[...m,{...d,_id:id}]);setNewModel("");setNewTH("")};
  const delModel=async m=>{await fbDel("customModels",m._id);mutate("customModels",arr=>arr.filter(x=>x._id!==m._id))};
  return<div>
    <div style={{fontWeight:900,fontSize:18,marginBottom:18}}>⚙️ Configurações</div>
    {dataWarnings.length>0&&<Card style={{marginBottom:14,border:`1px solid ${C.red}`}}>
      <SL>🛡️ AVISOS DE INTEGRIDADE DE DADOS ({dataWarnings.length})</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:8}}>Sempre que uma leitura do banco vier suspeitosamente menor que o normal, o app protege o que já está na tela e registra aqui em vez de apagar dados.</div>
      {dataWarnings.map((w,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12,color:"#ff9b9b"}}>{w.msg}<div style={{color:C.muted,fontSize:10}}>{fmtTS(w.at)}</div></div>)}
    </Card>}
    <MigrationPanel ctx={ctx}/>
    <Card style={{marginBottom:14}}><SL>📸 GOOGLE DRIVE (fotos)</SL><div style={{color:C.muted,fontSize:11,marginBottom:8}}>Cole aqui a URL do Apps Script que salva as fotos no Drive de vocês (arquivo google-apps-script-drive-upload.js)</div><Inp value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec"/>{driveTestRes&&<Alrt type={driveTestRes.startsWith("✓")?"ok":"err"}>{driveTestRes}</Alrt>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={testDriveUrl} style={{flex:1}}>🔗 Testar</Btn><Btn onClick={saveDriveUrl} style={{flex:1}}>💾 Salvar</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>GOOGLE SHEETS WEBHOOK</SL><Inp value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..."/>{testRes&&<Alrt type={testRes.startsWith("✓")?"ok":"err"}>{testRes}</Alrt>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={testWh} style={{flex:1}}>🔗 Testar</Btn><Btn onClick={saveWh} style={{flex:1}}>💾 Salvar</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>IMPORTAR PLANILHA EXISTENTE</SL>{importRes&&<Alrt type={importRes.startsWith("✓")?"ok":"err"}>{importRes}</Alrt>}{importProg&&<div style={{color:C.blue,fontSize:12,marginBottom:8}}>⏳ {importProg}</div>}<div style={{display:"flex",gap:8}}><Btn v="b" onClick={doImportMachines} disabled={importing} style={{flex:1,fontSize:12}}>{importing?"...":"📥 Máquinas"}</Btn><Btn v="p" onClick={doImportHashes} disabled={importing} style={{flex:1,fontSize:12}}>{importing?"...":"⚡ HASHs (REPARO)"}</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>MODELOS CUSTOMIZADOS</SL>{data.customModels.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontWeight:700}}>{m.m}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:C.muted,fontSize:12}}>{m.th}TH</span><button onClick={()=>delModel(m)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button></div></div>)}<div style={{display:"flex",gap:8,marginTop:12}}><Inp value={newModel} onChange={e=>setNewModel(e.target.value)} placeholder="Ex: M30S Pro" style={{flex:2,marginBottom:0}}/><Inp type="number" value={newTH} onChange={e=>setNewTH(e.target.value)} placeholder="TH" style={{width:70,marginBottom:0}}/><Btn onClick={addModel}>+</Btn></div></Card>
    <Card><div style={{fontWeight:800,color:C.blue,marginBottom:10}}>📖 Como configurar</div>{[["1","Abra sua planilha no Google Sheets"],["2","Extensões → Apps Script"],["3","Cole o código do arquivo hashstock-apps-script.js"],["4","Implantar → App da Web → Qualquer pessoa"],["5","Copie a URL e cole acima"]].map(([n,t])=><div key={n} style={{display:"flex",gap:10,marginBottom:8}}><div style={{width:22,height:22,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:11,flexShrink:0,color:"#fff"}}>{n}</div><div style={{fontSize:13,paddingTop:2}}>{t}</div></div>)}</Card>
  </div>;
}

function PalletsPage({ctx}){
  const{data,mutate,setModal,user}=ctx;
  const pallets=data.pallets||[];
  const[subTab,setSubTab]=useState("list");
  const openAdd=()=>setModal(<Modal title="Novo Palete" onClose={()=>setModal(null)}><AddPalletForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=p=>setModal(<Modal title={"📦 "+p.name} onClose={()=>setModal(null)}><PalletDetail ctx={ctx} pallet={p}/></Modal>);
  return<div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      {[["list","📦 Paletes"],["mov","🔄 Movimentação"]].map(([id,l])=><button key={id} onClick={()=>setSubTab(id)} style={{flex:1,background:subTab===id?C.accent:C.card2,color:"#fff",border:"none",borderRadius:10,padding:"9px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}
    </div>
    {subTab==="mov"?<MovimentacaoTab ctx={ctx}/>:<>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div><div style={{fontWeight:900,fontSize:18}}>Paletes</div><div style={{color:C.muted,fontSize:12}}>{pallets.length} paletes · {pallets.reduce((s,p)=>(p.machinesSN?.length||0)+s,0)} máquinas · {pallets.reduce((s,p)=>(p.hashesSN?.length||0)+s,0)} HASHs</div></div>
        <Btn onClick={openAdd}>+ Palete</Btn>
      </div>
      {pallets.length===0
        ?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>📦</div><div>Nenhum palete</div></div>
        :pallets.map(p=>{const macs=(p.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);const hshs=(p.hashesSN||[]).map(sn=>data.hashes.find(h=>h.sn===sn)).filter(Boolean);return<Card key={p._id} onClick={()=>openDetail(p)}>
          <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:800,fontSize:15}}>📦 {p.name}</div>{p.location&&<div style={{color:C.muted,fontSize:12}}>📍 {p.location}</div>}</div><div style={{display:"flex",gap:4}}><Tag color={C.blue}>{p.machinesSN?.length||0} máq.</Tag><Tag color={C.purple}>{p.hashesSN?.length||0} hash</Tag></div></div>
          {macs.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{macs.slice(0,4).map(m=><span key={m._id} style={{background:C.card2,borderRadius:6,padding:"2px 6px",fontSize:10}}>{m.sn?.slice(0,10)} <SP s={m.situacao}/></span>)}{macs.length>4&&<span style={{color:C.muted,fontSize:10}}>+{macs.length-4}</span>}</div>}
          {hshs.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{hshs.slice(0,4).map(h=><span key={h._id} style={{background:C.card2,borderRadius:6,padding:"2px 6px",fontSize:10}}>{h.sn?.slice(0,10)||"s/sn"} <HP s={h.status}/></span>)}{hshs.length>4&&<span style={{color:C.muted,fontSize:10}}>+{hshs.length-4}</span>}</div>}
        </Card>;})}
    </>}
  </div>;
}



/* ═══ MOVIMENTACAO ═══════════════════════════════════════════ */
function MovimentacaoTab({ctx}){
  const{data,mutate,user}=ctx;
  const pallets=data.pallets||[];
  const[src,setSrc]=useState(""),[dst,setDst]=useState(""),[scanned,setScanned]=useState([]),[input,setInput]=useState(""),[moving,setMoving]=useState(false),[log,setLog]=useState([]),[scanning,setScanning]=useState(false);
  const addSN=v=>{const sn=v.toUpperCase().trim();if(!sn||scanned.includes(sn))return;setScanned(s=>[...s,sn]);setInput("");};
  const doMove=async()=>{
    if(!src||!dst||!scanned.length)return;
    if(src===dst){alert("Origem e destino iguais!");return}
    setMoving(true);
    const srcP=pallets.find(p=>p._id===src);
    const dstP=pallets.find(p=>p._id===dst);
    if(!srcP||!dstP){setMoving(false);return}
    const srcNew=(srcP.machinesSN||[]).filter(s=>!scanned.includes(s));
    const dstNew=[...(dstP.machinesSN||[]),...scanned.filter(s=>!(dstP.machinesSN||[]).includes(s))];
    const srcUpd={...srcP,machinesSN:srcNew,...audit(user)};
    const dstUpd={...dstP,machinesSN:dstNew,...audit(user)};
    mutate("pallets",arr=>arr.map(p=>p._id===src?srcUpd:p._id===dst?dstUpd:p));
    await fbSet("pallets",src,srcUpd);await fbSet("pallets",dst,dstUpd);await markChanged("pallets");
    setLog(l=>[{src:srcP.name,dst:dstP.name,count:scanned.length,at:stamp()},...l]);
    setScanned([]);setSrc("");setDst("");setMoving(false);
    alert("✓ "+scanned.length+" máquinas movidas: "+srcP.name+" → "+dstP.name);
  };
  return<div>
    <SL>Mover Máquinas Entre Paletes</SL>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
      <Sel label="DE (origem)" value={src} onChange={e=>setSrc(e.target.value)}>
        <option value="">Selecionar...</option>
        {pallets.map(p=><option key={p._id} value={p._id}>{p.name} ({p.machinesSN?.length||0})</option>)}
      </Sel>
      <Sel label="PARA (destino)" value={dst} onChange={e=>setDst(e.target.value)}>
        <option value="">Selecionar...</option>
        {pallets.map(p=><option key={p._id} value={p._id}>{p.name} ({p.machinesSN?.length||0})</option>)}
      </Sel>
    </div>
    <SL>Bipe as Máquinas a Mover</SL>
    {scanning&&<BarcodeScanner onScan={v=>{addSN(v)}} onClose={()=>setScanning(false)}/>}
    <div style={{display:"flex",gap:8,marginBottom:8}}>
      <input value={input} onChange={e=>setInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addSN(input)} placeholder="SN da máquina..." style={{...inp,flex:1}}/>
      <button onClick={()=>setScanning(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:18}}>📷</button>
    </div>
    {scanned.length>0&&<div style={{background:C.card2,borderRadius:10,padding:10,marginBottom:12,maxHeight:140,overflow:"auto"}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4}}>PARA MOVER ({scanned.length})</div>
      {scanned.map((s,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:12,borderBottom:"1px solid "+C.border}}><span style={{color:C.blue}}>{s}</span><button onClick={()=>setScanned(sc=>sc.filter(x=>x!==s))} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button></div>)}
    </div>}
    <Btn v="g" onClick={doMove} disabled={moving||!src||!dst||!scanned.length} style={{width:"100%",marginBottom:12}}>{moving?"Movendo...":"🔄 Mover "+scanned.length+" máq. → "+((pallets.find(p=>p._id===dst)||{}).name||"?")}</Btn>
    {log.length>0&&<><SL>Histórico</SL>{log.slice(0,5).map((l,i)=><div key={i} style={{background:C.card2,borderRadius:8,padding:"8px 12px",marginBottom:6,fontSize:12}}><div style={{fontWeight:700}}>{l.src} → {l.dst}</div><div style={{color:C.muted,fontSize:10}}>{l.count} máquinas · {fmtTS(l.at)}</div></div>)}</>}
  </div>;
}

/* ═══ PALLET FORMS ═══════════════════════════════════════════ */
function AddPalletForm({ctx,onClose}){
  const{mutate,user}=ctx;
  const[name,setName]=useState(""),[location,setLocation]=useState(""),[notes,setNotes]=useState("");
  const save=async()=>{if(!name.trim())return;const id=uid();const d={name:name.trim(),location,notes,machinesSN:[],hashesSN:[],...audit(user),createdAt:TODAY()};await fbSet("pallets",id,d);mutate("pallets",p=>[...p,{...d,_id:id}]);await markChanged("pallets");onClose()};
  return<div>
    <Inp label="Nome" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: Palete 01" autoFocus/>
    <Inp label="Localização" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Ex: Galpão A, Prateleira B3"/>
    <Inp label="Observações" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/>
    <div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={!name.trim()} style={{flex:1}}>Criar</Btn></div>
  </div>;
}

function PalletDetail({ctx,pallet}){
  const{data,mutate,setModal,user,webhookUrl}=ctx;
  const[p,setP]=useState(pallet),[itemType,setItemType]=useState("machine"),[mode,setMode]=useState("scan"),[log,setLog]=useState([]);
  const fileRef=useRef();
  const macs=(p.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
  const hashes=(p.hashesSN||[]).map(sn=>data.hashes.find(h=>h.sn===sn)).filter(Boolean);
  const addSN=async(snRaw)=>{
    const sn=snRaw.toUpperCase().trim();if(!sn)return;
    const isHash=itemType==="hash";
    const listKey=isHash?"hashesSN":"machinesSN";
    if((p[listKey]||[]).includes(sn)){setLog(l=>[{sn,status:"dup",msg:"Já no palete"},...l]);setInput("");return}
    const newSNs=[...(p[listKey]||[]),sn];
    const upd={...p,[listKey]:newSNs,...audit(user)};
    setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));
    await fbSet("pallets",p._id,upd);await markChanged("pallets");
    if(isHash){
      const ex=data.hashes.find(h=>h.sn===sn);
      if(!ex){const id=uid();const d={sn,model:"M30S",status:"STOCK",machineSN:"",slot:-1,...audit(user),addedAt:TODAY()};await fbSet("hashes",id,d);mutate("hashes",h=>[...h,{...d,_id:id}]);await markChanged("hashes");syncSheet(webhookUrl,"addHash",{sn,model:d.model,status:d.status,employeeName:user.name,employeeCode:user.code});setLog(l=>[{sn,status:"new",msg:"Nova — criada no estoque"},...l]);}
      else setLog(l=>[{sn,status:"ok",msg:ex.model+" · "+ex.status},...l]);
    }else{
      const ex=data.machines.find(m=>m.sn===sn);
      if(!ex){const id=uid();const d={sn,model:"M30S",th:86,type:"complete",situacao:"STOCK",hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",...audit(user),addedAt:TODAY(),destino:""};await fbSet("machines",id,d);mutate("machines",m=>[...m,{...d,_id:id}]);await markChanged("machines");syncSheet(webhookUrl,"addMachine",{sn,model:d.model,situacao:d.situacao,employeeName:user.name,employeeCode:user.code});setLog(l=>[{sn,status:"new",msg:"Nova — criada no estoque"},...l]);}
      else setLog(l=>[{sn,status:"ok",msg:ex.model+" · "+ex.situacao},...l]);
    }
    setInput("");
  };
  const uploadCSV=async(file)=>{
    const text=await file.text();
    const sns=text.split("\n").map(l=>l.split(",")[0].replace(/['"]/g,"").toUpperCase().trim()).filter(s=>s&&s!=="SN"&&s.length>5);
    for(const sn of sns)await addSN(sn);
    alert("✓ "+sns.length+" SNs processados");
  };
  const remSN=async(sn,isHash)=>{const listKey=isHash?"hashesSN":"machinesSN";const newSNs=(p[listKey]||[]).filter(s=>s!==sn);const upd={...p,[listKey]:newSNs,...audit(user)};setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));await fbSet("pallets",p._id,upd);await markChanged("pallets")};
  const del=async()=>{if(!confirm("Remover palete "+p.name+"?"))return;mutate("pallets",arr=>arr.filter(x=>x._id!==p._id));await fbDel("pallets",p._id);await markChanged("pallets");setModal(null)};
  return<div>
    <div style={{background:C.card2,borderRadius:10,padding:12,marginBottom:12}}>{p.location&&<div style={{color:C.muted,fontSize:12}}>📍 {p.location}</div>}{p.notes&&<div style={{color:C.subtle,fontSize:12}}>{p.notes}</div>}<div style={{fontWeight:700,marginTop:4,color:C.accent}}>{macs.length} máquinas · {hashes.length} HASHs</div></div>
    <SL>O QUE VOCÊ VAI ADICIONAR?</SL>
    <div style={{display:"flex",gap:8,marginBottom:12}}>{[["machine","🖥️ Máquina"],["hash","⚡ HASH"]].map(([v,l])=><button key={v} onClick={()=>setItemType(v)} style={{flex:1,background:itemType===v?C.accent:"#1a2d42",color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div>
    <div style={{display:"flex",gap:6,marginBottom:10}}>
      {[["scan","📡 Bipagem"],["upload","📄 CSV"]].map(([id,l])=><button key={id} onClick={()=>setMode(id)} style={{flex:1,background:mode===id?C.accent:C.card2,color:"#fff",border:"none",borderRadius:10,padding:"8px 4px",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>)}
    </div>
    {mode==="scan"&&<div style={{marginBottom:8}}><SL>BIPE OU DIGITE → detecta sozinho se foi bipado</SL><SmartScanInput onDetect={addSN} placeholder={itemType==="hash"?"SN da HASH...":"SN da máquina..."} autoFocus/></div>}
    {mode==="upload"&&<><input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadCSV(e.target.files[0])}/><Btn v="b" onClick={()=>fileRef.current.click()} style={{width:"100%",marginBottom:8}}>📂 Escolher CSV</Btn><Btn v="s" onClick={()=>{const rows=["SN,Modelo,Situação"];macs.forEach(m=>rows.push((m.sn||"")+","+(m.model||"")+","+(m.situacao||"")));const blob=new Blob([rows.join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="palete-"+p.name+".csv";a.click()}} style={{width:"100%",marginBottom:8}}>⬇️ Exportar CSV</Btn></>}
    {log.length>0&&<div style={{background:C.card2,borderRadius:10,padding:8,marginBottom:10,maxHeight:100,overflow:"auto"}}>{log.map((l,i)=><div key={i} style={{fontSize:11,color:l.status==="new"?C.green:l.status==="dup"?C.amber:C.blue,padding:"2px 0"}}>{l.sn} — {l.msg}</div>)}</div>}
    <SL>Máquinas ({macs.length})</SL>
    {macs.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Nenhuma. Adicione acima.</div>:macs.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+C.border}}><div><div style={{fontWeight:700,fontSize:12}}>{m.sn||"SEM SN"}</div><div style={{fontSize:10,color:C.muted}}>{m.model} · <SP s={m.situacao}/></div></div><button onClick={()=>remSN(m.sn||"",false)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button></div>)}
    <SL mt={14}>HASHs ({hashes.length})</SL>
    {hashes.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Nenhuma. Adicione acima.</div>:hashes.map(h=><div key={h._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+C.border}}><div><div style={{fontWeight:700,fontSize:12}}>{h.sn||"SEM SN"}</div><div style={{fontSize:10,color:C.muted}}>{h.model} · <HP s={h.status}/></div></div><button onClick={()=>remSN(h.sn||"",true)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button></div>)}
    <Btn v="d" onClick={del} style={{width:"100%",marginTop:14}}>🗑 Remover Palete</Btn>
  </div>;
}

/* ═══ CLIENTES ═══════════════════════════════════════════════ */
function ClientesPage({ctx}){
  const{data,mutate,setModal}=ctx;
  const clients=data.clients||[];
  const openAdd=()=>setModal(<Modal title="Novo Cliente" onClose={()=>setModal(null)}><AddClientForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
  const openDetail=c=>setModal(<Modal title={"👤 "+c.name} onClose={()=>setModal(null)}><ClientDetail ctx={ctx} client={c}/></Modal>);
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div><div style={{fontWeight:900,fontSize:18}}>Clientes</div><div style={{color:C.muted,fontSize:12}}>{clients.length} clientes</div></div><Btn onClick={openAdd}>+ Cliente</Btn></div>
    {clients.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>👥</div><div>Nenhum cliente</div></div>
      :clients.map(c=>{const macs=(c.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);return<Card key={c._id} onClick={()=>openDetail(c)}>
        <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:800,fontSize:14}}>👤 {c.name}</div>{c.phone&&<div style={{color:C.muted,fontSize:12}}>📱 {c.phone}</div>}</div><Tag color={C.accent}>{c.machinesSN?.length||0} máq.</Tag></div>
        {macs.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{macs.slice(0,4).map(m=><span key={m._id} style={{background:(SIT_C[m.situacao]||C.muted)+"22",borderRadius:6,padding:"2px 6px",fontSize:10,color:SIT_C[m.situacao]||C.muted}}>{m.sn?.slice(0,10)||"s/sn"}</span>)}{macs.length>4&&<span style={{color:C.muted,fontSize:10}}>+{macs.length-4}</span>}</div>}
        <By by={c._byName} at={c._at}/>
      </Card>;})}
  </div>;
}
function AddClientForm({ctx,onClose}){
  const{mutate,user}=ctx;
  const[name,setName]=useState(""),[phone,setPhone]=useState(""),[notes,setNotes]=useState("");
  const save=async()=>{if(!name.trim())return;const id=uid();const d={name:name.trim(),phone,notes,machinesSN:[],...audit(user),createdAt:TODAY()};await fbSet("clients",id,d);mutate("clients",c=>[...c,{...d,_id:id}]);await markChanged("clients");onClose()};
  return<div><Inp label="Nome" value={name} onChange={e=>setName(e.target.value)} placeholder="Ex: João Silva" autoFocus/><Inp label="Telefone" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(47) 99999-9999"/><Inp label="Observações" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Endereço, empresa..."/><div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={!name.trim()} style={{flex:1}}>Criar</Btn></div></div>;
}
function ClientDetail({ctx,client}){
  const{data,mutate,setModal,user,webhookUrl}=ctx;
  const[c,setC]=useState(client),[pending,setPending]=useState([]),[removeInput,setRemoveInput]=useState(""),[saving,setSaving]=useState(false);
  const macs=(c.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
  // Item 1+2: bipagem em lote — cada SN bipado entra numa lista mostrando se
  // já existe (modelo/status) ou se é novo; só grava tudo quando aperta Salvar.
  const addToPending=(raw)=>{
    const sn=raw.toUpperCase().trim();if(!sn)return;
    if((c.machinesSN||[]).includes(sn)||pending.some(p=>p.sn===sn))return;
    const ex=data.machines.find(m=>m.sn===sn);
    setPending(p=>[...p,ex?{sn,existing:true,model:ex.model,situacao:ex.situacao,_id:ex._id}:{sn,existing:false}]);
  };
  const removeFromPending=sn=>setPending(p=>p.filter(x=>x.sn!==sn));
  const saveAll=async()=>{
    if(!pending.length)return;setSaving(true);
    const newSNs=[...(c.machinesSN||[])];
    for(const row of pending){
      if(row.existing){
        const ex=data.machines.find(m=>m._id===row._id);if(!ex)continue;
        const mHashes=data.hashes.filter(h=>h.machineSN===row.sn);
        for(const h of mHashes){const u={...h,status:"SAIDA",location:"Vendida: "+c.name,...audit(user)};mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u)}
        const u={...ex,situacao:"SAIDA",destino:c.name,changeLog:[{field:"situacao",label:"Situação",from:ex.situacao,to:"SAIDA",by:user.name,at:stamp()},...(ex.changeLog||[])].slice(0,80),...audit(user)};
        mutate("machines",m=>m.map(x=>x._id===ex._id?u:x));await fbSet("machines",ex._id,u);
        syncSheet(webhookUrl,"updateMachine",{sn:row.sn,field:"situacao",to:"SAIDA",destino:c.name,employeeName:user.name,employeeCode:user.code});
      }else{
        const id=uid();const d={sn:row.sn,model:"M30S",th:86,type:"complete",situacao:"SAIDA",hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",destino:c.name,...audit(user),addedAt:TODAY()};
        await fbSet("machines",id,d);mutate("machines",m=>[...m,{...d,_id:id}]);
        syncSheet(webhookUrl,"addMachine",{sn:row.sn,model:d.model,situacao:"SAIDA",destino:c.name,employeeName:user.name,employeeCode:user.code});
      }
      newSNs.push(row.sn);
    }
    const upd={...c,machinesSN:newSNs,...audit(user)};setC(upd);mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));await fbSet("clients",c._id,upd);
    await markChanged("clients");await markChanged("machines");await markChanged("hashes");
    setPending([]);setSaving(false);
  };
  const remMac=async(sn)=>{const newSNs=(c.machinesSN||[]).filter(s=>s!==sn);const upd={...c,machinesSN:newSNs,...audit(user)};setC(upd);mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));await fbSet("clients",c._id,upd);await markChanged("clients")};
  const removeBySN=()=>{const sn=removeInput.toUpperCase().trim();if(!sn)return;if((c.machinesSN||[]).includes(sn)){remMac(sn)}setRemoveInput("")};
  const del=async()=>{if(!confirm("Remover "+c.name+"?"))return;mutate("clients",arr=>arr.filter(x=>x._id!==c._id));await fbDel("clients",c._id);await markChanged("clients");setModal(null)};
  return<div>
    <div style={{background:C.card2,borderRadius:12,padding:14,marginBottom:14}}><div style={{fontWeight:900,fontSize:16,marginBottom:4}}>👤 {c.name}</div>{c.phone&&<div style={{color:C.blue,fontSize:13}}>📱 {c.phone}</div>}{c.notes&&<div style={{color:C.subtle,fontSize:12,marginTop:4}}>{c.notes}</div>}<div style={{marginTop:8,display:"flex",gap:8}}><div style={{background:C.accent+"22",borderRadius:8,padding:"6px 12px",textAlign:"center",flex:1}}><div style={{fontWeight:900,color:C.accent,fontSize:20}}>{c.machinesSN?.length||0}</div><div style={{fontSize:10,color:C.muted}}>Total</div></div><div style={{background:C.red+"22",borderRadius:8,padding:"6px 12px",textAlign:"center",flex:1}}><div style={{fontWeight:900,color:C.red,fontSize:20}}>{macs.filter(m=>["SAIDA","VENDIDA","EXPORTADA"].includes(m.situacao)).length}</div><div style={{fontSize:10,color:C.muted}}>Saídas</div></div></div></div>
    <div style={{color:C.amber,fontSize:11,marginBottom:8}}>⚠️ Ao salvar, máquina e HASHs internas vão para SAIDA</div>
    <div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}>
      <SL>BIPE OU DIGITE OS SNs → detecta sozinho se foi bipado</SL>
      <SmartScanInput onDetect={addToPending} placeholder="SN da máquina..." autoFocus/>
      <div style={{maxHeight:200,overflow:"auto",marginTop:10}}>
        {pending.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN ainda</div>:pending.map(p=><div key={p.sn} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
          <div><span style={{fontSize:13,fontFamily:"monospace",color:C.blue}}>{p.sn}</span>{p.existing?<Tag color={C.amber} small style={{marginLeft:6}}>{p.model} · {p.situacao}</Tag>:<Tag color={C.green} small style={{marginLeft:6}}>🆕 novo</Tag>}</div>
          <button onClick={()=>removeFromPending(p.sn)} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button>
        </div>)}
      </div>
      <Btn v="g" onClick={saveAll} disabled={saving||!pending.length} style={{width:"100%",marginTop:10}}>{saving?"Salvando...":"💾 Salvar "+pending.length+" máquina(s)"}</Btn>
    </div>
    <div style={{background:"#080e17",borderRadius:10,padding:14,marginBottom:14}}>
      <SL>REMOVER DO CLIENTE POR SN</SL>
      <div style={{display:"flex",gap:8}}><input value={removeInput} onChange={e=>setRemoveInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&removeBySN()} placeholder="Bipe ou digite o SN pra remover..." style={{...inp,flex:1}}/><Btn v="d" onClick={removeBySN} style={{fontSize:12}}>Remover</Btn></div>
    </div>
    <SL>Máquinas ({macs.length})</SL>
    {macs.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Nenhuma máquina</div>:macs.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.border}}><div><div style={{fontWeight:700,fontSize:12}}>{m.sn||"SEM SN"} <SP s={m.situacao}/></div><div style={{fontSize:10,color:C.muted}}>{m.model} · {m.th}TH</div></div><button onClick={()=>remMac(m.sn||"")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button></div>)}
    <Btn v="d" onClick={del} style={{width:"100%",marginTop:14}}>🗑 Remover Cliente</Btn>
  </div>;
}

/* ═══ EQUIPE DETALHES ════════════════════════════════════════ */
function EmpHistory({ctx,emp}){
  const{data}=ctx;const[dateFilter,setDateFilter]=useState(TODAY());
  const allR=data.repairs.filter(r=>r.employeeId===emp._id);const allT=data.tests.filter(t=>t.employeeId===emp._id);
  const dayR=allR.filter(r=>r.date===dateFilter);const dayT=allT.filter(t=>t.date===dateFilter);
  const byDate={};[...allR.map(r=>r.date),...allT.map(t=>t.date)].forEach(d=>{byDate[d]=(byDate[d]||0)+1});
  return<div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      {[[allR.filter(r=>r.type!=="already_good").length,"Consertos",C.accent],[allT.length,"Testes",C.blue],[data.feedbacks?.filter(f=>!f.resolved&&f.originalRepairerId===emp._id).length||0,"Pendências",C.red]].map(([v,l,c])=><div key={l} style={{background:C.card2,borderRadius:10,padding:10,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div><div style={{fontSize:10,color:C.muted}}>{l}</div></div>)}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"flex-end"}}><div style={{flex:1}}><Inp label="Data" type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div><Btn v="s" onClick={()=>copyReport(emp,data.repairs,data.tests,dateFilter)} style={{marginBottom:12}}>📤</Btn></div>
    {dayR.length===0&&dayT.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sem registros nesta data</div>:<>
      {dayR.map(r=><Card key={r._id} accent={r.type==="already_good"?C.green:C.blue}><div style={{fontWeight:700,fontSize:13}}>{r.type==="already_good"?"✅":"🔧"} {r.hashSN||"SEM SN"} — {r.model}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(r._at)}</div></Card>)}
      {dayT.map(t=><Card key={t._id} accent={t.status==="pending"?C.blue:t.overallResult==="good"?C.green:C.red}><div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(t._at)}</div></Card>)}
    </>}
    <SL mt={12}>Por Dia</SL>
    {Object.keys(byDate).sort().reverse().slice(0,20).map(d=><div key={d} onClick={()=>setDateFilter(d)} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid "+C.border,fontSize:12,cursor:"pointer"}}><span style={{color:d===dateFilter?C.accent:C.text}}>{fmtDate(d)}</span><Tag color={C.accent} small>{byDate[d]}</Tag></div>)}
  </div>;
}
function EmpEdit({ctx,emp,onClose}){
  const{data,mutate}=ctx;const[e,setE]=useState({...emp});
  const setPerm=(k,v)=>setE(p=>({...p,permissions:{...p.permissions,[k]:v}}));
  const save=async()=>{mutate("employees",arr=>arr.map(x=>x._id===e._id?e:x));await fbSet("employees",e._id,e);await markChanged("employees");onClose()};
  const del=async()=>{if(!confirm("Remover "+e.name+"?"))return;mutate("employees",arr=>arr.filter(x=>x._id!==e._id));await fbDel("employees",e._id);await markChanged("employees");onClose()};
  const resetPwd=async()=>{const np=prompt("Nova senha para "+e.name+" (mín 4):");if(!np||np.length<4){alert("Senha muito curta");return}const hash=await hashPwd(np);const upd={...e,passwordHash:hash};setE(upd);mutate("employees",arr=>arr.map(x=>x._id===e._id?upd:x));await fbSet("employees",e._id,upd);await markChanged("employees");alert("✓ Senha redefinida!")};
  return<div>
    <Inp label="Nome" value={e.name} onChange={ev=>setE(p=>({...p,name:ev.target.value}))}/>
    <Inp label="Código" value={e.code} onChange={ev=>setE(p=>({...p,code:ev.target.value.slice(0,3)}))} maxLength={3}/>
    <SL mt={8}>Permissões</SL>
    {PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.border}}><span style={{fontSize:13}}>{label}</span><button onClick={()=>setPerm(key,!e.permissions?.[key])} style={{background:e.permissions?.[key]?C.green+"22":"#1a2d42",color:e.permissions?.[key]?C.green:C.muted,border:"1px solid "+(e.permissions?.[key]?C.green:C.border),borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{e.permissions?.[key]?"ON":"OFF"}</button></div>)}
    <div style={{marginTop:12}}><Btn v="y" onClick={resetPwd} style={{width:"100%",marginBottom:8}}>🔑 Redefinir Senha</Btn></div>
    <div style={{display:"flex",gap:8}}><Btn v="d" onClick={del} style={{flex:1}}>🗑 Remover</Btn><Btn v="g" onClick={save} style={{flex:2}}>💾 Salvar</Btn></div>
  </div>;
}