const fs = require('fs');

console.log("Applying Global Server Auto-Update & Connection Feedback Banner...");

// --- 1. UPDATE HELPER FILES (local-helper.js & desktop/local-helper.js) ---
function updateHelperVersionCheck(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  const newVersionEndpoint = `
const CURRENT_HELPER_VERSION = "1.0.1";

app.get('/api/version', async (req, res) => {
    let latestVersion = CURRENT_HELPER_VERSION;
    let hasUpdate = false;
    try {
        const pkgRes = await fetch('https://raw.githubusercontent.com/srgordo2005-dev/Estoque/main/desktop/package.json');
        if (pkgRes.ok) {
            const pkg = await pkgRes.json();
            if (pkg.version) latestVersion = pkg.version;
            if (latestVersion !== CURRENT_HELPER_VERSION) hasUpdate = true;
        }
    } catch(e) {}
    res.json({
        version: CURRENT_HELPER_VERSION,
        latestVersion: latestVersion,
        hasUpdate: hasUpdate,
        name: 'HashStock Local Helper & Bridge',
        uptime: Math.floor(process.uptime()),
        platform: process.platform
    });
});
`;

  const oldVersionRegex = /const HELPER_VERSION =[\s\S]*?res\.json\(\{[\s\S]*?\}\);\s*\}\);/;
  if (oldVersionRegex.test(code)) {
    code = code.replace(oldVersionRegex, newVersionEndpoint);
  } else if (!code.includes("CURRENT_HELPER_VERSION")) {
    code = code.replace("app.listen(PORT,", newVersionEndpoint + "\napp.listen(PORT,");
  }

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Updated version endpoint in ${filePath}`);
}

updateHelperVersionCheck('local-helper.js');
updateHelperVersionCheck('desktop/local-helper.js');

// --- 2. UPDATE APP.JSX (AUTO BANNER & GLOBAL SERVERS MODAL) ---
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Fix 2.1: Add state for serverUpdateBanner
if (!appCode.includes('serverUpdateAvailable')) {
  const newLocalCheckState = `
  const [serverUpdateAvailable, setServerUpdateAvailable] = useState(null); // { version, latestVersion }
  const [serverUpdateDismissed, setServerUpdateDismissed] = useState(false);

  // Local helper server ping & version check
  useEffect(() => {
     const checkLocal = async () => {
        try {
            const res = await fetch("http://localhost:3001/api/version");
            if (res.ok) {
                setLocalConnected(true);
                const verInfo = await res.json();
                if (verInfo.hasUpdate || verInfo.version !== verInfo.latestVersion) {
                    setServerUpdateAvailable(verInfo);
                } else {
                    setServerUpdateAvailable(null);
                }
            } else {
                setLocalConnected(false);
            }
        } catch(e) {
            setLocalConnected(false);
        }
     };
     checkLocal();
     let interval = setInterval(checkLocal, 8000);
     return () => clearInterval(interval);
  }, []);
`;
  appCode = appCode.replace(/  \/\/ Local helper server ping check[\s\S]*?return \(\) => clearInterval\(interval\);\s*\}, \[\]\);/, newLocalCheckState);
}

// Fix 2.2: Inject Top Banner Banner UI right below the navbar in App.jsx
if (!appCode.includes('server-update-banner-bar')) {
  const topBannerJSX = `
      {/* 🚀 BANNER DE ALERTA DE ATUALIZAÇÃO DO SERVIDOR LOCAL */}
      {localConnected && serverUpdateAvailable && !serverUpdateDismissed && (
         <div id="server-update-banner-bar" style={{background:'linear-gradient(90deg, #1e1b4b 0%, #312e81 100%)', borderBottom:'1px solid #6366f1', padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10, zIndex:9999}}>
             <div style={{display:'flex', alignItems:'center', gap:10, color:'#e0e7ff', fontSize:13, fontWeight:700}}>
                 <span style={{fontSize:18}}>🚀</span>
                 <span><b>Novo Update do Servidor Local Detectado!</b> Versão <b>v{serverUpdateAvailable.latestVersion || 'nova'}</b> está disponível para este aparelho.</span>
             </div>
             <div style={{display:'flex', gap:8}}>
                 <button 
                     onClick={async () => {
                         try {
                             alert("⏳ Atualizando o Servidor Local sem reinstalar... O serviço será reiniciado em instantes.");
                             const r = await fetch('http://localhost:3001/api/self-update', { method: 'POST' });
                             const res = await r.json();
                             alert(res.message || "✓ Servidor atualizado com sucesso!");
                             setServerUpdateDismissed(true);
                         } catch(e) {
                             alert("Falha ao atualizar servidor: " + e.message);
                         }
                     }}
                     style={{background:'#6366f1', color:'#fff', border:'none', padding:'6px 14px', borderRadius:6, fontWeight:800, fontSize:12, cursor:'pointer'}}
                 >
                     ⚡ Atualizar Servidor Agora
                 </button>
                 <button 
                     onClick={() => setServerUpdateDismissed(true)} 
                     style={{background:'transparent', color:'#a5b4fc', border:'1px solid #4338ca', padding:'6px 10px', borderRadius:6, fontSize:11, cursor:'pointer'}}
                 >
                     Dispensar
                 </button>
             </div>
         </div>
      )}
`;
  appCode = appCode.replace('<div style={{display:"flex",minHeight:"100vh"', topBannerJSX + '\n      <div style={{display:"flex",minHeight:"100vh"');
}

// Fix 2.3: Add "🖥️ Servidores Locais" button in DataCenterPage header
if (!appCode.includes('handleOpenServerManager')) {
  const serverManagerAction = `
    const handleOpenServerManager = () => {
        setModal(
            <Modal title="🖥️ Gerenciador Global de Servidores Locais" onClose={() => setModal(null)}>
                <div style={{padding:16, display:'flex', flexDirection:'column', gap:14}}>
                    <div style={{background:C.card2, padding:14, borderRadius:8, border:'1px solid '+C.border}}>
                        <div style={{fontWeight:800, fontSize:14, color:C.text, marginBottom:4}}>📡 Servidor Local Desta Fazenda (localhost:3001)</div>
                        <div style={{fontSize:12, color:C.subtle, display:'flex', gap:12, marginTop:6}}>
                            <span>Status: <b style={{color: localConnected ? C.green : C.red}}>{localConnected ? "🟢 ONLINE" : "🔴 OFFLINE"}</b></span>
                            <span>Versão: <b>v{serverUpdateAvailable?.version || "1.0.1"}</b></span>
                        </div>
                    </div>

                    <div style={{display:'flex', flexDirection:'column', gap:8}}>
                        <Btn 
                            disabled={!localConnected}
                            onClick={async () => {
                                try {
                                    alert("⏳ Baixando atualização do servidor local...");
                                    const r = await fetch('http://localhost:3001/api/self-update', { method: 'POST' });
                                    const res = await r.json();
                                    alert(res.message || "Servidor atualizado!");
                                } catch(e) {
                                    alert("Erro ao comunicar com servidor local: " + e.message);
                                }
                            }}
                            style={{background:C.blue, color:'#fff', justifyContent:'center'}}
                        >
                            🔄 Atualizar Servidor Local sem Reinstalar
                        </Btn>
                    </div>
                </div>
            </Modal>
        );
    };
`;
  appCode = appCode.replace("const handleManualRefresh = async () => {", serverManagerAction + "\n    const handleManualRefresh = async () => {");

  // Insert button in DataCenterPage header
  appCode = appCode.replace(
    `<button onClick={handleManualRefresh}`,
    `<button onClick={handleOpenServerManager} style={{background:C.purple, border:'none', color:'#fff', padding:'8px 16px', borderRadius:8, fontWeight:800, cursor:'pointer', marginRight:8}}>🖥️ Servidores Locais</button>\n                    <button onClick={handleManualRefresh}`
  );
}

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx upgraded with Global Server Updates & Connection Banner.");

console.log("ALL GLOBAL SERVER UPDATE FEATURES APPLIED!");
