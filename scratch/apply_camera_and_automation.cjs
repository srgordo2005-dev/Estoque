const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Update TestSlotSNInput with regex
const testSlotRegex = /function TestSlotSNInput\(\{slotRefs,i,value,onCommit,listId\}\)\{[\s\S]*?placeholder="Bipe o SN da HASH\.\.\."[\s\S]*? style=\{\{\.\.\.inp,marginBottom:6\}\}\/>;\s*\}/;

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

if (testSlotRegex.test(code)) {
    code = code.replace(testSlotRegex, newTestSlot);
    console.log("1. TestSlotSNInput updated via regex!");
} else {
    console.log("1. TestSlotSNInput regex failed.");
}

// 2. Update EditPendingTestForm
const editFormRegex = /function EditPendingTestForm\(\{ctx,appr,test,onSaved\}\)\{[\s\S]*?const\[fans,setFans\]=useState\(test\?\.fans\|\|"OFF"\);/;

if (editFormRegex.test(code)) {
    code = code.replace(
        `const[fans,setFans]=useState(test?.fans||"OFF");`,
        `const[fans,setFans]=useState(test?.fans||"OFF");\n  const[scSlot,setScSlot]=useState(null);\n  const[scMac,setScMac]=useState(false);`
    );
    
    code = code.replace(
        `<Inp label="SN DA MÁQUINA" value={machineSN} onChange={e=>setMachineSN(e.target.value.toUpperCase())} placeholder="Digite o SN da máquina"/>`,
        `<div style={{display:"flex",gap:8,marginBottom:12}}>
      <div style={{flex:1}}>
        <Inp label="SN DA MÁQUINA" value={machineSN} onChange={e=>setMachineSN(e.target.value.toUpperCase())} placeholder="Digite o SN da máquina" style={{marginBottom:0}}/>
      </div>
      <button onClick={()=>setScMac(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"10px 14px",cursor:"pointer",fontSize:18,alignSelf:"flex-end",marginBottom:0}} title="Escanear SN da Máquina com Câmera">📷</button>
    </div>
    {scMac&&<BarcodeScanner onScan={v=>{setMachineSN(v.toUpperCase());setScMac(false)}} onClose={()=>setScMac(false)}/>}`
    );

    code = code.replace(
        `<input value={slots[i].hashSN} onChange={e=>setSlot(i,"hashSN",e.target.value.toUpperCase())} placeholder="SN da HASH" style={{...inp,marginBottom:6,fontSize:12,padding:"7px 8px"}}/>`,
        `<div style={{display:"flex",gap:8,marginBottom:6}}>
          <input value={slots[i].hashSN} onChange={e=>setSlot(i,"hashSN",e.target.value.toUpperCase())} placeholder="SN da HASH" style={{...inp,flex:1,marginBottom:0,fontSize:12,padding:"7px 8px"}}/>
          <button onClick={()=>setScSlot(i)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:16,flexShrink:0}} title="Escanear HASH SN com Câmera">📷</button>
        </div>`
    );

    code = code.replace(
        `    <SL mt={8}>COMPONENTES</SL>`,
        `    {scSlot!==null&&<BarcodeScanner onScan={v=>{setSlot(scSlot,"hashSN",v.toUpperCase());setScSlot(null)}} onClose={()=>setScSlot(null)}/>}\n    <SL mt={8}>COMPONENTES</SL>`
    );
    console.log("2. EditPendingTestForm updated via replace!");
}

// 4. BenchConnectionPanel toggle button
code = code.replace(
    `<Btn v="s" onClick={toggleBlink}>`,
    `<button
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
               </button>\n\n               <Btn v="s" onClick={toggleBlink}>`
);

fs.writeFileSync('src/App.jsx', code);
console.log("Completed!");
