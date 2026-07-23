const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Fix destructuring error in OnlineMinersModal
code = code.replace(
  `function OnlineMinersModal({ctx, session, setMacInput, loadMachine, saveSession, fetchAndApplyMinerInfo, onClose}){\n  const {C, Btn, Inp, Modal, formatUptime} = ctx;`,
  `function OnlineMinersModal({ctx, session, setMacInput, loadMachine, saveSession, fetchAndApplyMinerInfo, onClose}){\n  const { data, mutate } = ctx || {};`
);
console.log("1. Fixed OnlineMinersModal destructuring!");

// 2. Enhance Rack Cabinet rendering to organize machines into Vãos (shelf rows) with clear slot numbers and IPs
const oldRackGridPattern = `                                        <div className="shelf-rack-grid">
                                            {list.map(m => {`;

const newRackGridPattern = `                                        {(() => {
                                           // Layout metadata from storage or default (6 slots per vao)
                                           const layoutMeta = (() => {
                                             try { return JSON.parse(localStorage.getItem("hs_layout_" + shelfName) || "{}"); } catch(e) { return {}; }
                                           })();
                                           const slotsPerVao = layoutMeta.machinesPerLevel || 6;
                                           const vaos = [];
                                           for (let i = 0; i < list.length; i += slotsPerVao) {
                                             vaos.push(list.slice(i, i + slotsPerVao));
                                           }

                                           return (
                                             <div style={{display:'flex', flexDirection:'column', gap:12}}>
                                               {vaos.map((vaoList, vaoIdx) => (
                                                 <div key={vaoIdx} style={{background:'#111827', borderRadius:8, padding:10, border:'1px solid #1f2937'}}>
                                                   <div style={{fontSize:11, fontWeight:800, color:C.subtle, marginBottom:8, display:'flex', justifyContent:'space-between'}}>
                                                     <span>📍 VÃO ${'${vaoIdx + 1}'} (${'${vaoList.length}'} slots)</span>
                                                     <span style={{color:C.muted}}>Slots #${'${vaoList[0]?.notes}'} - #${'${vaoList[vaoList.length-1]?.notes}'}</span>
                                                   </div>
                                                   <div className="shelf-rack-grid">
                                                     {vaoList.map(m => {
                                                       const stat = farmStatus[m.ip] || null;
                                                       const isDummy = m.sn && m.sn.startsWith("FARM-");
                                                       const isOnline = stat && stat.status !== 'offline';
                                                       const isMining = isOnline && stat.status === 'mining';
                                                       const machineModelName = (m.model && m.model !== "Antminer S19j Pro") ? m.model : (stat?.model || m.model || "Whatsminer M30S");
                                                       
                                                       let bg = '#17202e'; 
                                                       let textColor = '#94a3b8'; 
                                                       let borderStyle = '1px solid #334155';
                                                       let ledColor = '#475569';
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

                                                       const shortIP = m.ip ? m.ip.split('.').slice(2).join('.') : null;
                                                       let valToShow = "#" + m.notes;
                                                       if (viewMode === 'temp') {
                                                           valToShow = isOnline && stat.temp ? stat.temp + '°' : '--';
                                                       } else if (viewMode === 'hashrate') {
                                                           valToShow = isOnline && stat.hashrate ? stat.hashrate.toFixed(0) + 'T' : '--';
                                                       }

                                                       const snMismatch = isOnline && stat.sn && m.sn && !isDummy && stat.sn.trim().toUpperCase() !== m.sn.trim().toUpperCase();

                                                       return (
                                                           <div 
                                                              key={m._id} 
                                                              className="shelf-slot-box"
                                                              onDoubleClick={(e) => { e.stopPropagation(); if (m.ip) window.open('http://' + m.ip, '_blank'); }}
                                                              onClick={() => openSlotDetailsModal(m)}
                                                              style={{
                                                                  minWidth: 70,
                                                                  height: 52,
                                                                  padding: '4px 6px',
                                                                  fontSize: 11,
                                                                  background: bg,
                                                                  color: textColor,
                                                                  boxShadow: borderGlow,
                                                                  border: snMismatch ? "2px solid " + C.amber : borderStyle,
                                                                  display: 'flex',
                                                                  flexDirection: 'column',
                                                                  justifyContent: 'center',
                                                                  alignItems: 'center',
                                                                  borderRadius: 8,
                                                                  position: 'relative'
                                                              }}
                                                           >
                                                               <div style={{position:'absolute', top:3, right:4, width:6, height:6, borderRadius:'50%', background: ledColor}} />
                                                               <div style={{fontWeight: 900, fontSize: 11}}>{valToShow}</div>
                                                               <div style={{fontSize: 9, color: shortIP ? C.accent : C.muted, marginTop: 2, fontWeight: 700}}>
                                                                 {shortIP ? "🌐 " + shortIP : "Sem IP"}
                                                               </div>

                                                               {/* Tooltip Card */}
                                                               <div className="shelf-slot-tooltip">
                                                                   <div style={{fontWeight:900, color:C.accent, fontSize:12, marginBottom:4, display:'flex', justifyContent:'space-between'}}>
                                                                       <span>Slot #{m.notes} · {machineModelName}</span>
                                                                       <span style={{color: isOnline ? C.green : C.red}}>{isOnline ? (isMining ? 'MINANDO' : 'OCIOSO') : 'OFFLINE'}</span>
                                                                   </div>
                                                                   <div style={{height:1, background:C.border, margin:'4px 0'}} />
                                                                   <div>🌐 IP: {m.ip || 'Sem IP (Clique para configurar)'}</div>
                                                                   <div>💻 Modelo: {machineModelName}</div>
                                                                   <div>📦 SN Carcaça: {isDummy ? '(Vazio)' : m.sn}</div>
                                                                   {isOnline && (
                                                                       <>
                                                                           <div>📦 SN Físico: {stat.sn || '--'}</div>
                                                                           <div>⏱️ Uptime: {formatUptime(stat.uptime)}</div>
                                                                           <div>⛏️ Hashrate: {stat.hashrate ? stat.hashrate.toFixed(1) + ' TH/s' : '--'}</div>
                                                                           <div>🌡️ Temp: {stat.temp ? stat.temp + '°C' : '--'}</div>
                                                                       </>
                                                                   )}
                                                                   <div style={{fontSize:9, color:C.subtle, marginTop:4}}>(Clique para gerenciar IP e SN)</div>
                                                               </div>
                                                           </div>
                                                       );
                                                     })}
                                                   </div>
                                                 </div>
                                               ))}
                                             </div>
                                           );
                                        })()}`;

if (code.includes(oldRackGridPattern)) {
  code = code.replace(oldRackGridPattern, newRackGridPattern);
  console.log("2. Enhanced Rack Cabinet layout with Vãos and IP badges!");
} else {
  console.log("2. oldRackGridPattern not found in App.jsx");
}

fs.writeFileSync('src/App.jsx', code);
