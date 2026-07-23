const fs = require('fs');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// 1. ADD CSS ANIMATIONS FOR BLINKING WARNING SLOTS
const cssKeyframes = `@keyframes alertPulseRed { 0%, 100% { border-color: #ef4444; box-shadow: 0 0 16px rgba(239,68,68,0.9); } 50% { border-color: #7f1d1d; box-shadow: 0 0 4px rgba(239,68,68,0.2); } } @keyframes alertPulseYellow { 0%, 100% { border-color: #f59e0b; box-shadow: 0 0 16px rgba(245,158,11,0.9); } 50% { border-color: #78350f; box-shadow: 0 0 4px rgba(245,158,11,0.2); } } `;

appCode = appCode.replace(
  `const cssStyles = '.shelf-rack-cabinet`,
  `const cssStyles = '${cssKeyframes} .shelf-rack-cabinet`
);

// 2. ADD SEQUENTIAL MAPPING MODAL COMPONENT (BIPAGEM SN + IP REPORT AUTO-AVANÇO)
const sequentialMappingModalCode = `
function SequentialMappingModal({ ctx, shelfName, farmName, totalSlots, onClose }) {
  const { data, mutate, user } = ctx;
  const farmMachines = data.farmMachines || [];
  const [currentSlotNum, setCurrentSlotNum] = useState(1);
  const [snInput, setSnInput] = useState("");
  const [ipInput, setIpInput] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isListening, setIsListening] = useState(true);

  // Poll for IP report automatically
  useEffect(() => {
    if (!isListening) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/ipreport');
        if (res.ok) {
          const report = await res.json();
          if (report && report.ip && report.ip !== ipInput) {
            setIpInput(report.ip);
            setStatusMsg("⚡ IP " + report.ip + " capturado via IP Report!");
          }
        }
      } catch(e) {}
    }, 1500);
    return () => clearInterval(interval);
  }, [isListening, ipInput]);

  const handleSaveSlotAndAdvance = async () => {
    if (!snInput.trim() && !ipInput.trim()) {
      return alert("Bipe o SN da carcaça ou aguarde o IP Report antes de avançar.");
    }

    const cleanSN = snInput.trim().toUpperCase() || ("FARM-" + Date.now() + "-" + currentSlotNum);
    const cleanIP = ipInput.trim();

    // Check if slot already exists in DB
    const existing = farmMachines.find(m => m.shelf === shelfName && (m.location || "Fazenda Principal") === farmName && String(m.notes) === String(currentSlotNum));
    
    const newMachine = {
      _id: existing?._id || uid(),
      sn: cleanSN,
      model: "Antminer S19",
      shelf: shelfName,
      location: farmName,
      notes: String(currentSlotNum),
      ip: cleanIP,
      status: "ACTIVE",
      updatedAt: stamp()
    };

    mutate("farmMachines", prev => {
      const filtered = prev.filter(x => x._id !== newMachine._id);
      return [...filtered, newMachine];
    });

    const res = await fbSet("farmMachines", newMachine._id, newMachine);
    if (!res.ok) alert("Erro ao salvar slot no banco.");

    setStatusMsg("✅ Slot #" + currentSlotNum + " cadastrado com sucesso! Avançando para o Slot #" + (currentSlotNum + 1) + "...");
    
    // Clear inputs and advance to next slot automatically
    setSnInput("");
    setIpInput("");
    try { await fetch('http://localhost:3001/api/ipreport?clear=true'); } catch(e) {}
    
    if (currentSlotNum < totalSlots) {
      setCurrentSlotNum(prev => prev + 1);
    } else {
      alert("🎉 Todos os " + totalSlots + " slots desta prateleira foram cadastrados!");
      onClose();
    }
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:14}}>
      <div style={{background:C.accent + "15", border:"1px solid " + C.accent + "44", color:C.accent, padding:12, borderRadius:10, fontSize:12, fontWeight:800, textAlign:'center'}}>
        ⚡ MODO MAPPING RÁPIDO PARAFUNCIONÁRIO · {shelfName} ({farmName})
      </div>

      <div style={{background:C.card2, padding:14, borderRadius:10, border:"1px solid " + C.border, textAlign:'center'}}>
        <div style={{fontSize:11, color:C.subtle, fontWeight:800}}>CADASTRANDO AGORA:</div>
        <div style={{fontSize:24, fontWeight:900, color:C.text, margin:'4px 0'}}>SLOT #{currentSlotNum} <span style={{fontSize:14, color:C.muted}}>de {totalSlots}</span></div>
        <div style={{fontSize:11, color:C.muted}}>Bipe o SN da máquina e pressione o IP Report no minerador</div>
      </div>

      <div>
        <label style={{fontSize:11, color:C.subtle, fontWeight:800, display:'block', marginBottom:4}}>1. SN DA CARCAÇA (BIPE O CÓDIGO DE BARRAS)</label>
        <input 
          autoFocus 
          value={snInput} 
          onChange={e => setSnInput(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') handleSaveSlotAndAdvance(); }} 
          placeholder="Bipe o SN aqui..." 
          style={{...inp, width:'100%', fontSize:14, fontWeight:700}}
        />
      </div>

      <div>
        <label style={{fontSize:11, color:C.subtle, fontWeight:800, display:'block', marginBottom:4}}>2. IP DA MÁQUINA (CAPTURADO VIA IP REPORT OU MANUAL)</label>
        <input 
          value={ipInput} 
          onChange={e => setIpInput(e.target.value.trim())} 
          placeholder="Aguardando aperto do botão IP Report..." 
          style={{...inp, width:'100%', color: ipInput ? C.green : C.muted, fontWeight:700}}
        />
      </div>

      {statusMsg && <div style={{fontSize:12, color:C.accent, fontWeight:800, textAlign:'center'}}>{statusMsg}</div>}

      <div style={{display:'flex', gap:10, marginTop:10}}>
        <Btn v="s" onClick={onClose} style={{flex:1}}>Sair</Btn>
        <Btn onClick={handleSaveSlotAndAdvance} style={{flex:2, justifyContent:'center'}}>
          ⚡ Confirmar & Pular pro Slot #{currentSlotNum + 1} ➔
        </Btn>
      </div>
    </div>
  );
}
`;

// Insert SequentialMappingModal before DataCenterPage
appCode = appCode.replace(
  `function DataCenterPage({ctx}) {`,
  `${sequentialMappingModalCode}\nfunction DataCenterPage({ctx}) {`
);

// 3. UPDATE RACK CARD RENDERING TO INCLUDE BLINKING WARNINGS & DYNAMICS
const oldRackSlotReturn = `return (
                                                            <div 
                                                               key={m._id || slotIndex} 
                                                               onDoubleClick={(e) => { e.stopPropagation(); if (m.ip) window.open('http://' + m.ip, '_blank'); }}
                                                               onClick={() => openSlotDetailsModal(m)}
                                                               title={\`Slot #\${slotNumStr} · \${machineModelName} \${m.ip ? '· IP: ' + m.ip : '· (Vago)'}\`}
                                                               style={{
                                                                   height: 58,
                                                                   padding: '6px 8px',
                                                                   fontSize: 11,
                                                                   background: bg,
                                                                   color: textColor,
                                                                   boxShadow: borderGlow,
                                                                   border: borderStyle,
                                                                   display: 'flex',
                                                                   flexDirection: 'column',
                                                                   justifyContent: 'center',
                                                                   alignItems: 'center',
                                                                   borderRadius: 8,
                                                                   position: 'relative',
                                                                   cursor: 'pointer',
                                                                   transition: 'all 0.15s ease'
                                                               }}
                                                            >`;

const newRackSlotReturn = `
                                                        const isOverheating = isOnline && stat && stat.temp > 85;
                                                        const isIdleError = isOnline && stat && (stat.status === 'idle' || stat.status === 'error' || (stat.slots && stat.slots.includes(0)));

                                                        let warningAnimation = 'none';
                                                        if (isOverheating) {
                                                            warningAnimation = 'alertPulseRed 1s ease-in-out infinite';
                                                            borderStyle = '2px solid #ef4444';
                                                            bg = '#450a0a';
                                                            textColor = '#fca5a5';
                                                        } else if (isIdleError) {
                                                            warningAnimation = 'alertPulseYellow 1.5s ease-in-out infinite';
                                                            borderStyle = '2px solid #f59e0b';
                                                            bg = '#451a03';
                                                            textColor = '#fde68a';
                                                        }

                                                        return (
                                                            <div 
                                                               key={m._id || slotIndex} 
                                                               onDoubleClick={(e) => { e.stopPropagation(); if (m.ip) window.open('http://' + m.ip, '_blank'); }}
                                                               onClick={() => openSlotDetailsModal(m)}
                                                               title={\`Slot #\${slotNumStr} · \${machineModelName} \${m.ip ? '· IP: ' + m.ip : '· (Vago)'} \${stat?.pool ? '· Pool: ' + stat.pool : ''}\`}
                                                               style={{
                                                                   height: 58,
                                                                   padding: '6px 8px',
                                                                   fontSize: 11,
                                                                   background: bg,
                                                                   color: textColor,
                                                                   boxShadow: borderGlow,
                                                                   border: borderStyle,
                                                                   animation: warningAnimation,
                                                                   display: 'flex',
                                                                   flexDirection: 'column',
                                                                   justify: 'center',
                                                                   alignItems: 'center',
                                                                   borderRadius: 8,
                                                                   position: 'relative',
                                                                   cursor: 'pointer',
                                                                   transition: 'all 0.15s ease'
                                                               }}
                                                            >`;

appCode = appCode.replace(oldRackSlotReturn, newRackSlotReturn);

// 4. ADD FAST MAPPING BUTTON TO RACK HEADER
const oldRackHeaderBtns = `<button onClick={() => handleDeleteShelf(shelfName, farmName)} style={{background:'transparent', border:'none', color:C.red, fontSize:11, fontWeight:700, cursor:'pointer'}}>
                                                    🗑️ Apagar Prateleira
                                                </button>`;

const newRackHeaderBtns = `
                                                <button 
                                                  onClick={() => setModal(
                                                    <Modal title="⚡ Cadastramento Sequencial Rápido" onClose={() => setModal(null)}>
                                                      <SequentialMappingModal ctx={ctx} shelfName={shelfName} farmName={farmName} totalSlots={fullSlots.length} onClose={() => setModal(null)} />
                                                    </Modal>
                                                  )}
                                                  style={{background:C.accent + "22", border:"1px solid " + C.accent + "66", color:C.accent, padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:800, cursor:'pointer'}}
                                                >
                                                  ⚡ Cadastrar Bipando...
                                                </button>
                                                <button onClick={() => handleDeleteShelf(shelfName, farmName)} style={{background:'transparent', border:'none', color:C.red, fontSize:11, fontWeight:700, cursor:'pointer'}}>
                                                    🗑️ Apagar Prateleira
                                                </button>
`;

appCode = appCode.replace(oldRackHeaderBtns, newRackHeaderBtns);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("APPLIED BLINKING WARNINGS AND FAST SEQUENTIAL MAPPING TO APP.JSX!");
