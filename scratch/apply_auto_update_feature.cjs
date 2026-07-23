const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add ServerSelfUpdateModal definition
const modalDef = `
function ServerSelfUpdateModal({ctx, updateInfo, onClose}) {
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleUpdate = async () => {
    setUpdating(true);
    setStatus("⬇️ Baixando nova versão do código e atualizando arquivos locais...");
    try {
      const res = await fetch("http://localhost:3001/api/self-update", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStatus("⚡ Arquivos atualizados! Reiniciando o serviço local...");
        setTimeout(() => {
          setStatus("✅ Servidor local atualizado com sucesso para v" + data.newVersion + "!");
          setTimeout(() => {
            onClose();
          }, 2000);
        }, 2000);
      } else {
        setError(data.error || "Erro ao aplicar atualização.");
        setUpdating(false);
      }
    } catch(e) {
      setError("Erro ao se comunicar com o servidor local: " + e.message);
      setUpdating(false);
    }
  };

  return (
    <div style={{display:'flex', flexDirection:'column', gap:14}}>
       <div style={{fontWeight:900, fontSize:14, color:C.accent}}>
          🚀 Nova Versão do Servidor / App Local Disponível!
       </div>
       <div style={{background:C.card2, borderRadius:10, padding:12, border:"1px solid " + C.border, fontSize:12}}>
          <div>📌 Versão em execução no servidor local: <b>v{updateInfo.localVersion}</b></div>
          <div>✨ Nova versão disponível no servidor remoto: <b style={{color:C.green}}>v{updateInfo.remoteVersion}</b></div>
          <div style={{fontSize:11, color:C.subtle, marginTop:8}}>
             💡 O app/servidor local pode se auto-atualizar agora mesmo sem precisar rodar nenhum instalador .exe!
          </div>
       </div>

       {status && <div style={{background:C.green + "15", border:"1px solid " + C.green + "44", color:C.green, borderRadius:8, padding:10, fontSize:12, fontWeight:700}}>{status}</div>}
       {error && <Alrt type="err">{error}</Alrt>}

       <div style={{display:'flex', gap:10, marginTop:6}}>
          <Btn v="s" onClick={onClose} disabled={updating} style={{flex:1}}>Lembrar Mais Tarde</Btn>
          <Btn v="g" onClick={handleUpdate} disabled={updating} style={{flex:1.5}}>
             {updating ? "⚡ Atualizando..." : "⚡ Atualizar Agora (Sem Instalador)"}
          </Btn>
       </div>
    </div>
  );
}
`;

// Insert modal component before export / default
code = modalDef + "\n" + code;

// 2. Add localVersionInfo and serverUpdateAvailable state and effect in App component
const oldCheckLocal = `  // Local helper server ping check
  useEffect(() => {
     const checkLocal = () => {
        fetch("http://localhost:3001/api/ping")
          .then(res => setLocalConnected(res.ok))
          .catch(() => setLocalConnected(false));
     };
     checkLocal();
     let interval = setInterval(checkLocal, 5000);
     return () => clearInterval(interval);
  }, []);`;

const newCheckLocal = `  // Local helper server ping & auto-update check
  const [localVersionInfo, setLocalVersionInfo] = useState(null);
  const [serverUpdateAvailable, setServerUpdateAvailable] = useState(null);

  useEffect(() => {
     const checkLocal = async () => {
        try {
           const res = await fetch("http://localhost:3001/api/version");
           if (res.ok) {
              const info = await res.json();
              setLocalConnected(true);
              setLocalVersionInfo(info);

              // Check remote version from GitHub
              fetch("https://raw.githubusercontent.com/srgordo2005-dev/Estoque/main/desktop/package.json")
                 .then(r => r.json())
                 .then(remotePkg => {
                    if (remotePkg && remotePkg.version && info.version && remotePkg.version !== info.version) {
                       setServerUpdateAvailable({ localVersion: info.version, remoteVersion: remotePkg.version });
                    }
                 })
                 .catch(() => null);
           } else {
              setLocalConnected(false);
           }
        } catch(e) {
           setLocalConnected(false);
        }
     };
     checkLocal();
     let interval = setInterval(checkLocal, 8000);
     return () => clearInterval(interval);
  }, []);`;

code = code.replace(oldCheckLocal, newCheckLocal);

// 3. Render update badge button in top bar header
const oldHeaderIndicator = `           {/* Luz 2: Servidor Local Helper */}
           <div 
             title={localConnected ? "Servidor Local (Helper): Conectado (Online)" : "Servidor Local (Helper): DESCONECTADO (Offline)"} 
             style={{
               width:8,
               height:8,
               borderRadius:'50%',
               background: localConnected ? C.green : C.red, 
               boxShadow: \`0 0 8px \${localConnected ? C.green : C.red}\`, 
               transition:'background 0.5s',
               animation: localConnected ? 'none' : 'blink-glow 1.5s infinite alternate'
             }}
           />`;

const newHeaderIndicator = `           {/* Luz 2: Servidor Local Helper */}
           <div 
             title={localConnected ? "Servidor Local (Helper): Conectado (Online)" : "Servidor Local (Helper): DESCONECTADO (Offline)"} 
             style={{
               width:8,
               height:8,
               borderRadius:'50%',
               background: localConnected ? C.green : C.red, 
               boxShadow: \`0 0 8px \${localConnected ? C.green : C.red}\`, 
               transition:'background 0.5s',
               animation: localConnected ? 'none' : 'blink-glow 1.5s infinite alternate'
             }}
           />
           {serverUpdateAvailable && (
             <button
               onClick={() => setModal(
                 <Modal title="🚀 Nova Atualização do Servidor Local" onClose={() => setModal(null)}>
                    <ServerSelfUpdateModal ctx={ctx} updateInfo={serverUpdateAvailable} onClose={() => { setModal(null); setServerUpdateAvailable(null); }} />
                 </Modal>
               )}
               style={{ background: C.green + "22", border: "1px solid " + C.green, color: C.green, borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 900, cursor: "pointer", display: 'flex', alignItems: 'center', gap: 4 }}
             >
                🚀 Atualizar Servidor (v{serverUpdateAvailable.remoteVersion})
             </button>
           )}`;

code = code.replace(oldHeaderIndicator, newHeaderIndicator);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("AUTO UPDATE FEATURE ADDED TO APP.JSX!");
