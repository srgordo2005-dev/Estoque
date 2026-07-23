const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Fix Supabase sessions schema error by removing non-column fields autoEnabled and targetUptimeHours in fbSet
const oldFbSet = `async function fbSet(c,id,obj){
  incrementWrites();
  try {
    const table=tableName(c);
    const{_id,...cleanObj}=obj; // nunca manda o _id junto — o "id" já vai separado
    const row={id,...toDBRow(cleanObj)};`;

const newFbSet = `async function fbSet(c,id,obj){
  incrementWrites();
  try {
    const table=tableName(c);
    const{_id,...cleanObj}=obj; // nunca manda o _id junto — o "id" já vai separado
    if (c === "sessions") {
      delete cleanObj.autoEnabled;
      delete cleanObj.targetUptimeHours;
    }
    const row={id,...toDBRow(cleanObj)};`;

if (code.includes(oldFbSet)) {
  code = code.replace(oldFbSet, newFbSet);
  console.log("1. Fixed fbSet for sessions schema fields!");
} else {
  console.log("1. fbSet pattern not matched");
}

// 2. Fix Machine Model display in Fazenda (shelf cards and table rows)
// Replace machineModelName logic so m.model (real machine model from DB) takes precedence over raw controller strings
code = code.replaceAll(
  `const machineModelName = stat?.model || m.model || "Antminer S19j Pro";`,
  `const machineModelName = (m.model && m.model !== "Antminer S19j Pro") ? m.model : (stat?.model || m.model || "Whatsminer M30S");`
);
console.log("2. Updated machineModelName in Fazenda view!");

// 3. Add OnlineMinersModal component & button in BenchConnectionPanel
const onlineMinersModalComp = `
function OnlineMinersModal({ctx, session, setMacInput, loadMachine, saveSession, fetchAndApplyMinerInfo, onClose}){
  const {C, Btn, Inp, Modal, formatUptime} = ctx;
  const [subnet, setSubnet] = useState("192.168.1");
  const [isScanning, setIsScanning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [miners, setMiners] = useState([]);
  const [statusMsg, setStatusMsg] = useState("");

  const fetchMiners = useCallback(async (isManual = false) => {
    if (isManual) setIsScanning(true);
    try {
      // First check local farm-status cache
      const res = await fetch('http://localhost:3001/api/farm-status');
      if (res.ok) {
        const cache = await res.json();
        const list = Object.values(cache).filter(m => m.ip && m.status !== 'offline');
        setMiners(list);
      }
      
      // If manual scan requested, trigger range scan
      if (isManual) {
        setStatusMsg("Escaneando faixa " + subnet + ".1 - " + subnet + ".254...");
        const scanRes = await fetch('http://localhost:3001/api/scan-range', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ subnet })
        });
        if (scanRes.ok) {
          const scanData = await scanRes.json();
          if (scanData.miners) {
            setMiners(scanData.miners);
            setStatusMsg("✅ Encontradas " + scanData.miners.length + " máquinas online!");
          }
        }
      }
    } catch(e) {
      console.error("Erro ao buscar máquinas online:", e);
    }
    setIsScanning(false);
  }, [subnet]);

  useEffect(() => {
    fetchMiners();
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchMiners(false), 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchMiners]);

  const handleLinkToBench = async (miner) => {
    if (session && saveSession) {
      saveSession({ ...session, ip: miner.ip, updatedAt: stamp() });
    }
    if (miner.sn) {
      setMacInput(miner.sn);
      loadMachine(miner.sn);
    }
    await fetchAndApplyMinerInfo(miner.ip);
    alert("✅ Máquina " + miner.ip + " (" + (miner.model || "Minerador") + ") vinculada à bancada!");
    onClose();
  };

  return (
    <div style={{maxHeight: "75vh", overflowY: "auto", paddingRight: 4}}>
      <div style={{background: C.card2, borderRadius: 10, padding: 12, marginBottom: 14, border: "1px solid " + C.border}}>
        <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
          <div style={{flex: 1, minWidth: 180}}>
            <Inp 
              label="FAIXA DE IP / SUBNET" 
              value={subnet} 
              onChange={e => setSubnet(e.target.value.trim())} 
              placeholder="Ex: 192.168.1"
              style={{marginBottom: 0}}
            />
          </div>
          <button 
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              background: autoRefresh ? C.green + "22" : C.card,
              border: "1px solid " + (autoRefresh ? C.green : C.border),
              color: autoRefresh ? C.green : C.muted,
              borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", marginTop: 14
            }}
          >
            {autoRefresh ? "⚡ Auto-Recarregar: ON (4s)" : "⏸️ Auto-Recarregar: OFF"}
          </button>

          <Btn v="b" onClick={() => fetchMiners(true)} disabled={isScanning} style={{marginTop: 14}}>
            🔄 {isScanning ? "Escaneando..." : "Escanear Faixa Manual"}
          </Btn>
        </div>
        {statusMsg && <div style={{fontSize: 11, color: C.accent, marginTop: 8, fontWeight: 700}}>{statusMsg}</div>}
      </div>

      <div style={{fontSize: 12, fontWeight: 800, color: C.subtle, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <span>🌐 MÁQUINAS DETECTADAS NA REDE ({miners.length})</span>
        <span style={{fontSize: 10, color: C.muted}}>Clique em "Vincular à Bancada" para puxar IP e dados</span>
      </div>

      {miners.length === 0 ? (
        <div style={{padding: 24, textAlign: 'center', color: C.muted, background: C.card2, borderRadius: 10}}>
          {isScanning ? "🔍 Escaneando a rede por máquinas de mineração..." : "Nenhuma máquina respondendo nesta faixa. Verifique o IP ou clique em Escanear Faixa Manual."}
        </div>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
          {miners.map(m => {
            const isMining = m.status === 'mining';
            const boardCount = m.slots ? m.slots.filter(Boolean).length : 0;
            return (
              <Card key={m.ip} accent={isMining ? C.green : C.amber} style={{marginBottom: 0}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10}}>
                  <div>
                    <div style={{fontWeight: 900, fontSize: 14, color: C.text, display: 'flex', alignItems: 'center', gap: 8}}>
                      <span>🌐 {m.ip}</span>
                      <span style={{background: isMining ? C.green + "22" : C.amber + "22", border: "1px solid " + (isMining ? C.green : C.amber), color: isMining ? C.green : C.amber, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 800}}>
                        {isMining ? "🟢 MINANDO" : "🟡 OCIOSO / ERRO"}
                      </span>
                    </div>

                    <div style={{fontSize: 12, fontWeight: 700, color: C.accent, marginTop: 4}}>
                      💻 Modelo: {m.model || "Minerador Desconhecido"} {m.hashrate ? "· " + m.hashrate.toFixed(1) + " TH/s" : ""} {m.temp ? "· " + m.temp + "°C" : ""}
                    </div>

                    <div style={{fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                      <span>⏱️ Uptime: {formatUptime(m.uptime || 0)}</span>
                      <span>📦 SN Físico: {m.sn || "Não reportado"}</span>
                      {boardCount > 0 && <span>⚡ {boardCount} HASH SNs no log</span>}
                    </div>

                    {m.slots && m.slots.some(Boolean) && (
                      <div style={{fontSize: 10, color: C.subtle, marginTop: 4}}>
                        📋 Slots: {m.slots.map((s, idx) => s ? "Slot " + (idx+1) + ": " + s : null).filter(Boolean).join(" | ")}
                      </div>
                    )}
                  </div>

                  <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                    <button
                      onClick={() => window.open("http://" + m.ip, "_blank")}
                      style={{background: C.card2, color: C.subtle, border: "1px solid " + C.border, borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer"}}
                      title="Abrir Dashboard da Máquina no Navegador"
                    >
                      🌐 Abrir Dashboard
                    </button>
                    <Btn v="g" onClick={() => handleLinkToBench(m)} style={{padding: "8px 14px", fontSize: 11, fontWeight: 900}}>
                      ⚡ Vincular à Bancada
                    </Btn>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
`;

// Insert OnlineMinersModal component before BenchConnectionPanel
const benchPanelToken = `function BenchConnectionPanel({ctx, session, setMacInput, loadMachine, saveSession, doSubmit}) {`;
if (code.includes(benchPanelToken)) {
  code = code.replace(benchPanelToken, onlineMinersModalComp + "\n\n" + benchPanelToken);
  console.log("3. OnlineMinersModal component added!");
} else {
  console.log("3. BenchConnectionPanel token not matched!");
}

// Add "🌐 Ver Máquinas Online na Rede" button in BenchConnectionPanel bar
const oldBenchButtons = `<Btn v="b" onClick={startManualCapture}>📡 Capturar IP Report</Btn>`;
const newBenchButtons = `<Btn v="p" onClick={() => ctx.setModal(
                 <Modal title="🌐 Máquinas Online na Rede Local (Escaneamento)" onClose={() => ctx.setModal(null)}>
                   <OnlineMinersModal 
                     ctx={ctx} 
                     session={session} 
                     setMacInput={setMacInput} 
                     loadMachine={loadMachine} 
                     saveSession={saveSession} 
                     fetchAndApplyMinerInfo={fetchAndApplyMinerInfo} 
                     onClose={() => ctx.setModal(null)} 
                   />
                 </Modal>
               )}>
                  🌐 Ver Máquinas Online na Rede
               </Btn>

               <Btn v="b" onClick={startManualCapture}>📡 Capturar IP Report</Btn>`;

if (code.includes(oldBenchButtons)) {
  code = code.replace(oldBenchButtons, newBenchButtons);
  console.log("4. Ver Máquinas Online button added to BenchConnectionPanel!");
} else {
  console.log("4. oldBenchButtons token not matched!");
}

fs.writeFileSync('src/App.jsx', code);
console.log("Script execution complete!");
