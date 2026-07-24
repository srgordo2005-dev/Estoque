const fs = require('fs');

console.log("Starting full feature upgrade with exact string replacements...");

// Reset App.jsx from git first to be 100% clean
const { execSync } = require('child_process');
execSync('git checkout src/App.jsx');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// --- 1. UPDATE HELPER FILES ---
function upgradeHelperFileComplete(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  if (!code.includes("app.post('/api/self-update'")) {
    const selfUpdateEndpoint = `
app.get('/api/version', (req, res) => {
    res.json({
        version: '1.0.2',
        name: 'HashStock Local Helper & Bridge',
        uptime: Math.floor(process.uptime()),
        platform: process.platform
    });
});

app.post('/api/self-update', async (req, res) => {
    console.log('[Self-Update] Solicitação de atualização sem instalador recebida...');
    try {
        const helperRes = await fetch('https://raw.githubusercontent.com/srgordo2005-dev/Estoque/main/local-helper.js');
        if (!helperRes.ok) throw new Error('Falha ao baixar a nova versão do código.');
        const newCode = await helperRes.text();
        
        if (newCode && newCode.includes('app.listen')) {
            const helperPath = path.join(__dirname, 'local-helper.js');
            fs.writeFileSync(helperPath, newCode, 'utf8');
            console.log('[Self-Update] local-helper.js atualizado com sucesso!');
            res.json({ success: true, message: 'Servidor local atualizado com sucesso! Reiniciando serviço...' });
            setTimeout(() => { process.exit(0); }, 1000);
            return;
        } else {
            throw new Error('Código baixado inválido.');
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});
`;
    code = code.replace("app.listen(PORT,", selfUpdateEndpoint + "\napp.listen(PORT,");
  }

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Helper script updated in ${filePath}`);
}

upgradeHelperFileComplete('local-helper.js');
upgradeHelperFileComplete('desktop/local-helper.js');

// --- 2. UPDATE APP.JSX ---

// Fix 2.1: Clear dataWarnings state when recalcProtection is called
const oldRecalcStr = `  const recalcProtection=()=>{
    resetMaxCount("machines",data.machines.length);
    resetMaxCount("hashes",data.hashes.length);
    alert(\`✓ Recalculado! Máquinas: \${data.machines.length} · HASHs: \${data.hashes.length}\\nAgora esses números viram a nova referência — sem avisos falsos de "sumiço".\`);
  };`;

const newRecalcStr = `  const recalcProtection=()=>{
    resetMaxCount("machines", data.machines ? data.machines.length : 0, data.machines);
    resetMaxCount("hashes", data.hashes ? data.hashes.length : 0, data.hashes);
    resetMaxCount("farmMachines", data.farmMachines ? data.farmMachines.length : 0, data.farmMachines || []);
    setDataWarnings([]);
    alert(\`✓ Recalculado! Máquinas: \${data.machines?.length || 0} · HASHs: \${data.hashes?.length || 0} · Fazenda: \${data.farmMachines?.length || 0}\\nOs avisos de proteção foram zerados e a cópia salva foi atualizada.\`);
  };`;

appCode = appCode.replace(oldRecalcStr, newRecalcStr);

// Fix 2.2: Add "Log Completo & Diagnóstico" button & modal in App.jsx
if (!appCode.includes('handleFetchMinerLog')) {
  const logModalAction = `
    const handleFetchMinerLog = async (m) => {
        if (!m.ip) return alert("Esta posição não possui IP configurado.");
        setModal(
            <Modal title={"📋 Log & Diagnóstico - " + m.ip} onClose={() => setModal(null)}>
                <div style={{padding:16}}>
                    <div style={{marginBottom:10, fontSize:13, fontWeight:700, color:C.text}}>
                       🔍 Consultando logs de mineração em tempo real...
                    </div>
                    <iframe 
                        src={"http://localhost:3001/api/miner-log?ip=" + m.ip}
                        style={{width:'100%', height:300, background:'#090d16', color:'#10b981', border:'1px solid '+C.border, borderRadius:8, padding:10, fontFamily:'monospace', fontSize:11}}
                    />
                    <div style={{marginTop:12, textAlign:'right'}}>
                        <Btn onClick={() => window.open("http://" + m.ip, '_blank')}>🌐 Web UI</Btn>
                        <Btn v="b" onClick={() => setModal(null)} style={{marginLeft:8}}>Fechar</Btn>
                    </div>
                </div>
            </Modal>
        );
    };
`;
  appCode = appCode.replace("const triggerScreenshot = async (m) => {", logModalAction + "\n    const triggerScreenshot = async (m) => {");

  // Add button to machine modal JSX
  appCode = appCode.replace(
    `<Btn disabled={!m.ip} onClick={() => { setModal(null); triggerScreenshot(m); }}>📸 Tirar Print</Btn>`,
    `<Btn disabled={!m.ip} onClick={() => { setModal(null); triggerScreenshot(m); }}>📸 Tirar Print</Btn>
                        <Btn disabled={!m.ip} onClick={() => handleFetchMinerLog(m)} style={{background:C.purple, color:'#fff'}}>📋 Log & Erros</Btn>`
  );
}

// Fix 2.3: Add Self-Update Server button in EditFarmModal
const targetBtnStr = `<Btn v="b" onClick={handleDownloadNode} style={{width:'100%', justifyContent:'center'}}>
            📥 Baixar Instalador do Servidor Local
         </Btn>`;

const newBtnStr = `<Btn v="b" onClick={handleDownloadNode} style={{width:'100%', justifyContent:'center'}}>
            📥 Baixar Instalador do Servidor Local
         </Btn>
         <button 
             onClick={async () => {
                 try {
                     const r = await fetch('http://localhost:3001/api/self-update', { method: 'POST' });
                     const res = await r.json();
                     alert(res.message || res.error);
                 } catch(e) {
                     alert("Falha ao comunicar com o servidor local: " + e.message);
                 }
             }}
             style={{background:C.purple, color:'#fff', border:'none', padding:'8px 16px', borderRadius:6, fontWeight:800, cursor:'pointer', width:'100%', marginTop:8}}
         >
             🔄 Atualizar Código do Servidor Local sem Reinstalar
         </button>`;

appCode = appCode.replace(targetBtnStr, newBtnStr);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx upgraded successfully.");

console.log("ALL FEATURE UPGRADES APPLIED!");
