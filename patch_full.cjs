const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Replace background blobs with floating 3D coins
content = content.replace(
    '<div className="bg-blob-1" />\\n      <div className="bg-blob-2" />',
    `<div className="floating-coins-container">
        <div className="floating-coin coin-1">₿</div>
        <div className="floating-coin coin-2">Ξ</div>
        <div className="floating-coin coin-3">₿</div>
        <div className="floating-coin coin-4">🪙</div>
        <div className="light-particle" style={{top: '30%', left: '40%'}}></div>
        <div className="light-particle" style={{top: '70%', left: '70%', animationDelay: '1s'}}></div>
        <div className="light-particle" style={{top: '40%', left: '80%', animationDelay: '2s'}}></div>
      </div>`
);

// 2. Redesign Sidebar
content = content.replace(
    /<aside className="app-sidebar">[\s\S]*?<\/aside>/,
    `<aside className="premium-sidebar">
        <div style={{padding: "24px 20px", borderBottom: \`1px solid rgba(191,149,63,0.2)\`, display: "flex", alignItems: "center", gap: 12}}>
          <div style={{width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg, #bf953f, #fcf6ba)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 0 15px rgba(191,149,63,0.5)'}}>⛏️</div>
          <div>
            <div className="gold-text" style={{fontWeight: 900, fontSize: 18, letterSpacing: 1}}>HASHSTOCK</div>
            <div style={{fontSize: 11, color: '#8e9eab', fontWeight: 600}}>
              {user.name} #{user.code} {syncing ? "· 🔄" : ""}
            </div>
          </div>
        </div>

        <div style={{flex: 1, overflowY: "auto", padding: "20px 14px", display: "flex", flexDirection: "column"}}>
          {TABS.map(t => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={\`premium-sidebar-btn \${isActive ? 'active' : ''}\`}
              >
                <span className="sidebar-icon" style={{fontSize: 20}}>{t.icon}</span>
                <span style={{flex: 1}}>{t.label}</span>
                {isActive && <div style={{width: 6, height: 6, borderRadius: "50%", background: '#fcf6ba', boxShadow: \`0 0 10px #fcf6ba\`}}></div>}
              </button>
            );
          })}
        </div>

        <div style={{padding: "20px", borderTop: \`1px solid rgba(191,149,63,0.2)\`, background: 'rgba(5,7,10,0.8)', display: "flex", flexDirection: "column", gap: 12}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", fontSize:11, color:'#8e9eab', fontWeight:600}}>
            <span>Rede (Supabase / Local)</span>
            <div style={{display: "flex", gap: 6}}>
              <div title="Supabase" style={{width: 8, height: 8, borderRadius: "50%", background: dbConnected ? '#4ade80' : '#f87171', boxShadow:\`0 0 8px \${dbConnected ? '#4ade80' : '#f87171'}\`}} />
              <div title="Local Helper" style={{width: 8, height: 8, borderRadius: "50%", background: localConnected ? '#4ade80' : '#f87171', boxShadow:\`0 0 8px \${localConnected ? '#4ade80' : '#f87171'}\`}} />
            </div>
          </div>
          <div style={{display: "flex", gap: 8, marginTop: 4}}>
            <button onClick={() => { setUser(null); setTab("home"); }} style={{flex: 1, background: 'rgba(248,113,113,0.1)', border: \`1px solid rgba(248,113,113,0.3)\`, color: '#f87171', borderRadius: 10, padding: "8px 0", fontSize: 12, fontWeight: 800, cursor: "pointer", transition:'all 0.2s'}}>
              🚪 Sair
            </button>
          </div>
        </div>
      </aside>`
);

// 3. DataCenterPage state updates
content = content.replace(
    'const [btcScanIpRange, setBtcScanIpRange] = useState("192.168.1.1-255");',
    `const savedIps = user?.btcToolsIps ? user.btcToolsIps : ["192.168.1.1-255"];
    const [btcScanIpRanges, setBtcScanIpRanges] = useState(savedIps);
    const [ipModalOpen, setIpModalOpen] = useState(false);
    
    const saveIpRanges = async (newRanges) => {
        setBtcScanIpRanges(newRanges);
        if (user?._id) {
            await supabase.from("employees").update({ btcToolsIps: newRanges }).eq("id", user._id);
        }
    };
    const [btcScanResults, setBtcScanResults] = useState([]);`
).replace('const [btcScanResults, setBtcScanResults] = useState([]);', ''); // Since we injected it above, remove the original

// Replace the specific BTC tools input with the new Modal button
content = content.replace(
    /<div style=\{\{display:'flex', gap:10, marginBottom:16, flexWrap:'wrap'\}\}>[\s\S]*?alert\("Erro ao executar scanner no servidor local\."\);\s*\}\s*\}\s*catch\(e\)\{\}\s*\}\}\s*style=\{\{.*?\}\}>\s*🔍 Escanear\s*<\/Btn>\s*<\/div>/,
    `<div className="card-3d" style={{marginBottom: 24}}>
                     <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                            <h3 className="gold-text" style={{margin:0}}>📡 BTC Tools Scanner Global</h3>
                            <div style={{fontSize:12, color:'#8e9eab', marginTop:4}}>{btcScanIpRanges.length} faixas configuradas prontas para escaneamento.</div>
                        </div>
                        <div style={{display:'flex', gap:10}}>
                            <button onClick={() => setIpModalOpen(true)} style={{background:'rgba(191,149,63,0.1)', border:'1px solid #bf953f', color:'#fcf6ba', padding:'8px 16px', borderRadius:8, fontWeight:800, cursor:'pointer'}}>
                                ⚙️ Configurar IPs
                            </button>
                            <button onClick={async () => {
                                setBtcScanResults([]);
                                setIsScanning(true);
                                let allResults = [];
                                for (const range of btcScanIpRanges) {
                                    try {
                                        const res = await fetch(\`http://localhost:3001/api/scan-range?range=\${encodeURIComponent(range)}\`);
                                        if (res.ok) {
                                            const data = await res.json();
                                            allResults = [...allResults, ...(data.miners || [])];
                                        }
                                    } catch(e) {}
                                }
                                setBtcScanResults(allResults);
                                setIsScanning(false);
                            }} style={{background:'linear-gradient(90deg, #bf953f, #aa771c)', border:'none', color:'#000', padding:'8px 16px', borderRadius:8, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 15px rgba(191,149,63,0.4)'}}>
                                {isScanning ? '⏳ Escaneando...' : '🔍 Escanear Todas as Faixas'}
                            </button>
                        </div>
                     </div>
                     
                     {ipModalOpen && (
                         <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(10px)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center'}}>
                             <div className="card-3d" style={{width:'90%', maxWidth:500, padding: 30}}>
                                 <h2 className="gold-text" style={{marginBottom:10}}>Gerenciar Faixas de IP</h2>
                                 <p style={{fontSize:12, color:'#8e9eab', marginBottom:20}}>Adicione quantas faixas quiser para escanear simultaneamente. Uma por linha.</p>
                                 <textarea 
                                     id="ipRangesInput"
                                     defaultValue={btcScanIpRanges.join('\\n')} 
                                     rows={6}
                                     style={{width:'100%', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(191,149,63,0.3)', color:'#fff', padding:16, borderRadius:8, fontFamily:'monospace', marginBottom:20, outline:'none'}}
                                     placeholder="Ex:\\n192.168.1.1-255\\n10.0.0.1-50"
                                 />
                                 <div style={{display:'flex', gap:10, justifyContent:'flex-end'}}>
                                     <button onClick={()=>setIpModalOpen(false)} style={{background:'transparent', border:'1px solid #8e9eab', color:'#8e9eab', padding:'10px 20px', borderRadius:8, cursor:'pointer', fontWeight:800}}>Cancelar</button>
                                     <button onClick={()=>{
                                         const val = document.getElementById('ipRangesInput').value;
                                         const ranges = val.split('\\n').map(r => r.trim()).filter(Boolean);
                                         saveIpRanges(ranges);
                                         setIpModalOpen(false);
                                     }} style={{background:'linear-gradient(90deg, #bf953f, #aa771c)', border:'none', color:'#000', padding:'10px 20px', borderRadius:8, fontWeight:900, cursor:'pointer', boxShadow:'0 4px 15px rgba(191,149,63,0.4)'}}>💾 Salvar Faixas</button>
                                 </div>
                             </div>
                         </div>
                     )}
                  </div>`
);

fs.writeFileSync('src/App.jsx', content);
console.log("Patch successful!");
