const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const target = `               {!listening ? (
                  <Btn v="p" onClick={() => ctx.setModal(
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

                <Btn v="b" onClick={startManualCapture}>📡 Capturar IP Report</Btn>
               ) : (`;

const replacement = `               <Btn v="p" onClick={() => ctx.setModal(
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

               {!listening ? (
                  <Btn v="b" onClick={startManualCapture}>📡 Capturar IP Report</Btn>
               ) : (`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/App.jsx', code);
  console.log("Replaced successfully!");
} else {
  console.log("Target not found");
}
