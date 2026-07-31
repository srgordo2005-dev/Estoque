const fs = require('fs');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');
let modalCode = fs.readFileSync('FarmConfigModal.jsx', 'utf8');

// Escape modal code for safe appending
modalCode = modalCode.split('\\\\`').join('\`');

// 1. Add Settings button to DataCenterPage
const headerSearch = `<div style={{fontWeight:900, fontSize:22, color:C.blue, display:'flex', alignItems:'center', gap:10}}>
                   <span style={{fontSize:28}}>🏢</span> Fazenda
                </div>`;

const replaceHeader = `<div style={{fontWeight:900, fontSize:22, color:C.blue, display:'flex', alignItems:'center', gap:10}}>
                   <span style={{fontSize:28}}>🏢</span> Fazenda
                   {user?.code === "019" && (
                       <button onClick={() => ctx.setModal({content: <FarmConfigModal ctx={ctx} onClose={() => ctx.setModal(null)} />, title: "Configuração", hideHeader: true})} style={{background: C.card2, border: \`1px solid \${C.border}\`, color: C.text, padding: '4px 8px', borderRadius: 6, fontSize: 14, cursor: 'pointer', marginLeft: 10}}>
                           ⚙️ Config
                       </button>
                   )}
                </div>`;

if (appCode.includes(headerSearch)) {
    appCode = appCode.replace(headerSearch, replaceHeader);
    
    // Append the modal function at the end
    appCode += "\n\n" + modalCode;
    
    fs.writeFileSync('src/App.jsx', appCode);
    console.log("FarmConfigModal injected!");
} else {
    console.log("Could not find DataCenterPage header to inject button!");
}
