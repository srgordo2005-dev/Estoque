const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Declare toast state & handler in TestePage
const oldTestePageSignature = `function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH,gChips,setModal}=ctx;const models=allModels();`;

const newTestePageSignature = `function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH,gChips,setModal}=ctx;const models=allModels();
  const [toastMsg, setToastMsg] = useState("");
  const triggerToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  }, []);`;

if (code.includes(oldTestePageSignature)) {
  code = code.replace(oldTestePageSignature, newTestePageSignature);
  console.log("1. Added toastMsg & triggerToast declaration to TestePage!");
} else {
  console.log("1. oldTestePageSignature not matched");
}

// Render toast notification at top of TestePage return
const oldTesteReturn = `return<div>\n    {availItems.length>0&&<>`;
const newTesteReturn = `return<div>\n    {toastMsg && <div style={{position:'fixed', top:20, right:20, zIndex:9999, background:C.green, color:'#fff', padding:'10px 18px', borderRadius:10, fontWeight:800, boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}}>{toastMsg}</div>}\n    {availItems.length>0&&<>`;

if (code.includes(oldTesteReturn)) {
  code = code.replace(oldTesteReturn, newTesteReturn);
  console.log("2. Rendered toast notification in TestePage!");
}

// 2. Make Prateleiras display side-by-side (uma do lado da outra) like HashCore
code = code.replace(
  `{/* LISTA VERTICAL DE TODAS AS FAZENDAS */}`,
  `{/* FAZENDAS COM PRATELEIRAS SIDE-BY-SIDE (LADO A LADO COMO HASHCORE) */}`
);

// Update shelf outer grid in DataCenterPage
code = code.replace(
  `<div key={farmName} style={{background:C.card, borderRadius:14, border:"1px solid " + C.border, padding:16, marginBottom:24}}>`,
  `<div key={farmName} style={{background:C.card, borderRadius:14, border:"1px solid " + C.border, padding:16, marginBottom:24}}>\n                        <style>{\`.shelves-side-by-side-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; align-items: start; }\`}</style>`
);

code = code.replace(
  `Object.keys(shelfGroups).map(shelfName => {`,
  `<div className="shelves-side-by-side-grid">\n                              {Object.keys(shelfGroups).map(shelfName => {`
);

code = code.replace(
  `}) \n                           )`,
  `})}\n                              </div>\n                           )`
);

// 3. Ensure Auto-Update section is also visible in Config Page for manual check
const oldCfgFooter = `<div style={{marginTop:20, fontSize:11, color:C.subtle, textAlign:'center'}}>HashStock Systems · 2026</div>`;
const newCfgFooter = `
    <div style={{background: C.card2, borderRadius: 12, padding: 16, marginTop: 20, border: "1px solid " + C.border}}>
      <div style={{fontWeight: 800, fontSize: 13, color: C.accent, marginBottom: 6}}>🚀 ATUALIZAÇÃO DO SERVIDOR LOCAL</div>
      <div style={{fontSize: 12, color: C.muted, marginBottom: 12}}>
        Você pode verificar a versão do servidor local e atualizar direto pela web sem precisar de instalador .exe.
      </div>
      <button 
        onClick={async () => {
          try {
            const res = await fetch("http://localhost:3001/api/version");
            if (res.ok) {
              const info = await res.json();
              const remoteRes = await fetch("https://raw.githubusercontent.com/srgordo2005-dev/Estoque/main/desktop/package.json?t=" + Date.now());
              const remotePkg = await remoteRes.json();
              setModal(
                <Modal title="🚀 Gerenciador de Atualizações do Servidor" onClose={() => setModal(null)}>
                  <ServerSelfUpdateModal ctx={ctx} updateInfo={{ localVersion: info.version, remoteVersion: remotePkg.version }} onClose={() => setModal(null)} />
                </Modal>
              );
            } else {
              alert("Servidor local não encontrado ou offline. Verifique se o helper está rodando.");
            }
          } catch(e) {
            alert("Erro ao verificar versão: " + e.message);
          }
        }} 
        style={{background: C.accent, color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer'}}
      >
        🚀 Verificar / Atualizar Servidor Local Agora
      </button>
    </div>
    <div style={{marginTop:20, fontSize:11, color:C.subtle, textAlign:'center'}}>HashStock Systems · 2026</div>`;

if (code.includes(oldCfgFooter)) {
  code = code.replace(oldCfgFooter, newCfgFooter);
  console.log("3. Added Server Update section to Config Page!");
}

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("APPLIED ALL FINAL SHELF, TOAST, AND AUTO-UPDATE FIXES TO APP.JSX!");
