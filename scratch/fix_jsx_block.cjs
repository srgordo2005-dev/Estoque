const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const searchStr = `               {!listening ? (
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
               ) : (
                  <Btn v="s" onClick={()=>setListening(false)}>❌ Cancelar Escuta</Btn>
               )}`;

const replaceStr = `               <Btn v="p" onClick={() => ctx.setModal(
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
               ) : (
                  <Btn v="s" onClick={()=>setListening(false)}>❌ Cancelar Escuta</Btn>
               )}`;

if (code.includes(searchStr)) {
  code = code.replace(searchStr, replaceStr);
  fs.writeFileSync('src/App.jsx', code, 'utf8');
  console.log('REPLACED SUCCESS');
} else {
  console.log('SEARCH STR NOT FOUND');
}
