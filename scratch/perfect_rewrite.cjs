const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Ghost data
code = code.replace(
  /const isOnline = stat && \(Date\.now\(\) - stat\.lastUpdate < \d+\);/g,
  `const isOnline = stat && stat.status !== 'offline' && (Date.now() - stat.lastUpdate < 15000);`
);
code = code.replace(
  /return stat && \(Date\.now\(\) - stat\.lastUpdate < \d+\);/g,
  `return stat && stat.status !== 'offline' && (Date.now() - stat.lastUpdate < 15000);`
);

// 2. Virtual Shelf CSS
code = code.replace(
  /background: '#090d16',[\s\S]*?border: '3px solid #334155',/g,
  `background: '#1a1f2b', border: '6px solid #475569', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 10px 30px rgba(0,0,0,0.5)',`
);
code = code.replace(
  /background: '#111827',[\s\S]*?borderTop: '2px solid #334155',[\s\S]*?borderBottom: '4px solid #1e293b',/g,
  `background: 'linear-gradient(180deg, #111827 0%, #0f172a 95%, #334155 100%)', borderTop: '2px solid #000', borderBottom: '6px solid #475569',`
);

// 3. UI Replacement
const startTag = `{/* Top Header & Farm Filter Tabs */}`;
const endTag = `{/* FAZENDAS COM PRATELEIRAS SIDE-BY-SIDE (LADO A LADO) */}`;

const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
   const sectionToReplace = code.substring(startIndex, endIndex + endTag.length);
   
   const newUI = `{activeFarm === "ALL" ? (
        // --- 🚀 LOBBY DE FAZENDAS ---
        <div style={{display:'flex', flexDirection:'column', gap:20, paddingBottom: 40}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                    <div style={{fontSize:28, fontWeight:900, display:'flex', alignItems:'center', gap:12}}>
                       🏭 Data Center / Fazendas <span style={{background:C.accent, color:'#000', padding:'2px 8px', borderRadius:10, fontSize:12, fontWeight:900}}>V2.3 CLOUD</span>
                    </div>
                    <div style={{color:C.subtle, fontSize:14, marginTop:4}}>Selecione uma Fazenda abaixo para acessar as Prateleiras</div>
                </div>
                <button 
                    onClick={() => setModal(<Modal title="🏭 Criar Nova Fazenda" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>)}
                    style={{background:C.blue, color:'#fff', padding:'10px 20px', borderRadius:8, fontWeight:800, border:'none', cursor:'pointer'}}
                >
                    + Criar Nova Fazenda
                </button>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:20, marginTop:20}}>
                {farmsList.map(f => {
                    const fMachines = dbFarmMachines.filter(m => (m.location || "Fazenda Principal") === f);
                    const onlineM = fMachines.filter(m => m.ip && farmStatus[m.ip] && farmStatus[m.ip].status !== 'offline').length;
                    return (
                        <div 
                            key={f} 
                            onClick={() => setActiveFarm(f)}
                            style={{background:C.card, border:'1px solid '+C.border, borderRadius:12, padding:20, cursor:'pointer', transition:'all 0.2s'}}
                            onMouseOver={e => Object.assign(e.currentTarget.style, {borderColor:C.accent, transform:'translateY(-2px)', boxShadow:'0 10px 20px rgba(0,0,0,0.4)'})}
                            onMouseOut={e => Object.assign(e.currentTarget.style, {borderColor:C.border, transform:'translateY(0)', boxShadow:'none'})}
                        >
                            <div style={{fontSize:20, fontWeight:900, color:C.accent, marginBottom:10}}>🏭 {f}</div>
                            <div style={{display:'flex', justifyContent:'space-between', color:C.subtle, fontSize:13}}>
                                <span>{fMachines.length} Posições</span>
                                <span style={{color:C.green}}>🟢 {onlineM} Online</span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    ) : (
        // --- 🚀 DENTRO DA FAZENDA ESCOLHIDA ---
        <div style={{display:'flex', flexDirection:'column', gap:20}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:C.card, padding:20, borderRadius:12, border:'1px solid '+C.border}}>
                <div>
                    <button onClick={() => setActiveFarm("ALL")} style={{background:'transparent', border:'none', color:C.subtle, cursor:'pointer', display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:800, marginBottom:10}}>
                        ⬅️ Voltar para Todas as Fazendas
                    </button>
                    <div style={{fontSize:24, fontWeight:900, color:C.accent}}>🏭 FAZENDA: {activeFarm.toUpperCase()}</div>
                </div>

                <div style={{display:'flex', gap:10}}>
                    <button onClick={handleManualRefresh} disabled={isScanning} style={{background:C.card2, border:'1px solid '+C.border, color:C.text, padding:'8px 16px', borderRadius:8, fontWeight:800, cursor:'pointer'}}>
                        {isScanning ? "⏳ Escaneando..." : "📡 Escanear Frota"}
                    </button>
                    <button onClick={() => setModal(<Modal title="🏢 Adicionar Armário/Prateleira" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} isRack={true} farmName={activeFarm} onClose={()=>setModal(null)}/></Modal>)} style={{background:C.blue, border:'none', color:'#fff', padding:'8px 16px', borderRadius:8, fontWeight:800, cursor:'pointer'}}>
                        + Adicionar Armário
                    </button>
                    {user?.role === 'admin' && (
                        <button onClick={() => setModal(<Modal title="Configurações da Fazenda" onClose={()=>setModal(null)}><EditFarmModal ctx={ctx} farmName={activeFarm} onClose={()=>setModal(null)}/></Modal>)} style={{background:C.amber, border:'none', color:'#000', padding:'8px 16px', borderRadius:8, fontWeight:800, cursor:'pointer'}}>
                            ⚙️ Configurar Fazenda
                        </button>
                    )}
                </div>
            </div>

            <div style={{display:'flex', gap:10, alignItems:'center', background:C.card, padding:'10px 20px', borderRadius:8, border:'1px solid '+C.border, flexWrap:'wrap'}}>
                <span style={{fontSize:11, color:C.subtle, fontWeight:800}}>VISÃO:</span>
                <button onClick={()=>setViewType('btc')} style={{background: viewType === 'btc' ? C.accent : 'transparent', color: viewType === 'btc' ? '#000' : C.subtle, border:'none', padding:'4px 10px', borderRadius:4, fontWeight:800, cursor:'pointer', fontSize:11}}>Tabela</button>
                <button onClick={()=>setViewType('rack')} style={{background: viewType === 'rack' ? C.accent : 'transparent', color: viewType === 'rack' ? '#000' : C.subtle, border:'none', padding:'4px 10px', borderRadius:4, fontWeight:800, cursor:'pointer', fontSize:11}}>Prateleira Virtual 2D</button>
                
                <div style={{width:1, height:20, background:C.border, margin:'0 10px'}}></div>
                
                <label style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.subtle, cursor:'pointer', fontWeight:800}}>
                    <input type="checkbox" checked={onlyOnline} onChange={e=>setOnlyOnline(e.target.checked)}/> Somente Online
                </label>
                
                <div style={{width:1, height:20, background:C.border, margin:'0 10px'}}></div>
                
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Buscar IP, SN, Slot..." style={{background:C.card2, border:'1px solid '+C.border, color:C.text, padding:'4px 10px', borderRadius:4, fontSize:11, width:200}} />
            </div>
            
            {/* INÍCIO DA RENDERIZAÇÃO DA FAZENDA SELECIONADA */}`;
            
   code = code.replace(sectionToReplace, newUI);
   
   // FIX THE END OF DATACENTER PAGE SAFELY
   // Look for the exact end block of DataCenterPage before CfgPage
   const searchForEnd = `             })
          )}
      </div>;
}

function CfgPage`;
   
   const replaceWithEnd = `             })
          )}
        </div>
      )}
    </div>;
}

function CfgPage`;

   code = code.replace(searchForEnd, replaceWithEnd);
   
} else {
   console.log("Could not find start/end tags");
}

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("PERFECT REWRITE COMPLETE.");
