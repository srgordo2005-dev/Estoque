const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

// Find line index for `{!listening ? (`
const idx = lines.findIndex(l => l.includes('{!listening ? ('));
console.log('Found line idx:', idx);

if (idx !== -1) {
  // Replace lines idx to idx+20 with fixed JSX
  const newLines = [
    `               <Btn v="p" onClick={() => ctx.setModal(`,
    `                 <Modal title="🌐 Máquinas Online na Rede Local (Escaneamento)" onClose={() => ctx.setModal(null)}>`,
    `                   <OnlineMinersModal `,
    `                     ctx={ctx} `,
    `                     session={session} `,
    `                     setMacInput={setMacInput} `,
    `                     loadMachine={loadMachine} `,
    `                     saveSession={saveSession} `,
    `                     fetchAndApplyMinerInfo={fetchAndApplyMinerInfo} `,
    `                     onClose={() => ctx.setModal(null)} `,
    `                   />`,
    `                 </Modal>`,
    `               )}>`,
    `                  🌐 Ver Máquinas Online na Rede`,
    `               </Btn>`,
    ``,
    `               {!listening ? (`,
    `                  <Btn v="b" onClick={startManualCapture}>📡 Capturar IP Report</Btn>`,
    `               ) : (`,
    `                  <Btn v="s" onClick={()=>setListening(false)}>❌ Cancelar Escuta</Btn>`,
    `               )}`
  ];

  lines.splice(idx, 21, ...newLines);
  fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
  console.log('REPLACED BY LINE INDEX SUCCESS');
}
