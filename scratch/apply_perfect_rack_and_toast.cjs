const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. FIX BENCH CONNECTION PANEL TRIGGERTOAST PASSING
code = code.replace(
  `function BenchConnectionPanel({ctx, session, setMacInput, loadMachine, saveSession, doSubmit}) {`,
  `function BenchConnectionPanel({ctx, session, setMacInput, loadMachine, saveSession, doSubmit, triggerToast}) {`
);

code = code.replace(
  `<BenchConnectionPanel ctx={ctx} session={session} setMacInput={setMacInput} loadMachine={loadMachine} saveSession={saveSession} doSubmit={doSubmit} />`,
  `<BenchConnectionPanel ctx={ctx} session={session} setMacInput={setMacInput} loadMachine={loadMachine} saveSession={saveSession} doSubmit={doSubmit} triggerToast={triggerToast} />`
);

// 2. PERSIST ONLY ONLINE TOGGLE PER USER
code = code.replace(
  `const [onlyOnline, setOnlyOnline] = useState(() => localStorage.getItem("hs_only_online") === "true");`,
  `const [onlyOnline, setOnlyOnline] = useState(() => {\n        const key = user?._id ? "hs_only_online_" + user._id : "hs_only_online";\n        return localStorage.getItem(key) === "true";\n    });`
);

// 3. REBUILD VIRTUAL SHELF RACK CABINET DISPLAY IN DATACENTER PAGE
const oldShelfBlockStart = `Object.keys(shelfGroups).map(shelfName => {`;
const oldShelfBlockEnd = `return (\n                                   <div key={shelfName} className="shelf-rack-cabinet">`;

// Let's replace the entire Virtual Shelf rendering logic inside DataCenterPage
const newVirtualRackLogic = `                              Object.keys(shelfGroups).map(shelfName => {
                                 const list = shelfGroups[shelfName];
                                 const shelfTH = list.reduce((acc, m) => acc + (m.ip && farmStatus[m.ip]?.hashrate ? farmStatus[m.ip].hashrate : 0), 0);
                                 const shelfOnline = list.filter(m => m.ip && farmStatus[m.ip]?.status === 'mining').length;
                                 const cleanedShelfName = shelfName.replace(/^ao\\s*-\\s*/gi, "").replace(/^AutoSlot\\s*/gi, "Prateleira ").replace(/AutoSlot/gi, "Prateleira").trim();

                                 const layoutMeta = (() => {
                                   try { return JSON.parse(localStorage.getItem("hs_layout_" + shelfName) || "{}"); } catch(e) { return {}; }
                                 })();
                                 const slotsPerVao = layoutMeta.machinesPerLevel || 6;
                                 const vaosCount = layoutMeta.levelsCount || Math.max(1, Math.ceil(list.length / slotsPerVao));
                                 const totalSlotsNeeded = vaosCount * slotsPerVao;

                                 // Pad shelf slots so every level renders a complete metal tray row
                                 const fullSlots = [];
                                 for (let i = 1; i <= totalSlotsNeeded; i++) {
                                   const existing = list.find(m => String(m.notes) === String(i));
                                   if (existing) {
                                     fullSlots.push(existing);
                                   } else {
                                     fullSlots.push({
                                       _id: "dummy-" + shelfName + "-" + i,
                                       sn: "FARM-VAGO-" + i,
                                       model: "Antminer S19",
                                       shelf: shelfName,
                                       notes: String(i),
                                       location: farmName,
                                       status: "MAPPED"
                                     });
                                   }
                                 }

                                 const vaos = [];
                                 for (let i = 0; i < fullSlots.length; i += slotsPerVao) {
                                   vaos.push(fullSlots.slice(i, i + slotsPerVao));
                                 }

                                 // Bottom-up display (Vão 1 at bottom, Top Vão on top)
                                 const reversedVaos = vaos.map((vaoList, idx) => ({ vaoList, realVaoNum: idx + 1 })).reverse();

                                 return (
                                    <div key={shelfName} style={{
                                       background: '#090d16',
                                       border: '3px solid #334155',
                                       borderRadius: 14,
                                       padding: 16,
                                       marginBottom: 24,
                                       boxShadow: '0 10px 30px rgba(0,0,0,0.7), inset 0 0 40px rgba(0,0,0,0.9)',
                                       position: 'relative'
                                    }}>
                                        {/* Rack Metallic Beams Header */}
                                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'2px solid #334155', paddingBottom:12, marginBottom:16}}>
                                            <div style={{display:'flex', alignItems:'center', gap:10}}>
                                                <span style={{fontSize:18}}>🗄️</span>
                                                <div>
                                                   <div style={{fontWeight:900, fontSize:15, color:'#f8fafc'}}>{cleanedShelfName}</div>
                                                   <div style={{fontSize:11, color:'#94a3b8'}}>{shelfOnline} de {fullSlots.length} slots ocupados/online</div>
                                                </div>
                                            </div>
                                            <div style={{display:'flex', alignItems:'center', gap:12}}>
                                                <div style={{background:C.green + "15", border:"1px solid " + C.green + "44", color:C.green, padding:'4px 12px', borderRadius:8, fontSize:12, fontWeight:900}}>
                                                    ⛏️ {shelfTH.toFixed(1)} TH/s
                                                </div>
                                                <button onClick={() => handleDeleteShelf(shelfName, farmName)} style={{background:'transparent', border:'none', color:C.red, fontSize:11, fontWeight:700, cursor:'pointer'}}>
                                                    🗑️ Apagar Prateleira
                                                </button>
                                            </div>
                                        </div>

                                        {/* Metal Rack Tray Structure (Levels / Vãos) */}
                                        <div style={{display:'flex', flexDirection:'column', gap:16}}>
                                           {reversedVaos.map(({ vaoList, realVaoNum }) => {
                                              const startSlot = (realVaoNum - 1) * slotsPerVao + 1;
                                              const endSlot = realVaoNum * slotsPerVao;
                                              return (
                                                 <div key={realVaoNum} style={{
                                                    background: '#0f172a',
                                                    borderRadius: 10,
                                                    border: '1px solid #1e293b',
                                                    padding: 12,
                                                    borderBottom: '4px solid #475569',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
                                                 }}>
                                                    <div style={{fontSize:11, fontWeight:800, color:'#94a3b8', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                                      <span>📍 VÃO #{realVaoNum} ({realVaoNum === 1 ? "Base / Chão · Slot #1 à esquerda" : realVaoNum === vaos.length ? "Topo" : "Nível " + realVaoNum})</span>
                                                      <span style={{fontSize:10, color:'#64748b'}}>Slots #{startSlot} ao #{endSlot}</span>
                                                    </div>

                                                    {/* Machine Grid Resting on Metal Shelf Bar */}
                                                    <div style={{display:'grid', gridTemplateColumns:\`repeat(\${slotsPerVao}, 1fr)\`, gap:10}}>
                                                      {vaoList.map((m, slotIndex) => {
                                                        const stat = farmStatus[m.ip] || null;
                                                        const isDummy = m.sn && m.sn.startsWith("FARM-");
                                                        const isOnline = stat && stat.status !== 'offline';
                                                        const isMining = isOnline && stat.status === 'mining';
                                                        const slotNumStr = m.notes || (startSlot + slotIndex);
                                                        const machineModelName = stat?.model || m.model || "Antminer S19";

                                                        let bg = '#182232'; 
                                                        let textColor = '#64748b'; 
                                                        let borderStyle = '1px solid #1e293b';
                                                        let ledColor = '#334155';
                                                        let borderGlow = 'none';

                                                        if (m.ip) {
                                                            if (isMining) {
                                                                bg = '#064e3b';
                                                                textColor = '#6ee7b7';
                                                                borderStyle = '1px solid #10b981';
                                                                borderGlow = '0 0 12px rgba(16,185,129,0.4)';
                                                                ledColor = '#10b981';
                                                            } else if (isOnline) {
                                                                bg = '#451a03';
                                                                textColor = '#fde68a';
                                                                borderStyle = '1px solid #f59e0b';
                                                                borderGlow = '0 0 10px rgba(245,158,11,0.3)';
                                                                ledColor = '#f59e0b';
                                                            } else {
                                                                bg = '#1e1b2e';
                                                                textColor = '#cbd5e1';
                                                                borderStyle = '1px solid #475569';
                                                                ledColor = '#ef4444';
                                                            }
                                                        }

                                                        let valToShow = "Slot #" + slotNumStr;
                                                        if (viewMode === 'temp') {
                                                            valToShow = isOnline && stat.temp ? stat.temp + '°C' : '--';
                                                        } else if (viewMode === 'hashrate') {
                                                            valToShow = isOnline && stat.hashrate ? stat.hashrate.toFixed(0) + ' TH' : '--';
                                                        }

                                                        return (
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
                                                            >
                                                                <div style={{position:'absolute', top:4, right:4, width:6, height:6, borderRadius:'50%', background: ledColor}} />
                                                                <div style={{fontWeight: 900, fontSize: 11}}>{valToShow}</div>
                                                                <div style={{fontSize: 9, color: m.ip ? C.blue : '#475569', marginTop: 2, fontWeight: 700, overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%', whiteSpace:'nowrap'}}>
                                                                    {m.ip ? m.ip : "Vago"}
                                                                </div>
                                                            </div>
                                                        );
                                                      })}
                                                    </div>
                                                 </div>
                                              );
                                           })}
                                        </div>
                                    </div>
                                 );
                              })
                           )`;

code = code.replace(/Object\.keys\(shelfGroups\)\.map\(shelfName => {[\s\S]*?\}\)\n\s*\)/, newVirtualRackLogic);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("REBUILT PERFECT VIRTUAL RACK & TOAST HANDLERS!");
