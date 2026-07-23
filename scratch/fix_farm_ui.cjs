const fs = require('fs');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// 1. REMOVE "RECRIAR PRATELEIRA DO ZERO" BUTTON
appCode = appCode.replace(
  /<Btn v="d" onClick=\{async \(\) => \{\s+if \(!confirm\("Deseja APAGAR TODAS as prateleiras atuais e recriar a Prateleira do zero\?"\)\) return;[\s\S]*?Recriar Prateleira do Zero\s+<\/Btn>/g,
  ''
);

// 2. REMOVE "APAGAR PRATELEIRA" BUTTON
appCode = appCode.replace(
  /<button onClick=\{.*?handleDeleteShelf.*?Apagar Prateleira\s*<\/button>/g,
  ''
);

// 3. REMOVE onDoubleClick FROM SLOT TO PREVENT DOUBLE PAGE OPENS
appCode = appCode.replace(
  /onDoubleClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(m\.ip\) window\.open\('http:\/\/' \+ m\.ip, '_blank'\); \}\}/g,
  ''
);
// Also from other places if any
appCode = appCode.replace(
  /onDoubleClick=\{.*?window\.open.*?\}/g,
  ''
);

// 4. ADD "ABRIR NO NAVEGADOR" BUTTON IN THE MODAL INSTEAD OF DOUBLE CLICK
const slotDetailsModalTarget = `<Btn v="s" onClick={() => setModal(null)} style={{flex:1}}>Fechar</Btn>`;
const slotDetailsModalReplacement = `<Btn v="s" onClick={() => setModal(null)} style={{flex:1}}>Fechar</Btn>
            {m.ip && <Btn onClick={() => window.open('http://' + m.ip, '_blank')} style={{flex:2, justifyContent:'center'}}>🌐 Abrir Máquina no Navegador</Btn>}`;
appCode = appCode.replace(slotDetailsModalTarget, slotDetailsModalReplacement);

// 5. IMPLEMENT ALL FARMS VIEW (FARM CARDS GRID)
const originalFarmsMapStart = `         ) : (
            displayedFarms.map(farmName => {`;

const farmCardsImplementation = `         ) : activeFarm === "ALL" ? (
             <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:20, marginTop:20}}>
                {farmsList.map(farmName => {
                    const machines = farmMachines.filter(m => (m.location || "Fazenda Principal") === farmName);
                    const onlineCount = machines.filter(m => {
                       const stat = farmStatus[m.ip];
                       return stat && (Date.now() - stat.lastUpdate < 120000);
                    }).length;
                    const totalTH = machines.reduce((acc, m) => {
                       const stat = farmStatus[m.ip];
                       return acc + (stat && stat.th ? parseFloat(stat.th) : 0);
                    }, 0);
                    
                    return (
                       <div key={farmName} 
                            onClick={() => setActiveFarm(farmName)} 
                            style={{
                               background:C.card2, 
                               padding:24, 
                               borderRadius:16, 
                               border:'1px solid ' + C.border, 
                               cursor:'pointer', 
                               boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
                            }}>
                          <div style={{fontSize:22, fontWeight:900, marginBottom:16, display:'flex', alignItems:'center', gap:10}}>
                             🏭 {farmName}
                          </div>
                          
                          <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:20}}>
                              <div style={{display:'flex', justifyContent:'space-between', background:C.bg, padding:'10px 14px', borderRadius:8}}>
                                 <span style={{color:C.subtle, fontSize:13, fontWeight:700}}>Total de Posições (Slots):</span>
                                 <span style={{fontWeight:900, color:C.text}}>{machines.length}</span>
                              </div>
                              <div style={{display:'flex', justifyContent:'space-between', background:C.bg, padding:'10px 14px', borderRadius:8}}>
                                 <span style={{color:C.subtle, fontSize:13, fontWeight:700}}>Máquinas Online (Minando):</span>
                                 <span style={{fontWeight:900, color:C.green}}>{onlineCount}</span>
                              </div>
                              <div style={{display:'flex', justifyContent:'space-between', background:C.bg, padding:'10px 14px', borderRadius:8}}>
                                 <span style={{color:C.subtle, fontSize:13, fontWeight:700}}>Hashrate Total da Fazenda:</span>
                                 <span style={{fontWeight:900, color:C.blue}}>{totalTH.toFixed(1)} TH/s</span>
                              </div>
                          </div>
                          
                          <Btn v="b" style={{width:'100%', justifyContent:'center', padding:12, fontSize:14}}>
                             📂 Acessar Prateleiras Físicas
                          </Btn>
                       </div>
                    );
                })}
             </div>
          ) : (
            displayedFarms.map(farmName => {`;

appCode = appCode.replace(originalFarmsMapStart, farmCardsImplementation);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("APPLIED FIXES TO APP.JSX!");
