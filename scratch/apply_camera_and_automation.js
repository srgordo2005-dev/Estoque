const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. TestSlotSNInput - add camera scanner button next to each slot input
const oldTestSlot = `function TestSlotSNInput({slotRefs,i,value,onCommit,listId}){
  const[local,setLocal]=useState(value);
  useEffect(()=>{setLocal(value)},[value]);
  const commit=()=>{if(local.toUpperCase().trim()!==value)onCommit(local.toUpperCase().trim())};
  return<input ref={el=>slotRefs.current[i]=el} value={local} onChange={e=>setLocal(e.target.value.toUpperCase())} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();setTimeout(()=>slotRefs.current[i+1]?.focus(),30)}}} placeholder="Bipe o SN da HASH..." list={listId} style={{...inp,marginBottom:6}}/>;
}`;

const newTestSlot = `function TestSlotSNInput({slotRefs,i,value,onCommit,listId}){
  const[local,setLocal]=useState(value);
  const[sc,setSc]=useState(false);
  useEffect(()=>{setLocal(value)},[value]);
  const commit=()=>{if(local.toUpperCase().trim()!==value)onCommit(local.toUpperCase().trim())};
  return<div style={{display:"flex",gap:8,marginBottom:6}}>
    <input ref={el=>slotRefs.current[i]=el} value={local} onChange={e=>setLocal(e.target.value.toUpperCase())} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();setTimeout(()=>slotRefs.current[i+1]?.focus(),30)}}} placeholder="Bipe o SN da HASH..." list={listId} style={{...inp,flex:1,marginBottom:0}}/>
    <button onClick={()=>setSc(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:18,flexShrink:0}} title="Escanear SN da HASH com Câmera">📷</button>
    {sc&&<BarcodeScanner onScan={v=>{const u=v.toUpperCase();setLocal(u);setSc(false);onCommit(u)}} onClose={()=>setSc(false)}/>}
  </div>;
}`;

if (code.includes(oldTestSlot)) {
    code = code.replace(oldTestSlot, newTestSlot);
    console.log("1. TestSlotSNInput updated successfully!");
} else {
    console.log("1. TestSlotSNInput snippet NOT matched.");
}

// 2. EditPendingTestForm - add camera scanner buttons to Machine SN and HASH SN fields
const oldEditForm = `function EditPendingTestForm({ctx,appr,test,onSaved}){
  const{data,mutate,allModels,gTH,gChips}=ctx;const models=allModels();
  const[machineSN,setMachineSN]=useState(appr.machineSN||"");
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
    const cleanSN=machineSN.toUpperCase().trim();
    const apprU={...appr,machineSN:cleanSN,model,th:Number(th)};
    await fbSet("pendingApprovals",appr._id,apprU);mutate("approvals",a=>a.map(x=>x._id===appr._id?apprU:x));
    if(test){
      const testU={...test,machineSN:cleanSN,model,th:Number(th),
        slot0HashSN:slots[0].hashSN,slot0Result:slots[0].result,
        slot1HashSN:slots[1].hashSN,slot1Result:slots[1].result,
        slot2HashSN:slots[2].hashSN,slot2Result:slots[2].result,
        controladora:ctr,fonte,fans};
      await fbSet("tests",test._id,testU);mutate("tests",t=>t.map(x=>x._id===test._id?testU:x));
    }
    onSaved();
  };
  const exMac=machineSN.trim()?data.machines.find(m=>m.sn===machineSN.toUpperCase().trim()):null;
  return<div>
    <Inp label="SN DA MÁQUINA" value={machineSN} onChange={e=>setMachineSN(e.target.value.toUpperCase())} placeholder="Digite o SN da máquina"/>
    {exMac&&<div style={{background:C.green+"15",border:\`1px solid \${C.green}44\`,borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:C.green}}>
      ✅ Esse SN já pertence a uma máquina no estoque ({exMac.model} · {exMac.situacao}). O teste será vinculado e atualizará essa máquina.
    </div>}
    {!exMac&&machineSN.trim()&&<div style={{background:C.amber+"15",border:\`1px solid \${C.amber}44\`,borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:C.amber}}>
      ⚠️ Essa máquina ainda não existe no estoque — ela será criada quando você aprovar o teste.
    </div>}
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
        {h&&<div style={{fontSize:11,color:C.blue,marginBottom:6}}>⚡ {h.model}{gChips(h.model,h.material)?\` · \${gChips(h.model,h.material)} chips\`:""}</div>}
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
}`;

const newEditForm = `function EditPendingTestForm({ctx,appr,test,onSaved}){
  const{data,mutate,allModels,gTH,gChips}=ctx;const models=allModels();
  const[machineSN,setMachineSN]=useState(appr.machineSN||"");
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
  const[scSlot,setScSlot]=useState(null);
  const[scMac,setScMac]=useState(false);
  const setSlot=(i,k,v)=>setSlots(s=>s.map((sl,idx)=>idx===i?{...sl,[k]:v}:sl));
  const save=async()=>{
    const cleanSN=machineSN.toUpperCase().trim();
    const apprU={...appr,machineSN:cleanSN,model,th:Number(th)};
    await fbSet("pendingApprovals",appr._id,apprU);mutate("approvals",a=>a.map(x=>x._id===appr._id?apprU:x));
    if(test){
      const testU={...test,machineSN:cleanSN,model,th:Number(th),
        slot0HashSN:slots[0].hashSN,slot0Result:slots[0].result,
        slot1HashSN:slots[1].hashSN,slot1Result:slots[1].result,
        slot2HashSN:slots[2].hashSN,slot2Result:slots[2].result,
        controladora:ctr,fonte,fans};
      await fbSet("tests",test._id,testU);mutate("tests",t=>t.map(x=>x._id===test._id?testU:x));
    }
    onSaved();
  };
  const exMac=machineSN.trim()?data.machines.find(m=>m.sn===machineSN.toUpperCase().trim()):null;
  return<div>
    <div style={{display:"flex",gap:8,marginBottom:12}}>
      <div style={{flex:1}}>
        <Inp label="SN DA MÁQUINA" value={machineSN} onChange={e=>setMachineSN(e.target.value.toUpperCase())} placeholder="Digite o SN da máquina" style={{marginBottom:0}}/>
      </div>
      <button onClick={()=>setScMac(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:18,alignSelf:"flex-end",marginBottom:0}} title="Escanear SN da Máquina com Câmera">📷</button>
    </div>
    {scMac&&<BarcodeScanner onScan={v=>{setMachineSN(v.toUpperCase());setScMac(false)}} onClose={()=>setScMac(false)}/>}
    {exMac&&<div style={{background:C.green+"15",border:\`1px solid \${C.green}44\`,borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:C.green}}>
      ✅ Esse SN já pertence a uma máquina no estoque ({exMac.model} · {exMac.situacao}). O teste será vinculado e atualizará essa máquina.
    </div>}
    {!exMac&&machineSN.trim()&&<div style={{background:C.amber+"15",border:\`1px solid \${C.amber}44\`,borderRadius:10,padding:12,marginBottom:12,fontSize:12,color:C.amber}}>
      ⚠️ Essa máquina ainda não existe no estoque — ela será criada quando você aprovar o teste.
    </div>}
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
        <div style={{display:"flex",gap:8,marginBottom:6}}>
          <input value={slots[i].hashSN} onChange={e=>setSlot(i,"hashSN",e.target.value.toUpperCase())} placeholder="SN da HASH" style={{...inp,flex:1,marginBottom:0,fontSize:12,padding:"7px 8px"}}/>
          <button onClick={()=>setScSlot(i)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:16,flexShrink:0}} title="Escanear HASH SN com Câmera">📷</button>
        </div>
        {h&&<div style={{fontSize:11,color:C.blue,marginBottom:6}}>⚡ {h.model}{gChips(h.model,h.material)?\` · \${gChips(h.model,h.material)} chips\`:""}</div>}
        {slotPhoto&&<PhotoView photoKey={slotPhoto} style={{maxHeight:120,marginBottom:6}}/>}
        <div style={{display:"flex",gap:6}}>
          {[["good","BOA",C.green],["bad","RUIM",C.red],["","—",C.muted]].map(([v,l,c])=><button key={v||"none"} onClick={()=>setSlot(i,"result",v)} style={{flex:1,background:slots[i].result===v?c+"33":C.card2,color:slots[i].result===v?c:C.muted,border:"1px solid "+(slots[i].result===v?c:C.border),borderRadius:8,padding:"6px 0",fontSize:11,fontWeight:700,cursor:"pointer"}}>{l}</button>)}
        </div>
      </div>;
    })}
    {scSlot!==null&&<BarcodeScanner onScan={v=>{setSlot(scSlot,"hashSN",v.toUpperCase());setScSlot(null)}} onClose={()=>setScSlot(null)}/>}
    <SL mt={8}>COMPONENTES</SL>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      {[["CTR",ctr,setCtr],["FONTE",fonte,setFonte],["FANS",fans,setFans]].map(([l,v,setV])=><Sel key={l} label={l} value={v} onChange={e=>setV(e.target.value)} style={{marginBottom:0}}><option value="ON">ON</option><option value="OFF">OFF</option></Sel>)}
    </div>
    {test?.testPhoto&&<><SL>FOTO DA TELA (enviada pelo testador)</SL><PhotoView photoKey={test.testPhoto} style={{maxHeight:220,marginBottom:14}}/></>}
    <Btn v="g" onClick={save} style={{width:"100%"}}>💾 Salvar</Btn>
  </div>;
}`;

if (code.includes(oldEditForm)) {
    code = code.replace(oldEditForm, newEditForm);
    console.log("2. EditPendingTestForm updated successfully!");
} else {
    console.log("2. EditPendingTestForm snippet NOT matched.");
}

// 3. Uptime check logic with machine-level toggle
const oldUptimeCheck = `if (uptimeHours >= targetUptimeHours && !autoSubmitTriggered && session && doSubmit) {`;
const newUptimeCheck = `const isAutoOn = session?.autoEnabled !== false;\n                        if (isAutoOn && uptimeHours >= targetUptimeHours && !autoSubmitTriggered && session && doSubmit) {`;

if (code.includes(oldUptimeCheck)) {
    code = code.replace(oldUptimeCheck, newUptimeCheck);
    console.log("3. Uptime check logic updated!");
} else {
    console.log("3. Uptime check logic snippet NOT matched.");
}

// 4. Automation Toggle button in BenchConnectionPanel
const oldBenchButtons = `<Btn v="s" onClick={toggleBlink}>
                  🔦 {blinkOn ? "Parar de Piscar" : "Piscar LED"}
               </Btn>`;

const newBenchButtons = `<button
                  onClick={() => {
                     const currentVal = session?.autoEnabled !== false;
                     const nextVal = !currentVal;
                     if (session && saveSession) saveSession({ ...session, autoEnabled: nextVal });
                  }}
                  style={{
                     background: (session?.autoEnabled !== false) ? C.green + "22" : C.card2,
                     border: "1px solid " + ((session?.autoEnabled !== false) ? C.green : C.border),
                     color: (session?.autoEnabled !== false) ? C.green : C.subtle,
                     borderRadius: 8,
                     padding: "5px 10px",
                     fontSize: 11,
                     fontWeight: 800,
                     cursor: "pointer",
                     display: "inline-flex",
                     alignItems: "center",
                     gap: 6
                  }}
                  title="Configuração por máquina: Ligar ou desligar envio automático de teste desta máquina ao atingir o tempo alvo"
               >
                  {(session?.autoEnabled !== false) ? "⚡ Automação: LIGADA" : "⏸️ Automação: DESLIGADA"}
               </button>

               <Btn v="s" onClick={toggleBlink}>
                  🔦 {blinkOn ? "Parar de Piscar" : "Piscar LED"}
               </Btn>`;

if (code.includes(oldBenchButtons)) {
    code = code.replace(oldBenchButtons, newBenchButtons);
    console.log("4. Automation Toggle button added!");
} else {
    console.log("4. Automation Toggle button snippet NOT matched.");
}

fs.writeFileSync('src/App.jsx', code);
