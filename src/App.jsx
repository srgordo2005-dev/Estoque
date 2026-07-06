import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { BrowserMultiFormatReader } from "@zxing/browser";

// Quando uma tela é aberta com setModal(<Componente ctx={ctx}/>), esse
// elemento fica "congelado" no estado — se os dados mudarem depois (por
// exemplo, você adiciona a máquina num palete), a tela aberta não via a
// atualização até fechar e abrir de novo. Essa função percorre a árvore
// guardada e troca o "ctx" congelado pelo mais atual, toda vez que a tela
// é renderizada de novo — sem precisar mudar todos os lugares que abrem modal.
function injectFreshCtx(element,ctx){
  if(!React.isValidElement(element))return element;
  const newProps={};
  if("ctx" in element.props)newProps.ctx=ctx;
  // Além do ctx, algumas telas recebem a própria máquina/HASH como prop
  // separada (ex: <MachineDetail machine={m}/>) — essa também ficava
  // congelada na versão de quando a tela foi aberta. Busca a versão mais
  // atual pelo _id, se existir.
  if(ctx?.data){
    if("machine" in element.props&&element.props.machine?._id){
      const fresh=ctx.data.machines?.find(x=>x._id===element.props.machine._id);
      if(fresh)newProps.machine=fresh;
    }
    if("hash" in element.props&&element.props.hash?._id){
      const fresh=ctx.data.hashes?.find(x=>x._id===element.props.hash._id);
      if(fresh)newProps.hash=fresh;
    }
  }
  let children=element.props.children;
  if(children!==undefined){
    children=React.Children.map(children,child=>injectFreshCtx(child,ctx));
    newProps.children=children;
  }
  return React.cloneElement(element,newProps);
}

/* ═══ SUPABASE ═══════════════════════════════════════════════════ */
const SUPABASE_URL="https://paelbarlmayswqilhoxa.supabase.co";
const SUPABASE_KEY="sb_publishable_6Kz2o4DWlxhBgc7oyDt2AA_KmphGK-h"; // sb_publishable_...
const supabase=createClient(SUPABASE_URL,SUPABASE_KEY);

// Nome da coleção (usado no resto do app, igual antes) → nome da tabela real no Postgres
const TABLE_MAP={pendingApprovals:"pending_approvals",customModels:"custom_models",loadPhotos:"load_photos"};
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
  clientId:"client_id",clientName:"client_name",sentAt:"sent_at",
  sheetRow:"sheet_row",
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
  adminNotes:"admin_notes",
  newHashModel:"new_hash_model",newHashMaterial:"new_hash_material",newHashChips:"new_hash_chips",
  newHashChars:"new_hash_chars",
  existingId:"existing_id",logPhoto:"log_photo",
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
  const{_id,...cleanObj}=obj; // nunca manda o _id junto — o "id" já vai separado
  const row={id,...toDBRow(cleanObj)};
  const{error}=await supabase.from(table).upsert(row,{onConflict:"id"});
  if(error){console.error(`fbSet(${c},${id}):`,error.message);onSyncSheetError?.(`Não consegui salvar em "${c}": ${error.message}`);return{ok:false,error:error.message}}
  return{ok:true};
}
async function fbDel(c,id){
  const table=tableName(c);
  const{error}=await supabase.from(table).delete().eq("id",id);
  if(error){console.warn(`fbDel(${c},${id}):`,error.message);onSyncSheetError?.(`Não consegui apagar de "${c}": ${error.message}`);return{ok:false,error:error.message}}
  // Quem apaga de propósito (lixo/duplicado) precisa que o "teto máximo" de
  // segurança (guardCount) desça junto — senão fica avisando pra sempre que
  // a contagem "diminuiu" mesmo sendo exatamente o que se pediu pra fazer.
  if(c==="machines"||c==="hashes"){
    const key="hs_maxcount_"+c;
    const cur=Number(localStorage.getItem(key)||0);
    if(cur>0)localStorage.setItem(key,String(cur-1));
  }
  return{ok:true};
}
async function fbBatch(writes){
  const byCol={};
  for(const w of writes){const{_id,...cleanD}=w.d||{};(byCol[w.c]=byCol[w.c]||[]).push({id:w.id,...toDBRow(cleanD)})}
  const errors=[];
  for(const[c,rows]of Object.entries(byCol)){
    const table=tableName(c);
    for(let i=0;i<rows.length;i+=500){
      const{error}=await supabase.from(table).upsert(rows.slice(i,i+500),{onConflict:"id"});
      if(error){console.error(`fbBatch(${c}):`,error.message);errors.push(`${c}: ${error.message}`)}
    }
  }
  if(errors.length){onSyncSheetError?.("Lote não salvou tudo: "+errors.join(" | "));return{ok:false,errors}}
  return{ok:true,errors:[]};
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
// URLs padrão (funcionam mesmo se o navegador não tiver salvo nada ainda —
// útil porque cada deploy novo do Vercel pode gerar uma URL diferente, e o
// localStorage é por site). Ainda dá pra trocar em Config se precisar.
const DEFAULT_DRIVE_UPLOAD_URL="https://script.google.com/macros/s/AKfycbxN39ZoU4vrk4wCD84TIMTzTlxJuKSqWjcHGPo-l8iFDkAMYPrcxLRRZzNn9XVAqOcM6Q/exec";
let DRIVE_UPLOAD_URL=localStorage.getItem("driveUploadUrl")||DEFAULT_DRIVE_UPLOAD_URL;
async function uploadPhoto(b64,path){
  if(!DRIVE_UPLOAD_URL){onSyncSheetError?.("Foto não enviada: configure a URL do Drive em Config.");return null}
  try{
    const r=await fetch(DRIVE_UPLOAD_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"uploadPhoto",base64:b64,filename:path.replace(/\//g,"_")})});
    const d=await r.json();
    if(d.error){console.error("Upload Drive error:",d.error);onSyncSheetError?.("Foto não salvou no Drive: "+d.error);return null}
    return d.url||null;
  }catch(e){console.error("uploadPhoto:",e);onSyncSheetError?.("Foto não chegou no Drive: "+e.message);return null}
}
// Apaga o arquivo de verdade do Drive (manda pra lixeira do Drive) — usado
// quando o usuário exclui uma foto no app, pra não deixar lixo acumulando lá.
async function deleteDrivePhoto(url){
  if(!DRIVE_UPLOAD_URL||!url||!url.startsWith("http"))return;
  try{
    const r=await fetch(DRIVE_UPLOAD_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"deletePhoto",url})});
    const d=await r.json().catch(()=>({}));
    if(d.error)console.warn("Não consegui apagar a foto do Drive:",d.error);
  }catch(e){console.warn("deleteDrivePhoto:",e)}
}
let wQ=[],wT=null;
let onSyncSheetError=null; // o App registra isso no boot pra mostrar erros de sincronização (planilha e Drive) na tela
function syncSheet(url,action,payload){
  if(!url)return;
  wQ.push({action,payload});
  clearTimeout(wT);
  wT=setTimeout(async()=>{
    if(!wQ.length)return;
    const b=[...wQ];wQ=[];
    try{
      // Sem mode:"no-cors" — assim conseguimos LER a resposta e saber se
      // realmente funcionou, em vez de disparar às cegas e nunca saber.
      const r=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({batch:b})});
      const d=await r.json().catch(()=>({}));
      if(d.error){console.error("syncSheet erro:",d.error);onSyncSheetError?.(`Planilha não salvou "${b[0]?.action}": ${d.error}`)}
      else console.log(`✓ syncSheet: ${b.length} ação(ões) enviada(s) pra planilha`,b.map(x=>x.action));
    }catch(e){
      console.error("syncSheet falhou:",e);
      onSyncSheetError?.(`Planilha não respondeu pra "${b[0]?.action}": ${e.message}`);
    }
  },1200);
}
async function importMachinesFromSheet(url,onProgress){
  if(onProgress)onProgress(0,0);
  const r=await fetch(`${url}?action=getMachines`);
  const text=await r.text();
  let d;try{d=JSON.parse(text)}catch{throw new Error("A planilha demorou demais ou travou (recebi uma página em vez de dados). Tente de novo em alguns segundos.")}
  if(d.error)throw new Error(d.error);
  const machines=d.machines||[];
  if(onProgress)onProgress(machines.length,machines.length);
  return machines;
}
async function importHashesFromSheet(url){
  const r=await fetch(`${url}?action=getHashes`);
  const text=await r.text();
  let d;try{d=JSON.parse(text)}catch{throw new Error("A planilha demorou demais ou travou (recebi uma página em vez de dados). Tente de novo em alguns segundos.")}
  if(d.error)throw new Error(d.error);
  return d.hashes||[];
}
async function importFromSheet(url){const r=await fetch(url+"?action=getMachines");const d=await r.json();return d.machines||[];}
const compress=f=>new Promise(res=>{const rd=new FileReader();rd.onload=e=>{const img=new Image();img.onload=()=>{const M=720,r=Math.min(M/img.width,M/img.height,1),c=document.createElement("canvas");c.width=img.width*r;c.height=img.height*r;c.getContext("2d").drawImage(img,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.65))};img.src=e.target.result};rd.readAsDataURL(f)});

/* ═══ CONSTANTS ═════════════════════════════════════════════════ */
const DEF_MODELS=[{m:"E9 Pro",th:3680},{m:"E9 Pro+",th:3880},{m:"KS5",th:21},{m:"KS5L",th:14},{m:"KS3",th:8},{m:"S19JPRO+",th:120},{m:"S19KPRO",th:77},{m:"S21XP",th:270},{m:"M20S",th:68},{m:"M30S",th:86},{m:"M30S+",th:100},{m:"M30S++",th:104},{m:"M31S",th:74},{m:"M31S+",th:80},{m:"M50",th:114},{m:"M50S",th:126},{m:"M50S+",th:136},{m:"M50S++",th:158},{m:"M53",th:226},{m:"M53S",th:230},{m:"M56",th:185},{m:"M56S",th:212},{m:"M60",th:160},{m:"M60S",th:178},{m:"M60S+",th:200},{m:"M60S++",th:218},{m:"M63",th:372},{m:"M63S",th:408},{m:"M63S++",th:464},{m:"M66",th:276},{m:"M66S",th:288},{m:"M70S",th:300},{m:"M73S",th:380},{m:"S9",th:13},{m:"S9i",th:14},{m:"S9j",th:14},{m:"S9k",th:13},{m:"S9 SE",th:16},{m:"T17",th:40},{m:"T17+",th:64},{m:"T17e",th:53},{m:"S17 Pro",th:53},{m:"S17+",th:73},{m:"T19",th:84},{m:"S19",th:95},{m:"S19 Pro",th:110},{m:"S19j",th:90},{m:"S19j Pro",th:104},{m:"S19j Pro+",th:120},{m:"S19k Pro",th:136},{m:"S19 XP",th:140},{m:"S19 XP Hyd",th:255},{m:"T21",th:190},{m:"S21",th:200},{m:"S21 Pro",th:234},{m:"S21 XP",th:270},{m:"S21 XP Hyd",th:495},{m:"S23",th:318},{m:"S23 Hyd",th:580}];
const SIT_OPTS=["STOCK","BOA","AGUARD. REVISÃO","REVISAR","ENTRADA OFICINA","LIGADA","VENDIDA","PREPARANDO","SAIDA","EXPORTADA","CASTANHAO"];
const HST_OPTS=["ON","OFF","TESTAR","REPARO","STOCK","SAIDA","IRREPARAVEL","NA MAQUINA"];
// Controladora/Fonte/Fans/Hash-slots da máquina: a planilha só aceita esses 3
// valores (validação travada na coluna). Usar mais opções que isso faz a
// escrita na planilha ser rejeitada silenciosamente.
const CTR_OPTS=["ON","OFF","TESTAR"];
const SIT_C={"STOCK":"#d97706","BOA":"#16a34a","AGUARD. REVISÃO":"#2563eb","REVISAR":"#dc2626","ENTRADA OFICINA":"#0ea5e9","LIGADA":"#8b5cf6","VENDIDA":"#dc2626","PREPARANDO":"#2563eb","SAIDA":"#dc2626","EXPORTADA":"#dc2626","CASTANHAO":"#92400e"};
const HST_C={ON:"#16a34a",OFF:"#dc2626",TESTAR:"#d97706",REPARO:"#8b5cf6",STOCK:"#64748b",SAIDA:"#ea580c",IRREPARAVEL:"#374151","NA MAQUINA":"#0ea5e9"};
const TODAY=()=>new Date().toISOString().split("T")[0];
const fmtDate=d=>d?new Date(d+"T12:00:00").toLocaleDateString("pt-BR"):"—";
const fmtTS=s=>s?new Date(s).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const fmtTime=s=>s?new Date(s).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"";
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const downloadPhoto=(url,filename)=>{
  const a=document.createElement("a");
  a.href=url;a.download=filename||"foto.jpg";a.target="_blank";a.rel="noopener noreferrer";
  document.body.appendChild(a);a.click();document.body.removeChild(a);
};
// Carrega uma foto (URL do Drive) e converte pra base64, pra poder colar
// dentro do PDF. Se falhar (CORS, foto não existe mais etc), não quebra o
// relatório — só segue sem a imagem daquele item.
async function loadImageAsDataURL(url){
  try{
    const res=await fetch(url);const blob=await res.blob();
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onloadend=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
  }catch{return null}
}
async function generateClientPDF(client,macsF,hshsF,data,loadPhotosF,onProgress){
  const doc=new jsPDF();
  const pageW=210,marginX=14,pageH=290;
  let y=20;
  const line=()=>{doc.setDrawColor(220);doc.line(marginX,y,pageW-marginX,y);y+=6};
  const ensureSpace=(needed)=>{if(y+needed>pageH){doc.addPage();y=20}};

  // Cabeçalho
  doc.setFillColor(30,41,59);doc.rect(0,0,pageW,26,"F");
  doc.setTextColor(255,255,255);doc.setFontSize(16);doc.setFont(undefined,"bold");
  doc.text("Relatorio de Envios",marginX,14);
  doc.setFontSize(10);doc.setFont(undefined,"normal");
  doc.text(`Cliente: ${client.name}`,marginX,21);
  doc.setTextColor(0);y=34;
  doc.setFontSize(9);doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}  -  ${macsF.length} maquina(s)  -  ${hshsF.length} HASH(s) avulsa(s)`,marginX,y);
  doc.setTextColor(0);y+=10;

  let done=0;const total=macsF.length+hshsF.length+(loadPhotosF?.length||0);
  if(macsF.length){
    doc.setFontSize(13);doc.setFont(undefined,"bold");doc.text("Maquinas",marginX,y);y+=8;
    for(const m of macsF){
      ensureSpace(85);
      doc.setFontSize(11);doc.setFont(undefined,"bold");doc.setTextColor(30,41,120);
      doc.text(`${m.sn||"SEM SN"}  -  ${m.model}`,marginX,y);y+=6;
      doc.setFont(undefined,"normal");doc.setFontSize(9);doc.setTextColor(80);
      doc.text(`Enviada em: ${m._at?fmtTS(m._at):"-"}`,marginX,y);y+=5;
      const slots=[m.hashSN0,m.hashSN1,m.hashSN2].filter(Boolean);
      if(slots.length){doc.text(`HASHs instaladas: ${slots.join(", ")}`,marginX,y);y+=5}
      const test=[...data.tests].reverse().find(t=>t.machineSN===m.sn&&t.overallResult==="good");
      const photoToUse=m.photoKey||test?.testPhoto;
      const photoLabel=m.photoKey?"Foto da maquina":"Foto do teste";
      const photoDate=m.photoKey?(m._at?fmtTS(m._at):"-"):(test?._at?fmtTS(test._at):"-");
      if(photoToUse){
        const img=await loadImageAsDataURL(photoToUse);
        if(img){
          ensureSpace(120);
          try{doc.addImage(img,"JPEG",marginX,y,130,97);
            doc.setFontSize(8);doc.setTextColor(140);
            doc.text(`${photoLabel} - ${photoDate}`,marginX,y+103);
            doc.setTextColor(0);
            y+=112;
          }catch{y+=4}
        }
      }
      doc.setTextColor(0);y+=4;line();
      done++;onProgress?.(done,total);
    }
  }
  if(hshsF.length){
    ensureSpace(20);
    doc.setFontSize(13);doc.setFont(undefined,"bold");doc.text("HASHs avulsas",marginX,y);y+=8;
    doc.setFont(undefined,"normal");doc.setFontSize(9);
    for(const h of hshsF){
      ensureSpace(8);
      doc.text(`${h.sn||"SEM SN"}  -  ${h.model}  -  ${h.status}  -  ${h._at?fmtTS(h._at):"-"}`,marginX,y);y+=6;
      done++;onProgress?.(done,total);
    }
  }
  if(loadPhotosF?.length){
    ensureSpace(20);
    doc.setFontSize(13);doc.setFont(undefined,"bold");doc.setTextColor(0);doc.text("Fotos da Carga do Envio",marginX,y);y+=8;
    for(const p of loadPhotosF){
      const img=await loadImageAsDataURL(p.photoKey);
      if(img){
        ensureSpace(112);
        try{
          doc.addImage(img,"JPEG",marginX,y,130,97);
          doc.setFontSize(8);doc.setTextColor(140);
          doc.text(`Carga - ${fmtDate(p.date)}`,marginX,y+103);
          doc.setTextColor(0);
          y+=112;
        }catch{y+=4}
      }
      done++;onProgress?.(done,total);
    }
  }
  doc.save(`relatorio-${client.name.replace(/[^a-z0-9]/gi,"_")}.pdf`);
}
const PERMS=[{key:"repairs",label:"Conserto de HASHs"},{key:"testing",label:"Teste de Máquinas"},{key:"machines",label:"Estoque de Máquinas"},{key:"hashes",label:"Estoque de HASHs"},{key:"admin",label:"Admin (acesso total)"}];

/* ═══ UI PRIMITIVES ═════════════════════════════════════════════ */
const DARK_THEME={bg:"#080e17",card:"#0f1923",card2:"#1a2d42",border:"#1a2d42",accent:"#f97316",blue:"#0ea5e9",green:"#16a34a",red:"#dc2626",purple:"#7c3aed",amber:"#d97706",text:"#e2e8f0",muted:"#64748b",subtle:"#94a3b8"};
const LIGHT_THEME={bg:"#f4f6f8",card:"#ffffff",card2:"#eef2f6",border:"#dbe2ea",accent:"#ea580c",blue:"#0284c7",green:"#15803d",red:"#dc2626",purple:"#7c3aed",amber:"#b45309",text:"#1e293b",muted:"#64748b",subtle:"#475569"};
// "C" é mutável de propósito — ao trocar o tema, só troca os valores dentro
// do MESMO objeto (não cria um objeto novo), assim todo o app (que já lê
// C.xxx em milhares de lugares) já pega a cor nova sozinho no próximo
// render, sem precisar mudar cada tela uma por uma.
let C={...DARK_THEME};
const inp={width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box",outline:"none",colorScheme:"dark"};
const Inp=({label,err,...p})=><div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<input {...p} style={{...inp,borderColor:err?C.red:C.border,...p.style}}/>{err&&<div style={{color:C.red,fontSize:11,marginTop:3}}>⚠️ {err}</div>}</div>;
// Campo de data — clicar em QUALQUER parte do campo abre o calendário (não só
// no ícone), usando showPicker() do navegador. Resolve o calendário nativo
// sendo difícil de abrir/ver em alguns navegadores.
const DateInp=({label,...p})=>{
  const ref=useRef();
  return<div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<input ref={ref} type="date" {...p} onClick={()=>{try{ref.current?.showPicker?.()}catch{}}} style={{...inp,cursor:"pointer",...p.style}}/></div>;
};
const Sel=({label,children,...p})=><div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<select {...p} style={{...inp,...p.style}}>{children}</select></div>;
const Btn=({v="o",children,...p})=>{const vs={o:{bg:C.accent,c:"#fff"},s:{bg:C.card2,c:C.text},d:{bg:C.red,c:"#fff"},g:{bg:C.green,c:"#fff"},b:{bg:"#0c2a3a",c:C.blue},p:{bg:C.purple,c:"#fff"},y:{bg:C.amber,c:"#fff"}};const st=vs[v]||vs.o;return<button {...p} style={{background:st.bg,color:st.c,border:"none",borderRadius:8,padding:"10px 16px",fontWeight:700,fontSize:13,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,opacity:p.disabled?.5:1,...p.style}}>{children}</button>};
const Modal=({title,onClose,children})=><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"flex-end"}}><div style={{background:C.card,borderRadius:"18px 18px 0 0",width:"100%",maxWidth:640,margin:"0 auto",maxHeight:"92vh",overflow:"auto",padding:20,boxSizing:"border-box"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><div style={{fontWeight:800,fontSize:16,color:C.text}}>{title}</div><button onClick={onClose} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:18}}>✕</button></div>{children}</div></div>;
const Card=({accent,onClick,children,style})=><div onClick={onClick} style={{background:C.card,borderRadius:12,padding:14,marginBottom:10,cursor:onClick?"pointer":"default",borderLeft:accent?`3px solid ${accent}`:undefined,...style}}>{children}</div>;
const Tag=({color,children,small})=><span style={{background:color,color:"#fff",borderRadius:6,padding:small?"1px 7px":"3px 9px",fontSize:small?10:11,fontWeight:700,whiteSpace:"nowrap"}}>{children}</span>;
const SL=({children,mt})=><div style={{color:C.subtle,fontSize:10,fontWeight:800,letterSpacing:1,marginBottom:8,marginTop:mt||0}}>{children}</div>;
const HP=({s})=><span style={{background:HST_C[s]||C.muted,color:"#fff",borderRadius:20,padding:"2px 9px",fontSize:10,fontWeight:800}}>{s||"—"}</span>;
const SP=({s})=><span style={{background:SIT_C[s]||C.muted,color:"#fff",borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:700}}>{s||"—"}</span>;
const By=({by,at})=>by?<div style={{fontSize:10,color:C.muted,marginTop:3}}>✏️ {by} · {fmtTS(at)}</div>:null;
const Alrt=({type,children})=>{const m={ok:{bg:"#0c2a0f",b:C.green,c:C.green},err:{bg:"#2a0c0c",b:C.red,c:C.red},warn:{bg:"#2a1a00",b:C.amber,c:C.amber}};const s=m[type]||m.warn;return<div style={{background:s.bg,border:`1px solid ${s.b}`,borderRadius:10,padding:12,marginBottom:12,color:s.c,fontWeight:700,fontSize:13}}>{children}</div>};

/* ═══ BARCODE SCANNER ══════════════════════════════════════════ */
function BarcodeScanner({onScan,onClose}){
  const vRef=useRef(),readerRef=useRef(),controlsRef=useRef(),trackRef=useRef();
  const[err,setErr]=useState(""),[ok,setOk]=useState(false),[torchOn,setTorchOn]=useState(false),[torchSupported,setTorchSupported]=useState(false);
  useEffect(()=>{
    let stopped=false;
    const timeout=setTimeout(()=>{
      if(!stopped&&!controlsRef.current)setErr("A câmera demorou demais pra iniciar.\n\nConfira nas Configurações do navegador se o site tem permissão de câmera liberada, e tenta de novo.");
    },8000);
    (async()=>{
      try{
        // ZXing funciona em QUALQUER navegador (Chrome/Safari, Android/iPhone)
        // — diferente do antigo BarcodeDetector, que só existe no Chrome do
        // Android. IMPORTANTE: usamos "decodeFromConstraints" (pede a câmera
        // direto, com facingMode) em vez de listar câmeras antes — listar
        // câmeras ANTES de ter permissão retorna nomes vazios em quase todo
        // celular, o que fazia escolher a câmera errada (ou nenhuma) e a
        // tela ficava preta sem escanear nada.
        const reader=new BrowserMultiFormatReader();
        readerRef.current=reader;
        const constraints={video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}};
        const controls=await reader.decodeFromConstraints(constraints,vRef.current,(result,error)=>{
          if(stopped)return;
          if(result){stopped=true;controls.stop();onScan(result.getText())}
          // "NotFoundException" é disparado a cada frame sem código — normal, ignora
        });
        clearTimeout(timeout);
        controlsRef.current=controls;
        setOk(true);
        // Lanterna — só funciona em alguns navegadores/aparelhos (Android
        // Chrome principalmente; iPhone geralmente não deixa controlar por
        // aqui). Se não der pra saber, o botão simplesmente não aparece.
        try{
          const track=vRef.current.srcObject?.getVideoTracks?.()[0];
          if(track){trackRef.current=track;const caps=track.getCapabilities?.();if(caps&&caps.torch)setTorchSupported(true)}
        }catch{}
      }catch(e){clearTimeout(timeout);setErr("Câmera:\n"+(e.message||"não consegui acessar")+"\n\nConfira se deu permissão de câmera pro site nas configurações do navegador.")}
    })();
    return()=>{stopped=true;clearTimeout(timeout);try{controlsRef.current?.stop()}catch{}};
  },[]);
  const toggleTorch=async()=>{
    if(!trackRef.current)return;
    try{await trackRef.current.applyConstraints({advanced:[{torch:!torchOn}]});setTorchOn(t=>!t)}catch{}
  };
  return<div style={{position:"fixed",inset:0,background:"#000",zIndex:500}}>{err?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"#fff",padding:24,textAlign:"center",gap:16}}><div style={{fontSize:52}}>📵</div><div style={{whiteSpace:"pre-line"}}>{err}</div><Btn onClick={onClose}>Fechar</Btn></div>:<><video ref={vRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} playsInline muted/><div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}><div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)"}}/><div style={{position:"relative",zIndex:1,width:290,height:150,borderRadius:12,boxShadow:"0 0 0 9999px rgba(0,0,0,.55)"}}><div style={{position:"absolute",top:"50%",left:4,right:4,height:2,background:"#f97316",borderRadius:2}}/></div><div style={{position:"relative",zIndex:1,color:"#fff",marginTop:20,fontSize:14,fontWeight:700}}>{ok?"🔍 Aponte para o código...":"⏳ Iniciando..."}</div></div>{torchSupported&&<button onClick={toggleTorch} style={{position:"absolute",bottom:30,left:"50%",transform:"translateX(-50%)",background:torchOn?"#f97316":"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:24,padding:"10px 20px",cursor:"pointer",fontWeight:700,zIndex:2,fontSize:14}}>{torchOn?"🔦 Lanterna ON":"🔦 Lanterna"}</button>}<button onClick={onClose} style={{position:"absolute",top:20,right:20,background:"rgba(0,0,0,.7)",border:"none",color:"#fff",borderRadius:20,padding:"8px 18px",cursor:"pointer",fontWeight:700,zIndex:2}}>✕</button></>}</div>;
}

function SNInput({label,value,onChange,placeholder,list,onEnter,autoFocus,err}){
  const[sc,setSc]=useState(false);
  return<div style={{marginBottom:12}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}<div style={{display:"flex",gap:8}}><input list={list} value={value} onChange={e=>onChange(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&onEnter?.()} placeholder={placeholder||"SN"} autoFocus={autoFocus} style={{...inp,flex:1,borderColor:err?C.red:C.border}}/><button onClick={()=>setSc(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:20,flexShrink:0}} title="Escanear">📷</button></div>{err&&<div style={{color:C.red,fontSize:11,marginTop:3}}>⚠️ {err}</div>}{sc&&<BarcodeScanner onScan={v=>{onChange(v.toUpperCase());setSc(false);onEnter?.()}} onClose={()=>setSc(false)}/>}</div>;
}

// Campo de editar o SN de uma máquina/HASH JÁ EXISTENTE. Usa estado LOCAL —
// só confirma (e só então salva/sincroniza) ao sair do campo ou apertar
// Enter. Sem isso, cada letra digitada disparava um salvamento (e no caso
// de apagar tudo, chegava a salvar SN vazio no meio do caminho).
function EditableSNField({label,value,onCommit}){
  const[local,setLocal]=useState(value);
  const[sc,setSc]=useState(false);
  useEffect(()=>{setLocal(value)},[value]);
  const commit=()=>{const v=local.toUpperCase().trim();if(v!==value&&v)onCommit(v)};
  return<div style={{marginBottom:12}}>
    {label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>{label}</div>}
    <div style={{display:"flex",gap:8}}>
      <input value={local} onChange={e=>setLocal(e.target.value.toUpperCase())} onBlur={commit} onKeyDown={e=>e.key==="Enter"&&e.target.blur()} placeholder="Digite o SN" style={{...inp,flex:1}}/>
      <button onClick={()=>setSc(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:20,flexShrink:0}} title="Escanear">📷</button>
    </div>
    {local!==value&&!local.trim()&&<div style={{color:C.amber,fontSize:11,marginTop:3}}>⚠️ Não salva com SN vazio</div>}
    {sc&&<BarcodeScanner onScan={v=>{setLocal(v.toUpperCase());setSc(false);onCommit(v.toUpperCase())}} onClose={()=>setSc(false)}/>}
  </div>;
}

/* ═══ BIPAGEM EM LOTE (Bipar / Digitar separados) ═══════════════
   Componente reutilizável usado em Clientes, Paletes e Lote de HASHs/Máquinas.
   Antes o app tentava ADIVINHAR se o SN estava sendo bipado ou digitado pela
   velocidade das teclas — isso é instável (varia de leitor pra leitor).
   Agora são dois modos explícitos que você escolhe:
   - 📡 Bipar: o leitor de código de barras manda "Enter" sozinho ao fim de
     cada leitura — só confia nisso, confirma na hora e mantém o foco pronto
     pro próximo bipe.
   - ⌨️ Digitar: digitação manual, sem nada automático — só confirma com
     Enter ou clicando no botão "+".
*/
// Guarda a lista de itens bipados no localStorage enquanto o usuário
// continua bipando — se a página recarregar (queda de conexão, F5 sem
// querer, etc.) o progresso do lote não se perde. Só é apagado de verdade
// quando o formulário fecha normalmente (salvou ou cancelou).
function usePersistedBatch(key,initial){
  const[val,setVal]=useState(()=>{
    try{const saved=localStorage.getItem("batch:"+key);return saved?JSON.parse(saved):initial}catch{return initial}
  });
  useEffect(()=>{
    try{
      if(Array.isArray(val)&&val.length===0)localStorage.removeItem("batch:"+key);
      else localStorage.setItem("batch:"+key,JSON.stringify(val));
    }catch{}
  },[val,key]);
  const clear=()=>{try{localStorage.removeItem("batch:"+key)}catch{}};
  return[val,setVal,clear];
}

function SmartScanInput({onDetect,placeholder,autoFocus,disabled,count}){
  const[mode,setMode]=useState("scan");
  const[val,setVal]=useState("");
  const[localCount,setLocalCount]=useState(0);
  const inputRef=useRef();
  const commit=()=>{
    const s=val.trim();
    if(!s)return;
    onDetect(s,mode==="scan");
    setLocalCount(c=>c+1);
    setVal("");
    if(mode==="scan")setTimeout(()=>inputRef.current?.focus(),30);
  };
  const handleKeyDown=e=>{if(e.key==="Enter"){e.preventDefault();commit()}};
  const shownCount=count!==undefined?count:localCount;
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <div style={{display:"flex",gap:6,flex:1}}>
        <button type="button" onClick={()=>setMode("scan")} style={{flex:1,background:mode==="scan"?C.blue:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>📡 Bipar</button>
        <button type="button" onClick={()=>setMode("manual")} style={{flex:1,background:mode==="manual"?C.accent:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>⌨️ Digitar</button>
      </div>
      <div style={{background:C.accent,color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:900,whiteSpace:"nowrap",marginLeft:8,flexShrink:0}}>{shownCount} bipado(s)</div>
    </div>
    <div style={{display:"flex",gap:8}}>
      <input ref={inputRef} value={val} onChange={e=>setVal(e.target.value.toUpperCase())} onKeyDown={handleKeyDown} placeholder={mode==="scan"?"Aponte o leitor e bipe...":(placeholder||"Digite o SN...")} autoFocus={autoFocus} disabled={disabled} style={{...inp,flex:1}}/>
      {mode==="manual"&&<button type="button" onClick={commit} style={{background:C.accent,border:"none",color:"#fff",borderRadius:8,padding:"0 18px",cursor:"pointer",fontWeight:900,fontSize:16}}>+</button>}
    </div>
    {mode==="scan"&&<div style={{color:C.muted,fontSize:10,marginTop:4}}>O leitor confirma sozinho ao terminar de bipar (ele já manda Enter)</div>}
  </div>;
}

/* ═══ PHOTO ═════════════════════════════════════════════════════ */
function PhotoCapture({label,photoKey,onChange,folder="photos",required,snHint,onUploadFail}){
  const[src,setSrc]=useState(null),[up,setUp]=useState(false);const ref=useRef();
  useEffect(()=>{if(!photoKey){setSrc(null);return}if(photoKey.startsWith("http")||photoKey.startsWith("data:"))setSrc(photoKey);else setSrc(localStorage.getItem("ph:"+photoKey))},[photoKey]);
  const[failed,setFailed]=useState(false);
  const pick=async f=>{
    setUp(true);setFailed(false);onUploadFail?.(false);
    const b64=await compress(f);
    setSrc(b64); // mostra a prévia na hora, mas não salva isso no banco
    const cleanSN=(snHint||"").replace(/[^a-zA-Z0-9]/g,"");
    const filename=cleanSN?`${folder}/${cleanSN}_${uid()}.jpg`:`${folder}/${uid()}.jpg`;
    const url=await uploadPhoto(b64,filename);
    if(url){onChange(url)}
    else{
      // Nunca salva a foto em base64 direto no banco — isso lotaria o Supabase.
      // Se o Drive falhar, avisa e deixa sem foto (o aviso 🛡️ já mostra o erro).
      // E avisa o formulário todo pra não deixar salvar sem a foto, mesmo
      // em telas onde a foto normalmente é opcional — enquanto o Drive
      // estiver com problema, ninguém quer salvar "sem querer" sem foto.
      setFailed(true);setSrc(null);onChange(null);onUploadFail?.(true);
    }
    setUp(false);
  };
  return<div style={{marginBottom:14}}>{label&&<div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>{label}{required&&<span style={{color:C.red}}> *</span>}</div>}{up&&<div style={{color:C.amber,fontSize:12,marginBottom:6}}>⏳ Enviando pro Drive...</div>}{failed&&<div style={{color:C.red,fontSize:12,marginBottom:6}}>✗ Não consegui enviar a foto pro Drive. Confere a conexão e tenta de novo (não salva no banco pra não lotar).</div>}{src?<div style={{position:"relative"}}><img src={src} alt="" style={{width:"100%",borderRadius:10,maxHeight:220,objectFit:"cover"}}/><button onClick={()=>{deleteDrivePhoto(src);setSrc(null);onChange(null)}} style={{position:"absolute",top:6,right:6,background:C.red,border:"none",color:"#fff",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontWeight:700}}>✕</button></div>:<div style={{display:"flex",gap:8}}><button onClick={()=>ref.current.click()} style={{flex:1,background:C.bg,border:`2px dashed ${C.border}`,color:C.muted,borderRadius:10,padding:16,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>📷 {required?"(Obrigatória)":"Foto"}</button><button onClick={async()=>{try{const items=await navigator.clipboard.read();for(const item of items){const type=item.types.find(t=>t.startsWith("image/"));if(type){const blob=await item.getType(type);const file=new File([blob],"paste.jpg",{type});await pick(file);return}}alert("Nenhuma imagem no clipboard")}catch{alert("Copie uma imagem (print screen) e toque Colar")}}} style={{background:C.card2,border:`1px solid ${C.border}`,color:C.blue,borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}} title="Colar print">📋 Colar</button></div>}<input ref={ref} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={e=>e.target.files[0]&&pick(e.target.files[0])}/></div>;
}
function PhotoView({photoKey,style}){
  const[src,setSrc]=useState(null),[big,setBig]=useState(false);
  useEffect(()=>{if(!photoKey)return;if(photoKey.startsWith("http")||photoKey.startsWith("data:"))setSrc(photoKey);else setSrc(localStorage.getItem("ph:"+photoKey))},[photoKey]);
  if(!src)return null;
  return<>
    <div style={{position:"relative"}}>
      <img src={src} alt="" onClick={()=>setBig(true)} style={{width:"100%",borderRadius:8,objectFit:"cover",cursor:"zoom-in",...style}}/>
      <button onClick={()=>downloadPhoto(src,"foto.jpg")} title="Baixar" style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.6)",border:"none",color:"#fff",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:14}}>⬇️</button>
    </div>
    {big&&<div onClick={()=>setBig(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}>
      <img src={src} alt="" style={{maxWidth:"100%",maxHeight:"100%",borderRadius:8,objectFit:"contain"}}/>
      <button onClick={e=>{e.stopPropagation();setBig(false)}} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:20,fontWeight:900}}>✕</button>
    </div>}
  </>;
}

/* ═══ REPORT ════════════════════════════════════════════════════ */
function generateReport(user,repairs,tests,date){
  const dr=repairs.filter(r=>(r.employeeId===user._id||r._by===user._id)&&r.date===date&&r.type!=="already_good");
  const dg=repairs.filter(r=>(r.employeeId===user._id||r._by===user._id)&&r.date===date&&r.type==="already_good");
  const dt=tests.filter(t=>(t.employeeId===user._id||t._by===user._id)&&t.date===date);
  const d=new Date(date+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit",year:"numeric"});
  const lines=[`📋 Relatório — ${user.name} #${user.code}`,`📅 ${d}`,``];
  if(dr.length){lines.push(`🔧 HASHs Consertadas (${dr.length}):`);dr.forEach(r=>{let obs="";if(r.boardChips)obs+=` | Chips placa:${r.boardChips}`;if(r.chips)obs+=` | Chips trocados:${r.chips}`;if(r.sensores)obs+=` | Sens:${r.sensores}`;if(r.ldos)obs+=` | LDOs:${r.ldos}`;if(r.obsManual)obs+=` | ${r.obsManual}`;const tipo=r.type==="rework"?"🔁 RETRABALHO":"🔧 Conserto";lines.push(`• [${tipo}] ${r.hashSN||"SEM SN"} — ${r.model}${obs} — ${fmtTime(r._at)}`)});lines.push("")}
  if(dg.length){lines.push(`✅ Já Estavam Boas (${dg.length}):`);dg.forEach(r=>lines.push(`• ${r.hashSN||"SEM SN"} — ${r.model} — ${fmtTime(r._at)}`));lines.push("")}
  if(dt.length){lines.push(`🧪 Máquinas Testadas (${dt.length}):`);dt.forEach(t=>{const st=t.status==="pending"?"Aguard. Revisão":t.status==="rejected"?"REPROVADA":t.overallResult==="good"?"BOA":"RUIM";lines.push(`• ${t.machineSN||"SEM SN"} — ${t.model} — ${st} — ${fmtTime(t._at)}`)});lines.push("")}
  const nRework=dr.filter(r=>r.type==="rework").length;
  const nRepair=dr.length-nRework;
  lines.push(`✅ Total consertos: ${nRepair}${nRework?` + ${nRework} retrabalho(s)`:""} | Testes: ${dt.length}`);
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
  const[data,setData]=useState({employees:[],machines:[],hashes:[],repairs:[],tests:[],feedbacks:[],approvals:[],customModels:[],pallets:[],clients:[],shipments:[],loadPhotos:[]});
  const[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[tab,setTab]=useState("home"),[modal,setModal]=useState(null),[camOpen,setCamOpen]=useState(false);
  const[theme,setTheme]=useState(()=>localStorage.getItem("hs_theme")||"dark");
  Object.assign(C,theme==="dark"?DARK_THEME:LIGHT_THEME); // muda os valores no MESMO objeto C
  const toggleTheme=()=>{const next=theme==="dark"?"light":"dark";localStorage.setItem("hs_theme",next);setTheme(next)};
  const DEFAULT_WEBHOOK_URL="https://script.google.com/macros/s/AKfycbxZ1WpUhjvKWYEUAvQdaRHuu-mb1WLorVMOreihxvSJlMrddJYa-U1obUlu5tGtRjBv/exec";
  const[webhookUrl,setWebhookUrl]=useState(()=>localStorage.getItem("webhookUrl")||DEFAULT_WEBHOOK_URL);
  const setCol=(col,val)=>setData(d=>({...d,[col]:val}));
  const mutate=(col,fn)=>setData(d=>({...d,[col]:fn(d[col])}));
  const allModels=useCallback(()=>[...DEF_MODELS,...data.customModels].sort((a,b)=>a.m.localeCompare(b.m)),[data.customModels]);
  const gTH=useCallback(m=>{const f=[...DEF_MODELS,...data.customModels].find(x=>x.m===m);return f?.th||0},[data.customModels]);
  const gChips=useCallback((m,material)=>{
    if(material){const exact=data.customModels.find(x=>x.m===m&&x.material===material&&x.chips);if(exact)return exact.chips}
    const f=data.customModels.find(x=>x.m===m&&x.chips);return f?.chips||null;
  },[data.customModels]);
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
  // Chamado depois de uma exclusão DE PROPÓSITO (ex: limpar duplicatas na
  // comparação com a planilha) — avisa a blindagem que o número novo (menor)
  // é legítimo, pra ela não ficar "protegendo" dados que já foram apagados
  // de verdade e acabar restaurando eles na tela.
  const resetMaxCount=(col,newCount)=>{localStorage.setItem("hs_maxcount_"+col,String(newCount))};

  // Mapeia a chave usada em markChanged() para o nome real da coleção no Firestore
  const META_TO_COL={machines:"machines",hashes:"hashes",repairs:"repairs",tests:"tests",feedbacks:"feedbacks",approvals:"pendingApprovals",customModels:"customModels",pallets:"pallets",clients:"clients",shipments:"shipments",loadPhotos:"loadPhotos"};
  const fetchAllCollections=async(onlyKeys)=>{
    const allCols=["machines","hashes","repairs","tests","feedbacks","pendingApprovals","customModels","pallets","clients","shipments","loadPhotos"];
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
        pallets:merge("pallets",out.pallets),
        clients:merge("clients",out.clients),
        loadPhotos:out.loadPhotos!==undefined?(out.loadPhotos.length?out.loadPhotos:prev.loadPhotos):prev.loadPhotos,
      };
      if(next.machines.length)localStorage.setItem("hs_machines",JSON.stringify(next.machines));
      if(next.hashes.length)localStorage.setItem("hs_hashes",JSON.stringify(next.hashes));
      if(next.pallets.length)localStorage.setItem("hs_pallets",JSON.stringify(next.pallets));
      if(next.clients.length)localStorage.setItem("hs_clients",JSON.stringify(next.clients));
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
        pallets:JSON.parse(localStorage.getItem("hs_pallets")||"[]"),
        clients:JSON.parse(localStorage.getItem("hs_clients")||"[]"),
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
      const cachedP=JSON.parse(localStorage.getItem("hs_pallets")||"[]");
      const cachedC=JSON.parse(localStorage.getItem("hs_clients")||"[]");
      const gM=guardCount("machines",out.machines,cachedM);
      const gH=guardCount("hashes",out.hashes,cachedH);
      const gP=guardCount("pallets",out.pallets,cachedP);
      const gC=guardCount("clients",out.clients,cachedC);
      const warnings=[...errs,gM.warn,gH.warn,gP.warn,gC.warn].filter(Boolean);
      setData(d=>({
        ...d,
        machines:gM.use.length?gM.use:cachedM,
        hashes:gH.use.length?gH.use:cachedH,
        repairs:out.repairs.length?out.repairs:d.repairs,
        tests:out.tests.length?out.tests:d.tests,
        feedbacks:out.feedbacks.length?out.feedbacks:d.feedbacks,
        approvals:out.pendingApprovals.length?out.pendingApprovals:d.approvals,
        customModels:out.customModels.length?out.customModels:d.customModels,
        pallets:gP.use.length?gP.use:cachedP,
        clients:gC.use.length?gC.use:cachedC,
        loadPhotos:out.loadPhotos.length?out.loadPhotos:d.loadPhotos,
      }));
      if(gM.use.length)localStorage.setItem("hs_machines",JSON.stringify(gM.use));
      if(gH.use.length)localStorage.setItem("hs_hashes",JSON.stringify(gH.use));
      if(gP.use.length)localStorage.setItem("hs_pallets",JSON.stringify(gP.use));
      if(gC.use.length)localStorage.setItem("hs_clients",JSON.stringify(gC.use));
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
  useEffect(()=>{onSyncSheetError=(msg)=>setDataWarnings(w=>[{msg:"⚠️ "+msg,at:stamp()},...w].slice(0,20))},[]);
  // Supabase Realtime: qualquer mudança em qualquer tabela avisa todo mundo
  // na hora (substitui o polling de 15 em 15 minutos do Firebase). Como o
  // Supabase não cobra por leitura, não tem problema reler a coleção inteira
  // sempre que algo mudar.
  useEffect(()=>{
    const TABLE_TO_META={machines:"machines",hashes:"hashes",repairs:"repairs",tests:"tests",feedbacks:"feedbacks",pending_approvals:"approvals",custom_models:"customModels",pallets:"pallets",clients:"clients",shipments:"shipments",load_photos:"loadPhotos"};
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

  // Checagem diária automática: uma vez por dia (por navegador), se for
  // Admin, compara tudo com a planilha sozinho e guarda o resultado — sem
  // precisar abrir a tela de comparação manualmente.
  const[dailyDiff,setDailyDiff]=useState(null);
  const dailyCompareRunning=useRef(false);
  useEffect(()=>{
    if(!user)return;
    if(user.code!=="019")return;
    if(!data.machines.length&&!data.hashes.length)return; // ainda carregando
    const today=TODAY();
    if(localStorage.getItem("hs_lastDailyCompare")===today)return;
    if(dailyCompareRunning.current)return; // já tem uma rodando agora mesmo, não duplica
    dailyCompareRunning.current=true;
    localStorage.setItem("hs_lastDailyCompare",today); // marca ANTES de terminar — evita rodar de novo se a tela atualizar no meio do processo
    (async()=>{
      try{
        const result=await computeSheetDiffs(data,webhookUrl);
        if(result.total>0)setDailyDiff(result);
      }catch(e){console.error("Checagem diária com a planilha falhou:",e)}
      dailyCompareRunning.current=false;
    })();
  },[user,data.machines.length,data.hashes.length,webhookUrl]);

  const ctx={user,data,setCol,mutate,setModal,setTab,loadAll,webhookUrl,setWebhookUrl,allModels,gTH,gChips,dataWarnings,resetMaxCount};
  if(loading)return<Splash/>;
  if(!user&&data.employees.length===0)return<BootErrorScreen onRetry={bootLoad} warnings={dataWarnings}/>;
  if(!user)return<LoginPage employees={data.employees} onLogin={u=>{setUser(u);setTab("home")}}/>;

  const p=user.permissions||{};const isAdmin=p.admin;const isSuperAdmin=user.code==="019";
  const canSeeEmp=id=>isAdmin||(user.allowedEmployees||[]).includes(id);
  const pendingApprs=data.approvals.filter(a=>a.status==="pending");
  const myFdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===user._id);
  const myRevisit=data.machines.filter(m=>m.situacao==="REVISAR"&&m.lastTesterId===user._id);

  const TABS=[
    {id:"home",icon:"🏠",label:"Início"},
    ...(p.machines||isAdmin?[{id:"mac",icon:"🖥️",label:"Máquinas"}]:[]),
    ...(p.hashes||isAdmin?[{id:"hsh",icon:"⚡",label:"HASHs"}]:[]),
    ...(p.repairs?[{id:"conserto",icon:"🔧",label:"Conserto"}]:[]),
    ...(p.testing?[{id:"teste",icon:"🧪",label:"Teste"}]:[]),
    ...((p.repairs||p.testing)&&!isAdmin?[{id:"hist",icon:"📋",label:"Histórico"}]:[]),
    ...(p.machines||p.hashes||isAdmin?[{id:"pal",icon:"📦",label:"Paletes"}]:[]),...(isAdmin?[{id:"cli",icon:"👥",label:"Clientes"}]:[]),...(isAdmin?[{id:"approvals",icon:"✅",label:"Revisão"},{id:"team",icon:"👷",label:"Equipe"}]:[]),...(isSuperAdmin?[{id:"cfg",icon:"⚙️",label:"Config"}]:[]),
  ];

  return<div style={{background:C.bg,minHeight:"100vh",fontFamily:"'Inter',system-ui,sans-serif",color:C.text,maxWidth:960,margin:"0 auto"}}>
    <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:20}}>⛏️</span>
      <div style={{flex:1}}><div style={{fontWeight:900,fontSize:14,color:C.accent}}>HashStock</div><div style={{fontSize:10,color:C.muted}}>{user.name} #{user.code}{syncing?" · 🔄":""}</div></div>
      <div style={{display:"flex",gap:6}}>
        {myFdbs.length>0&&<Tag color={C.red}>⚠️{myFdbs.length}</Tag>}
        {myRevisit.length>0&&<Tag color={C.red}>🔁{myRevisit.length}</Tag>}
        {isAdmin&&pendingApprs.length>0&&<Tag color={C.blue}>✅{pendingApprs.length}</Tag>}
        {isSuperAdmin&&dataWarnings.length>0&&<Tag color={C.red} title="Avisos de integridade de dados">🛡️{dataWarnings.length}</Tag>}
      </div>
      <button onClick={toggleTheme} title="Trocar tema" style={{background:C.card2,border:"none",color:C.subtle,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:14,marginRight:6}}>{theme==="dark"?"☀️":"🌙"}</button>
      <button onClick={()=>{setUser(null);setTab("home")}} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:8,padding:"5px 10px",cursor:"pointer",fontSize:12}}>Sair</button>
    </div>
    {isSuperAdmin&&dataWarnings.length>0&&<div style={{background:"#2a0c0c",borderBottom:`1px solid ${C.red}`,padding:"8px 16px",fontSize:11,color:"#ff9b9b"}}>🛡️ {dataWarnings[0].msg} <span style={{color:C.muted}}>· ver mais em Config</span></div>}
    {isSuperAdmin&&dailyDiff&&<div onClick={()=>{setDailyDiff(null);setModal(<Modal title="🔄 Comparar com a Planilha" onClose={()=>setModal(null)}><SheetCompareReview ctx={ctx} onClose={()=>setModal(null)}/></Modal>)}} style={{background:"#2a1a0c",borderBottom:`1px solid ${C.amber}`,padding:"8px 16px",fontSize:11,color:C.amber,cursor:"pointer"}}>🔄 Checagem diária: {dailyDiff.total} diferença(s) entre o app e a planilha — toque pra ver e resolver</div>}
    <div style={{padding:"14px 12px 100px"}}>
      {tab==="home"&&<HomePage ctx={ctx} isAdmin={isAdmin} myFdbs={myFdbs} myRevisit={myRevisit} pendingApprs={pendingApprs} canSeeEmp={canSeeEmp}/>}
      {tab==="mac"&&(p.machines||isAdmin)&&<MacPage ctx={ctx}/>}
      {tab==="hsh"&&(p.hashes||isAdmin)&&<HashPage ctx={ctx}/>}
      {tab==="conserto"&&p.repairs&&<ConsertaPage ctx={ctx}/>}
      {tab==="teste"&&p.testing&&<TestePage ctx={ctx}/>}
      {tab==="hist"&&(p.repairs||p.testing)&&!isAdmin&&<HistPage ctx={ctx} canSeeEmp={canSeeEmp}/>}
      {tab==="pal"&&(p.machines||p.hashes||isAdmin)&&<SafeTab><PalletsPage ctx={ctx}/></SafeTab>}{tab==="cli"&&isAdmin&&<SafeTab><ClientesPage ctx={ctx}/></SafeTab>}{tab==="approvals"&&isAdmin&&<ApprovalsPage ctx={ctx}/>}
      {tab==="team"&&isAdmin&&<TeamPage ctx={ctx} canSeeEmp={canSeeEmp}/>}
      {tab==="cfg"&&isSuperAdmin&&<CfgPage ctx={ctx}/>}
    </div>
    <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:960,background:C.card,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100}}>
      {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",padding:"8px 2px 12px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:tab===t.id?C.accent:C.muted}}><span style={{fontSize:17}}>{t.icon}</span><span style={{fontSize:8,fontWeight:800}}>{t.label}</span></button>)}
    </nav>
    <button onClick={()=>setCamOpen(true)} style={{position:"fixed",right:16,bottom:72,width:52,height:52,borderRadius:"50%",background:C.accent,border:"none",cursor:"pointer",fontSize:22,zIndex:99,boxShadow:"0 4px 16px rgba(249,115,22,.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>📷</button>
    {camOpen&&<CamModal ctx={ctx} onClose={()=>setCamOpen(false)}/>}
    {modal&&injectFreshCtx(modal,ctx)}
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
    {result&&<div style={{background:C.bg,borderRadius:12,padding:16}}>
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
function QMacEdit({item,ctx,onUpdate}){const{mutate,user}=ctx;const save=async s=>{const u={...item,situacao:s,...audit(user)};mutate("machines",m=>m.map(x=>x._id===item._id?u:x));await fbSet("machines",item._id,u);await markChanged("machines");onUpdate(u)};return<div><div style={{fontWeight:800,fontSize:15,color:C.accent}}>🖥️ {item.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12,marginBottom:8}}>{item.model} · {item.type==="shell"?"Carcaça":"Completa"}</div><SP s={item.situacao}/><div style={{marginTop:10}}><SL>SITUAÇÃO</SL><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{SIT_OPTS.map(s=><button key={s} onClick={()=>save(s)} style={{background:item.situacao===s?SIT_C[s]:C.card2,color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>)}</div></div><By by={item._byName} at={item._at}/></div>}
function QHashEdit({item,ctx,onUpdate,photoKey}){
  const{mutate,user}=ctx;
  const save=async s=>{const u={...item,status:s,...audit(user)};mutate("hashes",h=>h.map(x=>x._id===item._id?u:x));await fbSet("hashes",item._id,u);await markChanged("hashes");onUpdate(u)};
  const updateSN=async()=>{if(!item._pendingSN)return;const u={...item,sn:item._pendingSN,...audit(user),_pendingSN:undefined};mutate("hashes",h=>h.map(x=>x._id===item._id?u:x));await fbSet("hashes",item._id,u);await markChanged("hashes");onUpdate(u)};
  return<div>
    <div style={{fontWeight:800,fontSize:15,color:C.blue}}>⚡ {item.sn||"SEM SN"}</div>
    <div style={{color:C.muted,fontSize:12,marginBottom:8}}>{item.model}</div>
    <HP s={item.status}/>
    {!item.sn&&<div style={{marginTop:8}}><Inp label="ADICIONAR SN" value={item._pendingSN||""} onChange={e=>onUpdate({...item,_pendingSN:e.target.value.toUpperCase()})} placeholder="Digite o SN"/><Btn v="g" onClick={updateSN} style={{width:"100%",marginBottom:8}}>✓ Vincular SN</Btn></div>}
    <div style={{marginTop:10}}><SL>STATUS</SL><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{HST_OPTS.map(s=><button key={s} onClick={()=>save(s)} style={{background:item.status===s?HST_C[s]:C.card2,color:"#fff",border:"none",borderRadius:6,padding:"4px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>)}</div></div>
    <By by={item._byName} at={item._at}/>
  </div>;
}

/* ═══ HOME ══════════════════════════════════════════════════════ */
// Fila de placas que saíram do conserto e estão esperando teste — pro Admin
// que não tem a permissão de Teste marcada, mas quer dar uma olhada de vez
// em quando. Fica ESCONDIDA por padrão, só aparece se ele clicar no olho.
function AdminTestQueuePeek({data}){
  const[open,setOpen]=useState(false);
  const toTest=data.hashes.filter(h=>h.status==="TESTAR");
  return<div style={{marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
      <div style={{fontWeight:800,fontSize:14}}>⏳ Fila de Teste (placas do conserto)</div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}><Tag color={toTest.length>0?C.amber:C.card2}>{toTest.length}</Tag><span style={{fontSize:16}}>{open?"🙈":"👁️"}</span></div>
    </div>
    {open&&<div style={{marginTop:10}}>
      {toTest.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Fila vazia</div>:toTest.map(h=>{
        const rep=data.employees.find(e=>e._id===h.repairedBy);const repName=rep?.name||h.repairedByName;
        return<div key={h._id} style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:8}}>
          <div style={{fontWeight:700,fontSize:13,color:C.blue}}>⚡ {h.sn||"SEM SN"}</div>
          <div style={{fontSize:11,color:C.muted}}>{h.model}{repName?` · consertada por 👷 ${repName}`:""}</div>
        </div>;
      })}
    </div>}
  </div>;
}

function HomePage({ctx,isAdmin,myFdbs,myRevisit,pendingApprs}){
  const{user,data,setTab}=ctx;const today=TODAY();
  const toTest=data.hashes.filter(h=>h.status==="TESTAR");
  const myRejectedHashes=(data.approvals||[]).filter(a=>a.type==="hashBad"&&a.status==="rejected"&&(a.employeeId===user._id||a._by===user._id));
  return<div>
    <div style={{fontWeight:900,fontSize:22,marginBottom:4}}>Olá, {user.name.split(" ")[0]} 👋</div>
    <div style={{color:C.muted,fontSize:12,marginBottom:18}}>#{user.code} · {new Date().toLocaleDateString("pt-BR",{weekday:"long"})}</div>
    {isAdmin&&pendingApprs.length>0&&<Card accent={C.blue} onClick={()=>setTab("approvals")} style={{marginBottom:14}}><div style={{fontWeight:800,color:C.blue,fontSize:15}}>✅ {pendingApprs.length} máquina(s) aguardando revisão</div><div style={{fontSize:12,color:C.muted,marginTop:4}}>Toque para revisar e autorizar</div></Card>}
    {!isAdmin&&myFdbs.length>0&&<div style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>⚠️ Para Re-consertar ({myFdbs.length})</div>{myFdbs.map(f=><Card key={f._id} accent={C.red}><div style={{fontWeight:800,color:C.red}}>⚡ {f.hashSN||"SEM SN"}</div><div style={{fontSize:12,marginTop:4}}>{f.notes||"Ver log"}</div><By by={f._byName} at={f._at}/>{f.logPhotoKey&&<PhotoView photoKey={f.logPhotoKey} style={{marginTop:8,maxHeight:100}}/>}</Card>)}</div>}
    {!isAdmin&&myRevisit.length>0&&<div style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>🔁 Para Revisar ({myRevisit.length})</div>{myRevisit.map(m=><Card key={m._id} accent={C.red}><div style={{fontWeight:800}}>🖥️ {m.sn||"SEM SN"} — {m.model}</div><div style={{fontSize:12,color:C.red,marginTop:4}}>{m.adminNote||"Admin solicitou revisão"}</div></Card>)}</div>}
    {!isAdmin&&myRejectedHashes.length>0&&<div style={{marginBottom:16}}><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>❌ HASHs Recusadas ({myRejectedHashes.length})</div>{myRejectedHashes.map(a=><Card key={a._id} accent={C.red}><div style={{fontWeight:800,color:C.red}}>⚡ {a.sn}{a.machineSN?` (na máquina ${a.machineSN})`:""}</div>{a.notes&&<div style={{fontSize:12,marginTop:4}}>📝 {a.notes}</div>}</Card>)}</div>}
    {user.permissions?.testing&&!isAdmin&&<div style={{marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontWeight:800,fontSize:14}}>⏳ Para Testar</div><Tag color={toTest.length>0?C.amber:C.card2}>{toTest.length}</Tag></div>{toTest.slice(0,3).map(h=>{const rep=data.employees.find(e=>e._id===h.repairedBy);const repName=rep?.name||h.repairedByName;return<div key={h._id} style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700,fontSize:13,color:C.blue}}>⚡ {h.sn||"SEM SN"}</div><div style={{fontSize:11,color:C.muted}}>{h.model}{repName?` · 👷 ${repName}`:""}</div></div><HP s={h.status}/></div>})}<Btn v="g" onClick={()=>setTab("teste")} style={{width:"100%",justifyContent:"center",marginTop:8}}>🧪 Iniciar Teste</Btn></div>}
    {isAdmin&&<AdminTestQueuePeek data={data}/>}
    {isAdmin&&<AdminSummary data={data}/>}
    <div style={{marginTop:16}}><Btn v="s" onClick={()=>copyReport(user,data.repairs,data.tests,today)} style={{width:"100%",justifyContent:"center"}}>📋 Copiar Relatório do Dia</Btn></div>
  </div>;
}
function AdminSummary({data}){
  const today=TODAY();const ms={};
  data.machines.forEach(m=>{if(!ms[m.model])ms[m.model]={model:m.model,boa:0,stock:0,ruim:0,shell:0,conserto:0};if(m.type==="shell")ms[m.model].shell++;else if(["BOA","LIGADA"].includes(m.situacao))ms[m.model].boa++;else if(m.situacao==="STOCK")ms[m.model].stock++;else if(m.situacao==="ENTRADA OFICINA")ms[m.model].conserto++;else ms[m.model].ruim++});
  const irrep=data.hashes.filter(h=>h.status==="IRREPARAVEL").length;
  return<><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>{[{label:"Máquinas",v:data.machines.filter(m=>m.type==="complete").length,sub:`${data.machines.filter(m=>["BOA","STOCK"].includes(m.situacao)).length} ok`,c:C.accent},{label:"HASHs",v:data.hashes.length,sub:`${data.hashes.filter(h=>h.status==="TESTAR").length} p/ testar · ${irrep} irrep.`,c:C.blue},{label:"Consertos Hoje",v:data.repairs.filter(r=>r.date===today&&r.type!=="already_good").length,sub:"HASHs",c:C.green},{label:"Testes Hoje",v:data.tests.filter(t=>t.date===today).length,sub:"máquinas",c:C.purple}].map(s=><Card key={s.label} accent={s.c} style={{margin:0}}><div style={{fontSize:26,fontWeight:900,color:s.c}}>{s.v}</div><div style={{fontWeight:700,fontSize:12,marginTop:4}}>{s.label}</div><div style={{fontSize:10,color:C.muted}}>{s.sub}</div></Card>)}</div>
  <Card><div style={{fontWeight:800,fontSize:14,marginBottom:10}}>📊 Por Modelo</div>{Object.values(ms).sort((a,b)=>(b.boa+b.ruim+b.stock)-(a.boa+a.ruim+a.stock)).map(s=><div key={s.model} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><div style={{fontWeight:700,fontSize:13}}>{s.model}</div><div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>{s.boa>0&&<Tag color={C.green} small>{s.boa} boas</Tag>}{s.stock>0&&<Tag color={C.amber} small>{s.stock} stock</Tag>}{s.ruim>0&&<Tag color={C.red} small>{s.ruim} ruins</Tag>}{s.shell>0&&<Tag color="#475569" small>{s.shell} carc.</Tag>}{s.conserto>0&&<Tag color={C.amber} small>{s.conserto} cons.</Tag>}</div></div>)}</Card></>;
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
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allModelsUsed.map(mo=><button key={mo} onClick={()=>toggleModel(mo)} style={{background:modelFilters.has(mo)?C.accent:C.card2,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{mo}</button>)}</div>
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
      for(const m of machines){
        const forceOn=sit==="BOA";
        const u={...m,situacao:sit,...(forceOn?{hash0:"ON",hash1:"ON",hash2:"ON",controladora:"ON",fonte:"ON",fans:"ON"}:{}),changeLog:[{field:"situacao",label:"Situação",from:m.situacao,to:sit,by:user.name,at:stamp()},...(m.changeLog||[])].slice(0,80),...audit(user)};
        mutate("machines",arr=>arr.map(x=>x._id===m._id?u:x));await fbSet("machines",m._id,u);
        syncSheet(webhookUrl,"updateMachine",{sn:u.sn,field:"situacao",to:sit,employeeName:user.name,employeeCode:user.code});
        if(forceOn){["hash0","hash1","hash2","controladora","fonte","fans"].forEach(k=>syncSheet(webhookUrl,"updateMachine",{sn:u.sn,field:k,to:"ON",employeeName:user.name,employeeCode:user.code}))}
      }
      await markChanged("machines");
    }else if(action==="pallet"&&palletId){
      const pl=data.pallets.find(p=>p._id===palletId);if(pl){const sns=machines.map(m=>m.sn).filter(Boolean);const ns=[...new Set([...(pl.machinesSN||[]),...sns])];const upd={...pl,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===palletId?upd:x));await fbSet("pallets",palletId,upd);await markChanged("pallets")}
    }else if(action==="client"&&clientId){
      const cl=data.clients.find(c=>c._id===clientId);if(cl){
        const sns=machines.map(m=>m.sn).filter(Boolean);
        for(const m of machines){const mHashes=data.hashes.filter(h=>h.machineSN===m.sn);for(const h of mHashes){const uh={...h,status:"SAIDA",location:"Vendida: "+cl.name,...audit(user)};mutate("hashes",arr=>arr.map(x=>x._id===h._id?uh:x));await fbSet("hashes",h._id,uh);syncSheet(webhookUrl,"hashSaida",{sn:uh.sn,machineSN:m.sn,employeeName:user.name,employeeCode:user.code})}const um={...m,situacao:"SAIDA",destino:cl.name,...audit(user)};mutate("machines",arr=>arr.map(x=>x._id===m._id?um:x));await fbSet("machines",m._id,um);syncSheet(webhookUrl,"machineToClient",{sn:m.sn,destino:cl.name,employeeName:user.name,employeeCode:user.code})}
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
  const[model,setModel]=useState(models[0]?.m||"M30S"),[th,setTh]=useState(gTH(models[0]?.m||"M30S")),[type,setType]=useState("complete"),[sit,setSit]=useState("STOCK"),[ref,setRef]=useState(user.code),[ctr,setCtr]=useState("OFF"),[fonte,setFonte]=useState("OFF"),[fans,setFans]=useState("OFF"),[hash0,setHash0]=useState("OFF"),[hash1,setHash1]=useState("OFF"),[hash2,setHash2]=useState("OFF"),[pending,setPending,clearPending]=usePersistedBatch("machines-lote",[]),[saving,setSaving]=useState(false);
  const addSN=(raw)=>{
    const s=raw.toUpperCase().trim();if(!s)return;
    if(pending.some(p=>p.sn===s))return;
    const ex=data.machines.find(m=>m.sn===s);
    // Se já existe, ainda adiciona no lote — mas marcado como "atualizar
    // existente" e mostrando o status/cliente atual, em vez de bloquear.
    setPending(p=>[...p,{sn:s,existing:ex||null}]);
  };
  const saveAll=async()=>{
    if(!pending.length)return;setSaving(true);
    const writes=pending.map(p=>{
      const isUpdate=!!p.existing;const id=isUpdate?p.existing._id:uid();
      return{c:"machines",id,d:{sn:p.sn,model,th:Number(th),type,situacao:sit,hash0,hash1,hash2,controladora:ctr,fonte,fans,ref,location:"",...audit(user),addedAt:TODAY(),destino:""}};
    });
    await fbBatch(writes);
    mutate("machines",m=>{
      const updIds=new Set(writes.filter((w,i)=>pending[i].existing).map(w=>w.id));
      const kept=m.filter(x=>!updIds.has(x._id));
      return[...kept,...writes.map(w=>({...w.d,_id:w.id}))];
    });
    await markChanged("machines");
    writes.forEach(w=>{
      syncSheet(webhookUrl,"addMachine",{sn:w.d.sn,model:w.d.model,th:w.d.th,situacao:w.d.situacao,ref,employeeName:user.name,employeeCode:user.code});
      syncSheet(webhookUrl,"updateMachine",{sn:w.d.sn,field:"destino",to:"",employeeName:user.name,employeeCode:user.code});
      ["hash0","hash1","hash2","controladora","fonte","fans"].forEach(k=>syncSheet(webhookUrl,"updateMachine",{sn:w.d.sn,field:k,to:w.d[k],employeeName:user.name,employeeCode:user.code}));
    });
    setSaving(false);clearPending();onClose();
  };
  return<div><div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div><Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:70}}/></div><div style={{display:"flex",gap:8}}><Sel label="TIPO" value={type} onChange={e=>setType(e.target.value)} style={{flex:1}}><option value="complete">Completa</option><option value="shell">Carcaça</option></Sel><Sel label="SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)} style={{flex:1}}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel></div><Inp label="Referência (REF, aplicada a todos)" value={ref} onChange={e=>setRef(e.target.value.toUpperCase())} placeholder="Ex: seu código, lote, etc."/>
  <div style={{color:C.muted,fontSize:11,marginBottom:6}}>As opções abaixo valem pra TODAS as máquinas desse lote:</div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
    {[["hash0","HASH 0",hash0,setHash0],["hash1","HASH 1",hash1,setHash1],["hash2","HASH 2",hash2,setHash2]].map(([k,l,v,setV])=><Sel key={k} label={l} value={v} onChange={e=>setV(e.target.value)} style={{marginBottom:0}}>{CTR_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>)}
  </div>
  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
    {[["ctr","CTR",ctr,setCtr],["fonte","FONTE",fonte,setFonte],["fans","FANS",fans,setFans]].map(([k,l,v,setV])=><Sel key={k} label={l} value={v} onChange={e=>setV(e.target.value)} style={{marginBottom:0}}>{CTR_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>)}
  </div>
  <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}><SL>BIPAR OU DIGITAR</SL><SmartScanInput onDetect={addSN} placeholder="SN..." autoFocus count={pending.length}/><div style={{maxHeight:220,overflow:"auto",marginTop:8}}>{pending.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN</div>:pending.map((p,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:13,fontFamily:"monospace",color:p.existing?C.amber:C.blue}}>{p.sn}</span>
      <button onClick={()=>setPending(pending.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button>
    </div>
    {p.existing&&<div style={{fontSize:11,color:C.amber,marginTop:2}}>⚠️ Já existe ({p.existing.model} · {p.existing.situacao}){p.existing.destino?<> · 👤 foi pro cliente <b>{p.existing.destino}</b></>:""} — vai atualizar essa máquina</div>}
  </div>)}</div></div><div style={{display:"flex",gap:8}}><Btn v="s" onClick={()=>{clearPending();onClose()}} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={saveAll} disabled={saving||!pending.length} style={{flex:1}}>{saving?"...":"💾 Salvar "+pending.length}</Btn></div></div>;
}

function BatchNoSNForm({ctx,onClose}){
  const{data,mutate,user,allModels,gTH,webhookUrl}=ctx;const models=allModels();
  const[itemType,setItemType]=useState("machine"),[model,setModel]=useState(models[0]?.m||"M30S"),[th,setTh]=useState(gTH(models[0]?.m||"M30S")),[sit,setSit]=useState("STOCK"),[ref,setRef]=useState(user.code),[qty,setQty]=useState("10"),[saving,setSaving]=useState(false),[prog,setProg]=useState(0);
  const save=async()=>{const n=parseInt(qty);if(!n||n<1||n>1000)return;setSaving(true);const isHash=itemType==="hash";const writes=Array.from({length:n},()=>{const id=uid();const d=isHash?{sn:"",model,status:"REPARO",machineSN:"",slot:-1,location:"",...audit(user),addedAt:TODAY()}:{sn:"",model,th:Number(th),type:itemType==="shell"?"shell":"complete",situacao:sit,hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",ref,location:"",...audit(user),addedAt:TODAY(),destino:""};return{c:isHash?"hashes":"machines",id,d}});for(let i=0;i<writes.length;i+=500){await fbBatch(writes.slice(i,i+500));setProg(Math.min(i+500,writes.length))}mutate(isHash?"hashes":"machines",arr=>[...arr,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged(isHash?"hashes":"machines");syncSheet(webhookUrl,isHash?"addHashBatch":"addMachineBatch",{count:n,model,ref,employeeName:user.name,employeeCode:user.code});setSaving(false);onClose()};
  return<div><SL>TIPO</SL><div style={{display:"flex",gap:8,marginBottom:14}}>{[["machine","🖥️ Máq."],["shell","📦 Carc."],["hash","⚡ HASH"]].map(([v,l])=><button key={v} onClick={()=>setItemType(v)} style={{flex:1,background:itemType===v?C.accent:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div><div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div>{itemType!=="hash"&&<Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:70}}/>}</div>{itemType!=="hash"&&<Sel label="SITUAÇÃO" value={sit} onChange={e=>setSit(e.target.value)}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>}{itemType!=="hash"&&<Inp label="Referência (REF)" value={ref} onChange={e=>setRef(e.target.value.toUpperCase())} placeholder="Ex: seu código, lote, etc."/>}<Inp label="QUANTIDADE" type="number" value={qty} onChange={e=>setQty(e.target.value)} placeholder="Ex: 300"/>{saving&&<div style={{background:"#0c2a0f",borderRadius:8,padding:10,marginBottom:12}}><div style={{color:C.green,fontWeight:700,marginBottom:4}}>Salvando {prog}/{qty}...</div><div style={{background:C.card2,borderRadius:4,height:6}}><div style={{background:C.green,borderRadius:4,height:6,width:`${(prog/parseInt(qty||1))*100}%`,transition:"width .3s"}}/></div></div>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={save} disabled={saving} style={{flex:1}}>{saving?"...":"📦 Criar "+qty}</Btn></div></div>;
}

function AddMachineForm({ctx,onClose,initSN="",initPhoto=null}){
  const{data,mutate,user,allModels,gTH,webhookUrl}=ctx;const models=allModels();
  const[f,setF]=useState({sn:initSN,ref:user.code,model:models[0]?.m||"M30S",th:gTH(models[0]?.m||"M30S"),type:"complete",hash0:"OFF",hash1:"OFF",hash2:"OFF",hashSN0:"",hashSN1:"",hashSN2:"",controladora:"OFF",fonte:"OFF",fans:"OFF",situacao:"STOCK",destino:"",location:""});
  const[photoKey,setPhotoKey]=useState(initPhoto),[saving,setSaving]=useState(false),[confirmOverwrite,setConfirmOverwrite]=useState(false),[photoBlocked,setPhotoBlocked]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const dupMachine=f.sn.trim()?data.machines.find(m=>m.sn===f.sn.toUpperCase().trim()):null;
  const doSave=async(asNewSN)=>{
    setSaving(true);const isUpdate=!!dupMachine&&!asNewSN;const id=isUpdate?dupMachine._id:uid();
    const forceOn=f.situacao==="BOA";
    const finalSN=asNewSN?asNewSN:f.sn.toUpperCase().trim();
    const d={...f,th:Number(f.th),sn:finalSN,...(forceOn?{hash0:"ON",hash1:"ON",hash2:"ON",controladora:"ON",fonte:"ON",fans:"ON"}:{}),...audit(user),addedAt:TODAY(),photoKey:photoKey||""};
    await fbSet("machines",id,d);
    if(isUpdate)mutate("machines",m=>m.map(x=>x._id===id?{...d,_id:id}:x));
    else mutate("machines",m=>[...m,{...d,_id:id}]);
    await markChanged("machines");
    syncSheet(webhookUrl,"addMachine",{sn:d.sn,model:d.model,th:d.th,situacao:d.situacao,ref:d.ref,employeeName:user.name,employeeCode:user.code});
    // Sempre limpa o destino na planilha ao readicionar — a máquina volta
    // pro ciclo normal (o histórico dela no cliente continua existindo, só
    // não fica mais marcada como "saída" pra ele).
    syncSheet(webhookUrl,"updateMachine",{sn:d.sn,field:"destino",to:"",employeeName:user.name,employeeCode:user.code});
    // Sempre manda o ON/OFF de cada componente pra planilha — antes só ia
    // quando a situação era BOA (forceOn), então qualquer ON/OFF marcado
    // manualmente com outra situação nunca chegava na planilha.
    ["hash0","hash1","hash2","controladora","fonte","fans"].forEach(k=>syncSheet(webhookUrl,"updateMachine",{sn:d.sn,field:k,to:d[k],employeeName:user.name,employeeCode:user.code}));
    // Cria (se for nova) ou vincula (se já existir) a HASH de cada slot —
    // antes isso nunca acontecia, só ficava o texto do SN salvo na máquina,
    // sem criar a HASH nem mandar o SN pra planilha de verdade.
    for(let i=0;i<3;i++){
      const slotSN=(d[`hashSN${i}`]||"").trim();if(!slotSN)continue;
      const slotOn=d[`hash${i}`]==="ON";
      const existingHash=data.hashes.find(h=>h.sn===slotSN);
      if(existingHash){
        const hu={...existingHash,machineSN:d.sn,slot:i,status:slotOn?"NA MAQUINA":existingHash.status,...audit(user)};
        mutate("hashes",arr=>arr.map(x=>x._id===existingHash._id?hu:x));await fbSet("hashes",existingHash._id,hu);
      }else{
        const hid=uid();const hd={sn:slotSN,model:d.model,status:slotOn?"NA MAQUINA":"STOCK",machineSN:d.sn,slot:i,...audit(user),addedAt:TODAY()};
        await fbSet("hashes",hid,hd);mutate("hashes",arr=>[...arr,{...hd,_id:hid}]);
      }
      syncSheet(webhookUrl,"hashApproved",{sn:slotSN,model:d.model,machineSN:d.sn,slot:i,employeeName:user.name,employeeCode:user.code});
    }
    await markChanged("hashes");
    setSaving(false);onClose();
  };
  // Gera um SN "livre" (SN-2, SN-3...) quando o usuário confirma que são
  // duas máquinas físicas diferentes com o mesmo SN impresso (acontece).
  const nextFreeSN=()=>{
    const base=f.sn.toUpperCase().trim();let i=2;
    while(data.machines.find(m=>m.sn===`${base}-${i}`))i++;
    return`${base}-${i}`;
  };
  const save=()=>{if(dupMachine){setConfirmOverwrite(true);return}doSave()};
  return<div>
    <SNInput label="SN" value={f.sn} onChange={v=>{set("sn",v);setConfirmOverwrite(false)}} placeholder="Deixe vazio se não tiver"/>
    {dupMachine&&<div style={{background:"#3a0a0a",border:"1px solid "+C.red,borderRadius:10,padding:10,marginBottom:10}}>
      <div style={{color:C.red,fontWeight:800}}>⚠️ SN já existe no estoque!</div>
      <div style={{fontSize:12,color:C.muted,marginTop:2}}>{dupMachine.model} · <SP s={dupMachine.situacao}/></div>
      {dupMachine.destino&&<div style={{fontSize:12,color:C.purple,marginTop:2}}>👤 Foi pro cliente: <b>{dupMachine.destino}</b></div>}
    </div>}
    <Inp label="Referência (REF)" value={f.ref} onChange={e=>set("ref",e.target.value.toUpperCase())} placeholder="Ex: seu código, lote, etc."/>
    <div style={{display:"flex",gap:8}}><div style={{flex:2}}><Sel label="MODELO" value={f.model} onChange={e=>{set("model",e.target.value);set("th",gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div><Inp label="T/H" type="number" value={f.th} onChange={e=>set("th",e.target.value)} style={{width:70}}/></div>
    <div style={{display:"flex",gap:8}}><Sel label="TIPO" value={f.type} onChange={e=>set("type",e.target.value)} style={{flex:1}}><option value="complete">Completa</option><option value="shell">Carcaça</option></Sel><Sel label="SITUAÇÃO" value={f.situacao} onChange={e=>set("situacao",e.target.value)} style={{flex:1}}>{SIT_OPTS.map(s=><option key={s}>{s}</option>)}</Sel></div>
    <PalletLocationPicker pallets={data.pallets} value={f.location} onChange={v=>set("location",v)}/>
    <>{[0,1,2].map(i=>{
      const slotSN=(f[`hashSN${i}`]||"").trim();
      const existingHash=slotSN?data.hashes.find(h=>h.sn===slotSN):null;
      return<div key={i} style={{marginBottom:8}}>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{color:C.subtle,fontSize:11,width:50}}>HASH {i}</span>
          <input value={f[`hashSN${i}`]} onChange={e=>set(`hashSN${i}`,e.target.value.toUpperCase())} placeholder="SN" style={{...inp,flex:1,fontSize:12,padding:"7px 10px"}}/>
          <select value={f[`hash${i}`]} onChange={e=>set(`hash${i}`,e.target.value)} style={{...inp,width:85,padding:"7px 8px",fontSize:12}}>{CTR_OPTS.map(s=><option key={s}>{s}</option>)}</select>
        </div>
        {slotSN&&(existingHash?
          <div style={{fontSize:11,color:C.blue,marginLeft:58,marginTop:2}}>⚡ Já existe: {existingHash.model} · <SP s={existingHash.status}/></div>
          :<div style={{fontSize:11,color:C.green,marginLeft:58,marginTop:2}}>✓ Nova — vai ser criada como {f.model} ao salvar</div>
        )}
      </div>;
    })}<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]].map(([k,l])=><Sel key={k} label={l} value={f[k]} onChange={e=>set(k,e.target.value)} style={{marginBottom:0}}>{CTR_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>)}</div></>
    <PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey} onUploadFail={setPhotoBlocked}/>
    {photoBlocked&&<Alrt type="err">⚠️ A foto não subiu pro Drive — corrige isso (ou tira a foto) antes de salvar.</Alrt>}
    {confirmOverwrite&&<div style={{background:C.amber+"15",border:`1px solid ${C.amber}44`,borderRadius:10,padding:12,marginBottom:10}}>
      <div style={{fontWeight:800,color:C.amber,marginBottom:4}}>Tem certeza?</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Essa máquina já existe como <SP s={dupMachine.situacao}/>{dupMachine.destino?` (foi pro cliente ${dupMachine.destino})`:""}. Vou atualizar ela pra <b><SP s={f.situacao}/></b> e devolver ao ciclo normal do estoque (o histórico dela no cliente continua existindo, só não fica mais marcada como saída).</div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <Btn v="s" onClick={()=>setConfirmOverwrite(false)} style={{flex:1}}>Cancelar</Btn>
        <Btn v="g" onClick={()=>doSave()} disabled={saving} style={{flex:1}}>{saving?"...":"✓ Atualizar essa"}</Btn>
      </div>
      <div style={{color:C.muted,fontSize:11,marginBottom:6}}>Ou, se são DUAS máquinas físicas diferentes com o mesmo SN impresso (pode acontecer):</div>
      <Btn v="b" onClick={()=>doSave(nextFreeSN())} disabled={saving} style={{width:"100%"}}>➕ Cadastrar como NOVA máquina ({nextFreeSN()})</Btn>
    </div>}
    <div style={{display:"flex",gap:8,marginTop:8}}><Btn v="s" onClick={onClose} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={saving||confirmOverwrite||photoBlocked} style={{flex:1}}>{saving?"...":dupMachine?"⚠️ Já existe — clique pra ver opções":"💾 Salvar"}</Btn></div>
  </div>;
}

const FIELD_LABELS={situacao:"Situação",sn:"SN",location:"Localização",model:"Modelo",th:"T/H",hash0:"Hash slot 1",hash1:"Hash slot 2",hash2:"Hash slot 3",hashSN0:"SN slot 1",hashSN1:"SN slot 2",hashSN2:"SN slot 3",controladora:"Controladora",fonte:"Fonte",fans:"Fans",status:"Status",destino:"Destino"};
// Editor de um slot de HASH da máquina. Usa estado LOCAL enquanto digita —
// só salva de verdade (e só então cria histórico/sincroniza com a planilha)
// quando sai do campo ou aperta Enter. Isso evita o bug de criar uma entrada
// de histórico a cada letra digitada.
function MachineSlotEditor({ctx,m,i,upd,setModal}){
  const{data,mutate,user,webhookUrl}=ctx;
  const slotField=`hashSN${i}`;
  const[localSN,setLocalSN]=useState(m[slotField]||"");
  useEffect(()=>{setLocalSN(m[slotField]||"")},[m[slotField]]);
  const slotSN=m[slotField]||"";
  const slotHash=slotSN?data.hashes.find(h=>h.sn===slotSN):null;
  const commit=async()=>{
    const upper=localSN.toUpperCase().trim();
    setLocalSN(upper);
    if(upper===slotSN)return;
    await upd(slotField,upper);
    // Se já tinha outra HASH nesse slot, desvincula ela (volta pra fila de teste)
    const oldHash=slotSN?data.hashes.find(h=>h.sn===slotSN):null;
    if(oldHash&&oldHash.machineSN===m.sn){
      const ou={...oldHash,machineSN:"",slot:-1,status:oldHash.status==="NA MAQUINA"?"TESTAR":oldHash.status,...audit(user)};
      mutate("hashes",arr=>arr.map(x=>x._id===oldHash._id?ou:x));await fbSet("hashes",oldHash._id,ou);
    }
    // A HASH nova colocada aqui passa a estar NA MAQUINA — reflete isso nela
    const found=upper?data.hashes.find(h=>h.sn===upper):null;
    if(found){
      // Nunca deixa a carcaça com um modelo e a HASH com outro — corrige sozinho
      if(found.model&&found.model!==m.model)await upd("model",found.model);
      const fu={...found,status:"NA MAQUINA",machineSN:m.sn,slot:i,...audit(user)};
      mutate("hashes",arr=>arr.map(x=>x._id===found._id?fu:x));await fbSet("hashes",found._id,fu);
      syncSheet(webhookUrl,"hashApproved",{sn:found.sn,model:found.model,machineSN:m.sn,slot:i,employeeName:user.name,employeeCode:user.code});
    }
    await markChanged("hashes");
  };
  const notFound=localSN.trim()&&!data.hashes.find(h=>h.sn===localSN.toUpperCase().trim());
  return<div style={{marginBottom:8}}>
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      <span style={{color:C.subtle,fontSize:10,width:50,flexShrink:0,fontWeight:800}}>SLOT {i+1}</span>
      <input value={localSN} onChange={e=>setLocalSN(e.target.value.toUpperCase())} onBlur={commit} onKeyDown={e=>e.key==="Enter"&&e.target.blur()} placeholder="SN da HASH" style={{...inp,flex:1,fontSize:12,padding:"7px 8px"}}/>
      <select value={m["hash"+i]||"OFF"} onChange={e=>upd("hash"+i,e.target.value)} style={{...inp,width:78,padding:"7px 6px",fontSize:10}}>
        {CTR_OPTS.map(s=><option key={s}>{s}</option>)}
      </select>
    </div>
    {slotHash&&<div style={{width:"calc(100% - 58px)",marginLeft:58,marginTop:4}}>
      <div style={{background:HST_C[slotHash.status]+"15",border:"1px solid "+HST_C[slotHash.status]+"44",borderRadius:8,padding:"5px 12px",marginBottom:4}}>
        <span style={{fontSize:11,color:HST_C[slotHash.status],fontWeight:700}}>{"⚡ "+slotHash.model+" — "+(slotHash.sn||"").slice(0,14)}</span>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button onClick={()=>setModal(<Modal title={"📋 Histórico "+(slotHash.sn||"SEM SN")} onClose={()=>setModal(null)}><HashHistoryOnly ctx={ctx} hash={slotHash}/></Modal>)} style={{flex:1,background:C.card2,border:"none",color:C.text,borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>📋 Histórico</button>
        <button onClick={()=>setModal(<Modal title={"📷 Foto "+(slotHash.sn||"SEM SN")} onClose={()=>setModal(null)}><HashPhotoQuick ctx={ctx} hash={slotHash}/></Modal>)} style={{flex:1,background:C.card2,border:"none",color:C.text,borderRadius:8,padding:"6px 8px",cursor:"pointer",fontSize:11,fontWeight:700}}>📷 Foto</button>
      </div>
    </div>}
    {notFound&&<div style={{width:"calc(100% - 58px)",marginLeft:58,marginTop:4}}>
      <button onClick={()=>setModal(<Modal title="Nova HASH" onClose={()=>setModal(null)}><AddHashForm ctx={ctx} initSN={localSN.toUpperCase().trim()} linkToMachine={{sn:m.sn,slot:i}} onClose={async(savedSN)=>{setModal(null);if(savedSN)await upd(slotField,savedSN)}}/></Modal>)} style={{width:"100%",background:C.green+"22",border:`1px solid ${C.green}44`,color:C.green,borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>➕ Essa HASH não existe — cadastrar agora</button>
    </div>}
  </div>;
}

function MachineDetail({ctx,machine}){
  const{data,mutate,setModal,user,webhookUrl,allModels,gTH}=ctx;const models=allModels();
  const[m,setM]=useState(machine);
  useEffect(()=>{setM(machine)},[machine]);
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
  data.tests.filter(t=>t.machineSN===m.sn&&m.sn).forEach(t=>{const emp=data.employees.find(e=>e._id===t.employeeId);history.push({date:t._at||t.date,text:"Testada por "+(emp?.name||t._byName||"?")+" — "+(t.status==="pending"?"Aguard.Revisão":t.status==="rejected"?"REPROVADA":t.overallResult==="good"?"BOA":"RUIM"),photoKey:t.testPhoto})});
  (m.changeLog||[]).forEach(l=>history.push({date:l.at,text:`${l.label} alterado por ${l.by}: "${l.from||"—"}" → "${l.to||"—"}"`}));
  history.sort((a,b)=>a.date<b.date?-1:1);
  const exitSits=["SAIDA","EXPORTADA","VENDIDA"];
  // Depois que a máquina sai pro cliente, ela fica travada — não dá mais pra
  // editar nem apagar foto, só desvincular do cliente e voltar pro estoque.
  const locked=exitSits.includes(m.situacao)&&!!m.destino;
  const desvincular=async()=>{
    if(!confirm(`Desvincular do cliente "${m.destino}" e devolver "${m.sn}" (e as HASHs dela) pro estoque como BOA?`))return;
    const u={...m,situacao:"BOA",destino:"",changeLog:[{field:"situacao",label:"Situação",from:m.situacao,to:"BOA (desvinculada de "+m.destino+")",by:user.name,at:stamp()},...(m.changeLog||[])].slice(0,80),...audit(user)};
    setM(u);mutate("machines",arr=>arr.map(x=>x._id===m._id?u:x));
    await fbSet("machines",m._id,u);await markChanged("machines");
    syncSheet(webhookUrl,"updateMachine",{sn:u.sn,field:"situacao",to:"BOA",employeeName:user.name,employeeCode:user.code});
    syncSheet(webhookUrl,"machineFromClient",{sn:u.sn,employeeName:user.name,employeeCode:user.code});
    // As HASHs que estavam dentro dessa máquina também voltam ao estoque —
    // senão ficavam "presas" como SAIDA pra sempre.
    const mHashes=data.hashes.filter(h=>h.machineSN===m.sn&&m.sn);
    for(const h of mHashes){
      const hu={...h,status:"NA MAQUINA",location:"",changeLog:[{field:"status",label:"Status",from:h.status,to:"NA MAQUINA (desvinculada do cliente)",by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
      mutate("hashes",arr=>arr.map(x=>x._id===h._id?hu:x));await fbSet("hashes",h._id,hu);
      syncSheet(webhookUrl,"updateHash",{sn:hu.sn,model:hu.model,status:"NA MAQUINA",machineSN:m.sn,employeeName:user.name,employeeCode:user.code});
    }
    if(mHashes.length)await markChanged("hashes");
  };
  if(locked)return<div>
    <div style={{background:C.purple+"15",border:`1px solid ${C.purple}44`,borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{fontWeight:800,fontSize:15}}>{m.sn||"SEM SN"} · {m.model}</div>
      <div style={{color:C.muted,fontSize:12,marginTop:4}}><SP s={m.situacao}/> · Enviada pro cliente: <b style={{color:C.purple}}>{m.destino}</b></div>
    </div>
    <div style={{color:C.amber,fontSize:12,marginBottom:12}}>🔒 Essa máquina já saiu pro cliente — não dá pra editar nem apagar nada nela (nem foto) até desvincular do cliente e ela voltar pro estoque normal.</div>
    {m.photoKey&&<PhotoView photoKey={m.photoKey} style={{marginBottom:14,maxHeight:220}}/>}
    <Btn v="y" onClick={desvincular} style={{width:"100%",marginBottom:14}}>🔓 Desvincular do Cliente (volta pro estoque)</Btn>
    {history.length>0&&<><SL>Histórico</SL>{history.slice().reverse().map((h,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><div>{h.text}</div><div style={{color:C.muted,fontSize:10}}>{fmtTS(h.date)}</div>{h.photoKey&&<PhotoView photoKey={h.photoKey} style={{maxHeight:120,marginTop:4}}/>}</div>)}</>}
  </div>;
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
      // Sai de qualquer palete que estivesse — não faz sentido continuar
      // "no palete" depois que a máquina saiu de verdade (SAIDA/VENDIDA/etc)
      if(m.sn){
        for(const pl of data.pallets){
          if((pl.machinesSN||[]).includes(m.sn)){
            const ns=(pl.machinesSN||[]).filter(x=>x!==m.sn);
            const upd2={...pl,machinesSN:ns,...audit(user)};
            mutate("pallets",arr=>arr.map(x=>x._id===pl._id?upd2:x));await fbSet("pallets",pl._id,upd2);
          }
        }
        await markChanged("pallets");
      }
    }
    await upd("situacao",s);
    // Marcar como BOA = máquina 100% funcionando — todas as peças ficam ON
    // automaticamente. Pra qualquer outro status, fica livre (pode salvar
    // parcial: só 1 HASH boa, só a controladora, só o fan, etc.).
    if(s==="BOA"){
      const patch={hash0:"ON",hash1:"ON",hash2:"ON",controladora:"ON",fonte:"ON",fans:"ON"};
      const changedFields=Object.keys(patch).filter(k=>m[k]!==patch[k]);
      if(changedFields.length){
        const newLog=changedFields.map(k=>({field:k,label:FIELD_LABELS[k]||k,from:m[k]??"",to:patch[k],by:user.name,at:stamp()}));
        const u={...m,...patch,changeLog:[...newLog,...(m.changeLog||[])].slice(0,80),...audit(user)};
        setM(u);mutate("machines",arr=>arr.map(x=>x._id===m._id?u:x));
        await fbSet("machines",m._id,u);await markChanged("machines");
        changedFields.forEach(k=>syncSheet(webhookUrl,"updateMachine",{sn:u.sn,field:k,to:patch[k],employeeName:user.name,employeeCode:user.code}));
      }
    }
  };
  return(
    <div>
      <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
        <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><SP s={m.situacao}/>{m.type==="shell"&&<Tag color={C.muted}>CARCAÇA</Tag>}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,fontSize:12}}>
          <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>MODELO</div><select value={m.model} onChange={e=>upd("model",e.target.value)} style={{...inp,padding:"4px 6px",fontSize:12,fontWeight:700}}>{models.map(mo=><option key={mo.m}>{mo.m}</option>)}</select></div>
          <div><div style={{color:C.muted,fontSize:10}}>T/H</div><div style={{fontWeight:700}}>{m.th}</div></div>
          <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>TIPO</div><select value={m.type||"complete"} onChange={e=>upd("type",e.target.value)} style={{...inp,padding:"4px 6px",fontSize:12,fontWeight:700}}><option value="complete">Completa</option><option value="shell">Carcaça</option></select></div>
        </div>
        {m.sheetRow&&<div style={{color:C.muted,fontSize:10,marginTop:8}}>📍 Linha {m.sheetRow} na planilha (referência, não atualiza sozinho)</div>}
        <By by={m._byName} at={m._at}/>
      </div>
      <SL>Situação</SL>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
        {SIT_OPTS.map(s=>(
          <button key={s} onClick={()=>setSituacao(s)} style={{background:m.situacao===s?(SIT_C[s]||C.card2):C.bg,color:m.situacao===s?"#fff":C.text,border:"1px solid "+(m.situacao===s?(SIT_C[s]||C.accent):C.border),borderRadius:8,padding:"6px 10px",fontSize:10,fontWeight:700,cursor:"pointer"}}>{s}</button>
        ))}
      </div>
      {m.type==="complete"&&(
        <div style={{marginBottom:14}}>
          <SL>Slots</SL>
          {[0,1,2].map(i=><MachineSlotEditor key={i} ctx={ctx} m={m} i={i} upd={upd} setModal={setModal}/>)}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:8}}>
            {[["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]].map(([k,l])=>(
              <div key={k}>
                <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4}}>{l}</div>
                <select value={m[k]||"OFF"} onChange={e=>upd(k,e.target.value)} style={{...inp,padding:"7px 8px",fontSize:12}}>
                  {CTR_OPTS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      <EditableSNField label="SN (editar)" value={m.sn||""} onCommit={v=>upd("sn",v)}/>
      <Inp label="Referência (REF)" value={m.ref||""} onChange={e=>upd("ref",e.target.value.toUpperCase())} placeholder="Ex: seu código, lote, etc."/>
      <Inp label="Localização" value={m.location||""} onChange={e=>upd("location",e.target.value.toUpperCase())} placeholder="Ex: PALETE 01 · PRATELEIRA B3"/>
      {m.destino&&<div style={{background:C.purple+"15",border:`1px solid ${C.purple}44`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13}}>👤 Enviada pro cliente: <b style={{color:C.purple}}>{m.destino}</b></div>}
      <SL mt={8}>📷 FOTO DA MÁQUINA</SL>
      {m.photoKey?<div style={{marginBottom:14}}>
        <PhotoView photoKey={m.photoKey} style={{maxHeight:220,marginBottom:8}}/>
        <div style={{display:"flex",gap:8}}>
          <Btn v="b" onClick={()=>downloadPhoto(m.photoKey,`${m.sn||"maquina"}.jpg`)} style={{flex:1}}>⬇️ Baixar</Btn>
          <Btn v="d" onClick={()=>{deleteDrivePhoto(m.photoKey);upd("photoKey",null)}} style={{flex:1}}>🗑️ Excluir (pra colocar outra)</Btn>
        </div>
      </div>:(()=>{
        const testPhoto=[...data.tests].reverse().find(t=>t.machineSN===m.sn&&t.overallResult==="good")?.testPhoto;
        return<div style={{marginBottom:14}}>
          {testPhoto&&<div style={{marginBottom:8}}><div style={{color:C.muted,fontSize:11,marginBottom:4}}>Foto do teste (some se você adicionar uma foto própria abaixo):</div><PhotoView photoKey={testPhoto} style={{maxHeight:180}}/></div>}
          <PhotoCapture photoKey={null} onChange={k=>upd("photoKey",k)} folder="maquinas" snHint={m.sn}/>
        </div>;
      })()}
      {(()=>{const paletsComMac=(data.pallets||[]).filter(p=>(p.machinesSN||[]).includes(m.sn));const outrosPalets=(data.pallets||[]).filter(p=>!(p.machinesSN||[]).includes(m.sn));return<div>
        {paletsComMac.length>0&&<><SL>📦 Paletes desta máquina</SL>{paletsComMac.map(p=><div key={p._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+C.border,fontSize:12}}><span style={{color:C.blue}}>📦 {p.name}{p.location?" · "+p.location:""}</span><button onClick={async()=>{const ns=(p.machinesSN||[]).filter(s=>s!==m.sn);const upd2={...p,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd2:x));await fbSet("pallets",p._id,upd2);await markChanged("pallets");}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:12}}>✕</button></div>)}</>}
        {!m.sn&&<div style={{color:C.amber,fontSize:11,marginTop:4}}>⚠️ Essa máquina não tem SN — não dá pra vincular a um palete (o vínculo é feito pelo SN). Defina um SN primeiro.</div>}
        {m.sn&&outrosPalets.length===0&&paletsComMac.length===0&&<div style={{color:C.muted,fontSize:11,marginTop:4}}>Nenhum palete criado ainda. Crie um em "Paletes" primeiro.</div>}
        {m.sn&&outrosPalets.length>0&&<><SL mt={8}>Adicionar ao Palete</SL><select onChange={async e=>{const pid=e.target.value;if(!pid||!m.sn)return;const pl=data.pallets.find(x=>x._id===pid);if(!pl)return;const ns=[...(pl.machinesSN||[]),m.sn];const upd2={...pl,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===pid?upd2:x));await fbSet("pallets",pid,upd2);await markChanged("pallets");e.target.value="";}} style={{...inp,marginBottom:8}}><option value="">📦 Selecionar palete...</option>{outrosPalets.map(p=><option key={p._id} value={p._id}>{p.name}{p.location?" · "+p.location:""} ({p.machinesSN?.length||0})</option>)}</select></>}
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
      <Btn v="d" onClick={async()=>{
        syncSheet(webhookUrl,"trashMachine",{sn:m.sn,model:m.model,removedBy:user.name});
        // As HASHs que estavam dentro dessa máquina voltam pra fila de teste
        // (podem ser usadas em outra máquina) em vez de ficarem presas
        const mHashes=data.hashes.filter(h=>h.machineSN===m.sn&&m.sn);
        for(const h of mHashes){
          const hu={...h,status:"ON",machineSN:"",slot:-1,changeLog:[{field:"status",label:"Status",from:h.status,to:"ON (máquina "+m.sn+" removida)",by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
          mutate("hashes",arr=>arr.map(x=>x._id===h._id?hu:x));await fbSet("hashes",h._id,hu);
          syncSheet(webhookUrl,"updateHash",{sn:hu.sn,model:hu.model,status:"ON",machineSN:"",employeeName:user.name,employeeCode:user.code});
        }
        if(mHashes.length)await markChanged("hashes");
        // Tira a máquina de qualquer palete que estivesse — senão o palete
        // fica com a contagem errada (SN "fantasma" que não existe mais).
        for(const pl of data.pallets){
          if((pl.machinesSN||[]).includes(m.sn)){
            const ns=(pl.machinesSN||[]).filter(s=>s!==m.sn);
            const upd2={...pl,machinesSN:ns,...audit(user)};
            mutate("pallets",arr=>arr.map(x=>x._id===pl._id?upd2:x));await fbSet("pallets",pl._id,upd2);
          }
        }
        await markChanged("pallets");
        // Idem pros clientes — senão a ficha do cliente fica com contagem
        // errada (SN fantasma que não existe mais).
        for(const cl of data.clients){
          if((cl.machinesSN||[]).includes(m.sn)){
            const ns=(cl.machinesSN||[]).filter(s=>s!==m.sn);
            const upd3={...cl,machinesSN:ns,...audit(user)};
            mutate("clients",arr=>arr.map(x=>x._id===cl._id?upd3:x));await fbSet("clients",cl._id,upd3);
          }
        }
        await markChanged("clients");
        mutate("machines",arr=>arr.filter(x=>x._id!==m._id));await fbDel("machines",m._id);await markChanged("machines");setModal(null)
      }} style={{width:"100%",marginTop:14}}>🗑 Remover</Btn>
    </div>
  );
}

/* ═══ HASHES ════════════════════════════════════════════════════ */
function HashPage({ctx}){
  const{data,setModal,mutate,user,gChips}=ctx;const[search,setSearch]=useState(""),[fS,setFS]=useState("all"),[modelFilters,setModelFilters]=useState(new Set()),[selected,setSelected]=useState(new Set()),[selMode,setSelMode]=useState(false),[bulkAction,setBulkAction]=useState(null);
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
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{allModelsUsed.map(mo=><button key={mo} onClick={()=>toggleModel(mo)} style={{background:modelFilters.has(mo)?C.accent:C.card2,color:"#fff",border:"none",borderRadius:20,padding:"4px 11px",fontSize:11,fontWeight:700,cursor:"pointer"}}>{mo}</button>)}</div>
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
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div><div style={{fontWeight:800,fontSize:14,color:h.status==="IRREPARAVEL"?"#9ca3af":C.blue}}>⚡ {h.sn||"SEM SN"}</div><div style={{color:C.muted,fontSize:12}}>{h.model}{h.material?` · ${h.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{(h.chips||gChips(h.model,h.material))?` · ${h.chips||gChips(h.model,h.material)} chips`:""}</div></div><HP s={h.status}/></div>
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
  const[model,setModel]=useState(models[0]?.m||"M30S"),[status,setStatus]=useState("REPARO"),[loc,setLoc]=useState(""),[rows,setRows,clearRows]=usePersistedBatch("hashes-lote",[]),[saving,setSaving]=useState(false);
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
    await markChanged("hashes");setSaving(false);clearRows();onClose();
  };
  return<div>
    <Sel label="MODELO (usado para os SNs novos)" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
      <SL>BIPAR OU DIGITAR</SL>
      <SmartScanInput onDetect={addSN} placeholder="SN da HASH..." autoFocus count={rows.length}/>
      <div style={{maxHeight:220,overflow:"auto",marginTop:10}}>
        {rows.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN ainda</div>:rows.map(r=><div key={r.sn} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
          <div><span style={{fontSize:13,fontFamily:"monospace",color:C.blue}}>{r.sn}</span>{r.existing?<Tag color={C.amber} small style={{marginLeft:6}}>já existe · {r.model} · {r.status}</Tag>:<Tag color={C.green} small style={{marginLeft:6}}>🆕 novo</Tag>}</div>
          <button onClick={()=>removeRow(r.sn)} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button>
        </div>)}
      </div>
    </div>
    <Sel label="STATUS FINAL (aplicado a todos)" value={status} onChange={e=>setStatus(e.target.value)}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>
    <PalletLocationPicker pallets={data.pallets} value={loc} onChange={setLoc}/>
    <div style={{display:"flex",gap:8}}><Btn v="s" onClick={()=>{clearRows();onClose()}} style={{flex:1}}>Cancelar</Btn><Btn v="g" onClick={saveAll} disabled={saving||!rows.length} style={{flex:1}}>{saving?"...":"💾 Salvar "+rows.length}</Btn></div>
  </div>;
}

// Toggle Fibra/Alumínio — usado em Adicionar HASH, Editar HASH e Conserto
function MaterialPicker({value,onChange}){
  return<div style={{marginBottom:12}}>
    <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>MATERIAL DA PLACA</div>
    <div style={{display:"flex",gap:8}}>
      {[["","Não especificado"],["FIBRA","🔵 Fibra"],["ALUMINIO","🟠 Alumínio"]].map(([v,l])=><button key={v} type="button" onClick={()=>onChange(v)} style={{flex:1,background:value===v?(v==="FIBRA"?C.blue:v==="ALUMINIO"?C.amber:C.accent):C.card2,color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>)}
    </div>
  </div>;
}

function AddHashForm({ctx,onClose,initSN="",initPhoto=null,linkToMachine=null}){
  const{data,mutate,user,allModels,webhookUrl,gChips}=ctx;const models=allModels();
  const[sn,setSN]=useState(initSN),[model,setModel]=useState(models[0]?.m||"M30S"),[material,setMaterial]=useState(""),[status,setStatus]=useState(linkToMachine?"NA MAQUINA":"REPARO"),[location,setLocation]=useState(""),[photoKey,setPhotoKey]=useState(initPhoto),[obs,setObs]=useState(""),[snInfo,setSnInfo]=useState(null),[photoBlocked,setPhotoBlocked]=useState(false);
  const checkSN=v=>{setSN(v);const s=v.toUpperCase().trim();if(!s){setSnInfo(null);return}const ex=data.hashes.find(h=>h.sn===s);if(ex)setSnInfo({type:"exists",item:ex});else{const mac=data.machines.find(m=>m.sn===s);if(mac)setSnInfo({type:"mac",item:mac});else setSnInfo(null)}};
  const save=async()=>{
    const s=sn.toUpperCase().trim();
    if(s&&data.hashes.find(h=>h.sn===s)){alert("SN já cadastrado!");return}
    const id=uid();
    const d={sn:s,model,material,status,location,obs,...audit(user),addedAt:TODAY(),
      machineSN:linkToMachine?linkToMachine.sn:"",slot:linkToMachine?linkToMachine.slot:-1,
      repairedBy:"",photoKey:photoKey||""};
    await fbSet("hashes",id,d);
    mutate("hashes",h=>[...h,{...d,_id:id}]);
    await markChanged("hashes");
    if(webhookUrl)syncSheet(webhookUrl,"addHash",{sn:s,model,status,obs,employeeName:user.name,employeeCode:user.code});
    // Se veio de dentro do editar de uma máquina (slot que não existia
    // ainda), já vincula ela na máquina e manda o SN pro slot certo na
    // planilha — antes isso nunca acontecia, ficava só cadastrada solta.
    if(linkToMachine&&webhookUrl){
      syncSheet(webhookUrl,"hashApproved",{sn:s,model,machineSN:linkToMachine.sn,slot:linkToMachine.slot,employeeName:user.name,employeeCode:user.code});
    }
    onClose(linkToMachine?s:undefined);
  };
  return<div>
    <SNInput label="SN (deixe vazio se não tiver)" value={sn} onChange={checkSN} placeholder="SN da HASH"/>
    {snInfo?.type==="exists"&&<div style={{background:"#3a0a0a",border:"1px solid "+C.red,borderRadius:10,padding:10,marginBottom:10}}><div style={{color:C.red,fontWeight:800}}>⚠️ SN já existe!</div><div style={{fontSize:12,color:C.muted}}>{snInfo.item.model} · <HP s={snInfo.item.status}/></div></div>}
    {snInfo?.type==="mac"&&<div style={{background:"#3a2a0a",border:"1px solid "+C.amber,borderRadius:10,padding:10,marginBottom:10}}><div style={{color:C.amber,fontWeight:800}}>📌 SN é de uma Máquina</div><div style={{fontSize:12,color:C.muted}}>{snInfo.item.model} · <SP s={snInfo.item.situacao}/></div></div>}
    <Sel label="MODELO" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <MaterialPicker value={material} onChange={setMaterial}/>
    {gChips(model,material)&&<div style={{color:C.muted,fontSize:11,marginTop:-6,marginBottom:12}}>Padrão pra esse modelo/material: {gChips(model,material)} chips</div>}
    <Sel label="STATUS" value={status} onChange={e=>setStatus(e.target.value)}>{HST_OPTS.map(s=><option key={s}>{s}</option>)}</Sel>
    <PalletLocationPicker pallets={data.pallets} value={location} onChange={setLocation}/>
    <Inp label="Observação" value={obs} onChange={e=>setObs(e.target.value)} placeholder="Ex: Chip U3 trocado, Chain Break corrigida..."/>
    <PhotoCapture label="FOTO" photoKey={photoKey} onChange={setPhotoKey} onUploadFail={setPhotoBlocked}/>
    {photoBlocked&&<Alrt type="err">⚠️ A foto não subiu pro Drive — corrige isso (ou tira a foto) antes de salvar.</Alrt>}
    <div style={{display:"flex",gap:8}}><Btn v="s" onClick={()=>onClose()} style={{flex:1}}>Cancelar</Btn><Btn onClick={save} disabled={snInfo?.type==="exists"||photoBlocked} style={{flex:1}}>Salvar</Btn></div>
  </div>;
}

// Histórico "somente leitura" de uma HASH, usado quando acessado a partir da
// tela de Máquina (item 15) — mesma lógica de montagem do histórico do HashDetail.
function buildHashHistory(data,h){
  const history=[];
  data.repairs.filter(r=>r.hashSN===h.sn&&h.sn).forEach(r=>{const emp=data.employees.find(e=>e._id===r.employeeId);const repName=emp?.name||r._byName||"?";let obs="";if(r.boardChips)obs+=` · Chips placa:${r.boardChips}`;if(r.chips)obs+=` · Chips trocados:${r.chips}`;if(r.sensores)obs+=` · Sens:${r.sensores}`;if(r.ldos)obs+=` · LDOs:${r.ldos}`;if(r.obsManual)obs+=` · ${r.obsManual}`;history.push({icon:r.type==="already_good"?"✅":r.type==="rework"?"🔁":"🔧",date:r._at||r.date,text:r.type==="already_good"?`Verificada OK por ${repName} (já estava boa)`:r.type==="rework"?`RETRABALHO — Consertada de novo por ${repName}${obs}`:`Consertada por ${repName}${obs}`,notes:r.notes,photoKey:r.photoKey})});
  data.tests.forEach(t=>{const si=[t.slot0HashSN,t.slot1HashSN,t.slot2HashSN].indexOf(h.sn);if(si<0||!h.sn)return;const emp=data.employees.find(e=>e._id===t.employeeId);const testName=emp?.name||t._byName||"?";const res=si===0?t.slot0Result:si===1?t.slot1Result:t.slot2Result;history.push({icon:"🧪",date:t._at||t.date,text:`Testada por ${testName} — Máq.${t.machineSN||"s/n"} Slot${si+1} — ${res==="good"?"BOA ✓":"RUIM ✗"}`,photoKey:si===0?t.slot0Photo:si===1?t.slot1Photo:t.slot2Photo})});
  data.feedbacks.filter(f=>f.hashSN===h.sn&&h.sn).forEach(f=>{const emp=data.employees.find(e=>e._id===f.originalRepairerId);history.push({icon:"⚠️",date:f._at||f.date,text:`Devolvida para ${emp?.name||f._byName||"?"}`,notes:f.notes,photoKey:f.logPhotoKey})});
  (h.changeLog||[]).forEach(l=>history.push({icon:"✏️",date:l.at,text:`${l.label} alterado por ${l.by}: "${l.from||"—"}" → "${l.to||"—"}"`}));
  history.sort((a,b)=>a.date<b.date?-1:1);
  return history;
}
function HashHistoryOnly({ctx,hash}){
  const{data}=ctx;const history=buildHashHistory(data,hash);
  return<div>
    <div style={{background:C.bg,borderRadius:10,padding:12,marginBottom:12}}><HP s={hash.status}/><span style={{marginLeft:8,fontWeight:700,color:C.blue}}>{hash.model}</span></div>
    {history.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Sem histórico</div>:history.map((ev,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:12}}><div style={{display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:C.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{ev.icon}</div>{i<history.length-1&&<div style={{width:2,flex:1,background:C.border,marginTop:4}}/>}</div><div style={{flex:1,paddingBottom:8}}><div style={{fontSize:12,fontWeight:700}}>{ev.text}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(ev.date)}</div>{ev.notes&&<div style={{fontSize:11,color:C.subtle,marginTop:2}}>{ev.notes}</div>}{ev.photoKey&&<PhotoView photoKey={ev.photoKey} style={{marginTop:6,maxHeight:100}}/>}</div></div>)}
  </div>;
}
// Visualização rápida da foto salva da HASH, com opção de adicionar se não tiver (não obrigatório)
function HashPhotoQuick({ctx,hash}){
  const{mutate,user}=ctx;const[h,setH]=useState(hash),[adding,setAdding]=useState(false);
  useEffect(()=>{setH(hash)},[hash]);
  const savePhoto=async k=>{const u={...h,photoKey:k,...audit(user)};setH(u);mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes");setAdding(false)};
  return<div>
    <div style={{background:C.bg,borderRadius:10,padding:12,marginBottom:12}}><HP s={h.status}/><span style={{marginLeft:8,fontWeight:700,color:C.blue}}>{h.model} · {h.sn||"SEM SN"}</span></div>
    {h.photoKey?<PhotoView photoKey={h.photoKey} style={{maxHeight:320}}/>:adding?<PhotoCapture label="Adicionar foto" photoKey={null} onChange={savePhoto}/>:<div style={{textAlign:"center",padding:24}}><div style={{color:C.muted,fontSize:12,marginBottom:12}}>Sem foto salva</div><button onClick={()=>setAdding(true)} style={{background:C.bg,border:`2px dashed ${C.border}`,color:C.muted,borderRadius:10,padding:16,cursor:"pointer",fontSize:24,width:60,height:60}}>+</button></div>}
  </div>;
}

function HashDetail({ctx,hash}){
  const{data,mutate,setModal,user,webhookUrl,allModels,gChips}=ctx;const models=allModels();const[h,setH]=useState(hash),[confirmIrrep,setConfirmIrrep]=useState(false),[editLoc,setEditLoc]=useState(false),[locVal,setLocVal]=useState(hash.location||"");
  useEffect(()=>{setH(hash)},[hash]);
  const upd=async(k,v)=>{
    if(h[k]===v)return;
    const logEntry={field:k,label:FIELD_LABELS[k]||k,from:h[k]??"",to:v??"",by:user.name,at:stamp()};
    const newLog=[logEntry,...(h.changeLog||[])].slice(0,80);
    const u={...h,[k]:v,changeLog:newLog,...audit(user)};
    setH(u);mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes");
    syncSheet(webhookUrl,"updateHash",{sn:u.sn,model:u.model,status:u.status,location:u.location,field:k,from:logEntry.from,to:v,employeeName:user.name,employeeCode:user.code});
  };
  const history=[];
  data.repairs.filter(r=>r.hashSN===h.sn&&h.sn).forEach(r=>{const emp=data.employees.find(e=>e._id===r.employeeId);const repName=emp?.name||r._byName||"?";let obs="";if(r.boardChips)obs+=` · Chips placa:${r.boardChips}`;if(r.chips)obs+=` · Chips trocados:${r.chips}`;if(r.sensores)obs+=` · Sens:${r.sensores}`;if(r.ldos)obs+=` · LDOs:${r.ldos}`;if(r.obsManual)obs+=` · ${r.obsManual}`;history.push({icon:r.type==="already_good"?"✅":r.type==="rework"?"🔁":"🔧",date:r._at||r.date,text:r.type==="already_good"?`Verificada OK por ${repName} (já estava boa)`:r.type==="rework"?`RETRABALHO — Consertada de novo por ${repName}${obs}`:`Consertada por ${repName}${obs}`,notes:r.notes,photoKey:r.photoKey})});
  data.tests.forEach(t=>{const si=[t.slot0HashSN,t.slot1HashSN,t.slot2HashSN].indexOf(h.sn);if(si<0||!h.sn)return;const emp=data.employees.find(e=>e._id===t.employeeId);const testName=emp?.name||t._byName||"?";const res=si===0?t.slot0Result:si===1?t.slot1Result:t.slot2Result;history.push({icon:"🧪",date:t._at||t.date,text:`Testada por ${testName} — Máq.${t.machineSN||"s/n"} Slot${si+1} — ${res==="good"?"BOA ✓":"RUIM ✗"}`,photoKey:si===0?t.slot0Photo:si===1?t.slot1Photo:t.slot2Photo})});
  data.feedbacks.filter(f=>f.hashSN===h.sn&&h.sn).forEach(f=>{const emp=data.employees.find(e=>e._id===f.originalRepairerId);history.push({icon:"⚠️",date:f._at||f.date,text:`Devolvida para ${emp?.name||f._byName||"?"}`,notes:f.notes,photoKey:f.logPhotoKey})});
  (h.changeLog||[]).forEach(l=>history.push({icon:"✏️",date:l.at,text:`${l.label} alterado por ${l.by}: "${l.from||"—"}" → "${l.to||"—"}"`}));
  history.sort((a,b)=>a.date<b.date?-1:1);
  const mac=data.machines.find(m=>m.sn===h.machineSN);
  // Depois que a HASH sai pro cliente, fica travada — só desvincular volta
  // pro estoque normal.
  const locked=h.status==="SAIDA"&&(h.location||"").toLowerCase().includes("vendida");
  const desvincularHash=async()=>{
    if(!confirm(`Desvincular essa HASH do cliente e devolver pro estoque normal?`))return;
    const u={...h,status:"STOCK",location:"",machineSN:"",changeLog:[{field:"status",label:"Status",from:h.status,to:"STOCK (desvinculada do cliente)",by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
    setH(u);mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);await markChanged("hashes");
    syncSheet(webhookUrl,"updateHash",{sn:u.sn,model:u.model,status:"STOCK",machineSN:"",employeeName:user.name,employeeCode:user.code});
  };
  if(locked)return<div>
    <div style={{background:C.purple+"15",border:`1px solid ${C.purple}44`,borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{fontWeight:800,fontSize:15}}>⚡ {h.sn||"SEM SN"} · {h.model}</div>
      <div style={{color:C.muted,fontSize:12,marginTop:4}}><HP s={h.status}/> · {h.location}</div>
    </div>
    <div style={{color:C.amber,fontSize:12,marginBottom:12}}>🔒 Essa HASH já saiu pro cliente — não dá pra editar nem apagar nada nela (nem foto) até desvincular e ela voltar pro estoque normal.</div>
    {h.photoKey&&<PhotoView photoKey={h.photoKey} style={{marginBottom:14,maxHeight:220}}/>}
    <Btn v="y" onClick={desvincularHash} style={{width:"100%",marginBottom:14}}>🔓 Desvincular do Cliente (volta pro estoque)</Btn>
    {history.length>0&&<><SL>Histórico</SL>{history.slice().reverse().map((it,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}><div>{it.icon} {it.text}</div><div style={{color:C.muted,fontSize:10}}>{fmtTS(it.date)}</div>{it.photoKey&&<PhotoView photoKey={it.photoKey} style={{maxHeight:120,marginTop:4}}/>}</div>)}</>}
  </div>;
  return<div>
    <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
      <HP s={h.status}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10,fontSize:12}}>
        <div><div style={{color:C.muted,fontSize:10,marginBottom:2}}>MODELO</div><select value={h.model} onChange={e=>upd("model",e.target.value)} style={{...inp,padding:"4px 6px",fontSize:12,fontWeight:700}}>{models.map(mo=><option key={mo.m}>{mo.m}</option>)}</select>{gChips(h.model,h.material)&&<div style={{color:C.blue,fontSize:10,marginTop:2,fontWeight:700}}>{gChips(h.model,h.material)} chips</div>}</div>
        <div><div style={{color:C.muted,fontSize:10}}>LOCALIZAÇÃO</div>
          {mac?<button onClick={()=>setModal(<Modal title={`🖥️ ${mac.sn}`} onClose={()=>setModal(null)}><MachineDetail ctx={ctx} machine={mac}/></Modal>)} style={{background:"none",border:"none",color:C.green,fontWeight:700,fontSize:12,cursor:"pointer",padding:0,textAlign:"left"}}>🖥️ Slot{h.slot>=0?h.slot+1:"?"} → {mac.sn?.slice(0,10)} ↗</button>
          :<div style={{color:C.muted,fontSize:11}}>
            {editLoc?<div><PalletLocationPicker pallets={data.pallets} value={locVal} onChange={setLocVal}/><Btn v="g" onClick={async()=>{
              await upd("location",locVal);
              // Se o valor escolhido é o nome de um palete de verdade, vincula a
              // HASH na lista dele também (tira de qualquer outro palete antes)
              const picked=data.pallets.find(pl=>pl.name===locVal);
              for(const pl of data.pallets){
                const has=(pl.hashesSN||[]).includes(h.sn);
                const shouldHave=picked&&pl._id===picked._id;
                if(has&&!shouldHave){const ns=(pl.hashesSN||[]).filter(s=>s!==h.sn);const u2={...pl,hashesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===pl._id?u2:x));await fbSet("pallets",pl._id,u2)}
                else if(!has&&shouldHave){const ns=[...(pl.hashesSN||[]),h.sn];const u2={...pl,hashesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===pl._id?u2:x));await fbSet("pallets",pl._id,u2)}
              }
              await markChanged("pallets");
              setEditLoc(false)
            }} style={{width:"100%"}}>✓ Salvar Local</Btn></div>
            :<button onClick={()=>{setEditLoc(true);setLocVal(h.location||"")}} style={{background:"none",border:`1px dashed ${C.border}`,borderRadius:6,color:h.location?C.text:C.muted,padding:"3px 8px",cursor:"pointer",fontSize:11,width:"100%",textAlign:"left"}}>{h.location||"⊕ Definir local..."}</button>}
          </div>}
        </div>
      </div>
      {mac&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}><SP s={mac.situacao}/><span style={{fontSize:11,color:C.muted}}>{mac.model} · {mac.th}TH</span></div>}
      {(data.pallets||[]).filter(pl=>(pl.hashesSN||[]).includes(h.sn)).map(pl=><div key={pl._id} style={{fontSize:11,color:C.blue,marginTop:4}}>📦 {pl.name}{pl.location?` — ${pl.location}`:""}</div>)}
      <By by={h._byName} at={h._at}/>
    </div>
    <SL>STATUS</SL><div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>{["ON","OFF","TESTAR","REPARO","STOCK","NA MAQUINA"].map(s=><button key={s} onClick={()=>upd("status",s)} style={{background:h.status===s?HST_C[s]:C.bg,color:"#fff",border:`1px solid ${HST_C[s]}`,borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer"}}>{s}</button>)}</div>
    <EditableSNField label="SN (editar)" value={h.sn||""} onCommit={v=>upd("sn",v)}/>
    <MaterialPicker value={h.material||""} onChange={v=>upd("material",v)}/>
    <SL mt={8}>📷 FOTO DA HASH</SL>
    {h.photoKey?<div style={{marginBottom:14}}>
      <PhotoView photoKey={h.photoKey} style={{maxHeight:220,marginBottom:8}}/>
      <div style={{display:"flex",gap:8}}>
        <Btn v="b" onClick={()=>downloadPhoto(h.photoKey,`${h.sn||"hash"}.jpg`)} style={{flex:1}}>⬇️ Baixar</Btn>
        <Btn v="d" onClick={()=>{deleteDrivePhoto(h.photoKey);upd("photoKey",null)}} style={{flex:1}}>🗑️ Excluir (pra colocar outra)</Btn>
      </div>
    </div>:<PhotoCapture photoKey={null} onChange={k=>upd("photoKey",k)} folder="hashes" snHint={h.sn}/>}
    {!confirmIrrep?<Btn v="d" onClick={()=>setConfirmIrrep(true)} style={{width:"100%",marginBottom:12}}>💀 Marcar como Irreparável</Btn>:<div style={{background:"#1a0a0a",border:`1px solid ${C.red}`,borderRadius:10,padding:14,marginBottom:12}}><div style={{fontWeight:800,color:C.red,marginBottom:8}}>⚠️ Confirmar Irreparável?</div><div style={{fontSize:12,color:C.text,marginBottom:12}}>Marcada para retirada de peças.</div><div style={{display:"flex",gap:8}}><Btn v="s" onClick={()=>setConfirmIrrep(false)} style={{flex:1}}>Cancelar</Btn><Btn v="d" onClick={async()=>{await upd("status","IRREPARAVEL");setConfirmIrrep(false)}} style={{flex:1}}>Confirmar</Btn></div></div>}
    <SL mt={8}>📋 HISTÓRICO COMPLETO</SL>
    {history.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Sem histórico</div>:history.map((ev,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:12}}><div style={{display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:C.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{ev.icon}</div>{i<history.length-1&&<div style={{width:2,flex:1,background:C.border,marginTop:4}}/>}</div><div style={{flex:1,paddingBottom:8}}><div style={{fontSize:12,fontWeight:700}}>{ev.text}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(ev.date)}</div>{ev.notes&&<div style={{fontSize:11,color:C.subtle,marginTop:2}}>{ev.notes}</div>}{ev.photoKey&&<PhotoView photoKey={ev.photoKey} style={{marginTop:6,maxHeight:100}}/>}</div></div>)}
    <Btn v="d" onClick={async()=>{
      syncSheet(webhookUrl,"trashHash",{sn:h.sn,model:h.model,removedBy:user.name});
      for(const pl of data.pallets){
        if((pl.hashesSN||[]).includes(h.sn)){
          const ns=(pl.hashesSN||[]).filter(s=>s!==h.sn);
          const upd2={...pl,hashesSN:ns,...audit(user)};
          mutate("pallets",arr=>arr.map(x=>x._id===pl._id?upd2:x));await fbSet("pallets",pl._id,upd2);
        }
      }
      await markChanged("pallets");
      for(const cl of data.clients){
        if((cl.hashesSN||[]).includes(h.sn)){
          const ns=(cl.hashesSN||[]).filter(s=>s!==h.sn);
          const upd3={...cl,hashesSN:ns,...audit(user)};
          mutate("clients",arr=>arr.map(x=>x._id===cl._id?upd3:x));await fbSet("clients",cl._id,upd3);
        }
      }
      await markChanged("clients");
      mutate("hashes",arr=>arr.filter(x=>x._id!==h._id));await fbDel("hashes",h._id);await markChanged("hashes");setModal(null)
    }} style={{width:"100%",marginTop:8}}>🗑 Remover</Btn>
  </div>;
}

/* ═══ CONSERTO ══════════════════════════════════════════════════ */
// Busca uma HASH pelo SN e mostra tudo sobre ela (quem consertou primeiro,
// fotos/observações de cada conserto, o que o teste registrou se ficou
// ruim, etc.) — pra qualquer técnico poder conferir o histórico completo,
// mesmo que não tenha sido ele quem mexeu nela antes.
function HashSearchBox({ctx}){
  const{data,setModal}=ctx;
  const[q,setQ]=useState("");
  const found=q.trim()?data.hashes.find(h=>h.sn===q.toUpperCase().trim()):null;
  return<div style={{background:C.bg,borderRadius:10,padding:12,marginBottom:14}}>
    <SL>🔍 BUSCAR HASH (histórico completo)</SL>
    <SNInput value={q} onChange={setQ} placeholder="Bipe ou digite o SN da HASH..."/>
    {q.trim()&&!found&&<div style={{color:C.muted,fontSize:12}}>Nenhuma HASH encontrada com esse SN</div>}
    {found&&<div style={{background:C.card2,borderRadius:8,padding:10}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><span style={{fontWeight:800,color:C.blue}}>⚡ {found.sn}</span> <span style={{color:C.muted,fontSize:12}}>{found.model}</span></div>
        <HP s={found.status}/>
      </div>
      <Btn v="b" onClick={()=>setModal(<Modal title={`⚡ ${found.sn}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={found}/></Modal>)} style={{width:"100%",marginTop:8}}>📋 Ver Histórico Completo</Btn>
    </div>}
  </div>;
}

function ConsertaPage({ctx}){
  const{data,mutate,user,allModels,webhookUrl,gChips}=ctx;const models=allModels();
  const[f,setF]=useState({hashSN:"",model:models[0]?.m||"M30S",material:"",boardChips:"",obsType:"quantity",chips:"",sensores:"",ldos:"",obsManual:"",notes:""});
  const[photoKey,setPhotoKey]=useState(null),[saved,setSaved]=useState(null),[photoErr,setPhotoErr]=useState(""),[photoBlocked,setPhotoBlocked]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));

  const doSubmit=async(type)=>{
    if(!f.hashSN.trim())return;
    if(!photoKey){setPhotoErr("Foto obrigatória!");return}
    setPhotoErr("");
    const sn=f.hashSN.toUpperCase().trim();const id=uid();
    // "Chips trocados" (parte do reparo) é DIFERENTE de "chips da placa"
    // (quantos chips a placa tem no total, fica salvo na própria HASH).
    const boardChipsFinal=f.boardChips||gChips(f.model,f.material)||"";
    // Se essa HASH já tinha sido consertada antes (voltou RUIM depois de um
    // conserto anterior), esse conserto novo entra como RETRABALHO no
    // histórico — mesmo fluxo de status, só muda o rótulo pra rastrear isso.
    const wasRepairedBefore=type==="repair"&&data.repairs.some(r=>r.hashSN===sn&&r.type==="repair");
    const recType=wasRepairedBefore?"rework":type;
    const rec={hashSN:sn,model:f.model,material:f.material,type:recType,photoKey:photoKey||"",employeeId:user._id,...audit(user),date:TODAY(),status:"TESTAR"};
    if(type==="repair"){Object.assign(rec,{chips:f.chips||"",boardChips:boardChipsFinal,sensores:f.sensores||"",ldos:f.ldos||"",obsManual:f.obsType==="manual"?f.obsManual:"",notes:f.notes})}
    const saveRes=await fbSet("repairs",id,rec);
    if(!saveRes.ok){
      alert(`⚠️ ERRO: o conserto de ${sn} NÃO foi salvo no banco de dados!\n\nErro: ${saveRes.error}\n\nA planilha pode ter sido atualizada mesmo assim, mas o app não vai lembrar desse conserto. Avisa o Admin pra corrigir isso.`);
    }else{
      mutate("repairs",r=>[...r,{...rec,_id:id}]);
    }
    // Hash → TESTAR
    const ex=data.hashes.find(h=>h.sn===sn);
    if(ex){const u={...ex,status:"TESTAR",material:f.material||ex.material,chips:boardChipsFinal||ex.chips,repairedBy:type==="repair"?user._id:ex.repairedBy,repairedByName:type==="repair"?user.name:ex.repairedByName,...audit(user)};mutate("hashes",h=>h.map(x=>x._id===ex._id?u:x));await fbSet("hashes",ex._id,u)}
    else{const hid=uid();const hd={sn,model:f.model,material:f.material,chips:boardChipsFinal,status:"TESTAR",repairedBy:type==="repair"?user._id:"",repairedByName:type==="repair"?user.name:"",...audit(user),addedAt:TODAY(),machineSN:"",slot:-1,photoKey:photoKey||""};await fbSet("hashes",hid,hd);mutate("hashes",h=>[...h,{...hd,_id:hid}])}
    syncSheet(webhookUrl,type==="repair"?"repair":"alreadyGood",{...rec,employeeCode:user.code,employeeName:user.name,tecnico:user.name});
    // Se essa HASH tinha um aviso pendente pro técnico que consertou antes
    // (porque voltou ruim), esse aviso some da tela dele agora — um outro
    // técnico assumiu o conserto dela.
    const openFdbs=data.feedbacks.filter(f=>!f.resolved&&f.hashSN===sn);
    for(const fdb of openFdbs){
      const fu={...fdb,resolved:true,...audit(user)};
      mutate("feedbacks",arr=>arr.map(x=>x._id===fdb._id?fu:x));await fbSet("feedbacks",fdb._id,fu);
    }
    if(openFdbs.length)await markChanged("feedbacks");
    await markChanged("repairs");await markChanged("hashes");
    setF({hashSN:"",model:f.model,material:f.material,obsType:"quantity",chips:"",sensores:"",ldos:"",obsManual:"",notes:""});setPhotoKey(null);
    setSaved(type);setTimeout(()=>setSaved(null),2500);
  };

  return<div>
    <HashSearchBox ctx={ctx}/>
    {saved==="repair"&&<Alrt type="ok">✓ Conserto registrado! HASH vai para fila de teste.</Alrt>}
    {saved==="already_good"&&<Alrt type="ok">✅ Registrada como já estava boa! Vai para fila de teste.</Alrt>}
    <Card>
      <SL>REGISTRAR CONSERTO DE HASH</SL>
      <SNInput label="SN DA HASHBOARD" value={f.hashSN} onChange={v=>{
        set("hashSN",v);
        const ex=data.hashes.find(h=>h.sn===v.toUpperCase().trim());
        if(ex){if(ex.model)set("model",ex.model);if(ex.material)set("material",ex.material);if(ex.chips)set("boardChips",ex.chips)}
      }} placeholder="Bipe, escaneie ou digite" list="hsh-rep"/>
      <datalist id="hsh-rep">{data.hashes.filter(h=>["REPARO","OFF"].includes(h.status)).map(h=><option key={h._id} value={h.sn||""}>{h.sn||"SEM SN"} — {h.model}</option>)}</datalist>
      <Sel label="MODELO" value={f.model} onChange={e=>set("model",e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
      <MaterialPicker value={f.material} onChange={v=>set("material",v)}/>
      <Inp label="QUANTIDADE DE CHIPS DA PLACA (total, salvo na HASH)" type="number" value={f.boardChips} onChange={e=>set("boardChips",e.target.value)} placeholder={gChips(f.model,f.material)?String(gChips(f.model,f.material))+" (padrão desse modelo)":"0"}/>
      <div style={{color:C.muted,fontSize:11,marginTop:-6,marginBottom:12}}>⚠️ Isso é diferente de "chips trocados" (lá embaixo) — aqui é quantos chips a placa TEM no total.</div>
      {/* Observation type */}
      <SL mt={4}>TIPO DE OBSERVAÇÃO DO CONSERTO</SL>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <button onClick={()=>set("obsType","quantity")} style={{flex:1,background:f.obsType==="quantity"?C.accent:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>Por Quantidade</button>
        <button onClick={()=>set("obsType","manual")} style={{flex:1,background:f.obsType==="manual"?C.accent:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"8px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>Descrição Livre</button>
      </div>
      {f.obsType==="quantity"?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <Inp label="CHIPS TROCADOS" type="number" value={f.chips} onChange={e=>set("chips",e.target.value)} placeholder="0"/>
        <Inp label="SENSORES" type="number" value={f.sensores} onChange={e=>set("sensores",e.target.value)} placeholder="0"/>
        <Inp label="LDOs" type="number" value={f.ldos} onChange={e=>set("ldos",e.target.value)} placeholder="0"/>
      </div>:<Inp label="DESCRIÇÃO DO CONSERTO" value={f.obsManual} onChange={e=>set("obsManual",e.target.value)} placeholder="Ex: 3 chips U3 trocados, reballing..."/>}
      <Inp label="OBSERVAÇÃO ADICIONAL" value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="Opcional..."/>
      <PhotoCapture label="FOTO / PRINT (obrigatória)" photoKey={photoKey} onChange={k=>{setPhotoKey(k);setPhotoErr("")}} folder="consertos" snHint={f.hashSN} onUploadFail={setPhotoBlocked} required/>
      {photoErr&&<Alrt type="err">{photoErr}</Alrt>}
      <div style={{display:"flex",gap:8}}>
        <Btn v="y" onClick={()=>{if(confirm(`Confirma que a HASH ${f.hashSN||"(sem SN)"} já estava boa, sem precisar de conserto?`))doSubmit("already_good")}} disabled={photoBlocked} style={{flex:1}}>✅ Já Estava Boa</Btn>
        <Btn onClick={()=>doSubmit("repair")} disabled={photoBlocked} style={{flex:1}}>🔧 Consertada</Btn>
      </div>
      <div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:8}}>Ambas vão para fila de Teste</div>
    </Card>
    <div style={{marginTop:14}}><Btn v="s" onClick={()=>copyReport(user,data.repairs,data.tests,TODAY())} style={{width:"100%",justifyContent:"center"}}>📋 Copiar Relatório do Dia</Btn></div>
  </div>;
}

/* ═══ TESTE ═════════════════════════════════════════════════════ */
// Input de SN do slot com estado LOCAL — só chama onCommit (que faz toda a
// checagem de duplicado/desvincular/etc) quando sai do campo ou aperta
// Enter. Isso evita que o scanner (que digita rápido) perca o foco no meio
// da leitura por causa de um re-render disparado a cada letra.
function TestSlotSNInput({slotRefs,i,value,onCommit,listId}){
  const[local,setLocal]=useState(value);
  useEffect(()=>{setLocal(value)},[value]);
  const commit=()=>{if(local.toUpperCase().trim()!==value)onCommit(local.toUpperCase().trim())};
  return<input ref={el=>slotRefs.current[i]=el} value={local} onChange={e=>setLocal(e.target.value.toUpperCase())} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();setTimeout(()=>slotRefs.current[i+1]?.focus(),30)}}} placeholder="Bipe o SN da HASH..." list={listId} style={{...inp,marginBottom:6}}/>;
}

// Características (modelo/material/chips) que vão valer pra TODAS as HASHs
// novas bipadas nesse teste que ainda não existem no estoque.
function NewHashCharsForm({ctx,unknownSlots,initial,templateHash,onSave}){
  const{data,allModels,gChips}=ctx;const models=allModels();
  const[model,setModel]=useState(initial?.model||templateHash?.model||models[0]?.m||"M30S");
  const[material,setMaterial]=useState(initial?.material||templateHash?.material||"");
  const[chips,setChips]=useState(initial?.chips||templateHash?.chips||"");
  return<div>
    {templateHash&&!initial&&<div style={{background:C.blue+"15",border:`1px solid ${C.blue}44`,borderRadius:8,padding:10,marginBottom:12,fontSize:12,color:C.blue}}>💡 Pré-preenchido igual à HASH existente nesse teste ({templateHash.sn}) — não muda nada nela, só usa como referência.</div>}
    <div style={{color:C.muted,fontSize:12,marginBottom:12}}>Essas características vão ser usadas ao cadastrar {unknownSlots.length} HASH(s) nova(s): {unknownSlots.map(s=>s.sn).join(", ")}</div>
    <Sel label="MODELO" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <MaterialPicker value={material} onChange={setMaterial}/>
    {gChips(model,material)&&<div style={{color:C.muted,fontSize:11,marginTop:-6,marginBottom:12}}>Padrão pra esse modelo/material: {gChips(model,material)} chips</div>}
    <Inp label="Quantidade de Chips" type="number" value={chips} onChange={e=>setChips(e.target.value)} placeholder={gChips(model,material)?String(gChips(model,material)):"0"}/>
    <Btn v="g" onClick={()=>onSave({model,material,chips:chips||gChips(model,material)||""})} style={{width:"100%"}}>💾 Salvar Características</Btn>
  </div>;
}

function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH,gChips,setModal}=ctx;const models=allModels();
  // Item 10: agora o testador pode ter VÁRIAS máquinas em teste ao mesmo tempo.
  // Cada sessão é um documento próprio (não fica mais 1 sessão por usuário).
  const[sessions,setSessions]=useState([]),[activeId,setActiveId]=useState(null),[macInput,setMacInput]=useState(""),[err,setErr]=useState(""),[submitting,setSubmitting]=useState(false),[done,setDone]=useState(false),[ruimModal,setRuimModal]=useState(null),[scanning,setScanning]=useState(false),[unlinkPrompt,setUnlinkPrompt]=useState(null);
  const slotRefs=useRef([]);
  const recentlyCreated=useRef(new Set());
  const reloadSessions=useCallback(()=>{fbList("sessions").then(all=>setSessions(all.filter(s=>s.employeeId===user._id)))},[user._id]);
  useEffect(()=>{reloadSessions()},[reloadSessions]);
  // Tempo real: se o Admin reprovar um teste (ou qualquer outra sessão mudar),
  // o testador vê na hora, sem precisar recarregar a página.
  useEffect(()=>{
    const channel=supabase.channel("hashstock-sessions-"+user._id);
    channel.on("postgres_changes",{event:"*",schema:"public",table:"sessions"},()=>{reloadSessions()});
    channel.subscribe();
    return()=>{supabase.removeChannel(channel)};
  },[user._id,reloadSessions]);
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
    if(ex&&ex.situacao==="BOA"){
      const ok=window.confirm(`Essa máquina já está marcada como BOA na planilha/estoque.\nQuer mesmo testar de novo?`);
      if(!ok)return;
    }
    const id=uid();
    const s={_id:id,employeeId:user._id,machineSN:sn,model:ex?.model||models[0]?.m||"M30S",th:ex?.th||0,
      slots:[
        {hashSN:ex?.hashSN0||"",status:"",photoKey:null},
        {hashSN:ex?.hashSN1||"",status:"",photoKey:null},
        {hashSN:ex?.hashSN2||"",status:"",photoKey:null}
      ],controladora:"",fonte:"",fans:"",photoKey:null,adminNotes:[],updatedAt:stamp()};
    await saveSession(s);setActiveId(id);
  };

  const closeSession=async(id)=>{await fbDel("sessions",id);setSessions(prev=>prev.filter(x=>x._id!==id));if(activeId===id){setActiveId(null);setMacInput("")}};

  const applySlotSN=async(i,upperSn,existing,extraNote)=>{
    const newSlots=[...session.slots];
    const wasBad=newSlots[i].status==="bad";
    newSlots[i]={...newSlots[i],hashSN:upperSn,status:(wasBad&&upperSn)?"":newSlots[i].status};
    let newSession={...session,slots:newSlots,updatedAt:stamp()};
    // Nunca deixa ir pra revisão com a carcaça de um modelo e a HASH de outro
    // — corrige o modelo da máquina sozinho pro modelo da HASH bipada.
    if(existing&&existing.model&&existing.model!==session.model){
      newSession={...newSession,model:existing.model};
    }
    if(extraNote)newSession={...newSession,adminNotes:[...(newSession.adminNotes||[]),extraNote]};
    await saveSession(newSession);
    // IMPORTANTE: a HASH só é criada de verdade quando o resultado é definido
    // (marcada RUIM, ou aprovada como boa) — nunca aqui, enquanto ainda está
    // só digitando/bipando o SN (evitava criar uma HASH nova a cada letra).
    // O avanço pro próximo slot só acontece com Enter (o próprio input já
    // trata isso no onKeyDown) — nunca a cada letra digitada, senão atrapalha
    // quem está digitando manualmente.
  };

  const setSlotSN=async(i,sn)=>{
    if(!session)return;
    const upperSn=sn.toUpperCase().trim();
    setErr("");
    if(upperSn){
      // Nunca deixa repetir o mesmo SN em outro slot desta máquina, nem em
      // outra máquina que já esteja em teste ao mesmo tempo.
      const usedHere=session.slots.some((s,idx)=>idx!==i&&s.hashSN&&s.hashSN.toUpperCase()===upperSn);
      const usedElsewhere=sessions.some(s2=>s2._id!==session._id&&s2.slots.some(s=>s.hashSN&&s.hashSN.toUpperCase()===upperSn));
      if(usedHere||usedElsewhere){setErr(`⚠️ SN ${upperSn} já está sendo usado em outra máquina em teste agora — não pode repetir.`);return}
    }
    const existing=upperSn?data.hashes.find(x=>x.sn===upperSn):null;
    // A HASH já está instalada em OUTRA máquina, ou já foi vendida pro
    // cliente — pergunta se quer desvincular antes de usar aqui
    if(existing&&(existing.status==="NA MAQUINA"||existing.status==="SAIDA")&&existing.machineSN!==session.machineSN){
      setUnlinkPrompt({slotIndex:i,sn:upperSn,hash:existing});
      return;
    }
    await applySlotSN(i,upperSn,existing);
  };

  const confirmUnlink=async()=>{
    if(!unlinkPrompt)return;
    const{slotIndex,sn,hash}=unlinkPrompt;
    const wasSaida=hash.status==="SAIDA";
    const note=wasSaida
      ? `HASH ${sn} será desvinculada do cliente e movida pra essa máquina quando o teste for aprovado (a máquina antiga continua como está).`
      : `HASH ${sn} será desvinculada da máquina ${hash.machineSN} e movida pra essa quando o teste for aprovado.`;
    setUnlinkPrompt(null);
    // Não mexe em nada agora — só na aprovação é que a HASH realmente muda
    // de máquina/sai do cliente. Assim o "desfazer" fica simples: é só
    // cancelar essa sessão de teste sem aprovar.
    await applySlotSN(slotIndex,sn,hash,note);
  };

  const markAllGood=async()=>{
    if(!session)return;
    if(!session.photoKey){setErr("Adicione a foto da tela primeiro!");return}
    if(unknownSlots.length>0&&!session.newHashChars){setErr("Defina as características das HASHs novas primeiro!");return}
    const newSlots=session.slots.map(s=>({...s,status:s.status==="bad"?"bad":"good"}));
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
      controladora:sess.controladora,fonte:sess.fonte,fans:sess.fans,testPhoto:sess.photoKey,overallResult:"pending",
      newHashModel:sess.newHashChars?.model||"",newHashMaterial:sess.newHashChars?.material||"",newHashChips:sess.newHashChars?.chips||""};
    await fbSet("tests",id,rec);mutate("tests",t=>[...t,{...rec,_id:id}]);
    const apprId=uid();const appr={testId:id,machineSN:sess.machineSN,model:sess.model,th:sess.th,employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",adminNote:(sess.adminNotes||[]).join(" | "),...audit(user)};
    await fbSet("pendingApprovals",apprId,appr);mutate("approvals",a=>[...a,{...appr,_id:apprId}]);
    const exMac=data.machines.find(m=>m.sn===sess.machineSN);
    if(exMac){const u={...exMac,situacao:"AGUARD. REVISÃO",lastTesterId:user._id,...audit(user)};mutate("machines",m=>m.map(x=>x._id===exMac._id?u:x));await fbSet("machines",exMac._id,u);}
    await markChanged("tests");await markChanged("approvals");await markChanged("machines");
    syncSheet(webhookUrl,"test",{...rec,employeeCode:user.code,employeeName:user.name});
    await closeSession(sess._id);setSubmitting(false);setDone(true);setTimeout(()=>setDone(false),3000);
  };

  const otherSessions=sessions.filter(s=>s._id!==activeId);
  // SNs bipados que ainda não existem em lugar nenhum — precisa definir as
  // características (modelo/material/chips) deles antes de poder enviar.
  const unknownSlots=session?session.slots.map((s,i)=>({i,sn:s.hashSN})).filter(x=>x.sn&&!data.hashes.find(h=>h.sn===x.sn.toUpperCase())):[];
  // Se tiver 1 HASH já existente nesse teste, usa as características dela
  // como ponto de partida pra preencher as novas (não muda nada nela).
  const existingHashesInSession=session?session.slots.map(s=>s.hashSN?data.hashes.find(h=>h.sn===s.hashSN.toUpperCase()):null).filter(Boolean):[];
  const templateHash=existingHashesInSession.length===1?existingHashesInSession[0]:null;
  const needsChars=unknownSlots.length>0&&!session?.newHashChars;

  return<div>
    <HashSearchBox ctx={ctx}/>
    {scanning&&<BarcodeScanner onScan={v=>{setMacInput(v.toUpperCase());setScanning(false);loadMachine(v)}} onClose={()=>setScanning(false)}/>}
    {done&&<Alrt type="ok">✓ Enviado para revisão do admin!</Alrt>}
    {err&&<Alrt type="err">{err}</Alrt>}

    {/* Sessões em aberto — pode ter várias máquinas em teste ao mesmo tempo */}
    {sessions.length>0&&<div style={{marginBottom:12}}>
      <SL>🖥️ MÁQUINAS EM TESTE ({sessions.length})</SL>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {sessions.map(s=><button key={s._id} onClick={()=>{setActiveId(s._id);setMacInput(s.machineSN)}} style={{background:s._id===activeId?C.accent:(s.rejected?"#3a0a0a":C.card),color:"#fff",border:`1px solid ${s._id===activeId?C.accent:(s.rejected?C.red:C.border)}`,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
          {s.rejected?"❌":"🖥️"} {s.machineSN} {s.slots.filter(sl=>sl.status).length}/3
          <span onClick={e=>{e.stopPropagation();closeSession(s._id)}} style={{color:s._id===activeId?"#fff":C.red,fontWeight:900}}>✕</span>
        </button>)}
      </div>
    </div>}

    {session?.rejected&&<Alrt type="err">{(session.adminNotes||[]).join(" · ")||"❌ Essa máquina foi reprovada na revisão. Corrija e envie de novo."}</Alrt>}

    {/* Machine input — sempre inicia uma NOVA máquina (ou retoma se já tiver sessão pro SN) */}
    <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>SN DA MÁQUINA {session?"(sessão ativa)":"(nova)"}</div>
      <div style={{display:"flex",gap:8}}>
        <input value={macInput} onChange={e=>setMacInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&loadMachine(macInput)} placeholder="Bipe ou escaneie o SN e Enter..." list="mac-list" style={{...inp,flex:1}}/>
        <button onClick={()=>setScanning(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:18}}>📷</button>
      </div>
      <datalist id="mac-list">{data.machines.map(m=><option key={m._id} value={m.sn||""}>{m.model}</option>)}</datalist>
      {session&&<div style={{marginTop:8}}>
        <div style={{fontWeight:800,color:C.accent,marginBottom:6}}>{session.machineSN}</div>
        <div style={{display:"flex",gap:8}}>
          <Sel value={session.model} onChange={e=>{const newModel=e.target.value;saveSession({...session,model:newModel,th:gTH(newModel),updatedAt:stamp()})}} style={{flex:2,marginBottom:0}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
          <Inp type="number" value={session.th} onChange={e=>saveSession({...session,th:Number(e.target.value),updatedAt:stamp()})} placeholder="TH" style={{width:70,marginBottom:0}}/>
        </div>
      </div>}
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
          <TestSlotSNInput slotRefs={slotRefs} i={i} value={slot.hashSN||""} onCommit={sn=>setSlotSN(i,sn)} listId={"hash-list-"+i}/>
          <datalist id={"hash-list-"+i}>{data.hashes.map(x=><option key={x._id} value={x.sn||""}>{x.model} — {x.status}</option>)}</datalist>
          {h&&<div style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",background:C.card2,borderRadius:8,marginBottom:6,flexWrap:"wrap"}}>
            <HP s={h.status}/><span style={{fontSize:12,fontWeight:700,color:C.blue}}>⚡ {h.model}{h.material?` · ${h.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{gChips(h.model,h.material)?` · ${gChips(h.model,h.material)} chips`:""}</span>
            {h.location&&<span style={{fontSize:10,color:C.muted}}>📍{h.location}</span>}
            <button onClick={()=>setModal(<Modal title={`⚡ ${h.sn||"SEM SN"}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={h}/></Modal>)} style={{marginLeft:"auto",background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️ Editar</button>
          </div>}
          {!h&&slot.hashSN&&(session.newHashChars?
            <div style={{background:C.green+"15",border:`1px solid ${C.green}44`,borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.green,fontWeight:700}}>✓ HASH nova — {session.newHashChars.model}{session.newHashChars.material?` · ${session.newHashChars.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{session.newHashChars.chips?` · ${session.newHashChars.chips} chips`:""}</div>
            :<div style={{background:C.red+"15",border:`1px solid ${C.red}44`,borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.red,fontWeight:700}}>❌ Essa HASH não existe ainda — defina as características abaixo antes de enviar</div>
          )}
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
        <PhotoCapture label="📸 Foto da Tela / App Fabricante (obrigatória)" photoKey={session.photoKey||null} onChange={k=>saveSession({...session,photoKey:k,updatedAt:stamp()})} folder="testes" snHint={session.machineSN} required/>
      </div>

      {unknownSlots.length>0&&<div style={{background:needsChars?C.red+"15":C.green+"15",border:`1px solid ${needsChars?C.red:C.green}44`,borderRadius:12,padding:14,marginBottom:12}}>
        <div style={{fontWeight:800,fontSize:13,color:needsChars?C.red:C.green,marginBottom:6}}>{needsChars?"⚠️":"✓"} {unknownSlots.length} HASH(s) nova(s) {needsChars?"— falta definir as características":"— características definidas"}</div>
        {!needsChars&&session.newHashChars&&<div style={{fontSize:12,color:C.muted,marginBottom:8}}>{session.newHashChars.model}{session.newHashChars.material?` · ${session.newHashChars.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{session.newHashChars.chips?` · ${session.newHashChars.chips} chips`:""}</div>}
        <Btn v={needsChars?"d":"s"} onClick={()=>setModal(<Modal title="Características das HASHs novas" onClose={()=>setModal(null)}><NewHashCharsForm ctx={ctx} unknownSlots={unknownSlots} initial={session.newHashChars} templateHash={templateHash} onSave={async(chars)=>{await saveSession({...session,newHashChars:chars,model:chars.model||session.model,updatedAt:stamp()});setModal(null)}}/></Modal>)} style={{width:"100%"}}>{needsChars?"📋 Definir características (obrigatório)":"✏️ Editar características"}</Btn>
      </div>}

      <Btn v="g" onClick={markAllGood} disabled={submitting||!session.photoKey||needsChars} style={{width:"100%",padding:"16px",fontSize:15,marginBottom:8}}>
        {submitting?"Enviando...":"✅ TUDO BOA — Enviar para Revisão"}
      </Btn>
      <div style={{display:"flex",gap:8}}>
        <Btn v="s" onClick={()=>{setActiveId(null);setMacInput("")}} style={{flex:1,fontSize:12}}>👋 Deixar na fila e trocar de máquina</Btn>
        <Btn v="d" onClick={()=>closeSession(session._id)} style={{flex:1,fontSize:12}}>🗑 Cancelar esta</Btn>
      </div>
      {!session.photoKey&&<div style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:6}}>⚠️ Adicione a foto para enviar</div>}
      {needsChars&&<div style={{color:C.red,fontSize:11,textAlign:"center",marginTop:6}}>⚠️ Defina as características das HASHs novas pra enviar</div>}
    </>}

    {/* Pergunta de desvincular HASH que já está em outra máquina */}
    {unlinkPrompt&&<Modal title={unlinkPrompt.hash.status==="SAIDA"?"⚠️ HASH já foi vendida":"⚠️ HASH já está em uma máquina"} onClose={()=>setUnlinkPrompt(null)}>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:6}}>⚡ {unlinkPrompt.sn}</div>
        {unlinkPrompt.hash.status==="SAIDA"
          ?<div style={{color:C.text,fontSize:13}}>Essa HASH já foi vendida{unlinkPrompt.hash.location?" ("+unlinkPrompt.hash.location+")":""}.</div>
          :<div style={{color:C.text,fontSize:13}}>Essa HASH já está instalada na máquina <b style={{color:C.accent}}>{unlinkPrompt.hash.machineSN}</b>.</div>}
        <div style={{color:C.muted,fontSize:12,marginTop:6}}>Nada muda agora — ela só sai de lá de verdade e passa pra essa máquina quando esse teste for <b>aprovado</b>. A {unlinkPrompt.hash.status==="SAIDA"?"venda antiga":"máquina antiga"} continua como está até lá.</div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn v="s" onClick={()=>setUnlinkPrompt(null)} style={{flex:1}}>Cancelar</Btn>
        <Btn v="y" onClick={confirmUnlink} style={{flex:1}}>🔓 Desvincular e usar aqui</Btn>
      </div>
    </Modal>}

    {/* RUIM Modal */}
    {ruimModal!==null&&<Modal title={"✗ Slot "+(ruimModal+1)+" RUIM"} onClose={()=>setRuimModal(null)}>
      <RuimSlotForm ctx={ctx} session={session} slotIndex={ruimModal} onSave={async(s)=>{await saveSession(s);setRuimModal(null)}}/>
    </Modal>}
  </div>;
}

// Lista de paletes existentes pra escolher, com opção de digitar outro local
// livre — usado em Adicionar Máquina, Adicionar HASH, e Marcar RUIM.
function PalletLocationPicker({pallets,value,onChange}){
  const[custom,setCustom]=useState(false);
  const palletNames=[...new Set((pallets||[]).map(p=>p.name).filter(Boolean))];
  const isKnown=palletNames.includes(value);
  return<div style={{marginBottom:12}}>
    <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:4,letterSpacing:1}}>ONDE VAI FICAR (PALETE/LOCAL)</div>
    {!custom?<select value={isKnown?value:""} onChange={e=>{if(e.target.value==="__custom__"){setCustom(true);onChange("")}else onChange(e.target.value)}} style={{...inp}}>
      <option value="">Selecionar palete...</option>
      {palletNames.map(n=><option key={n} value={n}>{n}</option>)}
      <option value="__custom__">✏️ Digitar outro local...</option>
    </select>
    :<div style={{display:"flex",gap:8}}>
      <input value={value} onChange={e=>onChange(e.target.value.toUpperCase())} placeholder="Ex: PRATELEIRA REPARO" style={{...inp,flex:1}}/>
      {palletNames.length>0&&<button onClick={()=>setCustom(false)} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:8,padding:"0 12px",cursor:"pointer"}} title="Voltar pra lista de paletes">📦</button>}
    </div>}
  </div>;
}

function RuimSlotForm({ctx,session,slotIndex,onSave}){
  const{data,mutate,user,webhookUrl,allModels,gChips}=ctx;const models=allModels();
  const[logPhoto,setLogPhoto]=useState(null),[notes,setNotes]=useState(""),[location,setLocation]=useState(""),[saving,setSaving]=useState(false),[err,setErr]=useState("");
  const slot=session.slots[slotIndex];
  const h=slot.hashSN?data.hashes.find(x=>x.sn===slot.hashSN.toUpperCase()):null;
  const[newModel,setNewModel]=useState(session.model||models[0]?.m||"M30S");
  const[newMaterial,setNewMaterial]=useState("");
  const[newChips,setNewChips]=useState("");
  const lastRep=slot.hashSN?[...data.repairs].reverse().find(r=>r.hashSN===slot.hashSN):null;
  const repairer=lastRep?data.employees.find(e=>e._id===lastRep.employeeId):null;
  const confirm=async()=>{
    if(!logPhoto&&!notes.trim()){setErr("Coloca uma foto OU escreve uma descrição do erro (pelo menos um dos dois)");return}
    setErr("");
    setSaving(true);
    const newSlots=[...session.slots];newSlots[slotIndex]={...slot,hashSN:"",status:"bad",logPhoto:logPhoto||"",logNotes:notes};
    const sn=slot.hashSN?slot.hashSN.toUpperCase().trim():"";
    if(sn){
      // Não muda mais a HASH na hora — fica pendente até o Admin aprovar na Revisão
      const apprId=uid();
      const appr={type:"hashBad",sn,
        model:h?.model||newModel,material:h?.material||newMaterial,chips:h?.chips||newChips||gChips(newModel,newMaterial)||"",
        existingId:h?._id||"",
        logPhoto:logPhoto||"",notes,location,machineSN:session.machineSN,
        employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};
      await fbSet("pendingApprovals",apprId,appr);mutate("approvals",a=>[...a,{...appr,_id:apprId}]);
      await markChanged("approvals");
    }
    await onSave({...session,slots:newSlots,updatedAt:stamp()});
    setSaving(false);
  };
  return<div>
    <div style={{background:C.card2,borderRadius:10,padding:12,marginBottom:12}}>
      <div style={{fontWeight:700,color:C.red,marginBottom:4}}>⚡ {slot.hashSN||"SEM SN"} — Slot {slotIndex+1}</div>
      {h&&<HP s={h.status}/>}
      {repairer&&<div style={{color:C.amber,fontSize:12,marginTop:4}}>⚠️ {repairer.name} será notificado do erro</div>}
    </div>
    {!h&&slot.hashSN&&<div style={{background:C.amber+"15",border:`1px solid ${C.amber}44`,borderRadius:10,padding:12,marginBottom:12}}>
      <div style={{color:C.amber,fontWeight:700,fontSize:12,marginBottom:8}}>⚠️ Essa HASH ainda não existe — defina as características dela:</div>
      <Sel label="MODELO" value={newModel} onChange={e=>setNewModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
      <MaterialPicker value={newMaterial} onChange={setNewMaterial}/>
      <Inp label="Quantidade de Chips" type="number" value={newChips} onChange={e=>setNewChips(e.target.value)} placeholder={gChips(newModel,newMaterial)?String(gChips(newModel,newMaterial)):"0"}/>
    </div>}
    <PhotoCapture label="📸 Foto do Log de Erro (foto OU descrição abaixo é obrigatório)" photoKey={logPhoto} onChange={setLogPhoto} folder="logs-teste" snHint={slot.hashSN}/>
    <Inp label="Descrição do Erro (ou preencha a foto acima)" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex: Hash 0 not detected, Chain Break..."/>
    <PalletLocationPicker pallets={data.pallets} value={location} onChange={setLocation}/>
    <div style={{color:C.muted,fontSize:11,marginBottom:8}}>ℹ️ Isso vai pra revisão do Admin — a HASH só muda de status de verdade quando for aprovado lá.</div>
    {err&&<Alrt type="err">{err}</Alrt>}
    <div style={{display:"flex",gap:8}}>
      <Btn v="s" onClick={()=>onSave(session)} style={{flex:1}}>Cancelar</Btn>
      <Btn v="d" onClick={confirm} disabled={saving} style={{flex:1}}>{saving?"...":"✗ Marcar RUIM (enviar pra revisão)"}</Btn>
    </div>
  </div>;
}

/* ═══ HISTÓRICO ═════════════════════════════════════════════════ */
function HistPage({ctx,canSeeEmp}){
  const{data,user,mutate}=ctx;const[filter,setFilter]=useState("mine");const[dateFilter,setDateFilter]=useState("");
  const ownerId=r=>r.employeeId||r._by;
  const visible=id=>id===user._id||canSeeEmp(id);
  const reps=filter==="mine"?data.repairs.filter(r=>r.employeeId===user._id||r._by===user._id):data.repairs.filter(r=>visible(ownerId(r)));
  const tsts=filter==="mine"?data.tests.filter(t=>t.employeeId===user._id||t._by===user._id):data.tests.filter(t=>visible(ownerId(t)));
  const hashBads=(data.approvals||[]).filter(a=>a.type==="hashBad"&&(filter==="mine"?(a.employeeId===user._id||a._by===user._id):visible(ownerId(a))));
  const allRaw=[...reps.map(r=>({...r,_type:"repair"})),...tsts.map(t=>({...t,_type:"test"})),...hashBads.map(a=>({...a,_type:"hashBad"}))];
  const byDate={};allRaw.forEach(item=>{const d=item.date;if(d)byDate[d]=(byDate[d]||0)+1});
  const all=(dateFilter?allRaw.filter(item=>item.date===dateFilter):allRaw).sort((a,b)=>a.date<b.date?1:-1);
  const delItem=async item=>{
    if(!confirm("Apagar essa movimentação do histórico? Não dá pra desfazer."))return;
    const table=item._type==="repair"?"repairs":item._type==="hashBad"?"pendingApprovals":"tests";
    const col=item._type==="repair"?"repairs":item._type==="hashBad"?"approvals":"tests";
    await fbDel(table,item._id);
    mutate(col,arr=>arr.filter(x=>x._id!==item._id));
    await markChanged(col);
  };
  return<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={{fontWeight:900,fontSize:18}}>Histórico</div><Btn v="s" onClick={()=>copyReport(user,data.repairs,data.tests,dateFilter||TODAY())}>📋 Relatório</Btn></div>
    <div style={{display:"flex",gap:6,marginBottom:12}}>{[["mine","Meus"],["all","Todos"]].map(([id,l])=><button key={id} onClick={()=>setFilter(id)} style={{background:filter===id?C.accent:C.card,color:filter===id?"#fff":C.muted,border:"none",borderRadius:20,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>)}</div>
    <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"flex-end"}}><div style={{flex:1}}><DateInp label="📅 FILTRAR POR DATA" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div>{dateFilter&&<Btn v="s" onClick={()=>setDateFilter("")} style={{marginBottom:12}}>Limpar</Btn>}</div>
    {all.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>{dateFilter?"Sem registros nesta data":"Sem histórico ainda"}</div>}
    {all.slice(0,50).map(item=>{const emp=data.employees.find(e=>e._id===item.employeeId);const itemName=emp?.name||item._byName;
      if(item._type==="repair")return<Card key={item._id} accent={item.type==="already_good"?C.green:item.type==="rework"?C.amber:C.blue}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13,color:item.type==="already_good"?C.green:item.type==="rework"?C.amber:C.blue}}>{item.type==="already_good"?"✅":item.type==="rework"?"🔁":"🔧"} {item.hashSN||"SEM SN"}</div><div style={{fontSize:11,color:C.muted}}>👷 {itemName} · {fmtTS(item._at)}</div>{item.type!=="already_good"&&(item.chips||item.sensores||item.ldos)&&<div style={{fontSize:10,color:C.subtle}}>Chips:{item.chips||0} Sens:{item.sensores||0} LDOs:{item.ldos||0}</div>}</div><div style={{display:"flex",gap:6,alignItems:"center"}}><Tag color={item.type==="already_good"?C.green:item.type==="rework"?C.amber:C.purple} small>{item.type==="already_good"?"JÁ BOA":item.type==="rework"?"RETRABALHO":"CONSERTO"}</Tag><button onClick={()=>delItem(item)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button></div></div><By by={item._byName} at={item._at}/></Card>;
      if(item._type==="hashBad")return<Card key={item._id} accent={C.red}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13,color:C.red}}>✗ {item.sn||"SEM SN"}</div><div style={{fontSize:11,color:C.muted}}>👷 {itemName} · {fmtTS(item._at)}{item.machineSN?` · Máq. ${item.machineSN}`:""}</div>{item.notes&&<div style={{fontSize:10,color:C.subtle}}>📝 {item.notes}</div>}</div><div style={{display:"flex",gap:6,alignItems:"center"}}><Tag color={item.status==="pending"?C.amber:item.status==="approved"?C.green:C.red} small>{item.status==="pending"?"Aguard.Revisão":item.status==="approved"?"Aprovada":"Reprovada"}</Tag><button onClick={()=>delItem(item)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button></div></div><By by={item._byName} at={item._at}/></Card>;
      const stC=item.status==="pending"?C.blue:item.status==="rejected"?C.amber:item.overallResult==="good"?C.green:C.red;
      const stL=item.status==="pending"?"Aguard.Revisão":item.status==="rejected"?"REPROVADA":item.overallResult==="good"?"BOA":"RUIM";
      return<Card key={item._id} accent={stC}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13}}>🧪 {item.machineSN||"s/máq"}</div><div style={{fontSize:11,color:C.muted}}>👷 {itemName} · {fmtTS(item._at)}</div></div><div style={{display:"flex",gap:6,alignItems:"center"}}><Tag color={stC} small>{stL}</Tag><button onClick={()=>delItem(item)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button></div></div><By by={item._byName} at={item._at}/></Card>;
    })}
    {!dateFilter&&Object.keys(byDate).length>0&&<><SL mt={16}>DIAS COM MOVIMENTAÇÃO</SL>{Object.keys(byDate).sort().reverse().slice(0,20).map(d=><div key={d} onClick={()=>setDateFilter(d)} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13,cursor:"pointer"}}><span>{fmtDate(d)}</span><Tag color={C.accent} small>{byDate[d]} itens</Tag></div>)}</>}
  </div>;
}

/* ═══ APPROVALS ════════════════════════════════════════════════ */
// Mostra tudo que aconteceu numa revisão já processada (aprovada ou
// reprovada): quem testou, quando, os SNs/resultado de cada slot, a foto e o
// motivo da reprovação (se foi o caso).
function ApprovalDetail({ctx,appr}){
  const{data}=ctx;
  const test=data.tests.find(t=>t._id===appr.testId);
  return<div>
    <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
      <div style={{fontWeight:800,fontSize:15}}>{appr.model} · {appr.th}TH</div>
      <div style={{color:C.muted,fontSize:12,marginTop:4}}>👷 {appr.employeeName} · {fmtDate(appr.date)}</div>
      <Tag color={appr.status==="approved"?C.green:C.red} style={{marginTop:8}}>{appr.status==="approved"?"✓ Aprovada":"✗ Reprovada"}</Tag>
    </div>
    {appr.adminNote&&<Alrt type={appr.status==="approved"?"ok":"err"}>{appr.adminNote}</Alrt>}
    {test&&<>
      <SL>SLOTS TESTADOS</SL>
      {[0,1,2].map(i=>{
        const sn=i===0?test.slot0HashSN:i===1?test.slot1HashSN:test.slot2HashSN;
        const res=i===0?test.slot0Result:i===1?test.slot1Result:test.slot2Result;
        return<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
          <span>⚡ Slot {i+1}: {sn||<i style={{color:C.muted}}>sem SN</i>}</span>
          <Tag color={res==="good"?C.green:res==="bad"?C.red:C.muted} small>{res==="good"?"BOA":res==="bad"?"RUIM":"—"}</Tag>
        </div>;
      })}
      <SL mt={12}>COMPONENTES</SL>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        {[["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]].map(([k,l])=><div key={k} style={{flex:1,background:C.card2,borderRadius:8,padding:"8px 0",textAlign:"center"}}><div style={{fontSize:10,color:C.muted}}>{l}</div><div style={{fontWeight:800,color:test[k]==="ON"?C.green:C.red}}>{test[k]||"—"}</div></div>)}
      </div>
      {test.testPhoto&&<><SL mt={12}>FOTO DO TESTE</SL><PhotoView photoKey={test.testPhoto} style={{maxHeight:220}}/></>}
    </>}
  </div>;
}

// Deixa o Admin ajustar modelo/material/chips/observação de uma HASH ruim
// ANTES de aprovar — útil quando o testador errou ou esqueceu algo.
function EditHashBadApprovalForm({ctx,appr,onSaved}){
  const{mutate,allModels,gChips}=ctx;const models=allModels();
  const[model,setModel]=useState(appr.model||models[0]?.m||"M30S");
  const[material,setMaterial]=useState(appr.material||"");
  const[chips,setChips]=useState(appr.chips||"");
  const[notes,setNotes]=useState(appr.notes||"");
  const[location,setLocation]=useState(appr.location||"");
  const save=async()=>{
    const u={...appr,model,material,chips:chips||gChips(model,material)||"",notes,location};
    await fbSet("pendingApprovals",appr._id,u);mutate("approvals",a=>a.map(x=>x._id===appr._id?u:x));
    onSaved();
  };
  return<div>
    <div style={{fontWeight:800,fontSize:14,marginBottom:12}}>⚡ {appr.sn}</div>
    <Sel label="MODELO" value={model} onChange={e=>setModel(e.target.value)}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel>
    <MaterialPicker value={material} onChange={setMaterial}/>
    <Inp label="Quantidade de Chips" type="number" value={chips} onChange={e=>setChips(e.target.value)} placeholder={gChips(model,material)?String(gChips(model,material)):"0"}/>
    <Inp label="Descrição do Erro" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex: Hash 0 not detected..."/>
    <Inp label="Local" value={location} onChange={e=>setLocation(e.target.value.toUpperCase())} placeholder="Ex: PALETE 03"/>
    <Btn v="g" onClick={save} style={{width:"100%"}}>💾 Salvar</Btn>
  </div>;
}

// Mostra e deixa editar TUDO que o testador viu/preencheu (modelo, T/H, os 3
// slots com SN e resultado, componentes) — a mesma coisa, tanto pra máquina
// que já existe quanto pra uma nova que só vai ser criada ao aprovar.
function EditPendingTestForm({ctx,appr,test,onSaved}){
  const{data,mutate,allModels,gTH,gChips}=ctx;const models=allModels();
  const[model,setModel]=useState(test?.model||appr.model||models[0]?.m||"M30S");
  const[th,setTh]=useState(test?.th||appr.th||gTH(model));
  const[slots,setSlots]=useState([
    {hashSN:test?.slot0HashSN||"",result:test?.slot0Result||""},
    {hashSN:test?.slot1HashSN||"",result:test?.slot1Result||""},
    {hashSN:test?.slot2HashSN||"",result:test?.slot2Result||""},
  ]);
  const[ctr,setCtr]=useState(test?.controladora||"OFF");
  const[fonte,setFonte]=useState(test?.fonte||"OFF");
  const[fans,setFans]=useState(test?.fans||"OFF");
  const setSlot=(i,k,v)=>setSlots(s=>s.map((sl,idx)=>idx===i?{...sl,[k]:v}:sl));
  const save=async()=>{
    const apprU={...appr,model,th:Number(th)};
    await fbSet("pendingApprovals",appr._id,apprU);mutate("approvals",a=>a.map(x=>x._id===appr._id?apprU:x));
    if(test){
      const testU={...test,model,th:Number(th),
        slot0HashSN:slots[0].hashSN,slot0Result:slots[0].result,
        slot1HashSN:slots[1].hashSN,slot1Result:slots[1].result,
        slot2HashSN:slots[2].hashSN,slot2Result:slots[2].result,
        controladora:ctr,fonte,fans};
      await fbSet("tests",test._id,testU);mutate("tests",t=>t.map(x=>x._id===test._id?testU:x));
    }
    onSaved();
  };
  return<div>
    {!data.machines.find(m=>m.sn===appr.machineSN)&&<div style={{color:C.muted,fontSize:12,marginBottom:12}}>⚠️ Essa máquina ainda não existe no estoque — só vai ser criada quando você aprovar.</div>}
    <div style={{color:C.muted,fontSize:12,marginBottom:12}}>👷 {appr.employeeName} · {fmtDate(appr.date)}</div>
    {appr.adminNote&&<Alrt type="err">{appr.adminNote}</Alrt>}
    <div style={{display:"flex",gap:8}}>
      <div style={{flex:2}}><Sel label="MODELO" value={model} onChange={e=>{setModel(e.target.value);setTh(gTH(e.target.value))}}>{models.map(m=><option key={m.m}>{m.m}</option>)}</Sel></div>
      <Inp label="T/H" type="number" value={th} onChange={e=>setTh(e.target.value)} style={{width:80}}/>
    </div>
    <SL mt={8}>SLOTS</SL>
    {[0,1,2].map(i=>{
      const h=slots[i].hashSN?data.hashes.find(x=>x.sn===slots[i].hashSN.toUpperCase()):null;
      const slotPhoto=i===0?test?.slot0Photo:i===1?test?.slot1Photo:test?.slot2Photo;
      return<div key={i} style={{background:C.card2,borderRadius:10,padding:10,marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:800,color:C.subtle,marginBottom:6}}>SLOT {i+1}</div>
        <input value={slots[i].hashSN} onChange={e=>setSlot(i,"hashSN",e.target.value.toUpperCase())} placeholder="SN da HASH" style={{...inp,marginBottom:6,fontSize:12,padding:"7px 8px"}}/>
        {h&&<div style={{fontSize:11,color:C.blue,marginBottom:6}}>⚡ {h.model}{gChips(h.model,h.material)?` · ${gChips(h.model,h.material)} chips`:""}</div>}
        {slotPhoto&&<PhotoView photoKey={slotPhoto} style={{maxHeight:120,marginBottom:6}}/>}
        <div style={{display:"flex",gap:6}}>
          {[["good","BOA",C.green],["bad","RUIM",C.red],["","—",C.muted]].map(([v,l,c])=><button key={v||"none"} onClick={()=>setSlot(i,"result",v)} style={{flex:1,background:slots[i].result===v?c+"33":C.card2,color:slots[i].result===v?c:C.muted,border:"1px solid "+(slots[i].result===v?c:C.border),borderRadius:8,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>)}
        </div>
      </div>;
    })}
    <SL mt={8}>COMPONENTES</SL>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      {[["CTR",ctr,setCtr],["FONTE",fonte,setFonte],["FANS",fans,setFans]].map(([l,v,setV])=><Sel key={l} label={l} value={v} onChange={e=>setV(e.target.value)} style={{marginBottom:0}}><option value="ON">ON</option><option value="OFF">OFF</option></Sel>)}
    </div>
    {test?.testPhoto&&<><SL>FOTO DA TELA (enviada pelo testador)</SL><PhotoView photoKey={test.testPhoto} style={{maxHeight:220,marginBottom:14}}/></>}
    <Btn v="g" onClick={save} style={{width:"100%"}}>💾 Salvar</Btn>
  </div>;
}

function ApprovalsPage({ctx}){
  const{data,mutate,user,webhookUrl,setModal,gTH}=ctx;
  const[notes,setNotes]=useState({}),[processing,setProcessing]=useState(null);
  const pendingAll=data.approvals.filter(a=>a.status==="pending");
  const pending=pendingAll.filter(a=>!a.type||a.type==="machine");
  const pendingHashBad=pendingAll.filter(a=>a.type==="hashBad");
  const approveHashBad=async(appr)=>{
    setProcessing(appr._id);
    const existing=appr.existingId?data.hashes.find(h=>h._id===appr.existingId):data.hashes.find(h=>h.sn===appr.sn);
    if(existing){
      const u={...existing,status:"REPARO",location:appr.location||existing.location||"",...audit(user)};
      mutate("hashes",arr=>arr.map(x=>x._id===existing._id?u:x));await fbSet("hashes",existing._id,u);
      syncSheet(webhookUrl,"hashBad",{sn:u.sn,model:u.model,logPhoto:appr.logPhoto||"",obs:appr.notes,employeeName:appr.employeeName,employeeCode:appr.employeeCode});
    }else{
      const hid=uid();const hd={sn:appr.sn,model:appr.model,material:appr.material||"",chips:appr.chips||"",status:"REPARO",location:appr.location||"",machineSN:"",slot:-1,...audit(user),addedAt:TODAY()};
      await fbSet("hashes",hid,hd);mutate("hashes",arr=>[...arr,{...hd,_id:hid}]);
      syncSheet(webhookUrl,"hashBad",{sn:appr.sn,model:appr.model,logPhoto:appr.logPhoto||"",obs:appr.notes,employeeName:appr.employeeName,employeeCode:appr.employeeCode});
      // Se colocou uma quantidade de chips diferente da já configurada pra
      // esse modelo+material, guarda como referência (não sobrescreve a que já tem)
      if(appr.chips&&!data.customModels.find(cm=>cm.m===appr.model&&(cm.material||"")===(appr.material||"")&&String(cm.chips)===String(appr.chips))){
        const cmid=uid();const cmd={m:appr.model,th:0,chips:Number(appr.chips),material:appr.material||""};
        await fbSet("customModels",cmid,cmd);mutate("customModels",arr=>[...arr,{...cmd,_id:cmid}]);
      }
    }
    await markChanged("hashes");
    const lastRep=[...data.repairs].reverse().find(r=>r.hashSN===appr.sn);
    const origRepairerId=lastRep?.employeeId||lastRep?._by;
    if(origRepairerId){
      const fid=uid();const fdb={hashSN:appr.sn,machineSN:appr.machineSN,originalRepairerId:origRepairerId,testedBy:appr.employeeId,...audit(user),date:TODAY(),logPhotoKey:appr.logPhoto||"",notes:appr.notes,resolved:false};
      const fres=await fbSet("feedbacks",fid,fdb);
      if(!fres.ok){alert(`⚠️ Não consegui avisar o técnico que consertou antes!\nErro: ${fres.error}`)}
      else{mutate("feedbacks",f=>[...f,{...fdb,_id:fid}]);await markChanged("feedbacks");}
    }
    // (sem conserto anterior registrado = ninguém pra avisar, é normal)
    await fbSet("pendingApprovals",appr._id,{...appr,status:"approved",...audit(user)});mutate("approvals",a=>a.map(x=>x._id===appr._id?{...x,status:"approved"}:x));
    await markChanged("approvals");setProcessing(null);
  };
  const rejectHashBad=async(appr)=>{
    setProcessing(appr._id);
    await fbSet("pendingApprovals",appr._id,{...appr,status:"rejected",...audit(user)});mutate("approvals",a=>a.map(x=>x._id===appr._id?{...x,status:"rejected"}:x));
    await markChanged("approvals");setProcessing(null);
  };
  const approve=async(appr)=>{
    setProcessing(appr._id);const test=data.tests.find(t=>t._id===appr.testId);if(!test){setProcessing(null);return}
    const tUpd={...test,status:"approved",overallResult:"good",...audit(user)};await fbSet("tests",test._id,tUpd);mutate("tests",t=>t.map(x=>x._id===test._id?tUpd:x));
    const exMac=data.machines.find(m=>m.sn===appr.machineSN);
    if(exMac){
      // Quando o teste dá "TUDO BOA", TODOS os parâmetros ficam ON — mesmo os
      // slots sem SN preenchido (a máquina toda foi aprovada como funcionando).
      const mUpd={...exMac,situacao:"BOA",model:test.model||exMac.model,th:test.th||exMac.th,hash0:"ON",hash1:"ON",hash2:"ON",controladora:"ON",fonte:"ON",fans:"ON",hashSN0:test.slot0HashSN||exMac.hashSN0||"",hashSN1:test.slot1HashSN||exMac.hashSN1||"",hashSN2:test.slot2HashSN||exMac.hashSN2||"",...audit(user)};
      await fbSet("machines",exMac._id,mUpd);mutate("machines",m=>m.map(x=>x._id===exMac._id?mUpd:x));
      syncSheet(webhookUrl,"updateMachine",{sn:mUpd.sn,field:"situacao",to:"BOA",employeeName:user.name,employeeCode:user.code});
      if(test.model&&test.model!==exMac.model)syncSheet(webhookUrl,"updateMachine",{sn:mUpd.sn,field:"model",to:test.model,employeeName:user.name,employeeCode:user.code});
      if(test.th&&test.th!==exMac.th)syncSheet(webhookUrl,"updateMachine",{sn:mUpd.sn,field:"th",to:test.th,employeeName:user.name,employeeCode:user.code});
      ["hash0","hash1","hash2","controladora","fonte","fans"].forEach(k=>syncSheet(webhookUrl,"updateMachine",{sn:mUpd.sn,field:k,to:"ON",employeeName:user.name,employeeCode:user.code}));
      // Se o testador colocou um T/H diferente do padrão do modelo, guarda
      // isso como modelo customizado — próximas máquinas desse modelo já
      // vêm com o T/H certo.
      if(test.model&&test.th&&test.th!==gTH(test.model)&&!data.customModels.find(cm=>cm.m===test.model&&cm.th===test.th)){
        const cmid=uid();const cmd={m:test.model,th:test.th};
        await fbSet("customModels",cmid,cmd);mutate("customModels",arr=>[...arr,{...cmd,_id:cmid}]);
      }
    }else if(appr.machineSN){
      // Máquina testada que ainda não existia no estoque — cria agora, já como BOA
      const mid=uid();
      const mNew={sn:appr.machineSN,ref:appr.employeeCode||"",model:test.model,th:test.th||0,type:"complete",situacao:"BOA",
        hash0:"ON",hash1:"ON",hash2:"ON",
        hashSN0:test.slot0HashSN||"",hashSN1:test.slot1HashSN||"",hashSN2:test.slot2HashSN||"",
        controladora:"ON",fonte:"ON",fans:"ON",location:"",destino:"",...audit(user),addedAt:TODAY()};
      const saveResult=await fbSet("machines",mid,mNew);
      if(!saveResult.ok){
        alert(`⚠️ ERRO: não consegui criar a máquina ${mNew.sn} no banco de dados!\n\nErro: ${saveResult.error}\n\nA HASH e a planilha podem ter sido atualizadas mesmo assim — confira manualmente.`);
      }else{
        mutate("machines",m=>[...m,{...mNew,_id:mid}]);
      }
      syncSheet(webhookUrl,"addMachine",{sn:mNew.sn,model:mNew.model,th:mNew.th,situacao:"BOA",ref:mNew.ref,employeeName:user.name,employeeCode:user.code});
      ["hash0","hash1","hash2","controladora","fonte","fans"].forEach(k=>syncSheet(webhookUrl,"updateMachine",{sn:mNew.sn,field:k,to:mNew[k],employeeName:user.name,employeeCode:user.code}));
    }
    let newH=[...data.hashes];
    // Quando a máquina é aprovada com as 3 HASHs boas, o status da HASH vira
    // "NA MAQUINA" — ela deixa de aparecer como "solta" no estoque de HASHs,
    // porque agora está fisicamente dentro dessa máquina específica. E na
    // planilha, o SN dela vai pro slot certo (SLOT01/02/03) da máquina.
    const slotSNs=[test.slot0HashSN,test.slot1HashSN,test.slot2HashSN];
    for(const sn of slotSNs.filter(Boolean)){
      const h=newH.find(x=>x.sn===sn);
      const slotIdx=slotSNs.indexOf(sn);
      if(h){
        // Se essa HASH estava em OUTRA máquina, ou já tinha sido vendida,
        // limpa o vínculo antigo agora — só na aprovação é que isso vale de
        // verdade (a máquina/cliente antigos ficaram intocados até aqui).
        if(h.machineSN&&h.machineSN!==appr.machineSN){
          const oldMachine=data.machines.find(mm=>mm.sn===h.machineSN);
          if(oldMachine&&h.slot>=0){
            const slotField=h.slot===0?"hashSN0":h.slot===1?"hashSN1":"hashSN2";
            const statusField=h.slot===0?"hash0":h.slot===1?"hash1":"hash2";
            const oldUpd={...oldMachine,[slotField]:"",[statusField]:"OFF",...audit(user)};
            mutate("machines",arr=>arr.map(x=>x._id===oldMachine._id?oldUpd:x));await fbSet("machines",oldMachine._id,oldUpd);
            syncSheet(webhookUrl,"updateMachine",{sn:h.machineSN,field:slotField,to:"",employeeName:user.name,employeeCode:user.code});
          }
        }
        const fromLabel=h.status==="SAIDA"?"Desvinculada da venda":h.machineSN?"Desvinculada de "+h.machineSN:h.status;
        const u={...h,status:"NA MAQUINA",machineSN:appr.machineSN,slot:slotIdx,location:"",changeLog:[{field:"status",label:"Status",from:fromLabel,to:"NA MAQUINA em "+appr.machineSN,by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
        newH=newH.map(x=>x._id===h._id?u:x);await fbSet("hashes",h._id,u);
        syncSheet(webhookUrl,"hashApproved",{sn:u.sn,model:u.model,machineSN:appr.machineSN,slot:slotIdx,employeeName:user.name,employeeCode:user.code});
      }else{
        // HASH nova — só é criada agora que foi aprovada como boa. Usa as
        // características que o testador definiu (modelo/material/chips)
        // pra essa HASH nova, não o modelo genérico da máquina.
        const newModel=test.newHashModel||test.model;
        const newMaterial=test.newHashMaterial||"";
        const newChips=test.newHashChips||"";
        const hid=uid();const hd={sn,model:newModel,material:newMaterial,chips:newChips,status:"NA MAQUINA",machineSN:appr.machineSN,slot:slotIdx,...audit(user),addedAt:TODAY()};
        await fbSet("hashes",hid,hd);newH=[...newH,{...hd,_id:hid}];
        syncSheet(webhookUrl,"hashApproved",{sn,model:newModel,machineSN:appr.machineSN,slot:slotIdx,employeeName:user.name,employeeCode:user.code});
        // Se colocou uma quantidade de chips que ainda não tava configurada
        // pra esse modelo+material, guarda como referência pras próximas.
        if(newChips&&!data.customModels.find(cm=>cm.m===newModel&&(cm.material||"")===newMaterial&&cm.chips)){
          const cmid=uid();const cmd={m:newModel,th:0,chips:Number(newChips),material:newMaterial};
          await fbSet("customModels",cmid,cmd);mutate("customModels",arr=>[...arr,{...cmd,_id:cmid}]);
        }
      }
    }
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
    // Devolve pro tester original como sessão REPROVADA — ele corrige e reenvia.
    // A planilha só é atualizada quando a revisão finalmente aprovar de verdade.
    const test=data.tests.find(t=>t._id===appr.testId);
    if(test){
      const tUpd={...test,status:"rejected",adminNote:n,...audit(user)};
      await fbSet("tests",test._id,tUpd);mutate("tests",t=>t.map(x=>x._id===test._id?tUpd:x));
      const sid=uid();
      const s={_id:sid,employeeId:appr.employeeId,machineSN:appr.machineSN,model:test.model,th:test.th,
        slots:[
          {hashSN:test.slot0HashSN||"",status:test.slot0Result||"",photoKey:test.slot0Photo||null},
          {hashSN:test.slot1HashSN||"",status:test.slot1Result||"",photoKey:test.slot1Photo||null},
          {hashSN:test.slot2HashSN||"",status:test.slot2Result||"",photoKey:test.slot2Photo||null},
        ],controladora:test.controladora||"",fonte:test.fonte||"",fans:test.fans||"",photoKey:test.testPhoto||null,
        newHashChars:test.newHashModel?{model:test.newHashModel,material:test.newHashMaterial||"",chips:test.newHashChips||""}:null,
        adminNotes:[`❌ REPROVADA pelo Admin ${user.name}: ${n||"sem observação"}`],
        rejected:true,updatedAt:stamp()};
      await fbSet("sessions",sid,s);
    }
    await markChanged("approvals");await markChanged("machines");setProcessing(null);
  };
  return<div>
    <div style={{fontWeight:900,fontSize:18,marginBottom:4}}>Revisão de Testes</div>
    <div style={{color:C.muted,fontSize:12,marginBottom:16}}>🖥️ {pending.length} máquina(s) · ⚡ {pendingHashBad.length} HASH(s) ruim(s) aguardando</div>

    {pendingHashBad.length>0&&<>
      <div style={{fontWeight:800,fontSize:14,color:C.red,marginBottom:8}}>⚡ HASHs Ruins ({pendingHashBad.length})</div>
      {pendingHashBad.length>1&&<div style={{display:"flex",gap:8,marginBottom:10}}>
        <Btn v="g" onClick={async()=>{if(!confirm(`Aprovar TODAS as ${pendingHashBad.length} HASHs ruins?`))return;for(const a of pendingHashBad)await approveHashBad(a)}} disabled={!!processing} style={{flex:1}}>✓ Aprovar todas ({pendingHashBad.length})</Btn>
        <Btn v="d" onClick={async()=>{if(!confirm(`Reprovar TODAS as ${pendingHashBad.length} HASHs ruins?`))return;for(const a of pendingHashBad)await rejectHashBad(a)}} disabled={!!processing} style={{flex:1}}>✗ Reprovar todas</Btn>
      </div>}
      {pendingHashBad.map(appr=><Card key={appr._id} accent={C.red}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>⚡ {appr.sn}</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:8}}>{appr.model}{appr.material?` · ${appr.material==="FIBRA"?"Fibra":"Alumínio"}`:""} · 👷 {appr.employeeName} · {fmtDate(appr.date)}{appr.machineSN?` · Máq. ${appr.machineSN}`:""}</div>
        {appr.notes&&<div style={{fontSize:12,marginBottom:8}}>📝 {appr.notes}</div>}
        {appr.location&&<div style={{fontSize:12,color:C.muted,marginBottom:8}}>📍 {appr.location}</div>}
        {appr.logPhoto&&<PhotoView photoKey={appr.logPhoto} style={{marginBottom:10,maxHeight:150}}/>}
        <div style={{display:"flex",gap:8}}>
          <Btn v="s" onClick={()=>setModal(<Modal title={`✏️ ${appr.sn}`} onClose={()=>setModal(null)}><EditHashBadApprovalForm ctx={ctx} appr={appr} onSaved={()=>setModal(null)}/></Modal>)} style={{flex:1}}>✏️ Editar</Btn>
        </div>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <Btn v="d" onClick={()=>rejectHashBad(appr)} disabled={processing===appr._id} style={{flex:1}}>✗ Reprovar</Btn>
          <Btn v="g" onClick={()=>approveHashBad(appr)} disabled={processing===appr._id} style={{flex:1}}>{processing===appr._id?"...":"✓ Aprovar → REPARO"}</Btn>
        </div>
      </Card>)}
    </>}

    <div style={{fontWeight:800,fontSize:14,color:C.blue,marginBottom:8,marginTop:pendingHashBad.length>0?18:0}}>🖥️ Máquinas ({pending.length})</div>
    {pending.length>1&&<div style={{display:"flex",gap:8,marginBottom:14}}>
      <Btn v="g" onClick={async()=>{if(!confirm(`Aprovar TODAS as ${pending.length} pendentes?`))return;for(const a of pending)await approve(a)}} disabled={!!processing} style={{flex:1}}>✓ Aprovar todas ({pending.length})</Btn>
      <Btn v="d" onClick={async()=>{if(!confirm(`Reprovar TODAS as ${pending.length} pendentes?`))return;for(const a of pending)await reject(a)}} disabled={!!processing} style={{flex:1}}>✗ Reprovar todas</Btn>
    </div>}
    {pending.length===0&&pendingHashBad.length===0?<div style={{textAlign:"center",color:C.muted,padding:40}}><div style={{fontSize:40}}>✅</div><div>Nenhuma revisão pendente</div></div>
      :pending.map(appr=>{const test=data.tests.find(t=>t._id===appr.testId);return<Card key={appr._id} accent={C.blue}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>🖥️ {appr.machineSN||"SEM SN"}</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:8}}>{appr.model} · {appr.th}TH · 👷 {appr.employeeName} · {fmtDate(appr.date)}</div>
        {test&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>{[test.slot0HashSN,test.slot1HashSN,test.slot2HashSN].map((sn,i)=>sn&&<span key={i} style={{background:"#0c1a2e",border:`1px solid ${C.border}`,borderRadius:6,padding:"2px 8px",fontSize:10,color:C.blue}}>S{i}: {sn}</span>)}</div>}
        {test?.testPhoto&&<PhotoView photoKey={test.testPhoto} style={{marginBottom:10,maxHeight:150}}/>}
        <Inp label="Observação para rejeição (opcional)" value={notes[appr._id]||""} onChange={e=>setNotes({...notes,[appr._id]:e.target.value})} placeholder="Ex: rever HASH 2..."/>
        <div style={{display:"flex",gap:8}}>
          <Btn v="s" onClick={()=>setModal(<Modal title={`✏️ ${appr.machineSN}`} onClose={()=>setModal(null)}><EditPendingTestForm ctx={ctx} appr={appr} test={test} onSaved={()=>setModal(null)}/></Modal>)} style={{flex:1}}>✏️ Editar</Btn>
          <Btn v="b" onClick={()=>setModal(<Modal title={`📋 ${appr.machineSN||"SEM SN"}`} onClose={()=>setModal(null)}><ApprovalDetail ctx={ctx} appr={appr}/></Modal>)} style={{flex:1}}>📋 Ver mais</Btn>
        </div>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <Btn v="d" onClick={()=>reject(appr)} disabled={processing===appr._id} style={{flex:1}}>✗ Reprovar</Btn><Btn v="g" onClick={()=>approve(appr)} disabled={processing===appr._id} style={{flex:1}}>{processing===appr._id?"...":"✓ Aprovar → BOA"}</Btn></div>
      </Card>})}
    {data.approvals.filter(a=>a.status!=="pending"&&(!a.type||a.type==="machine")).length>0&&<><SL mt={16}>PROCESSADAS</SL>{data.approvals.filter(a=>a.status!=="pending"&&(!a.type||a.type==="machine")).slice(-5).reverse().map(a=><div key={a._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}><span>🖥️ {a.machineSN||"SEM SN"}</span><div style={{display:"flex",gap:6,alignItems:"center"}}><Tag color={a.status==="approved"?C.green:C.red} small>{a.status==="approved"?"Aprovada":"Reprovada"}</Tag><button onClick={()=>setModal(<Modal title={`📋 ${a.machineSN||"SEM SN"}`} onClose={()=>setModal(null)}><ApprovalDetail ctx={ctx} appr={a}/></Modal>)} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11}}>Ver mais</button>{user.code==="019"&&<button onClick={async()=>{if(!confirm("Apagar essa revisão do histórico? Não dá pra desfazer."))return;await fbDel("pendingApprovals",a._id);mutate("approvals",arr=>arr.filter(x=>x._id!==a._id));await markChanged("approvals")}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button>}</div></div>)}</>}
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
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div><div style={{fontWeight:900,fontSize:18}}>Equipe</div><div style={{color:C.muted,fontSize:12}}>{data.employees.filter(e=>isSuper||e.code!=="019").length} funcionários</div></div><Btn onClick={openAdd}>+ Funcionário</Btn></div>
    {data.employees.map(e=>{
      if(e.code==="019"&&!isSuper)return null; // ninguém além do próprio 019 vê essa conta
      if(!canSeeEmp(e._id)&&!data.employees.find(x=>x._id===ctx.user._id)?.permissions?.admin)return null;
      const rT=data.repairs.filter(r=>(r.employeeId===e._id||r._by===e._id)&&r.date===today&&r.type!=="already_good").length;
      const gT=data.repairs.filter(r=>(r.employeeId===e._id||r._by===e._id)&&r.date===today&&r.type==="already_good").length;
      const tT=data.tests.filter(t=>(t.employeeId===e._id||t._by===e._id)&&t.date===today).length;
      const fdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===e._id).length;
      return<Card key={e._id}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:C.card2,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.accent,fontSize:18,flexShrink:0}}>{e.name[0]}</div>
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
    <DateInp label="DATA" value={date} onChange={e=>setDate(e.target.value)}/>
    <div style={{color:C.muted,fontSize:12,marginBottom:12}}>{items.length} movimentações nesse dia, de todos os funcionários</div>
    {items.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:24}}>Nada registrado nesta data</div>
      :items.map((it,i)=><div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><div style={{fontSize:13}}>{it.text}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(it.at)}</div></div>)}
  </div>;
}

function EmpProfile({ctx,emp}){
  const{data,mutate,setModal,user}=ctx;const[dateFilter,setDateFilter]=useState(TODAY());
  const isSuper=user.code==="019";
  const allR=data.repairs.filter(r=>r.employeeId===emp._id||r._by===emp._id);const allT=data.tests.filter(t=>t.employeeId===emp._id||t._by===emp._id);
  const fdbs=data.feedbacks.filter(f=>!f.resolved&&f.originalRepairerId===emp._id);
  const dayR=allR.filter(r=>r.date===dateFilter);const dayT=allT.filter(t=>t.date===dateFilter);
  const byDate={};[...allR.map(r=>r.date),...allT.map(t=>t.date)].forEach(d=>{byDate[d]=(byDate[d]||0)+1});
  const totalRepairs=allR.filter(r=>r.type!=="already_good").length;
  const totalGood=allR.filter(r=>r.type==="already_good").length;
  const wipeHistory=async()=>{
    const step1=confirm(`Apagar TODO o histórico de ${emp.name}? (${allR.length} conserto(s), ${allT.length} teste(s))\n\nIsso NÃO muda o estoque atual, só apaga o histórico dele. Não dá pra desfazer.`);
    if(!step1)return;
    const step2=prompt(`Pra confirmar de verdade, digita o código do funcionário (${emp.code}):`);
    if(step2!==emp.code){alert("Código não confere — nada foi apagado.");return}
    const hashBads=(data.approvals||[]).filter(a=>a.type==="hashBad"&&(a.employeeId===emp._id||a._by===emp._id));
    for(const r of allR)await fbDel("repairs",r._id);
    for(const t of allT)await fbDel("tests",t._id);
    for(const a of hashBads)await fbDel("pendingApprovals",a._id);
    for(const f of fdbs)await fbDel("feedbacks",f._id);
    mutate("repairs",arr=>arr.filter(r=>!(r.employeeId===emp._id||r._by===emp._id)));
    mutate("tests",arr=>arr.filter(t=>!(t.employeeId===emp._id||t._by===emp._id)));
    mutate("approvals",arr=>arr.filter(a=>!(a.type==="hashBad"&&(a.employeeId===emp._id||a._by===emp._id))));
    mutate("feedbacks",arr=>arr.filter(f=>!(f.originalRepairerId===emp._id)));
    await markChanged("repairs");await markChanged("tests");await markChanged("approvals");await markChanged("feedbacks");
    alert(`Histórico de ${emp.name} apagado.`);
  };
  return<div>
    {isSuper&&<Btn v="d" onClick={wipeHistory} style={{width:"100%",marginBottom:14}}>🗑️ Apagar Histórico de {emp.name} (só admin 019)</Btn>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
      {[[totalRepairs,"Consertos",C.accent],[allT.length,"Testes",C.blue],[fdbs.length,"Pendências",C.red]].map(([v,l,c])=><div key={l} style={{background:C.bg,borderRadius:10,padding:12,textAlign:"center"}}><div style={{fontSize:24,fontWeight:900,color:c}}>{v}</div><div style={{fontSize:10,color:C.muted}}>{l}</div></div>)}
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
          <button onClick={async()=>{const list=emp.allowedEmployees||[];const newList=allowed?list.filter(x=>x!==e._id):[...list,e._id];const u={...emp,allowedEmployees:newList};mutate("employees",arr=>arr.map(x=>x._id===emp._id?u:x));await fbSet("employees",emp._id,u);await markChanged("employees")}} style={{background:allowed?C.green:C.card2,border:"none",color:"#fff",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{allowed?"ON":"OFF"}</button>
        </div>})}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"flex-end"}}>
      <div style={{flex:1}}><DateInp label="FILTRAR DATA" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div>
      <Btn v="s" onClick={()=>copyReport(emp,data.repairs,data.tests,dateFilter)} style={{marginBottom:12}}>📋</Btn>
    </div>
    {dayR.length===0&&dayT.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sem registros nesta data</div>:<>
      {dayR.map(r=><Card key={r._id} accent={r.type==="already_good"?C.green:r.type==="rework"?C.amber:C.blue}><div style={{fontWeight:700,fontSize:13,color:r.type==="already_good"?C.green:r.type==="rework"?C.amber:C.blue}}>{r.type==="already_good"?"✅":r.type==="rework"?"🔁 RETRABALHO":"🔧"} {r.hashSN||"SEM SN"} — {r.model}</div><div style={{fontSize:11,color:C.muted}}>{fmtTS(r._at)}</div>{r.type!=="already_good"&&<div style={{fontSize:10,color:C.subtle}}>Chips:{r.chips||0} Sens:{r.sensores||0} LDOs:{r.ldos||0}{r.obsManual?` · ${r.obsManual}`:""}</div>}</Card>)}
      {dayT.map(t=>{const stC=t.status==="pending"?C.blue:t.status==="rejected"?C.amber:t.overallResult==="good"?C.green:C.red;return<Card key={t._id} accent={stC}><div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div><div style={{fontSize:11,color:C.muted}}>{fmtTS(t._at)}</div><Tag color={stC} small>{t.status==="pending"?"Aguard.Revisão":t.status==="rejected"?"REPROVADA":t.overallResult==="good"?"BOA":"RUIM"}</Tag></Card>})}
    </>}
    <SL mt={12}>HISTÓRICO</SL>
    {Object.keys(byDate).sort().reverse().slice(0,20).map(d=><div key={d} onClick={()=>setDateFilter(d)} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13,cursor:"pointer"}}><span style={{color:d===dateFilter?C.accent:C.text}}>{fmtDate(d)}</span><span style={{fontWeight:700,color:C.accent}}>{byDate[d]} itens</span></div>)}
    {fdbs.length>0&&<><SL mt={12}>PENDÊNCIAS</SL>{fdbs.map(f=><Card key={f._id} accent={C.red}><div style={{color:C.red,fontWeight:700}}>⚡ {f.hashSN}</div><div style={{fontSize:12}}>{f.notes}</div></Card>)}</>}
    <SL mt={12}>PERMISSÕES</SL>
    {PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:13}}>{label}</span><button onClick={async()=>{const u={...emp,permissions:{...emp.permissions,[key]:!emp.permissions?.[key]}};mutate("employees",arr=>arr.map(x=>x._id===emp._id?u:x));await fbSet("employees",emp._id,u)}} style={{background:emp.permissions?.[key]?C.green:C.card2,border:"none",color:"#fff",borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{emp.permissions?.[key]?"ON":"OFF"}</button></div>)}
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
      <button onClick={()=>toggle(key)} style={{background:perms[key]?C.green+"22":C.card2,color:perms[key]?C.green:C.muted,border:`1px solid ${perms[key]?C.green:C.border}`,borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{perms[key]?"ON":"OFF"}</button>
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
        const batchErrors=[];
        for(let i=0;i<writes.length;i+=500){const r=await fbBatch(writes.slice(i,i+500));if(!r.ok)batchErrors.push(...r.errors)}
        if(batchErrors.length)setLog(l=>l.map(x=>x.c===c?{c,msg:"✗ Erro: "+batchErrors.join(" | ")}:x));
        else setLog(l=>l.map(x=>x.c===c?{c,msg:`✓ ${docs.length} migrados com sucesso`}:x));
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
  const{data,mutate,webhookUrl,setWebhookUrl,dataWarnings,setModal,resetMaxCount,gTH,allModels}=ctx;
  const[url,setUrl]=useState(webhookUrl),[testRes,setTestRes]=useState(null),[importing,setImporting]=useState(false),[importRes,setImportRes]=useState(null),[newModel,setNewModel]=useState(""),[newTH,setNewTH]=useState("");
  const[resetConfirmText,setResetConfirmText]=useState(""),[resetting,setResetting]=useState(false),[resetProg,setResetProg]=useState(""),[resetRes,setResetRes]=useState("");
  // Apaga TODAS as máquinas do app e reimporta tudo de novo direto da
  // planilha, já com o número da linha certinho em cada uma. É uma ação
  // grande — só roda depois de digitar a frase de confirmação.
  const resetAndReimport=async()=>{
    if(resetConfirmText.trim().toUpperCase()!=="RESETAR MAQUINAS")return;
    setResetting(true);setResetRes("");
    try{
      setResetProg("Lendo a planilha...");
      const sheetMachines=await importMachinesFromSheet(webhookUrl);
      setResetProg(`Apagando ${data.machines.length} máquina(s) do app...`);
      const ids=data.machines.map(m=>m._id);
      for(let i=0;i<ids.length;i+=300){
        await Promise.all(ids.slice(i,i+300).map(id=>fbDel("machines",id)));
        setResetProg(`Apagando... ${Math.min(i+300,ids.length)}/${ids.length}`);
      }
      mutate("machines",()=>[]);
      setResetProg(`Recriando ${sheetMachines.length} máquina(s) com número da linha...`);
      const writes=sheetMachines.map(m=>{const id=uid();return{c:"machines",id,d:{...m,type:m.type||"complete",addedAt:m.addedAt||TODAY()}}});
      for(let i=0;i<writes.length;i+=300){
        await fbBatch(writes.slice(i,i+300));
        setResetProg(`Recriando... ${Math.min(i+300,writes.length)}/${writes.length}`);
      }
      mutate("machines",()=>writes.map(w=>({...w.d,_id:w.id})));
      resetMaxCount("machines",writes.length);
      await markChanged("machines");
      setResetRes(`✓ Pronto! ${writes.length} máquina(s) recriadas, todas com o número da linha da planilha.`);
    }catch(e){setResetRes("✗ Erro: "+e.message)}
    setResetting(false);setResetProg("");setResetConfirmText("");
  };
  const[linkTecProg,setLinkTecProg]=useState(""),[linkTecRes,setLinkTecRes]=useState(""),[linkingTec,setLinkingTec]=useState(false);
  // Vincula o técnico (nome que já está na planilha) nas HASHs que já foram
  // cadastradas antes e ficaram sem esse vínculo — cria o registro de
  // conserto pra elas, usando a data que a HASH já tinha.
  const linkTecnicos=async()=>{
    setLinkingTec(true);setLinkTecRes("");setLinkTecProg("Lendo a planilha...");
    try{
      const sheetHashes=await importHashesFromSheet(webhookUrl);
      const targets=data.hashes.filter(h=>validSN(h.sn)&&!h.repairedBy);
      let linked=0,noMatch=0;
      const hashWrites=[],repairWrites=[];
      targets.forEach((h,i)=>{
        const sheetH=sheetHashes.find(sh=>validSN(sh.sn)===validSN(h.sn));
        const tecnicoName=(sheetH?.tecnico||"").trim();
        if(!tecnicoName)return;
        const emp=data.employees.find(e=>e.name.trim().toLowerCase()===tecnicoName.toLowerCase());
        if(!emp){noMatch++;return}
        const date=h.addedAt||TODAY();
        hashWrites.push({c:"hashes",id:h._id,d:{...h,repairedBy:emp._id,repairedByName:emp.name}});
        repairWrites.push({c:"repairs",id:uid(),d:{hashSN:h.sn,model:h.model,type:"repair",employeeId:emp._id,_by:emp._id,_byName:emp.name,_at:date,date,status:"TESTAR"}});
        linked++;
      });
      setLinkTecProg(`Salvando ${linked} vínculo(s)...`);
      const allWrites=[...hashWrites,...repairWrites];
      for(let i=0;i<allWrites.length;i+=200)await fbBatch(allWrites.slice(i,i+200));
      mutate("hashes",arr=>arr.map(h=>{const w=hashWrites.find(x=>x.id===h._id);return w?w.d:h}));
      mutate("repairs",arr=>[...arr,...repairWrites.map(w=>({...w.d,_id:w.id}))]);
      await markChanged("hashes");await markChanged("repairs");
      setLinkTecRes(`✓ ${linked} HASH(s) vinculada(s) ao técnico${noMatch?` (${noMatch} não encontraram um funcionário com esse nome cadastrado)`:""}.`);
    }catch(e){setLinkTecRes("✗ Erro: "+e.message)}
    setLinkingTec(false);setLinkTecProg("");
  };
  const[fixHistProg,setFixHistProg]=useState(""),[fixHistRes,setFixHistRes]=useState(""),[fixingHist,setFixingHist]=useState(false);
  // Acha HASHs que já têm o técnico vinculado (repairedBy preenchido) mas
  // que NÃO têm nenhum registro de conserto no histórico — normalmente
  // sobra de uma importação antiga, de antes do histórico se criar junto
  // automaticamente. Cria o registro que falta pra cada uma.
  const fixMissingHistory=async()=>{
    setFixingHist(true);setFixHistRes("");setFixHistProg("Procurando...");
    try{
      const targets=data.hashes.filter(h=>validSN(h.sn)&&h.repairedBy);
      const missing=targets.filter(h=>!data.repairs.some(r=>r.hashSN===h.sn&&(r.employeeId===h.repairedBy||r._by===h.repairedBy)));
      setFixHistProg(`Criando ${missing.length} registro(s) que faltavam...`);
      const writes=missing.map(h=>({c:"repairs",id:uid(),d:{hashSN:h.sn,model:h.model,type:"repair",employeeId:h.repairedBy,_by:h.repairedBy,_byName:h.repairedByName||"",_at:h.addedAt||TODAY(),date:h.addedAt||TODAY(),status:"TESTAR"}}));
      for(let i=0;i<writes.length;i+=200)await fbBatch(writes.slice(i,i+200));
      mutate("repairs",arr=>[...arr,...writes.map(w=>({...w.d,_id:w.id}))]);
      await markChanged("repairs");
      setFixHistRes(`✓ ${missing.length} registro(s) de conserto recriados no histórico.`);
    }catch(e){setFixHistRes("✗ Erro: "+e.message)}
    setFixingHist(false);setFixHistProg("");
  };
  const recalcProtection=()=>{
    resetMaxCount("machines",data.machines.length);
    resetMaxCount("hashes",data.hashes.length);
    alert(`✓ Recalculado! Máquinas: ${data.machines.length} · HASHs: ${data.hashes.length}\nAgora esses números viram a nova referência — sem avisos falsos de "sumiço".`);
  };
  // Corrige em massa máquinas SEM SN que tiveram o modelo corrompido (ex: o
  // bug antigo do comparador que trocou M30S por M21S em várias de uma vez).
  // Só mexe em quem NÃO tem SN — quem tem SN já é resolvido pela comparação
  // normal, com segurança, uma a uma.
  const[fixFrom,setFixFrom]=useState(""),[fixTo,setFixTo]=useState(""),[fixing,setFixing]=useState(false),[fixRes,setFixRes]=useState("");
  const fixTargets=data.machines.filter(m=>m.model===fixFrom&&!(m.sn||"").trim());
  const bulkFixModel=async()=>{
    if(!fixFrom||!fixTo||fixFrom===fixTo)return;
    if(!confirm(`Confirma? Vai mudar ${fixTargets.length} máquina(s) SEM SN de "${fixFrom}" pra "${fixTo}". Não afeta nenhuma máquina com SN preenchido.`))return;
    setFixing(true);
    for(let i=0;i<fixTargets.length;i+=200){
      const batch=fixTargets.slice(i,i+200);
      await fbBatch(batch.map(m=>({c:"machines",id:m._id,d:{...m,model:fixTo}})));
    }
    mutate("machines",arr=>arr.map(m=>m.model===fixFrom&&!(m.sn||"").trim()?{...m,model:fixTo}:m));
    await markChanged("machines");
    setFixRes(`✓ ${fixTargets.length} máquina(s) corrigida(s) de "${fixFrom}" pra "${fixTo}".`);
    setFixing(false);
  };
  const exportBackup=()=>{
    const backup={exportedAt:stamp(),employees:data.employees,machines:data.machines,hashes:data.hashes,repairs:data.repairs,tests:data.tests,feedbacks:data.feedbacks,approvals:data.approvals,customModels:data.customModels,pallets:data.pallets,clients:data.clients};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="hashstock-backup-"+TODAY()+".json";a.click();
  };
  const[driveUrl,setDriveUrl]=useState(DRIVE_UPLOAD_URL),[driveTestRes,setDriveTestRes]=useState(null);
  const saveDriveUrl=()=>{localStorage.setItem("driveUploadUrl",driveUrl);DRIVE_UPLOAD_URL=driveUrl;alert("✓ URL do Drive salva!")};
  const testDriveUrl=async()=>{try{const r=await fetch(driveUrl+"?action=test");const d=await r.json();setDriveTestRes(d.status==="ok"?"✓ Conectado! "+d.time:"✗ "+JSON.stringify(d))}catch(e){setDriveTestRes("✗ Falha: "+e.message)}};
  const saveWh=()=>{localStorage.setItem("webhookUrl",url);setWebhookUrl(url);alert("✓ Webhook salvo!")};
  const testWh=async()=>{try{const r=await fetch(url+"?action=test");const d=await r.json();setTestRes(d.status==="ok"?`✓ Conectado! ${d.time} — versão do script: ${d.version||"❌ SEM VERSÃO (é a v4 antiga, precisa reimplantar como v5!)"}`:"✗ "+JSON.stringify(d))}catch(e){setTestRes("✗ Falha: "+e.message)}};
  const[importProg,setImportProg]=useState("");
const doImportMachines=async()=>{if(!url){alert("Configure o webhook");return}setImporting(true);setImportRes(null);setImportProg("Buscando...");try{const machines=await importMachinesFromSheet(url,(cur,total)=>setImportProg(`${cur}/${total} recebidas...`));if(!machines.length){setImportRes("Nenhuma máquina.");setImporting(false);return}setImportProg(`Salvando ${machines.length}...`);const writes=machines.map(m=>{const id=uid();return{c:"machines",id,d:{...m,_id:undefined,type:m.type||"complete",addedAt:m.addedAt||TODAY()}}});for(let i=0;i<writes.length;i+=500){await fbBatch(writes.slice(i,i+500));setImportProg(`${Math.min(i+500,writes.length)}/${writes.length} salvas...`)}mutate("machines",existing=>[...existing,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("machines");setImportRes(`✓ ${machines.length} máquinas importadas!`)}catch(e){setImportRes("✗ "+e.message)}setImporting(false);setImportProg("")};
const doImportHashes=async()=>{if(!url){alert("Configure o webhook");return}setImporting(true);setImportRes(null);try{const hashes=await importHashesFromSheet(url);if(!hashes.length){setImportRes("Nenhuma HASH na aba REPARO DE HASH.");setImporting(false);return}const writes=hashes.map(h=>{const id=uid();let status="REPARO";const sit=String(h.situacao||"").toUpperCase();if(sit==="BOA")status="ON";else if(sit==="TESTAR")status="TESTAR";else if(sit==="STOCK")status="STOCK";return{c:"hashes",id,d:{sn:h.sn||"",model:h.model||"",status,chips:h.chips||0,defeito:h.defeito||"",tecnico:h.tecnico||"",machineSN:"",slot:-1,repairedBy:"",addedAt:h.addedAt||TODAY()}}});for(let i=0;i<writes.length;i+=500)await fbBatch(writes.slice(i,i+500));mutate("hashes",existing=>[...existing,...writes.map(w=>({...w.d,_id:w.id}))]);await markChanged("hashes");setImportRes(`✓ ${hashes.length} HASHs importadas!`)}catch(e){setImportRes("✗ "+e.message)}setImporting(false)};
  const addModel=async()=>{if(!newModel.trim()||!newTH)return;const id=uid();const d={m:newModel.trim(),th:Number(newTH)};await fbSet("customModels",id,d);mutate("customModels",m=>[...m,{...d,_id:id}]);setNewModel("");setNewTH("")};
  const delModel=async m=>{await fbDel("customModels",m._id);mutate("customModels",arr=>arr.filter(x=>x._id!==m._id))};
  const[chipsModel,setChipsModel]=useState(""),[chipsMaterial,setChipsMaterial]=useState(""),[chipsVal,setChipsVal]=useState("");
  const allModelsForChips=[...new Set([...DEF_MODELS.map(m=>m.m),...data.customModels.map(m=>m.m)])].sort();
  // Fica numa lista separada dos "Modelos Customizados" (TH) — nunca mistura
  // os dois. Uma HASH do mesmo modelo pode ter placa de Fibra ou Alumínio,
  // com quantidade de chips diferente, então guarda por modelo+material.
  const chipEntries=data.customModels.filter(m=>m.chips);
  const setChipsForModel=async()=>{
    if(!chipsModel||!chipsVal)return;
    const existing=data.customModels.find(m=>m.m===chipsModel&&(m.material||"")===(chipsMaterial||""));
    if(existing){const u={...existing,chips:Number(chipsVal)};await fbSet("customModels",existing._id,u);mutate("customModels",arr=>arr.map(x=>x._id===existing._id?u:x))}
    else{const id=uid();const d={m:chipsModel,th:0,chips:Number(chipsVal),material:chipsMaterial||""};await fbSet("customModels",id,d);mutate("customModels",m=>[...m,{...d,_id:id}])}
    setChipsModel("");setChipsVal("");setChipsMaterial("");
  };
  // Lista real de chips por modelo (que você passou) — carrega sozinho ao
  // abrir Config, só preenche o que ainda não estiver configurado, nunca
  // sobrescreve o que você já ajustou manualmente.
  const KNOWN_CHIPS=[
    ["S19",76],["S19 Pro",114],["S19PRO",114],
    ["S19J",126],["S19JPRO",126],["S19JPRO+",126],
    ["S19k Pro",82],["S19 XP",110],["S19XP",110],
    ["S21",108],["S21XP",91],["T21",108],["T19",76],
    ["S17",48],["S17 Pro",48],["T17",44],["T17+",44],
    ["S15",72],["S9",63],["L3+",72],
  ];
  useEffect(()=>{
    (async()=>{
      for(const[m,chips]of KNOWN_CHIPS){
        if(!allModelsForChips.includes(m))continue;
        const already=data.customModels.find(x=>x.m===m&&!x.material);
        if(already)continue;
        const id=uid();const d={m,th:0,chips,material:""};await fbSet("customModels",id,d);mutate("customModels",arr=>[...arr,{...d,_id:id}]);
      }
    })();
  },[]);
  return<div>
    <div style={{fontWeight:900,fontSize:18,marginBottom:18}}>⚙️ Configurações</div>
    {dataWarnings.length>0&&<Card style={{marginBottom:14,border:`1px solid ${C.red}`}}>
      <SL>🛡️ AVISOS DE INTEGRIDADE DE DADOS ({dataWarnings.length})</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:8}}>Sempre que uma leitura do banco vier suspeitosamente menor que o normal, o app protege o que já está na tela e registra aqui em vez de apagar dados. Se você mesmo apagou dados de propósito (ex: limpou duplicatas), clica no botão abaixo pra avisar o app que o número novo (menor) está certo.</div>
      <Btn v="y" onClick={recalcProtection} style={{width:"100%",marginBottom:10}}>🔄 Recalcular proteção (o número atual está certo)</Btn>
      {dataWarnings.map((w,i)=><div key={i} style={{padding:"6px 0",borderBottom:`1px solid ${C.border}`,fontSize:12,color:"#ff9b9b"}}>{w.msg}<div style={{color:C.muted,fontSize:10}}>{fmtTS(w.at)}</div></div>)}
    </Card>}
    <Card style={{marginBottom:14,border:`1px solid ${C.amber}`}}>
      <SL>🔧 CORRIGIR MODELO EM MASSA (só máquinas sem SN)</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Use isso quando várias máquinas SEM SN ficaram com o modelo errado (ex: o bug do comparador antigo). Só muda quem não tem SN preenchido — quem tem SN, resolve pela comparação normal.</div>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <Sel label="MODELO ERRADO (de)" value={fixFrom} onChange={e=>setFixFrom(e.target.value)} style={{flex:1}}><option value="">Selecionar...</option>{[...new Set(data.machines.map(m=>m.model))].filter(Boolean).sort().map(m=><option key={m}>{m}</option>)}</Sel>
        <Sel label="MODELO CERTO (para)" value={fixTo} onChange={e=>setFixTo(e.target.value)} style={{flex:1}}><option value="">Selecionar...</option>{allModels().map(m=><option key={m.m}>{m.m}</option>)}</Sel>
      </div>
      {fixFrom&&<div style={{color:C.amber,fontSize:12,marginBottom:8}}>⚠️ {fixTargets.length} máquina(s) sem SN com modelo "{fixFrom}" serão corrigidas.</div>}
      {fixRes&&<Alrt type="ok">{fixRes}</Alrt>}
      <Btn v="y" onClick={bulkFixModel} disabled={fixing||!fixFrom||!fixTo||fixFrom===fixTo} style={{width:"100%"}}>{fixing?"Corrigindo...":"🔧 Corrigir "+(fixTargets.length||0)+" máquina(s)"}</Btn>
    </Card>
    <Card style={{marginBottom:14,border:`1px solid ${C.red}`}}>
      <SL>💣 RESETAR E REIMPORTAR TODAS AS MÁQUINAS</SL>
      <div style={{color:C.red,fontSize:12,marginBottom:10}}>⚠️ Isso APAGA as {data.machines.length} máquina(s) que tem no app AGORA e recria TODAS do zero, direto da planilha — cada uma já com o número da linha certinho. Não mexe em HASHs, paletes ou clientes. Não dá pra desfazer.</div>
      <Inp label='Pra confirmar, digite: RESETAR MAQUINAS' value={resetConfirmText} onChange={e=>setResetConfirmText(e.target.value)} placeholder="RESETAR MAQUINAS"/>
      {resetProg&&<div style={{color:C.blue,fontSize:12,marginBottom:8}}>⏳ {resetProg}</div>}
      {resetRes&&<Alrt type={resetRes.startsWith("✓")?"ok":"err"}>{resetRes}</Alrt>}
      <Btn v="d" onClick={resetAndReimport} disabled={resetting||resetConfirmText.trim().toUpperCase()!=="RESETAR MAQUINAS"} style={{width:"100%"}}>{resetting?"Processando...":"💣 Apagar e Reimportar Tudo"}</Btn>
    </Card>
    <Card style={{marginBottom:14,border:`1px solid ${C.blue}`}}>
      <SL>👷 VINCULAR TÉCNICO ÀS HASHs JÁ CADASTRADAS</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Pra HASHs que já existem no app mas não têm o técnico vinculado — busca o nome na planilha, casa com um funcionário já cadastrado, e cria o conserto no histórico dele com a data que a HASH já tinha.</div>
      {linkTecProg&&<div style={{color:C.blue,fontSize:12,marginBottom:8}}>⏳ {linkTecProg}</div>}
      {linkTecRes&&<Alrt type={linkTecRes.startsWith("✓")?"ok":"err"}>{linkTecRes}</Alrt>}
      <Btn v="b" onClick={linkTecnicos} disabled={linkingTec} style={{width:"100%"}}>{linkingTec?"Processando...":"👷 Vincular Técnicos"}</Btn>
    </Card>
    <Card style={{marginBottom:14,border:`1px solid ${C.blue}`}}>
      <SL>📋 RECRIAR HISTÓRICO FALTANTE</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Acha HASHs que JÁ têm o técnico vinculado (aparece certo na HASH), mas que não têm nenhum registro de conserto no histórico dele — geralmente sobra de importação antiga. Cria o registro que falta, com a data que a HASH já tinha.</div>
      {fixHistProg&&<div style={{color:C.blue,fontSize:12,marginBottom:8}}>⏳ {fixHistProg}</div>}
      {fixHistRes&&<Alrt type={fixHistRes.startsWith("✓")?"ok":"err"}>{fixHistRes}</Alrt>}
      <Btn v="b" onClick={fixMissingHistory} disabled={fixingHist} style={{width:"100%"}}>{fixingHist?"Processando...":"📋 Recriar Histórico Faltante"}</Btn>
    </Card>
    <MigrationPanel ctx={ctx}/>
    <Card style={{marginBottom:14,border:`1px solid ${C.green}`}}>
      <SL>💾 BACKUP (garantia extra)</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:10}}>Baixa uma cópia completa de tudo (máquinas, HASHs, funcionários, histórico) num arquivo no seu computador. Recomendo baixar toda semana — se algum dia der algum problema no banco, você tem como recuperar tudo a partir desse arquivo.</div>
      <Btn v="g" onClick={exportBackup} style={{width:"100%"}}>⬇️ Baixar Backup Completo Agora</Btn>
    </Card>
    <Card style={{marginBottom:14}}><SL>📸 GOOGLE DRIVE (fotos)</SL><div style={{color:C.muted,fontSize:11,marginBottom:8}}>Cole aqui a URL do Apps Script que salva as fotos no Drive de vocês (arquivo google-apps-script-drive-upload.js)</div><Inp value={driveUrl} onChange={e=>setDriveUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec"/>{driveTestRes&&<Alrt type={driveTestRes.startsWith("✓")?"ok":"err"}>{driveTestRes}</Alrt>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={testDriveUrl} style={{flex:1}}>🔗 Testar</Btn><Btn onClick={saveDriveUrl} style={{flex:1}}>💾 Salvar</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>GOOGLE SHEETS WEBHOOK</SL><Inp value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/..."/>{testRes&&<Alrt type={testRes.startsWith("✓")?"ok":"err"}>{testRes}</Alrt>}<div style={{display:"flex",gap:8}}><Btn v="s" onClick={testWh} style={{flex:1}}>🔗 Testar</Btn><Btn onClick={saveWh} style={{flex:1}}>💾 Salvar</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>IMPORTAR PLANILHA EXISTENTE</SL>{importRes&&<Alrt type={importRes.startsWith("✓")?"ok":"err"}>{importRes}</Alrt>}{importProg&&<div style={{color:C.blue,fontSize:12,marginBottom:8}}>⏳ {importProg}</div>}<div style={{display:"flex",gap:8,marginBottom:8}}><Btn v="b" onClick={doImportMachines} disabled={importing} style={{flex:1,fontSize:12}}>{importing?"...":"📥 Máquinas"}</Btn><Btn v="p" onClick={doImportHashes} disabled={importing} style={{flex:1,fontSize:12}}>{importing?"...":"⚡ HASHs (REPARO)"}</Btn></div>
      <div style={{color:C.muted,fontSize:10,marginBottom:8}}>⚠️ Os botões acima importam TUDO de novo (pode duplicar). Prefira o botão abaixo — ele só mostra o que é realmente novo na planilha.</div>
      <Btn v="y" onClick={()=>setModal(<Modal title="🔍 Comparar com a Planilha" onClose={()=>setModal(null)}><SheetCompareReview ctx={ctx} onClose={()=>setModal(null)}/></Modal>)} disabled={!url} style={{width:"100%"}}>🔍 Comparar com Planilha (só mostra o que é novo)</Btn>
    </Card>
    <Card style={{marginBottom:14}}><SL>MODELOS CUSTOMIZADOS (T/H)</SL>{data.customModels.filter(m=>!m.chips).map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontWeight:700}}>{m.m}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:C.muted,fontSize:12}}>{m.th}TH</span><button onClick={()=>delModel(m)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button></div></div>)}<div style={{display:"flex",gap:8,marginTop:12}}><Inp value={newModel} onChange={e=>setNewModel(e.target.value)} placeholder="Ex: M30S Pro" style={{flex:2,marginBottom:0}}/><Inp type="number" value={newTH} onChange={e=>setNewTH(e.target.value)} placeholder="TH" style={{width:70,marginBottom:0}}/><Btn onClick={addModel}>+</Btn></div></Card>
    <Card style={{marginBottom:14}}><SL>⚡ CHIPS POR MODELO (E MATERIAL)</SL>
      <div style={{color:C.muted,fontSize:11,marginBottom:8}}>Lista separada dos modelos de T/H. Um mesmo modelo pode ter placa de Fibra ou Alumínio, com quantidade de chips diferente — aparece nos cards e é usada automaticamente no conserto quando não for informado.</div>
      <div style={{color:C.muted,fontSize:10,marginBottom:10}}>Já vem com os valores reais mais comuns pré-carregados (S19, S19 Pro, S19j Pro, S19k Pro, S19 XP, S21, S21XP, T21, T19, S17, T17, S15, S9, L3+) — você pode editar qualquer um.</div>
      {chipEntries.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:8}}>Nenhum cadastrado ainda</div>:chipEntries.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontWeight:700}}>{m.m}{m.material?<Tag color={m.material==="FIBRA"?C.blue:C.amber} small style={{marginLeft:6}}>{m.material}</Tag>:null}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{color:C.blue,fontSize:12,fontWeight:700}}>{m.chips} chips</span><button onClick={()=>delModel(m)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button></div></div>)}
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginTop:14,marginBottom:6,letterSpacing:1}}>ADICIONAR OU MUDAR</div>
      <div style={{display:"flex",gap:8}}>
        <Sel value={chipsModel} onChange={e=>setChipsModel(e.target.value)} style={{flex:2,marginBottom:0}}><option value="">Modelo...</option>{allModelsForChips.map(mo=><option key={mo}>{mo}{chipEntries.find(c=>c.m===mo)?" ✓":""}</option>)}</Sel>
        <Sel value={chipsMaterial} onChange={e=>setChipsMaterial(e.target.value)} style={{flex:1,marginBottom:0}}><option value="">Sem material</option><option value="FIBRA">Fibra</option><option value="ALUMINIO">Alumínio</option></Sel>
      </div>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <Inp type="number" value={chipsVal} onChange={e=>setChipsVal(e.target.value)} placeholder="Quantidade de chips" style={{flex:1,marginBottom:0}}/>
        <Btn onClick={setChipsForModel}>💾</Btn>
      </div>
    </Card>
    <Card><div style={{fontWeight:800,color:C.blue,marginBottom:10}}>📖 Como configurar</div>{[["1","Abra sua planilha no Google Sheets"],["2","Extensões → Apps Script"],["3","Cole o código do arquivo hashstock-apps-script.js"],["4","Implantar → App da Web → Qualquer pessoa"],["5","Copie a URL e cole acima"]].map(([n,t])=><div key={n} style={{display:"flex",gap:10,marginBottom:8}}><div style={{width:22,height:22,borderRadius:"50%",background:C.accent,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:11,flexShrink:0,color:"#fff"}}>{n}</div><div style={{fontSize:13,paddingTop:2}}>{t}</div></div>)}</Card>
  </div>;
}

// Compara a planilha com o que já existe no app: ignora tudo que já tem o
// mesmo SN, e mostra só o que é realmente novo, com checkbox pra escolher o
// que importar.
// Campos comparados campo a campo (máquina e HASH) — usado tanto na tela de
// comparação manual quanto na checagem diária automática.
const M_FIELDS=[["situacao","Situação"],["model","Modelo"],["th","T/H"],["ref","Referência"],["destino","Destino (cliente)"],["hashSN0","Slot 1 (SN)"],["hashSN1","Slot 2 (SN)"],["hashSN2","Slot 3 (SN)"],["hash0","Slot 1 (status)"],["hash1","Slot 2 (status)"],["hash2","Slot 3 (status)"],["controladora","CTR"],["fonte","FONTE"],["fans","FANS"]];
const H_FIELDS=[["status","Status"],["model","Modelo"],["machineSN","Máquina"],["chips","Chips"]];
const normCompare=v=>String(v??"").trim().toUpperCase();
// Alguns SNs são só um texto de "placeholder" (tipo "SEM SN" escrito na
// própria planilha) — isso NÃO é um SN de verdade e nunca pode ser usado
// pra comparar/casar registros (foi exatamente isso que causou o bug de
// várias máquinas sem SN "casando" umas com as outras por engano).
const INVALID_SN_TEXTS=["SEM SN","SEMSN","SEM S/N","S/N","SN","N/A","NA","-","--","NENHUM","VAZIO","SN INLEGIVEL","SN ILEGIVEL","SN ILEGÍVEL","ILEGIVEL","ILEGÍVEL","INLEGIVEL","INLEGÍVEL","NAO LEGIVEL","NÃO LEGÍVEL","APAGADO","BORRADO"];
const validSN=s=>{const v=(s||"").trim().toUpperCase();return v&&!INVALID_SN_TEXTS.includes(v)?v:""};
// Compara tudo (presença + campo a campo) e devolve só os números — usado
// pela checagem automática diária, sem precisar abrir a tela de comparação.
async function computeSheetDiffs(data,webhookUrl){
  const sheetMachines=await importMachinesFromSheet(webhookUrl);
  const sheetHashes=await importHashesFromSheet(webhookUrl);
  const sheetMSN=new Set(sheetMachines.map(m=>validSN(m.sn)).filter(Boolean));
  const sheetHSN=new Set(sheetHashes.map(h=>validSN(h.sn)).filter(Boolean));
  const appMSN=new Set(data.machines.map(m=>validSN(m.sn)).filter(Boolean));
  const appHSN=new Set(data.hashes.map(h=>validSN(h.sn)).filter(Boolean));
  const nm=sheetMachines.filter(m=>validSN(m.sn)&&!appMSN.has(validSN(m.sn))).length;
  const nh=sheetHashes.filter(h=>validSN(h.sn)&&!appHSN.has(validSN(h.sn))).length;
  const em=data.machines.filter(m=>validSN(m.sn)&&!sheetMSN.has(validSN(m.sn))).length;
  const eh=data.hashes.filter(h=>validSN(h.sn)&&!sheetHSN.has(validSN(h.sn))).length;
  let dm=0;
  data.machines.forEach(appM=>{
    const appSN=validSN(appM.sn);
    if(!appSN)return; // sem SN (ou texto tipo "SEM SN") não compara — "por linha" desativado até ficar 100% confiável
    const sheetM=sheetMachines.find(m=>validSN(m.sn)===appSN);
    if(!sheetM)return;
    if(M_FIELDS.some(([f])=>normCompare(appM[f])!==normCompare(sheetM[f])))dm++;
  });
  let dh=0;
  data.hashes.forEach(appH=>{
    const appSN=validSN(appH.sn);if(!appSN)return;
    const sheetH=sheetHashes.find(h=>validSN(h.sn)===appSN);
    if(!sheetH)return;
    if(H_FIELDS.some(([f])=>normCompare(appH[f])!==normCompare(sheetH[f])))dh++;
  });
  return{total:nm+nh+em+eh+dm+dh,nm,nh,em,eh,dm,dh};
}

function SheetCompareReview({ctx,onClose}){
  const{data,mutate,webhookUrl,user,resetMaxCount}=ctx;
  const[loading,setLoading]=useState(true);
  const[newInSheetM,setNewInSheetM]=useState([]),[newInSheetH,setNewInSheetH]=useState([]);
  const[extraInAppM,setExtraInAppM]=useState([]),[extraInAppH,setExtraInAppH]=useState([]);
  const[selSheetM,setSelSheetM]=useState(new Set()),[selSheetH,setSelSheetH]=useState(new Set());
  const[selAppM,setSelAppM]=useState(new Set()),[selAppH,setSelAppH]=useState(new Set());
  const[diffsM,setDiffsM]=useState([]),[diffsH,setDiffsH]=useState([]),[resolved,setResolved]=useState(new Set());
  const[dupInfo,setDupInfo]=useState({blankM:[],blankH:[],dupM:[],dupH:[]});
  const[groupDiffs,setGroupDiffs]=useState([]);
  const[tecDiffs,setTecDiffs]=useState([]);
  const[totals,setTotals]=useState(null);
  const[saving,setSaving]=useState(false),[err,setErr]=useState("");
  // Campos comparados campo a campo (máquina e HASH) — label é o que aparece pro Admin
  const norm=normCompare;
  useEffect(()=>{
    (async()=>{
      try{
        const sheetMachines=await importMachinesFromSheet(webhookUrl);
        const sheetHashes=await importHashesFromSheet(webhookUrl);
        const sheetMSN=new Set(sheetMachines.map(m=>validSN(m.sn)).filter(Boolean));
        const sheetHSN=new Set(sheetHashes.map(h=>validSN(h.sn)).filter(Boolean));
        const appMSN=new Set(data.machines.map(m=>validSN(m.sn)).filter(Boolean));
        const appHSN=new Set(data.hashes.map(h=>validSN(h.sn)).filter(Boolean));
        // Planilha tem, app não tem
        const nm=sheetMachines.filter(m=>validSN(m.sn)&&!appMSN.has(validSN(m.sn)));
        const nh=sheetHashes.filter(h=>validSN(h.sn)&&!appHSN.has(validSN(h.sn)));
        // App tem, planilha não tem
        const em=data.machines.filter(m=>validSN(m.sn)&&!sheetMSN.has(validSN(m.sn)));
        const eh=data.hashes.filter(h=>validSN(h.sn)&&!sheetHSN.has(validSN(h.sn)));
        setNewInSheetM(nm);setNewInSheetH(nh);setExtraInAppM(em);setExtraInAppH(eh);
        setSelSheetM(new Set(nm.map((_,i)=>i)));setSelSheetH(new Set(nh.map((_,i)=>i)));
        setSelAppM(new Set(em.map((_,i)=>i)));setSelAppH(new Set(eh.map((_,i)=>i)));
        // Existe nos dois lugares — compara campo a campo
        // BLINDAGEM: nunca compara SN vazio/em branco. Se dois itens sem SN
        // "casassem" por engano (ex: "" === ""), o valor de UM acabaria sendo
        // aplicado em TODOS os outros sem SN — foi exatamente isso que
        // corrompeu o modelo de várias máquinas antes.
        const dm=[];
        const rowUpdates=[];
        data.machines.forEach(appM=>{
          const appSN=validSN(appM.sn);
          if(!appSN)return; // sem SN (ou "SEM SN" literal) não compara
          const sheetM=sheetMachines.find(m=>validSN(m.sn)===appSN);
          if(!sheetM)return;
          // Aproveita que já achou a máquina certa e guarda a linha dela —
          // assim, da próxima vez, já aparece na tela de editar mesmo sem
          // ter precisado corrigir nada.
          if(sheetM.sheetRow&&appM.sheetRow!==sheetM.sheetRow)rowUpdates.push({id:appM._id,sheetRow:sheetM.sheetRow});
          const diffs=M_FIELDS.filter(([f])=>norm(appM[f])!==norm(sheetM[f])).map(([f,label])=>({field:f,label,appVal:appM[f],sheetVal:sheetM[f]}));
          if(diffs.length)dm.push({sn:appM.sn,appItem:appM,sheetItem:sheetM,diffs});
        });
        if(rowUpdates.length){
          const writes=rowUpdates.map(r=>{const full=data.machines.find(m=>m._id===r.id);return{c:"machines",id:r.id,d:{...full,sheetRow:r.sheetRow}}});
          for(let i=0;i<writes.length;i+=200)await fbBatch(writes.slice(i,i+200));
          mutate("machines",arr=>arr.map(m=>{const u=rowUpdates.find(r=>r.id===m._id);return u?{...m,sheetRow:u.sheetRow}:m}));
        }
        const dh=[];
        data.hashes.forEach(appH=>{
          const appSN=validSN(appH.sn);
          if(!appSN)return;
          const sheetH=sheetHashes.find(h=>validSN(h.sn)===appSN);
          if(!sheetH)return;
          const diffs=H_FIELDS.filter(([f])=>norm(appH[f])!==norm(sheetH[f])).map(([f,label])=>({field:f,label,appVal:appH[f],sheetVal:sheetH[f]}));
          if(diffs.length)dh.push({sn:appH.sn,appItem:appH,sheetItem:sheetH,diffs});
        });
        setDiffsM(dm);setDiffsH(dh);
        // Comparação específica de TÉCNICO — separado do resto porque o
        // nome do campo é diferente dos dois lados (repairedByName no app,
        // tecnico na planilha), então não entra no H_FIELDS comum.
        const tecD=[];
        data.hashes.forEach(appH=>{
          const appSN=validSN(appH.sn);if(!appSN)return;
          const sheetH=sheetHashes.find(h=>validSN(h.sn)===appSN);if(!sheetH)return;
          const appTec=(appH.repairedByName||"").trim();
          const sheetTec=(sheetH.tecnico||"").trim();
          if(appTec&&normCompare(appTec)!==normCompare(sheetTec)){
            tecD.push({sn:appH.sn,model:appH.model,appTec,sheetTec:sheetTec||"(vazio)"});
          }
        });
        setTecDiffs(tecD);
        // Diagnóstico extra: máquinas/HASHs sem SN e SNs duplicados no APP —
        // a comparação normal (por presença de SN) não pega isso, e é
        // exatamente o que explica "a contagem bate diferente mas não achei
        // nada diferente".
        const blankM=data.machines.filter(m=>!validSN(m.sn));
        const blankH=data.hashes.filter(h=>!validSN(h.sn));
        const countBy={};data.machines.forEach(m=>{const k=validSN(m.sn);if(k)countBy[k]=(countBy[k]||0)+1});
        const ignoredDups=JSON.parse(localStorage.getItem("hs_ignoredDupSNs")||"[]");
        const dupM=Object.entries(countBy).filter(([sn,c])=>c>1&&!ignoredDups.includes(sn)).map(([sn,c])=>({sn,count:c,items:data.machines.filter(m=>validSN(m.sn)===sn)}));
        const countByH={};data.hashes.forEach(h=>{const k=validSN(h.sn);if(k)countByH[k]=(countByH[k]||0)+1});
        const dupH=Object.entries(countByH).filter(([,c])=>c>1).map(([sn,c])=>({sn,count:c}));
        setDupInfo({blankM,blankH,dupM,dupH});
        // Comparação por GRUPO (modelo + T/H + REF), só pras máquinas sem
        // SN — como são idênticas dentro do grupo, não precisa saber "qual é
        // qual", só se a QUANTIDADE bate entre app e planilha. É assim que
        // pega o tipo de erro "modelo errado em massa" sem nunca arriscar
        // casar a linha errada com a máquina errada.
        const groupKey=m=>`${m.model}|||${m.th}|||${(m.ref||"").trim().toUpperCase()}`;
        const appBlank=data.machines.filter(m=>!validSN(m.sn));
        const sheetBlank=sheetMachines.filter(m=>!validSN(m.sn));
        const appGroups={};appBlank.forEach(m=>{const k=groupKey(m);appGroups[k]=(appGroups[k]||0)+1});
        const sheetGroups={};sheetBlank.forEach(m=>{const k=groupKey(m);sheetGroups[k]=(sheetGroups[k]||0)+1});
        const allKeys=[...new Set([...Object.keys(appGroups),...Object.keys(sheetGroups)])];
        const gd=allKeys.map(k=>{
          const[model,th,ref]=k.split("|||");
          const appCount=appGroups[k]||0,sheetCount=sheetGroups[k]||0;
          return{model,th,ref,appCount,sheetCount,match:appCount===sheetCount};
        }).filter(g=>!g.match); // só mostra os grupos que NÃO batem
        setGroupDiffs(gd);
        setTotals({appM:data.machines.length,sheetM:sheetMachines.length,appH:data.hashes.length,sheetH:sheetHashes.length});
      }catch(e){setErr(e.message)}
      setLoading(false);
    })();
  },[]);
  const toggle=(set,setSet,i)=>{const n=new Set(set);n.has(i)?n.delete(i):n.add(i);setSet(n)};
  // Resolve uma diferença: usa os valores do lado escolhido (planilha ou app)
  // Corrige um grupo (modelo+T/H+ref sem SN): se a planilha tem mais, cria
  // as que faltam no app; se o app tem mais, apaga o excedente (tanto faz
  // qual, já que são idênticas dentro do grupo).
  const fixGroup=async g=>{
    if(g.sheetCount>g.appCount){
      const diff=g.sheetCount-g.appCount;
      if(!confirm(`Confirma? Vai CRIAR ${diff} máquina(s) novas no app: ${g.model} · ${g.th}TH · REF "${g.ref}".`))return;
      const writes=Array.from({length:diff},()=>{const id=uid();return{c:"machines",id,d:{sn:"",ref:g.ref,model:g.model,th:Number(g.th)||0,type:"complete",situacao:"STOCK",hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",destino:"",...audit(user),addedAt:TODAY()}}});
      for(let i=0;i<writes.length;i+=200)await fbBatch(writes.slice(i,i+200));
      mutate("machines",arr=>[...arr,...writes.map(w=>({...w.d,_id:w.id}))]);
      await markChanged("machines");
    }else if(g.appCount>g.sheetCount){
      const diff=g.appCount-g.sheetCount;
      if(!confirm(`Confirma? Vai EXCLUIR ${diff} máquina(s) do app: ${g.model} · ${g.th}TH · REF "${g.ref}" (são idênticas entre si, então não importa qual sai).`))return;
      const targets=data.machines.filter(m=>!validSN(m.sn)&&m.model===g.model&&String(m.th)===String(g.th)&&(m.ref||"").trim().toUpperCase()===g.ref.toUpperCase()).slice(0,diff);
      for(const m of targets)await fbDel("machines",m._id);
      mutate("machines",arr=>arr.filter(m=>!targets.some(t=>t._id===m._id)));
      await markChanged("machines");
    }
    setGroupDiffs(gd=>gd.filter(x=>!(x.model===g.model&&String(x.th)===String(g.th)&&x.ref===g.ref)));
  };
  const resolveDiff=async(d,isMachine,useSheet)=>{
    const key=(isMachine?"m:":"h:")+d.sn;
    if(useSheet){
      // Traz os valores da planilha pro app
      const patch={};d.diffs.forEach(x=>{patch[x.field]=x.sheetVal});
      if(isMachine&&d.sheetItem.sheetRow)patch.sheetRow=d.sheetItem.sheetRow;
      const u={...d.appItem,...patch,...audit(user)};
      mutate(isMachine?"machines":"hashes",arr=>arr.map(x=>x._id===d.appItem._id?u:x));
      await fbSet(isMachine?"machines":"hashes",d.appItem._id,u);
    }else{
      // Manda os valores do app pra planilha — cada campo tem seu jeito certo de sincronizar
      d.diffs.forEach(x=>{
        if(isMachine){
          syncSheet(webhookUrl,"updateMachine",{sn:d.appItem.sn||undefined,row:!d.appItem.sn?d.sheetItem.sheetRow:undefined,field:x.field,to:x.appVal,employeeName:user.name,employeeCode:user.code});
        }else if(x.field==="chips"){
          syncSheet(webhookUrl,"updateHashChips",{sn:d.sn,model:d.appItem.model,chips:x.appVal,employeeName:user.name,employeeCode:user.code});
        }else{
          syncSheet(webhookUrl,"updateHash",{sn:d.sn,model:d.appItem.model,status:x.field==="status"?x.appVal:d.appItem.status,machineSN:x.field==="machineSN"?x.appVal:d.appItem.machineSN,employeeName:user.name,employeeCode:user.code});
        }
      });
    }
    setResolved(r=>new Set([...r,key]));
  };

  // Traz da planilha pro app (o que a planilha tem a mais)
  const importFromSheet=async()=>{
    setSaving(true);
    const mToImport=newInSheetM.filter((_,i)=>selSheetM.has(i));
    const hToImport=newInSheetH.filter((_,i)=>selSheetH.has(i));
    const mWrites=mToImport.map(m=>({c:"machines",id:uid(),d:{...m,type:m.type||"complete",addedAt:m.addedAt||TODAY()}}));
    const rWrites=[];
    const hWrites=hToImport.map(h=>{
      let status=h.status; // a aba "HASH" já manda o status pronto (TESTAR/NA MAQUINA/RUIM/SAIDA)
      if(!status){const sit=String(h.situacao||"").toUpperCase();status="REPARO";if(sit==="BOA")status="ON";else if(sit==="TESTAR")status="TESTAR";else if(sit==="STOCK")status="STOCK";}
      // Tenta casar o nome do técnico (texto solto da planilha) com um
      // funcionário de verdade — sem isso, o app não sabia "quem" consertou.
      const tecnicoName=(h.tecnico||"").trim();
      const matchedEmp=tecnicoName?data.employees.find(e=>e.name.trim().toLowerCase()===tecnicoName.toLowerCase()):null;
      // Se veio da aba de conserto e tem técnico, cria também o registro no
      // histórico dele — sem chips/foto (a planilha não guarda esse
      // detalhe), com a data que já estava lá.
      if(tecnicoName){
        rWrites.push({c:"repairs",id:uid(),d:{hashSN:h.sn||"",model:h.model||"",type:"repair",employeeId:matchedEmp?._id||"",_by:matchedEmp?._id||"",_byName:tecnicoName,_at:h.addedAt||TODAY(),date:h.addedAt||TODAY(),status:"TESTAR"}});
      }
      return{c:"hashes",id:uid(),d:{sn:h.sn||"",model:h.model||"",status,chips:h.chips||0,defeito:h.defeito||"",tecnico:tecnicoName,repairedBy:matchedEmp?.["_id"]||"",repairedByName:tecnicoName,machineSN:h.machineSN||"",slot:-1,addedAt:h.addedAt||TODAY()}};
    });
    const writes=[...mWrites,...hWrites,...rWrites];
    for(let i=0;i<writes.length;i+=500)await fbBatch(writes.slice(i,i+500));
    if(mWrites.length)mutate("machines",arr=>[...arr,...mWrites.map(w=>({...w.d,_id:w.id}))]);
    if(hWrites.length)mutate("hashes",arr=>[...arr,...hWrites.map(w=>({...w.d,_id:w.id}))]);
    if(rWrites.length)mutate("repairs",arr=>[...arr,...rWrites.map(w=>({...w.d,_id:w.id}))]);
    await markChanged("machines");await markChanged("hashes");if(rWrites.length)await markChanged("repairs");
    setSaving(false);onClose();
  };
  // Apaga da PLANILHA os itens marcados (o que sobrou lá e você não quer trazer)
  const deleteFromSheet=async()=>{
    const mToDel=newInSheetM.filter((_,i)=>selSheetM.has(i));
    const hToDel=newInSheetH.filter((_,i)=>selSheetH.has(i));
    if(!confirm(`Excluir ${mToDel.length} máquina(s) e ${hToDel.length} HASH(s) da PLANILHA? Isso não pode ser desfeito.`))return;
    setSaving(true);
    mToDel.forEach(m=>syncSheet(webhookUrl,"deleteMachineRow",{sn:m.sn}));
    hToDel.forEach(h=>syncSheet(webhookUrl,"deleteHashRow",{sn:h.sn}));
    setSaving(false);onClose();
  };
  // Manda pra planilha o que o app tem a mais
  const sendToSheet=async()=>{
    setSaving(true);
    const mToSend=extraInAppM.filter((_,i)=>selAppM.has(i));
    const hToSend=extraInAppH.filter((_,i)=>selAppH.has(i));
    mToSend.forEach(m=>syncSheet(webhookUrl,"addMachine",{sn:m.sn,model:m.model,th:m.th,situacao:m.situacao,employeeName:user.name,employeeCode:user.code}));
    hToSend.forEach(h=>syncSheet(webhookUrl,"addHash",{sn:h.sn,model:h.model,status:h.status,employeeName:user.name,employeeCode:user.code}));
    setSaving(false);onClose();
  };
  // Exclui do app os itens marcados (útil pra limpar lixo/duplicado que não deveria ter sido criado)
  const deleteFromApp=async()=>{
    const mToDel=extraInAppM.filter((_,i)=>selAppM.has(i));
    const hToDel=extraInAppH.filter((_,i)=>selAppH.has(i));
    if(!confirm(`Excluir ${mToDel.length} máquina(s) e ${hToDel.length} HASH(s) do app? Isso não pode ser desfeito.`))return;
    setSaving(true);
    for(const m of mToDel){
      for(const pl of data.pallets){if((pl.machinesSN||[]).includes(m.sn)){const ns=(pl.machinesSN||[]).filter(s=>s!==m.sn);const upd2={...pl,machinesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===pl._id?upd2:x));await fbSet("pallets",pl._id,upd2)}}
      for(const cl of data.clients){if((cl.machinesSN||[]).includes(m.sn)){const ns=(cl.machinesSN||[]).filter(s=>s!==m.sn);const upd3={...cl,machinesSN:ns,...audit(user)};mutate("clients",arr=>arr.map(x=>x._id===cl._id?upd3:x));await fbSet("clients",cl._id,upd3)}}
      await fbDel("machines",m._id);mutate("machines",arr=>arr.filter(x=>x._id!==m._id))
    }
    for(const h of hToDel){
      for(const pl of data.pallets){if((pl.hashesSN||[]).includes(h.sn)){const ns=(pl.hashesSN||[]).filter(s=>s!==h.sn);const upd2={...pl,hashesSN:ns,...audit(user)};mutate("pallets",arr=>arr.map(x=>x._id===pl._id?upd2:x));await fbSet("pallets",pl._id,upd2)}}
      for(const cl of data.clients){if((cl.hashesSN||[]).includes(h.sn)){const ns=(cl.hashesSN||[]).filter(s=>s!==h.sn);const upd3={...cl,hashesSN:ns,...audit(user)};mutate("clients",arr=>arr.map(x=>x._id===cl._id?upd3:x));await fbSet("clients",cl._id,upd3)}}
      await fbDel("hashes",h._id);mutate("hashes",arr=>arr.filter(x=>x._id!==h._id))
    }
    await markChanged("pallets");await markChanged("clients");
    // Avisa a blindagem de dados que essa contagem menor é de propósito —
    // senão ela ia "proteger" e trazer de volta o que acabamos de apagar.
    if(mToDel.length)resetMaxCount("machines",data.machines.length-mToDel.length);
    if(hToDel.length)resetMaxCount("hashes",data.hashes.length-hToDel.length);
    setSaving(false);onClose();
  };

  if(loading)return<div style={{textAlign:"center",padding:30,color:C.muted}}>🔍 Comparando com a planilha...</div>;
  if(err)return<Alrt type="err">✗ {err}</Alrt>;
  const pendingDiffsM=diffsM.filter(d=>!resolved.has("m:"+d.sn));
  const pendingDiffsH=diffsH.filter(d=>!resolved.has("h:"+d.sn));
  const totalDiff=newInSheetM.length+newInSheetH.length+extraInAppM.length+extraInAppH.length+pendingDiffsM.length+pendingDiffsH.length+groupDiffs.length+tecDiffs.length;
  const hasDupInfo=dupInfo.blankM.length+dupInfo.blankH.length+dupInfo.dupM.length+dupInfo.dupH.length>0;
  const DupInfoBox=hasDupInfo&&<div style={{marginBottom:20,background:"#2a0c0c",border:`1px solid ${C.red}44`,borderRadius:10,padding:12}}>
    <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:8}}>🔍 CONTAGEM NÃO BATE? Achei isso no app:</div>
    {dupInfo.blankM.length>0&&<div style={{fontSize:12,marginBottom:6}}>⚠️ {dupInfo.blankM.length} máquina(s) SEM SN no app (não aparecem na comparação normal)</div>}
    {dupInfo.blankH.length>0&&<div style={{fontSize:12,marginBottom:6}}>⚠️ {dupInfo.blankH.length} HASH(s) SEM SN no app</div>}
    {dupInfo.dupM.length>0&&<div style={{marginTop:8}}>
      <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>⚠️ SN duplicado em máquinas — confira e apague a errada (só apaga do app, a planilha nunca é tocada):</div>
      {dupInfo.dupM.map(d=><div key={d.sn} style={{background:"#1a0a0a",borderRadius:8,padding:8,marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{d.sn} ({d.count}x)</div>
        {d.items.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderTop:`1px solid ${C.border}`}}>
          <div style={{fontSize:11}}>{m.model} · {m.situacao} · adicionada {m.addedAt||"?"} {m.destino?`· cliente: ${m.destino}`:""}</div>
          <button onClick={async()=>{if(!confirm(`Apagar essa cópia de ${m.sn} (${m.model} · ${m.situacao})? A outra cópia continua.`))return;await fbDel("machines",m._id);mutate("machines",arr=>arr.filter(x=>x._id!==m._id));await markChanged("machines");setDupInfo(di=>({...di,dupM:di.dupM.map(x=>x.sn===d.sn?{...x,items:x.items.filter(it=>it._id!==m._id),count:x.count-1}:x).filter(x=>x.count>1)}))}} style={{background:C.red,border:"none",color:"#fff",borderRadius:6,padding:"3px 10px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0,marginLeft:8}}>🗑️ Apagar essa</button>
        </div>)}
        <button onClick={()=>{
          const ignored=JSON.parse(localStorage.getItem("hs_ignoredDupSNs")||"[]");
          if(!ignored.includes(d.sn))localStorage.setItem("hs_ignoredDupSNs",JSON.stringify([...ignored,d.sn]));
          setDupInfo(di=>({...di,dupM:di.dupM.filter(x=>x.sn!==d.sn)}));
        }} style={{width:"100%",marginTop:6,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:11}}>✓ São duas máquinas diferentes mesmo — não avisar de novo</button>
      </div>)}
    </div>}
    {dupInfo.dupH.length>0&&<div style={{fontSize:12}}>⚠️ SN duplicado em HASHs: {dupInfo.dupH.map(d=>`${d.sn} (${d.count}x)`).join(", ")}</div>}
  </div>;
  const TecDiffBox=tecDiffs.length>0&&<div style={{marginBottom:20,background:"#2a0c0c",border:`1px solid ${C.red}44`,borderRadius:10,padding:12}}>
    <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:8}}>👷 TÉCNICO DIFERENTE ENTRE APP E PLANILHA ({tecDiffs.length})</div>
    {tecDiffs.map((t,i)=><div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
      <b>{t.sn}</b> · {t.model} — <span style={{color:C.accent}}>App: {t.appTec}</span> · <span style={{color:C.blue}}>Planilha: {t.sheetTec}</span>
      <Btn v="g" onClick={()=>{syncSheet(webhookUrl,"updateHashTecnico",{sn:t.sn,tecnico:t.appTec,employeeName:user.name,employeeCode:user.code});setTecDiffs(td=>td.filter((_,j)=>j!==i))}} style={{width:"100%",marginTop:6}}>Corrigir na planilha (usar "{t.appTec}")</Btn>
    </div>)}
  </div>;
  const GroupDiffBox=groupDiffs.length>0&&<div style={{marginBottom:20,background:"#2a0c0c",border:`1px solid ${C.red}44`,borderRadius:10,padding:12}}>
    <div style={{color:C.red,fontWeight:800,fontSize:13,marginBottom:8}}>🔍 MÁQUINAS SEM SN — QUANTIDADE NÃO BATE POR GRUPO ({groupDiffs.length})</div>
    <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Comparando por Modelo + T/H + Referência (não dá pra saber "qual é qual" sem SN, mas dá pra saber se a QUANTIDADE bate).</div>
    {groupDiffs.map((g,i)=><div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:12}}>
      <b>{g.model}</b> · {g.th}TH · REF "{g.ref||"—"}" — <span style={{color:C.accent}}>App: {g.appCount}</span> · <span style={{color:C.blue}}>Planilha: {g.sheetCount}</span>
      {g.appCount>g.sheetCount&&<div style={{color:C.red,fontSize:11,marginBottom:6}}>⚠️ App tem {g.appCount-g.sheetCount} a mais do que a planilha — confira se não é modelo/dado errado</div>}
      {g.sheetCount>g.appCount&&<div style={{color:C.amber,fontSize:11,marginBottom:6}}>⚠️ Planilha tem {g.sheetCount-g.appCount} a mais do que o app — pode ter máquina faltando importar</div>}
      <Btn v={g.sheetCount>g.appCount?"g":"d"} onClick={()=>fixGroup(g)} style={{width:"100%"}}>{g.sheetCount>g.appCount?`📥 Importar as ${g.sheetCount-g.appCount} que faltam`:`🗑️ Excluir as ${g.appCount-g.sheetCount} a mais do app`}</Btn>
    </div>)}
  </div>;
  const TotalsBox=totals&&<div style={{marginBottom:16,background:C.card2,borderRadius:10,padding:12,display:"flex",gap:16}}>
    <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:10,color:C.muted}}>MÁQUINAS</div><div style={{fontWeight:800}}>App: {totals.appM} · Planilha: {totals.sheetM} {totals.appM!==totals.sheetM&&<span style={{color:C.red}}>({totals.appM>totals.sheetM?"+":""}{totals.appM-totals.sheetM})</span>}</div></div>
    <div style={{flex:1,textAlign:"center"}}><div style={{fontSize:10,color:C.muted}}>HASHs</div><div style={{fontWeight:800}}>App: {totals.appH} · Planilha: {totals.sheetH} {totals.appH!==totals.sheetH&&<span style={{color:C.red}}>({totals.appH>totals.sheetH?"+":""}{totals.appH-totals.sheetH})</span>}</div></div>
  </div>;
  if(totalDiff===0)return<div>{TotalsBox}{DupInfoBox}<div style={{textAlign:"center",padding:30,color:C.green}}>✓ Nada diferente (por SN) — app e planilha estão iguais nesse quesito.</div></div>;
  return<div>
    {TotalsBox}
    {DupInfoBox}
    {GroupDiffBox}
    {TecDiffBox}
    {(pendingDiffsM.length>0||pendingDiffsH.length>0)&&<div style={{marginBottom:20}}>
      <div style={{color:C.amber,fontWeight:800,fontSize:13,marginBottom:8}}>⚠️ MESMO SN, DADOS DIFERENTES ({pendingDiffsM.length+pendingDiffsH.length})</div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <Btn v="s" onClick={async()=>{const all=[...pendingDiffsM.map(d=>({...d,isMachine:true})),...pendingDiffsH.map(d=>({...d,isMachine:false}))];if(!confirm(`Confirma? Vai aplicar os valores do APP em ${all.length} item(ns), sobrescrevendo a planilha.`))return;for(const d of all)await resolveDiff(d,d.isMachine,false)}} style={{flex:1}}>Manter do App pra todos ({pendingDiffsM.length+pendingDiffsH.length})</Btn>
        <Btn v="g" onClick={async()=>{const all=[...pendingDiffsM.map(d=>({...d,isMachine:true})),...pendingDiffsH.map(d=>({...d,isMachine:false}))];if(!confirm(`Confirma? Vai aplicar os valores da PLANILHA em ${all.length} item(ns), sobrescrevendo o app.`))return;for(const d of all)await resolveDiff(d,d.isMachine,true)}} style={{flex:1}}>Usar da Planilha pra todos</Btn>
      </div>
      {[...pendingDiffsM.map(d=>({...d,isMachine:true})),...pendingDiffsH.map(d=>({...d,isMachine:false}))].map(d=>
        <div key={(d.isMachine?"m:":"h:")+d.sn} style={{background:"#2a1a0c",border:`1px solid ${C.amber}44`,borderRadius:10,padding:12,marginBottom:10}}>
          <div style={{fontWeight:800,fontSize:13,marginBottom:8}}>{d.isMachine?"🖥️":"⚡"} {d.sn}</div>
          {d.diffs.map(x=><div key={x.field} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{color:C.muted}}>{x.label}</span>
            <span><span style={{color:C.accent}}>App: {String(x.appVal||"—")}</span> · <span style={{color:C.blue}}>Planilha: {String(x.sheetVal||"—")}</span></span>
          </div>)}
          <div style={{display:"flex",gap:8,marginTop:10}}>
            <Btn v="s" onClick={()=>resolveDiff(d,d.isMachine,false)} style={{flex:1}}>Manter do App (corrige planilha)</Btn>
            <Btn v="g" onClick={()=>resolveDiff(d,d.isMachine,true)} style={{flex:1}}>Usar da Planilha (corrige app)</Btn>
          </div>
        </div>
      )}
    </div>}
    {(newInSheetM.length>0||newInSheetH.length>0)&&<div style={{marginBottom:20}}>
      <div style={{color:C.blue,fontWeight:800,fontSize:13,marginBottom:8}}>⬇️ A PLANILHA TEM E O APP NÃO ({newInSheetM.length+newInSheetH.length})</div>
      {newInSheetM.length>0&&<><SL>🖥️ Máquinas ({newInSheetM.length})</SL>
        {newInSheetM.map((m,i)=><div key={i} onClick={()=>toggle(selSheetM,setSelSheetM,i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
          <div><span style={{fontWeight:700,fontSize:13}}>{m.sn}</span><span style={{color:C.muted,fontSize:11}}> · {m.model}</span></div>
          <input type="checkbox" checked={selSheetM.has(i)} readOnly style={{width:16,height:16}}/>
        </div>)}
      </>}
      {newInSheetH.length>0&&<><SL mt={10}>⚡ HASHs ({newInSheetH.length})</SL>
        {newInSheetH.map((h,i)=><div key={i} onClick={()=>toggle(selSheetH,setSelSheetH,i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
          <div><span style={{fontWeight:700,fontSize:13}}>{h.sn}</span><span style={{color:C.muted,fontSize:11}}> · {h.model} · {h.situacao}</span></div>
          <input type="checkbox" checked={selSheetH.has(i)} readOnly style={{width:16,height:16}}/>
        </div>)}
      </>}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <Btn v="g" onClick={importFromSheet} disabled={saving||(selSheetM.size+selSheetH.size===0)} style={{flex:1}}>{saving?"...":`⬇️ Trazer ${selSheetM.size+selSheetH.size} pro app`}</Btn>
        <Btn v="d" onClick={deleteFromSheet} disabled={saving||(selSheetM.size+selSheetH.size===0)} style={{flex:1}}>🗑 Excluir da planilha</Btn>
      </div>
    </div>}
    {(extraInAppM.length>0||extraInAppH.length>0)&&<div>
      <div style={{color:C.amber,fontWeight:800,fontSize:13,marginBottom:8}}>⬆️ O APP TEM E A PLANILHA NÃO ({extraInAppM.length+extraInAppH.length})</div>
      {extraInAppM.length>0&&<><SL>🖥️ Máquinas ({extraInAppM.length})</SL>
        {extraInAppM.map((m,i)=><div key={i} onClick={()=>toggle(selAppM,setSelAppM,i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
          <div><span style={{fontWeight:700,fontSize:13}}>{m.sn}</span><span style={{color:C.muted,fontSize:11}}> · {m.model}</span></div>
          <input type="checkbox" checked={selAppM.has(i)} readOnly style={{width:16,height:16}}/>
        </div>)}
      </>}
      {extraInAppH.length>0&&<><SL mt={10}>⚡ HASHs ({extraInAppH.length})</SL>
        {extraInAppH.map((h,i)=><div key={i} onClick={()=>toggle(selAppH,setSelAppH,i)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
          <div><span style={{fontWeight:700,fontSize:13}}>{h.sn}</span><span style={{color:C.muted,fontSize:11}}> · {h.model} · {h.status}</span></div>
          <input type="checkbox" checked={selAppH.has(i)} readOnly style={{width:16,height:16}}/>
        </div>)}
      </>}
      <div style={{display:"flex",gap:8,marginTop:10}}>
        <Btn v="y" onClick={sendToSheet} disabled={saving||(selAppM.size+selAppH.size===0)} style={{flex:1}}>{saving?"...":`⬆️ Mandar ${selAppM.size+selAppH.size} pra planilha`}</Btn>
        <Btn v="d" onClick={deleteFromApp} disabled={saving||(selAppM.size+selAppH.size===0)} style={{flex:1}}>🗑 Excluir do app</Btn>
      </div>
    </div>}
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
  const[src,setSrc]=useState(""),[dst,setDst]=useState(""),[scanned,setScanned,clearScanned]=usePersistedBatch("movimentacao",[]),[moving,setMoving]=useState(false),[log,setLog]=useState([]);
  const addSN=v=>{const sn=v.toUpperCase().trim();if(!sn||scanned.includes(sn))return;setScanned(s=>[...s,sn]);};
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
    setScanned([]);clearScanned();setSrc("");setDst("");setMoving(false);
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
    <div style={{marginBottom:8}}><SmartScanInput onDetect={addSN} placeholder="SN da máquina..." count={scanned.length}/></div>
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
  const[p,setP]=useState(pallet),[itemType,setItemType]=useState("machine"),[mode,setMode]=useState("scan"),[log,setLog]=useState([]),[pendingAddSN,setPendingAddSN]=useState(null);
  const fileRef=useRef();
  const macs=(p.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
  const hashes=(p.hashesSN||[]).map(sn=>data.hashes.find(h=>h.sn===sn)).filter(Boolean);
  // SNs que ficaram "fantasma" — foram removidos/apagados em outro lugar,
  // mas continuaram contando aqui (de antes dessa correção existir)
  const ghostM=(p.machinesSN||[]).filter(sn=>!data.machines.find(m=>m.sn===sn));
  const ghostH=(p.hashesSN||[]).filter(sn=>!data.hashes.find(h=>h.sn===sn));
  const limparFantasmas=async()=>{
    const upd2={...p,machinesSN:(p.machinesSN||[]).filter(sn=>!ghostM.includes(sn)),hashesSN:(p.hashesSN||[]).filter(sn=>!ghostH.includes(sn)),...audit(user)};
    setP(upd2);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd2:x));await fbSet("pallets",p._id,upd2);await markChanged("pallets");
  };
  const addSN=async(snRaw)=>{
    const sn=snRaw.toUpperCase().trim();if(!sn)return;
    const isHash=itemType==="hash";
    const listKey=isHash?"hashesSN":"machinesSN";
    if((p[listKey]||[]).includes(sn)){setLog(l=>[{sn,status:"dup",msg:"Já no palete"},...l]);return}
    const ex=isHash?data.hashes.find(h=>h.sn===sn):data.machines.find(m=>m.sn===sn);
    if(!ex){
      // Não existe — não cria mais com dados genéricos. Mostra aviso e deixa
      // o usuário escolher cadastrar de verdade (modelo, status, etc.)
      setLog(l=>[{sn,status:"missing",msg:"❌ Não existe no estoque"},...l]);
      return;
    }
    const newSNs=[...(p[listKey]||[]),sn];
    const upd={...p,[listKey]:newSNs,...audit(user)};
    setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));
    await fbSet("pallets",p._id,upd);await markChanged("pallets");
    setLog(l=>[{sn,status:"ok",msg:isHash?ex.model+" · "+ex.status:ex.model+" · "+ex.situacao},...l]);
  };
  // Depois de cadastrar a HASH/máquina que faltava, adiciona ela no palete automaticamente
  useEffect(()=>{
    if(!pendingAddSN)return;
    const{sn,isHash}=pendingAddSN;
    const found=isHash?data.hashes.find(h=>h.sn===sn):data.machines.find(m=>m.sn===sn);
    if(found){
      const listKey=isHash?"hashesSN":"machinesSN";
      if(!(p[listKey]||[]).includes(sn)){
        const newSNs=[...(p[listKey]||[]),sn];
        const upd={...p,[listKey]:newSNs,...audit(user)};
        setP(upd);mutate("pallets",arr=>arr.map(x=>x._id===p._id?upd:x));
        fbSet("pallets",p._id,upd);markChanged("pallets");
      }
      setLog(l=>[{sn,status:"ok",msg:(isHash?found.model+" · "+found.status:found.model+" · "+found.situacao)+" — cadastrada e adicionada"},...l.filter(x=>x.sn!==sn)]);
      setPendingAddSN(null);
    }
  },[data.machines,data.hashes,pendingAddSN]);
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
    {(ghostM.length>0||ghostH.length>0)&&<div style={{background:C.amber+"15",border:`1px solid ${C.amber}44`,borderRadius:10,padding:12,marginBottom:12}}>
      <div style={{color:C.amber,fontWeight:800,fontSize:13,marginBottom:6}}>⚠️ {ghostM.length+ghostH.length} SN(s) "fantasma" nesse palete</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Foram removidos/apagados em outro lugar, mas continuavam contando aqui: {[...ghostM,...ghostH].join(", ")}</div>
      <Btn v="b" onClick={limparFantasmas} style={{width:"100%"}}>🧹 Limpar esses do palete</Btn>
    </div>}
    <SL>O QUE VOCÊ VAI ADICIONAR?</SL>
    <div style={{display:"flex",gap:8,marginBottom:12}}>{[["machine","🖥️ Máquina"],["hash","⚡ HASH"]].map(([v,l])=><button key={v} onClick={()=>setItemType(v)} style={{flex:1,background:itemType===v?C.accent:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div>
    <div style={{display:"flex",gap:6,marginBottom:10}}>
      {[["scan","📡 Bipagem"],["upload","📄 CSV"]].map(([id,l])=><button key={id} onClick={()=>setMode(id)} style={{flex:1,background:mode===id?C.accent:C.card2,color:"#fff",border:"none",borderRadius:10,padding:"8px 4px",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>)}
    </div>
    {mode==="scan"&&<div style={{marginBottom:8}}><SL>BIPAR OU DIGITAR</SL><SmartScanInput onDetect={addSN} placeholder={itemType==="hash"?"SN da HASH...":"SN da máquina..."} autoFocus count={log.length}/></div>}
    {mode==="upload"&&<><input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>e.target.files[0]&&uploadCSV(e.target.files[0])}/><Btn v="b" onClick={()=>fileRef.current.click()} style={{width:"100%",marginBottom:8}}>📂 Escolher CSV</Btn><Btn v="s" onClick={()=>{const rows=["SN,Modelo,Situação"];macs.forEach(m=>rows.push((m.sn||"")+","+(m.model||"")+","+(m.situacao||"")));const blob=new Blob([rows.join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="palete-"+p.name+".csv";a.click()}} style={{width:"100%",marginBottom:8}}>⬇️ Exportar CSV</Btn></>}
    {log.length>0&&<div style={{background:C.card2,borderRadius:10,padding:8,marginBottom:10,maxHeight:220,overflow:"auto"}}>{log.map((l,i)=><div key={i} style={{padding:"4px 0",borderBottom:i<log.length-1?"1px solid "+C.border:"none"}}>
      <div style={{fontSize:11,color:l.status==="new"?C.green:l.status==="dup"?C.amber:l.status==="missing"?C.red:C.blue}}>{l.sn} — {l.msg}</div>
      {l.status==="missing"&&<button onClick={()=>{setPendingAddSN({sn:l.sn,isHash:itemType==="hash"});setModal(<Modal title={itemType==="hash"?"Nova HASH":"Nova Máquina"} onClose={()=>setModal(null)}>{itemType==="hash"?<AddHashForm ctx={ctx} initSN={l.sn} onClose={()=>setModal(null)}/>:<AddMachineForm ctx={ctx} initSN={l.sn} onClose={()=>setModal(null)}/>}</Modal>)}} style={{marginTop:4,background:C.green+"22",border:`1px solid ${C.green}44`,color:C.green,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>➕ Cadastrar {l.sn}</button>}
    </div>)}</div>}
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
        <div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:800,fontSize:14}}>👤 {c.name}</div>{c.phone&&<div style={{color:C.muted,fontSize:12}}>📱 {c.phone}</div>}</div><Tag color={C.accent}>{macs.length} máq.</Tag></div>
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
// Fotos da carga do envio — pode adicionar VÁRIAS, cada uma soma na lista
// (não substitui a anterior), sempre com a data de hoje. Serve pra registrar
// o carregamento físico (caminhão, palete, etc.) além das fotos de cada
// máquina/HASH individual.
function ClientLoadPhotos({ctx,client}){
  const{data,mutate,user}=ctx;
  const[adding,setAdding]=useState(false);
  const myPhotos=(data.loadPhotos||[]).filter(p=>p.clientId===client._id).sort((a,b)=>(b._at||"").localeCompare(a._at||""));
  const addPhoto=async(photoKey)=>{
    if(!photoKey)return;
    const id=uid();
    const d={clientId:client._id,clientName:client.name,photoKey,date:TODAY(),...audit(user)};
    await fbSet("loadPhotos",id,d);mutate("loadPhotos",arr=>[...arr,{...d,_id:id}]);await markChanged("loadPhotos");
    setAdding(false);
  };
  return<div style={{marginBottom:14}}>
    <SL>📸 Fotos da Carga do Envio ({myPhotos.length})</SL>
    <div style={{color:C.muted,fontSize:11,marginBottom:8}}>Pode adicionar quantas quiser — cada uma fica salva com a data de hoje, sem apagar as anteriores.</div>
    {!adding?<Btn v="b" onClick={()=>setAdding(true)} style={{width:"100%",marginBottom:10}}>➕ Adicionar Foto da Carga</Btn>
      :<div style={{marginBottom:10}}><PhotoCapture photoKey={null} onChange={addPhoto} folder="cargas" snHint={client.name}/></div>}
    {myPhotos.length>0&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      {myPhotos.map(p=><div key={p._id}><PhotoView photoKey={p.photoKey} style={{maxHeight:120}}/><div style={{fontSize:10,color:C.muted,marginTop:2,textAlign:"center"}}>{fmtDate(p.date)}</div></div>)}
    </div>}
  </div>;
}

function ClientDetail({ctx,client}){
  const{data,mutate,setModal,user,webhookUrl}=ctx;
  const[c,setC]=useState(client),[itemType,setItemType]=useState("machine"),[pending,setPending]=useState([]),[removeInput,setRemoveInput]=useState(""),[saving,setSaving]=useState(false),[blockMsg,setBlockMsg]=useState("");
  const macs=(c.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
  const hshs=(c.hashesSN||[]).map(sn=>data.hashes.find(h=>h.sn===sn)).filter(Boolean);
  const ghostM=(c.machinesSN||[]).filter(sn=>!data.machines.find(m=>m.sn===sn));
  const ghostH=(c.hashesSN||[]).filter(sn=>!data.hashes.find(h=>h.sn===sn));
  const limparFantasmasCliente=async()=>{
    const upd2={...c,machinesSN:(c.machinesSN||[]).filter(sn=>!ghostM.includes(sn)),hashesSN:(c.hashesSN||[]).filter(sn=>!ghostH.includes(sn)),...audit(user)};
    setC(upd2);mutate("clients",arr=>arr.map(x=>x._id===c._id?upd2:x));await fbSet("clients",c._id,upd2);await markChanged("clients");
  };
  // Item 1+2: bipagem em lote — cada SN bipado entra numa lista mostrando se
  // já existe (modelo/status) ou se é novo; só grava tudo quando aperta Salvar.
  const addToPending=(raw)=>{
    const sn=raw.toUpperCase().trim();if(!sn)return;
    setBlockMsg("");
    const already=itemType==="machine"?(c.machinesSN||[]).includes(sn):(c.hashesSN||[]).includes(sn);
    if(already||pending.some(p=>p.sn===sn))return;
    if(itemType==="machine"){
      const ex=data.machines.find(m=>m.sn===sn);
      setPending(p=>[...p,ex?{sn,type:"machine",existing:true,model:ex.model,situacao:ex.situacao,_id:ex._id}:{sn,type:"machine",existing:false}]);
    }else{
      const ex=data.hashes.find(h=>h.sn===sn);
      // Uma HASH que está dentro de uma máquina (NA MAQUINA) não pode ir
      // avulsa pro cliente — ela sai junto quando a máquina for vendida.
      if(ex&&ex.status==="NA MAQUINA"){setBlockMsg(`⚠️ Essa HASH está dentro da máquina ${ex.machineSN} — ela sai vendendo a máquina, não avulsa.`);return}
      setPending(p=>[...p,ex?{sn,type:"hash",existing:true,model:ex.model,status:ex.status,_id:ex._id}:{sn,type:"hash",existing:false}]);
    }
  };
  const removeFromPending=sn=>setPending(p=>p.filter(x=>x.sn!==sn));
  // Ao vender, tira automaticamente de qualquer palete que a máquina/HASH estava
  const removeFromAllPallets=async(sn,isHash)=>{
    const field=isHash?"hashesSN":"machinesSN";
    for(const pl of data.pallets){
      if((pl[field]||[]).includes(sn)){
        const ns=(pl[field]||[]).filter(s=>s!==sn);
        const u={...pl,[field]:ns,...audit(user)};
        mutate("pallets",arr=>arr.map(x=>x._id===pl._id?u:x));await fbSet("pallets",pl._id,u);
      }
    }
  };
  const saveAll=async()=>{
    if(!pending.length)return;setSaving(true);
    const newMSNs=[...(c.machinesSN||[])];const newHSNs=[...(c.hashesSN||[])];
    for(const row of pending){
      if(row.type==="machine"){
        if(row.existing){
          const ex=data.machines.find(m=>m._id===row._id);if(!ex)continue;
          const mHashes=data.hashes.filter(h=>h.machineSN===row.sn);
          for(const h of mHashes){const u={...h,status:"SAIDA",location:"Vendida: "+c.name,...audit(user)};mutate("hashes",arr=>arr.map(x=>x._id===h._id?u:x));await fbSet("hashes",h._id,u);syncSheet(webhookUrl,"hashSaida",{sn:u.sn,machineSN:row.sn,employeeName:user.name,employeeCode:user.code})}
          const u={...ex,situacao:"SAIDA",destino:c.name,changeLog:[{field:"situacao",label:"Situação",from:ex.situacao,to:"SAIDA",by:user.name,at:stamp()},...(ex.changeLog||[])].slice(0,80),...audit(user)};
          mutate("machines",m=>m.map(x=>x._id===ex._id?u:x));await fbSet("machines",ex._id,u);
          syncSheet(webhookUrl,"machineToClient",{sn:row.sn,destino:c.name,employeeName:user.name,employeeCode:user.code});
          await removeFromAllPallets(row.sn,false);
        }else{
          const id=uid();const d={sn:row.sn,model:"M30S",th:86,type:"complete",situacao:"SAIDA",hash0:"OFF",hash1:"OFF",hash2:"OFF",controladora:"OFF",fonte:"OFF",fans:"OFF",destino:c.name,...audit(user),addedAt:TODAY()};
          await fbSet("machines",id,d);mutate("machines",m=>[...m,{...d,_id:id}]);
          syncSheet(webhookUrl,"addMachine",{sn:row.sn,model:d.model,situacao:"SAIDA",destino:c.name,employeeName:user.name,employeeCode:user.code});
        }
        newMSNs.push(row.sn);
        // Registro de ENVIO — nunca é apagado nem sobrescrito, mesmo que
        // essa máquina volte e seja mandada de novo (pro mesmo cliente ou
        // outro). Cada envio vira uma linha própria no histórico do cliente.
        {
          const mForShip=data.machines.find(m=>m.sn===row.sn);
          const testForShip=[...data.tests].reverse().find(t=>t.machineSN===row.sn&&t.overallResult==="good");
          const shipPhoto=mForShip?.photoKey||testForShip?.testPhoto||"";
          const shipId=uid();
          await fbSet("shipments",shipId,{clientId:c._id,clientName:c.name,machineSN:row.sn,model:mForShip?.model||"",photoKey:shipPhoto,sentAt:stamp(),...audit(user)});
          mutate("shipments",arr=>[...arr,{clientId:c._id,clientName:c.name,machineSN:row.sn,model:mForShip?.model||"",photoKey:shipPhoto,sentAt:stamp(),_id:shipId}]);
        }
      }else{
        if(row.existing){
          const ex=data.hashes.find(h=>h._id===row._id);if(!ex)continue;
          const u={...ex,status:"SAIDA",location:"Vendida: "+c.name,changeLog:[{field:"status",label:"Status",from:ex.status,to:"SAIDA",by:user.name,at:stamp()},...(ex.changeLog||[])].slice(0,80),...audit(user)};
          mutate("hashes",arr=>arr.map(x=>x._id===ex._id?u:x));await fbSet("hashes",ex._id,u);
          syncSheet(webhookUrl,"hashSaida",{sn:row.sn,employeeName:user.name,employeeCode:user.code});
          await removeFromAllPallets(row.sn,true);
        }else{
          const id=uid();const d={sn:row.sn,model:"M30S",status:"SAIDA",location:"Vendida: "+c.name,machineSN:"",slot:-1,...audit(user),addedAt:TODAY()};
          await fbSet("hashes",id,d);mutate("hashes",h=>[...h,{...d,_id:id}]);
          syncSheet(webhookUrl,"addHash",{sn:row.sn,model:d.model,status:"SAIDA",employeeName:user.name,employeeCode:user.code});
        }
        newHSNs.push(row.sn);
      }
    }
    const upd={...c,machinesSN:newMSNs,hashesSN:newHSNs,...audit(user)};setC(upd);mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));await fbSet("clients",c._id,upd);
    await markChanged("clients");await markChanged("machines");await markChanged("hashes");
    setPending([]);setSaving(false);
  };
  const remMac=async(sn)=>{
    if(!confirm(`Desvincular a máquina "${sn}" do cliente "${c.name}"? Ela volta pro estoque como BOA.`))return;
    const newSNs=(c.machinesSN||[]).filter(s=>s!==sn);
    const upd={...c,machinesSN:newSNs,...audit(user)};setC(upd);mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));await fbSet("clients",c._id,upd);await markChanged("clients");
    // Desvincula a máquina de verdade também (volta pra BOA, tira o destino)
    const ex=data.machines.find(m=>m.sn===sn);
    if(ex){
      const mu={...ex,situacao:"BOA",destino:"",changeLog:[{field:"situacao",label:"Situação",from:ex.situacao,to:"BOA (desvinculada de "+c.name+")",by:user.name,at:stamp()},...(ex.changeLog||[])].slice(0,80),...audit(user)};
      mutate("machines",arr=>arr.map(x=>x._id===ex._id?mu:x));await fbSet("machines",ex._id,mu);await markChanged("machines");
      syncSheet(webhookUrl,"updateMachine",{sn,field:"situacao",to:"BOA",employeeName:user.name,employeeCode:user.code});
      syncSheet(webhookUrl,"updateMachine",{sn,field:"destino",to:"",employeeName:user.name,employeeCode:user.code});
      const mHashes=data.hashes.filter(h=>h.machineSN===sn);
      for(const h of mHashes){
        const hu={...h,status:"NA MAQUINA",location:"",changeLog:[{field:"status",label:"Status",from:h.status,to:"NA MAQUINA (desvinculada do cliente)",by:user.name,at:stamp()},...(h.changeLog||[])].slice(0,80),...audit(user)};
        mutate("hashes",arr=>arr.map(x=>x._id===h._id?hu:x));await fbSet("hashes",h._id,hu);
        syncSheet(webhookUrl,"updateHash",{sn:hu.sn,model:hu.model,status:"NA MAQUINA",machineSN:sn,employeeName:user.name,employeeCode:user.code});
      }
      if(mHashes.length)await markChanged("hashes");
    }
  };
  const remHash=async(sn)=>{
    if(!confirm(`Desvincular a HASH "${sn}" do cliente "${c.name}"? Ela volta pro estoque.`))return;
    const newSNs=(c.hashesSN||[]).filter(s=>s!==sn);
    const upd={...c,hashesSN:newSNs,...audit(user)};setC(upd);mutate("clients",arr=>arr.map(x=>x._id===c._id?upd:x));await fbSet("clients",c._id,upd);await markChanged("clients");
    const ex=data.hashes.find(h=>h.sn===sn);
    if(ex){
      const hu={...ex,status:"STOCK",location:"",machineSN:"",changeLog:[{field:"status",label:"Status",from:ex.status,to:"STOCK (desvinculada de "+c.name+")",by:user.name,at:stamp()},...(ex.changeLog||[])].slice(0,80),...audit(user)};
      mutate("hashes",arr=>arr.map(x=>x._id===ex._id?hu:x));await fbSet("hashes",ex._id,hu);await markChanged("hashes");
      syncSheet(webhookUrl,"updateHash",{sn,model:hu.model,status:"STOCK",machineSN:"",employeeName:user.name,employeeCode:user.code});
    }
  };
  const removeBySN=()=>{const sn=removeInput.toUpperCase().trim();if(!sn)return;if((c.machinesSN||[]).includes(sn))remMac(sn);else if((c.hashesSN||[]).includes(sn))remHash(sn);setRemoveInput("")};
  const del=async()=>{if(!confirm("Remover "+c.name+"?"))return;mutate("clients",arr=>arr.filter(x=>x._id!==c._id));await fbDel("clients",c._id);await markChanged("clients");setModal(null)};
  return<div>
    <div style={{background:C.card2,borderRadius:12,padding:14,marginBottom:14}}><div style={{fontWeight:900,fontSize:16,marginBottom:4}}>👤 {c.name}</div>{c.phone&&<div style={{color:C.blue,fontSize:13}}>📱 {c.phone}</div>}{c.notes&&<div style={{color:C.subtle,fontSize:12,marginTop:4}}>{c.notes}</div>}<div style={{marginTop:8,display:"flex",gap:8}}><div style={{background:C.accent+"22",borderRadius:8,padding:"6px 12px",textAlign:"center",flex:1}}><div style={{fontWeight:900,color:C.accent,fontSize:20}}>{macs.length}</div><div style={{fontSize:10,color:C.muted}}>Máquinas</div></div><div style={{background:C.purple+"22",borderRadius:8,padding:"6px 12px",textAlign:"center",flex:1}}><div style={{fontWeight:900,color:C.purple,fontSize:20}}>{hshs.length}</div><div style={{fontSize:10,color:C.muted}}>HASHs</div></div></div></div>
    <div style={{color:C.muted,fontSize:11,marginBottom:10}}>ℹ️ Isso mostra só as máquinas/HASHs que ainda existem no estoque. O histórico de tudo que já foi enviado — mesmo se a máquina depois for apagada — fica sempre no "📋 Relatório de Envios" abaixo, não some daqui.</div>
    <Btn v="b" onClick={()=>setModal(<Modal title={`📋 Relatório — ${c.name}`} onClose={()=>setModal(null)}><ClientReport ctx={ctx} client={c}/></Modal>)} style={{width:"100%",marginBottom:14}}>📋 Relatório de Envios</Btn>
    <ClientLoadPhotos ctx={ctx} client={c}/>
    <div style={{color:C.amber,fontSize:11,marginBottom:8}}>⚠️ Ao salvar, vai tudo pra SAIDA (máquina e HASHs internas dela também)</div>
    <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
      <SL>O QUE VOCÊ VAI ADICIONAR?</SL>
      <div style={{display:"flex",gap:8,marginBottom:10}}>{[["machine","🖥️ Máquina"],["hash","⚡ HASH avulsa"]].map(([v,l])=><button key={v} onClick={()=>setItemType(v)} style={{flex:1,background:itemType===v?C.accent:C.card2,color:"#fff",border:"none",borderRadius:8,padding:"10px 0",fontWeight:700,fontSize:12,cursor:"pointer"}}>{l}</button>)}</div>
      <SL>BIPAR OU DIGITAR OS SNs</SL>
      <SmartScanInput onDetect={addToPending} placeholder={itemType==="machine"?"SN da máquina...":"SN da HASH..."} autoFocus count={pending.length}/>
      {blockMsg&&<Alrt type="err">{blockMsg}</Alrt>}
      <div style={{maxHeight:200,overflow:"auto",marginTop:10}}>
        {pending.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:10}}>Nenhum SN ainda</div>:pending.map(p=><div key={p.sn} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
          <div><span style={{fontSize:11,marginRight:4}}>{p.type==="machine"?"🖥️":"⚡"}</span><span style={{fontSize:13,fontFamily:"monospace",color:C.blue}}>{p.sn}</span>{p.existing?<Tag color={C.amber} small style={{marginLeft:6}}>{p.model} · {p.situacao||p.status}</Tag>:<Tag color={C.green} small style={{marginLeft:6}}>🆕 novo</Tag>}</div>
          <button onClick={()=>removeFromPending(p.sn)} style={{background:"none",border:"none",color:C.red,cursor:"pointer"}}>✕</button>
        </div>)}
      </div>
      <Btn v="g" onClick={saveAll} disabled={saving||!pending.length} style={{width:"100%",marginTop:10}}>{saving?"Salvando...":"💾 Salvar "+pending.length+" item(s)"}</Btn>
    </div>
    <div style={{background:C.bg,borderRadius:10,padding:14,marginBottom:14}}>
      <SL>REMOVER DO CLIENTE POR SN</SL>
      <div style={{display:"flex",gap:8}}><input value={removeInput} onChange={e=>setRemoveInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&removeBySN()} placeholder="Bipe ou digite o SN pra remover..." style={{...inp,flex:1}}/><Btn v="d" onClick={removeBySN} style={{fontSize:12}}>Remover</Btn></div>
    </div>
    <SL>Máquinas ({macs.length})</SL>
    {macs.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Nenhuma máquina</div>:macs.map(m=><div key={m._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.border}}><div><div style={{fontWeight:700,fontSize:12}}>{m.sn||"SEM SN"} <SP s={m.situacao}/></div><div style={{fontSize:10,color:C.muted}}>{m.model} · {m.th}TH</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={()=>setModal(<Modal title={`🖥️ ${m.sn||"SEM SN"}`} onClose={()=>setModal(null)}><MachineDetail ctx={ctx} machine={m}/></Modal>)} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Ver mais</button><button onClick={()=>remMac(m.sn||"")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button></div></div>)}
    <SL mt={14}>HASHs avulsas ({hshs.length})</SL>
    {hshs.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:12}}>Nenhuma HASH avulsa</div>:hshs.map(h=><div key={h._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.border}}><div><div style={{fontWeight:700,fontSize:12}}>{h.sn||"SEM SN"} <HP s={h.status}/></div><div style={{fontSize:10,color:C.muted}}>{h.model}</div></div><div style={{display:"flex",gap:8,alignItems:"center"}}><button onClick={()=>setModal(<Modal title={`⚡ ${h.sn||"SEM SN"}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={h}/></Modal>)} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Ver mais</button><button onClick={()=>remHash(h.sn||"")} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button></div></div>)}
    <Btn v="d" onClick={del} style={{width:"100%",marginTop:14}}>🗑 Remover Cliente</Btn>
  </div>;
}

// Relatório de tudo que foi enviado pra um cliente: máquinas (com SN das HASHs
// e status delas dentro, e a foto tirada no teste) e HASHs avulsas — com
// filtro por modelo e data.
function ClientReport({ctx,client}){
  const{data,setModal}=ctx;
  const[modelFilter,setModelFilter]=useState(""),[dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState(""),[gen,setGen]=useState(false),[genProg,setGenProg]=useState("");
  const macs=(client.machinesSN||[]).map(sn=>data.machines.find(m=>m.sn===sn)).filter(Boolean);
  const hshs=(client.hashesSN||[]).map(sn=>data.hashes.find(h=>h.sn===sn)).filter(Boolean);
  const allModelsUsed=[...new Set([...macs.map(m=>m.model),...hshs.map(h=>h.model)].filter(Boolean))].sort();
  // Período: se só preencher "De", filtra só aquele dia; se preencher os
  // dois, filtra o intervalo (ex: 02 até 15).
  const inRange=at=>{
    if(!at)return!dateFrom&&!dateTo;
    const d=at.slice(0,10);
    if(dateFrom&&d<dateFrom)return false;
    if(dateTo&&d>dateTo)return false;
    if(dateFrom&&!dateTo&&d!==dateFrom)return false; // só "De" preenchido = só aquele dia
    return true;
  };
  const macsF=macs.filter(m=>(!modelFilter||m.model===modelFilter)&&inRange(m._at));
  const hshsF=hshs.filter(h=>(!modelFilter||h.model===modelFilter)&&inRange(h._at));
  const loadPhotosF=(data.loadPhotos||[]).filter(p=>p.clientId===client._id&&inRange(p._at));
  const baixarPDF=async()=>{
    setGen(true);setGenProg("Montando...");
    try{await generateClientPDF(client,macsF,hshsF,data,loadPhotosF,(done,total)=>setGenProg(`Montando... ${done}/${total}`))}
    catch(e){alert("Erro ao gerar PDF: "+e.message)}
    setGen(false);setGenProg("");
  };
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <Sel label="MODELO" value={modelFilter} onChange={e=>setModelFilter(e.target.value)} style={{flex:1}}><option value="">Todos</option>{allModelsUsed.map(m=><option key={m}>{m}</option>)}</Sel>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:4,alignItems:"flex-end"}}>
      <DateInp label="DE" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{flex:1}}/>
      <DateInp label="ATÉ (opcional — deixe vazio pra só 1 dia)" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{flex:1}}/>
      {(dateFrom||dateTo)&&<Btn v="s" onClick={()=>{setDateFrom("");setDateTo("")}} style={{marginBottom:12}}>Limpar</Btn>}
    </div>
    <Btn v="g" onClick={baixarPDF} disabled={gen||(macsF.length+hshsF.length===0)} style={{width:"100%",marginBottom:10}}>{gen?genProg:"📄 Baixar PDF"}</Btn>
    <div style={{color:C.muted,fontSize:12,marginBottom:12}}>{macsF.length} máquina(s) · {hshsF.length} HASH(s) avulsa(s)</div>
    {macsF.length>0&&<><SL>🖥️ MÁQUINAS</SL>
      {macsF.map(m=>{
        const test=[...data.tests].reverse().find(t=>t.machineSN===m.sn&&t.overallResult==="good");
        return<Card key={m._id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{fontWeight:800,fontSize:13,color:C.accent}}>{m.sn} · {m.model}</div>
            <button onClick={()=>setModal(<Modal title={`🖥️ ${m.sn||"SEM SN"}`} onClose={()=>setModal(null)}><MachineDetail ctx={ctx} machine={m}/></Modal>)} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Ver mais</button>
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>Enviada em {m._at?fmtTS(m._at):"—"}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
            {[m.hashSN0,m.hashSN1,m.hashSN2].filter(Boolean).map((sn,i)=>{const h=data.hashes.find(x=>x.sn===sn);return<span key={i} style={{background:C.card2,borderRadius:6,padding:"2px 8px",fontSize:10}}>⚡ {sn} {h&&<HP s={h.status}/>}</span>})}
          </div>
          {(m.photoKey||test?.testPhoto)&&<PhotoView photoKey={m.photoKey||test?.testPhoto} style={{marginTop:8,maxHeight:140}}/>}
        </Card>;
      })}
    </>}
    {hshsF.length>0&&<><SL mt={14}>⚡ HASHs AVULSAS</SL>
      {hshsF.map(h=><Card key={h._id}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:800,fontSize:13,color:C.blue}}>{h.sn} · {h.model}</div><button onClick={()=>setModal(<Modal title={`⚡ ${h.sn||"SEM SN"}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={h}/></Modal>)} style={{background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:11}}>Ver mais</button></div><div style={{fontSize:11,color:C.muted,marginTop:2}}>Enviada em {h._at?fmtTS(h._at):"—"} · <HP s={h.status}/></div></Card>)}
    </>}
    {macsF.length===0&&hshsF.length===0&&<div style={{textAlign:"center",color:C.muted,padding:24}}>Nada encontrado com esse filtro</div>}
    {(()=>{
      const ships=(data.shipments||[]).filter(s=>s.clientId===client._id&&inRange(s.sentAt));
      if(!ships.length&&!loadPhotosF.length)return null;
      // Agrupa por dia — mostra as máquinas enviadas naquele dia, e a(s)
      // foto(s) da carga daquele dia logo em seguida, antes de passar pro
      // próximo dia.
      const days=[...new Set([...ships.map(s=>(s.sentAt||"").slice(0,10)),...loadPhotosF.map(p=>p.date)])].filter(Boolean).sort().reverse();
      return<><SL mt={18}>📦 HISTÓRICO DE ENVIOS POR DIA</SL>
        <div style={{color:C.muted,fontSize:11,marginBottom:8}}>Cada envio fica registrado aqui pra sempre — se a máquina voltar e for mandada de novo, aparece como um envio novo, separado.</div>
        {days.map(day=>{
          const dayShips=ships.filter(s=>(s.sentAt||"").slice(0,10)===day);
          const dayPhotos=loadPhotosF.filter(p=>p.date===day);
          return<div key={day} style={{marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:13,color:C.accent,marginBottom:6}}>{fmtDate(day)}</div>
            {dayShips.map(s=><Card key={s._id} style={{marginBottom:6}}>
              <div style={{fontWeight:700,fontSize:13}}>{s.machineSN}{s.model?` · ${s.model}`:""}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:2}}>Enviada às {fmtTS(s.sentAt).split(", ")[1]||fmtTS(s.sentAt)}</div>
              {s.photoKey&&<PhotoView photoKey={s.photoKey} style={{marginTop:8,maxHeight:140}}/>}
            </Card>)}
            {dayPhotos.length>0?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:6}}>
              {dayPhotos.map(p=><PhotoView key={p._id} photoKey={p.photoKey} style={{maxHeight:140}}/>)}
            </div>:<div style={{color:C.muted,fontSize:11,fontStyle:"italic"}}>Sem foto da carga nesse dia</div>}
          </div>;
        })}
      </>;
    })()}
  </div>;
}

/* ═══ EQUIPE DETALHES ════════════════════════════════════════ */
function EmpHistory({ctx,emp}){
  const{data,mutate,user}=ctx;const[dateFilter,setDateFilter]=useState(TODAY());
  const isSuperAdmin=user.code==="019";
  const allR=data.repairs.filter(r=>r.employeeId===emp._id||r._by===emp._id);const allT=data.tests.filter(t=>t.employeeId===emp._id||t._by===emp._id);
  const dayR=allR.filter(r=>r.date===dateFilter);const dayT=allT.filter(t=>t.date===dateFilter);
  const byDate={};[...allR.map(r=>r.date),...allT.map(t=>t.date)].forEach(d=>{byDate[d]=(byDate[d]||0)+1});
  const delItem=async(item,isRepair)=>{
    if(!confirm("Apagar essa movimentação do histórico? Não dá pra desfazer."))return;
    await fbDel(isRepair?"repairs":"tests",item._id);
    mutate(isRepair?"repairs":"tests",arr=>arr.filter(x=>x._id!==item._id));
    await markChanged(isRepair?"repairs":"tests");
  };
  return<div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      {[[allR.filter(r=>r.type!=="already_good").length,"Consertos",C.accent],[allT.length,"Testes",C.blue],[data.feedbacks?.filter(f=>!f.resolved&&f.originalRepairerId===emp._id).length||0,"Pendências",C.red]].map(([v,l,c])=><div key={l} style={{background:C.card2,borderRadius:10,padding:10,textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div><div style={{fontSize:10,color:C.muted}}>{l}</div></div>)}
    </div>
    <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"flex-end"}}><div style={{flex:1}}><DateInp label="Data" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></div><Btn v="s" onClick={()=>copyReport(emp,data.repairs,data.tests,dateFilter)} style={{marginBottom:12}}>📤</Btn></div>
    {dayR.length===0&&dayT.length===0?<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sem registros nesta data</div>:<>
      {dayR.map(r=><Card key={r._id} accent={r.type==="already_good"?C.green:r.type==="rework"?C.amber:C.blue}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13}}>{r.type==="already_good"?"✅":r.type==="rework"?"🔁 RETRABALHO":"🔧"} {r.hashSN||"SEM SN"} — {r.model}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(r._at)}</div></div>{isSuperAdmin&&<button onClick={()=>delItem(r,true)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button>}</div></Card>)}
      {dayT.map(t=><Card key={t._id} accent={t.status==="pending"?C.blue:t.status==="rejected"?C.amber:t.overallResult==="good"?C.green:C.red}><div style={{display:"flex",justifyContent:"space-between"}}><div><div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div><div style={{fontSize:10,color:C.muted}}>{fmtTS(t._at)}</div></div>{isSuperAdmin&&<button onClick={()=>delItem(t,false)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16}}>✕</button>}</div></Card>)}
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
    {PERMS.map(({key,label})=><div key={key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+C.border}}><span style={{fontSize:13}}>{label}</span><button onClick={()=>setPerm(key,!e.permissions?.[key])} style={{background:e.permissions?.[key]?C.green+"22":C.card2,color:e.permissions?.[key]?C.green:C.muted,border:"1px solid "+(e.permissions?.[key]?C.green:C.border),borderRadius:20,padding:"4px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{e.permissions?.[key]?"ON":"OFF"}</button></div>)}
    <div style={{marginTop:12}}><Btn v="y" onClick={resetPwd} style={{width:"100%",marginBottom:8}}>🔑 Redefinir Senha</Btn></div>
    <div style={{display:"flex",gap:8}}><Btn v="d" onClick={del} style={{flex:1}}>🗑 Remover</Btn><Btn v="g" onClick={save} style={{flex:2}}>💾 Salvar</Btn></div>
  </div>;
}