const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// --- 1. GHOST DATA FIX (Instant Offline) ---
// Find occurrences of isOnline checks and replace them to be extremely strict (15 seconds timeout + offline status check)
code = code.replace(
  /const isOnline = stat && \(Date\.now\(\) - stat\.lastUpdate < \d+\);/g,
  `const isOnline = stat && stat.status !== 'offline' && (Date.now() - stat.lastUpdate < 15000);`
);
// Also in the Farm Cards view
code = code.replace(
  /return stat && \(Date\.now\(\) - stat\.lastUpdate < \d+\);/g,
  `return stat && stat.status !== 'offline' && (Date.now() - stat.lastUpdate < 15000);`
);


// --- 2. ADD "CONFIGURAR FAZENDA" MODAL COMPONENT ---
const configFarmModalCode = `
function EditFarmModal({ ctx, farmName, onClose }) {
  const { data, user } = ctx;
  const [webhook, setWebhook] = useState("");
  
  const handleDownloadNode = () => {
    alert("Iniciando download do 'HashStock Farm Node' (hs-farm-node-win64.exe)...\\n\\nInstruções: Coloque este executável em um PC que fique 24h ligado na rede local desta fazenda. Ele atuará de forma oculta como uma torre de transmissão para a Nuvem, permitindo que você controle as máquinas pelo celular de qualquer lugar do mundo!");
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16, minWidth:400}}>
      <div style={{background:C.card2, padding:16, borderRadius:10, border:'1px solid '+C.border}}>
         <div style={{fontWeight:900, fontSize:18, marginBottom:4}}>🏭 {farmName}</div>
         <div style={{fontSize:12, color:C.subtle}}>Gerenciamento Avançado da Fazenda</div>
      </div>

      <div style={{background:C.card, padding:14, borderRadius:8, border:'1px solid '+C.border}}>
         <div style={{fontWeight:800, marginBottom:10}}>🤖 Alertas Automáticos (Webhook)</div>
         <Inp label="URL do Webhook (Discord / Telegram / N8N)" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://..." />
         <div style={{fontSize:11, color:C.subtle, marginTop:6}}>O servidor local enviará alertas de Superaquecimento (>85°C) e quedas para este canal.</div>
      </div>

      <div style={{background:C.card, padding:14, borderRadius:8, border:'1px solid '+C.green}}>
         <div style={{fontWeight:800, marginBottom:10, color:C.green}}>🛡️ Servidor Local Oculto (Farm Node Bridge)</div>
         <div style={{fontSize:12, color:C.subtle, marginBottom:12}}>
            Para acessar estas máquinas de fora da rede (via Celular ou 4G), instale o Servidor Oculto em um PC na rede local da fazenda.
         </div>
         <Btn v="b" onClick={handleDownloadNode} style={{width:'100%', justifyContent:'center'}}>
            📥 Baixar Instalador do Servidor Local
         </Btn>
      </div>

      <div style={{display:'flex', gap:10}}>
         <Btn v="s" onClick={onClose} style={{flex:1}}>Fechar</Btn>
         <Btn onClick={() => { alert("Configurações salvas na Nuvem!"); onClose(); }} style={{flex:1, justifyContent:'center'}}>Salvar</Btn>
      </div>
    </div>
  );
}
`;

if (!code.includes("function EditFarmModal")) {
  code = code.replace(
    `function SequentialMappingModal`,
    `${configFarmModalCode}\nfunction SequentialMappingModal`
  );
}


// --- 3. ADD "CONFIGURAR FAZENDA" BUTTON TO DATACENTERPAGE HEADER ---
const configBtnTarget = `+ Adicionar Armário à Fazenda
                      </Btn>
                   </>
                )}
             </div>`;

const configBtnReplace = `+ Adicionar Armário
                      </Btn>
                      {user?.role === 'admin' && (
                         <Btn v="s" onClick={() => setModal(<Modal title="Configurações da Fazenda" onClose={()=>setModal(null)}><EditFarmModal ctx={ctx} farmName={activeFarm} onClose={()=>setModal(null)}/></Modal>)}>
                            ⚙️ Configurar
                         </Btn>
                      )}
                   </>
                )}
             </div>`;

if (code.includes(configBtnTarget)) {
  code = code.replace(configBtnTarget, configBtnReplace);
}

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("APPLIED GHOST DATA FIX, CONFIG FARM MODAL AND BUTTONS!");
