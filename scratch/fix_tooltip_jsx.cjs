const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const startIdx = lines.findIndex((l, i) => i > 3350 && l.includes('/* Tooltip Card */'));
console.log('Tooltip card idx:', startIdx);

if (startIdx !== -1) {
  const tooltipReplacement = [
    `                                                               {/* Tooltip Card */}`,
    `                                                               <div className="shelf-slot-tooltip">`,
    `                                                                   <div style={{fontWeight:900, color:C.accent, fontSize:12, marginBottom:4, display:'flex', justifyContent:'space-between'}}>`,
    `                                                                       <span>Slot #{m.notes} · {machineModelName}</span>`,
    `                                                                       <span style={{color: isOnline ? C.green : C.red}}>{isOnline ? (isMining ? 'MINANDO' : 'OCIOSO') : 'OFFLINE'}</span>`,
    `                                                                   </div>`,
    `                                                                   <div style={{height:1, background:C.border, margin:'4px 0'}} />`,
    `                                                                   <div>🌐 IP: {m.ip || 'Sem IP (Clique para configurar)'}</div>`,
    `                                                                   <div>💻 Modelo: {machineModelName}</div>`,
    `                                                                   <div>📦 SN Carcaça: {isDummy ? '(Vazio)' : m.sn}</div>`,
    `                                                                   {isOnline && (`,
    `                                                                       <>`,
    `                                                                           <div>📦 SN Físico: {stat.sn || '--'}</div>`,
    `                                                                           <div>⏱️ Uptime: {formatUptime(stat.uptime)}</div>`,
    `                                                                           <div>⛏️ Hashrate: {stat.hashrate ? stat.hashrate.toFixed(1) + ' TH/s' : '--'}</div>`,
    `                                                                           <div>🌡️ Temp: {stat.temp ? stat.temp + '°C' : '--'}</div>`,
    `                                                                       </>`,
    `                                                                   )}`,
    `                                                                   <div style={{fontSize:9, color:C.subtle, marginTop:4}}>(Clique para gerenciar IP e SN)</div>`,
    `                                                               </div>`
  ];

  lines.splice(startIdx, 16, ...tooltipReplacement);
  fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
  console.log('FIXED TOOLTIP JSX EXPRESSIONS');
}
