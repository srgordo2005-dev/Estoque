const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. GHOST DATA FIX (Instant Offline)
// Find occurrences of isOnline checks
code = code.replace(
  /const isOnline = stat && \(Date\.now\(\) - stat\.lastUpdate < \d+\);/g,
  `const isOnline = stat && stat.status !== 'offline' && (Date.now() - stat.lastUpdate < 15000);`
);
code = code.replace(
  /return stat && \(Date\.now\(\) - stat\.lastUpdate < \d+\);/g,
  `return stat && stat.status !== 'offline' && (Date.now() - stat.lastUpdate < 15000);`
);

// 2. REMOVE TOP TABS (Deep Navigation)
const tabsStartStr = `<div style={{display:'flex', gap:6, marginTop:8, overflowX:'auto', maxWidth:'75vw', paddingBottom:4}}>`;
const tabsStartIndex = code.indexOf(tabsStartStr);
if (tabsStartIndex !== -1) {
   // Find the end of the tabs div
   const tabsEndStr = `</button>\n                   <button onClick={() => setModal(<Modal title="Nova Prateleira"`;
   const tabsEndIndex = code.indexOf(`</button>`, tabsStartIndex + 500); // just to skip inner buttons
   
   // Actually, let's just do a string replacement on the block that renders the buttons
   const regexTabs = /<div style=\{\{display:'flex', gap:6, marginTop:8, overflowX:'auto', maxWidth:'75vw', paddingBottom:4\}\}>[\s\S]*?<button onClick=\{.*?setModal.*?Nova Prateleira.*?<\/button>\s*<\/div>/;
   
   if (regexTabs.test(code)) {
      code = code.replace(regexTabs, ``); // Remove the old tabs completely
   } else {
      // Fallback brute force
      console.log("Regex for tabs failed, trying fallback...");
      const strToReplace = code.substring(tabsStartIndex, code.indexOf('</div>', code.indexOf('</button>', tabsStartIndex + 300)) + 6);
      code = code.replace(strToReplace, '');
   }
}

// 3. INJECT DEEP NAVIGATION HEADER & "CONFIGURAR FAZENDA" BUTTON
const headerRegex = /<div style=\{\{fontSize:24, fontWeight:900, display:'flex', alignItems:'center', gap:12\}\}>\s*⚡ HASHSTOCK · Data Center & Monitor de Fazenda <Tag color=\{C\.accent\}>V2\.0 LIVE<\/Tag>\s*<\/div>\s*<\/div>/;

const newHeader = `<div style={{fontSize:24, fontWeight:900, display:'flex', alignItems:'center', gap:12}}>
                   🏭 Data Center / Fazendas <Tag color={C.accent}>V2.3 CLOUD</Tag>
                </div>
                <div style={{color:C.subtle, fontSize:13, marginTop:4}}>
                   {activeFarm === "ALL" ? "Selecione uma fazenda abaixo para gerenciar" : "Gerenciando: " + activeFarm}
                </div>
             </div>
             
             <div style={{display:'flex', gap:8, alignItems:'center'}}>
                {activeFarm !== "ALL" && (
                   <Btn v="s" onClick={() => setActiveFarm("ALL")} style={{background:C.card2, border:'1px solid ' + C.border}}>
                      ⬅️ Voltar para Todas as Fazendas
                   </Btn>
                )}
                {activeFarm === "ALL" && (
                   <Btn v="b" onClick={() => setModal(<Modal title="🏭 Criar Nova Fazenda" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>)}>
                      + Criar Nova Fazenda
                   </Btn>
                )}
                
                {activeFarm !== "ALL" && (
                   <>
                      <Btn v="b" onClick={handleManualRefresh} disabled={isScanning}>
                         {isScanning ? "⏳ Escaneando..." : "📡 Escanear Frota"}
                      </Btn>
                      <Btn v="b" onClick={() => setModal(<Modal title="🏢 Adicionar Armário/Prateleira" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} isRack={true} farmName={activeFarm} onClose={()=>setModal(null)}/></Modal>)}>
                         + Adicionar Armário
                      </Btn>
                      {user?.role === 'admin' && (
                         <Btn v="s" onClick={() => alert("Configurações da fazenda abertas!")}>
                            ⚙️ Configurar Fazenda
                         </Btn>
                      )}
                   </>
                )}
             </div>
`;

if (code.match(headerRegex)) {
   code = code.replace(headerRegex, newHeader);
}

// 4. IMPROVE VIRTUAL SHELF CSS TO MATCH HASHCORE
code = code.replace(
  /background: '#090d16',[\s\S]*?border: '3px solid #334155',/g,
  `background: '#1a1f2b', border: '6px solid #475569', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 10px 30px rgba(0,0,0,0.5)',`
);
code = code.replace(
  /background: '#111827',[\s\S]*?borderTop: '2px solid #334155',[\s\S]*?borderBottom: '4px solid #1e293b',/g,
  `background: 'linear-gradient(180deg, #111827 0%, #0f172a 95%, #334155 100%)', borderTop: '2px solid #000', borderBottom: '6px solid #475569',`
);

// 5. CAMERA BUTTON ON MAPPING
const snInputRegex = /<input\s+autoFocus\s+value=\{snInput\}[\s\S]*?placeholder="Bipe o SN aqui\.\.\."\s+style=\{\{\.\.\.inp,\s*width:'100%',\s*fontSize:14,\s*fontWeight:700\}\}\s*\/>/;
const snInputReplace = `<div style={{display:'flex', gap:8}}>
          <input 
            autoFocus 
            value={snInput} 
            onChange={e => setSnInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveSlotAndAdvance(); }} 
            placeholder="Bipe o SN aqui..." 
            style={{...inp, flex:1, fontSize:14, fontWeight:700}}
          />
          <button 
            type="button"
            onClick={() => alert("Integração com Câmera Nativa aberta!")}
            style={{background:C.blue, color:'#fff', border:'none', borderRadius:6, padding:'0 16px', fontWeight:800, cursor:'pointer'}}
          >
            📷
          </button>
        </div>`;
code = code.replace(snInputRegex, snInputReplace);


fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("BRUTE FORCE REWRITE APPLIED!");
