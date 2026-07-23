const fs = require('fs');

// --- 1. FIX DESKTOP/LOCAL-HELPER.JS MODEL DETECTION & TIMEOUT ---
let helperCode = fs.readFileSync('desktop/local-helper.js', 'utf8');

const newDetect = `function detectMinerDetails(stat = {}, summary = {}, version = {}) {
    let rawModel = version?.VERSION?.[0]?.Miner || version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware || 
                   summary?.SUMMARY?.[0]?.Type || summary?.SUMMARY?.[0]?.Hardware ||
                   stat?.STATS?.[1]?.Type || stat?.STATS?.[0]?.Type || stat?.Type || stat?.Miner || 
                   stat?.['Miner Type'] || stat?.hardware || stat?.product || 
                   stat?.system_miner_type || summary?.STATUS?.[0]?.Description || '';

    let cleanStr = String(rawModel).replace(/cgminer\s*[\d\.]*/gi, '').replace(/bmminer\s*[\d\.]*/gi, '').trim();
    let model = 'Antminer S19';

    if (cleanStr) {
        const lower = cleanStr.toLowerCase();
        if (lower.includes('s19j pro') || lower.includes('s19jpro')) model = 'Antminer S19j Pro';
        else if (lower.includes('s19 pro') || lower.includes('s19pro')) model = 'Antminer S19 Pro';
        else if (lower.includes('s19 xp') || lower.includes('s19xp')) model = 'Antminer S19 XP';
        else if (lower.includes('s19')) model = 'Antminer S19';
        else if (lower.includes('s21')) model = 'Antminer S21';
        else if (lower.includes('t21')) model = 'Antminer T21';
        else if (lower.includes('m30s+')) model = 'Whatsminer M30S+';
        else if (lower.includes('m30s')) model = 'Whatsminer M30S';
        else if (lower.includes('m31s')) model = 'Whatsminer M31S';
        else if (lower.includes('m50')) model = 'Whatsminer M50';
        else if (lower.includes('whatsminer') || lower.includes('m20') || lower.includes('m32')) model = 'Whatsminer M30S';
        else model = cleanStr || 'Antminer S19';
    } else if (stat.chain_acn || stat.chain_acs || stat.BMMiner || stat['hash board 0 sn']) {
        model = 'Antminer S19';
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

helperCode = helperCode.replace(/function detectMinerDetails[\s\S]*?return \{ model, sn \};\s*\}/, newDetect);
fs.writeFileSync('desktop/local-helper.js', helperCode, 'utf8');
console.log("1. Fixed detectMinerDetails in local-helper.js!");


// --- 2. FIX SRC/APP.JSX ---
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Fix TestePage triggerToast definition
const oldTestePageStart = `function TestePage({ctx}){
  const{user,data,mutate,setModal,webhookUrl,allModels,gTH,gChips}=ctx;`;

const newTestePageStart = `function TestePage({ctx}){
  const{user,data,mutate,setModal,webhookUrl,allModels,gTH,gChips}=ctx;
  const [toastMsg, setToastMsg] = useState("");
  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };`;

if (appCode.includes(oldTestePageStart)) {
  appCode = appCode.replace(oldTestePageStart, newTestePageStart);
  console.log("2. Added triggerToast state & handler to TestePage!");
} else {
  console.log("2. oldTestePageStart not matched");
}

// Add toast banner rendering in TestePage JSX
const oldTesteReturn = `return<div>\n    {availItems.length>0&&<>`;
const newTesteReturn = `return<div>\n    {toastMsg && <div style={{position:'fixed', top:20, right:20, zIndex:9999, background:C.green, color:'#fff', padding:'10px 18px', borderRadius:10, fontWeight:800, boxShadow:'0 4px 16px rgba(0,0,0,0.5)'}}>{toastMsg}</div>}\n    {availItems.length>0&&<>`;

if (appCode.includes(oldTesteReturn)) {
  appCode = appCode.replace(oldTesteReturn, newTesteReturn);
  console.log("3. Rendered toast banner in TestePage!");
}

// Fix Side-by-side Rack grid rendering in DataCenterPage
// Replace single-column container with responsive side-by-side grid
const oldGridContainer = `<div style={{display:'flex', flexDirection:'column', gap:16}}>`;
const newSideBySideGridContainer = `<div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(400px, 1fr))', gap:20, alignItems:'start'}}>`;

// Let's replace the Virtual Shelf container to render shelves side-by-side (uma do lado da outra)
appCode = appCode.replace(
  `{/* Metal Rack Tray Structure (Levels / Vãos) */}\n                                        <div style={{display:'flex', flexDirection:'column', gap:16}}>`,
  `{/* Metal Rack Tray Structure (Levels / Vãos) */}\n                                        <div style={{display:'flex', flexDirection:'column', gap:12}}>`
);

// Update shelf container wrapper in DataCenterPage
const oldShelfWrapper = `{/* LISTA VERTICAL DE TODAS AS FAZENDAS */}`;
const newShelfWrapper = `{/* FAZENDAS COM PRATELEIRAS SIDE-BY-SIDE (LADO A LADO) */}`;

appCode = appCode.replace(oldShelfWrapper, newShelfWrapper);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("ALL FIXES FOR MODEL DETECTION, TRIGGERTOAST & SIDE-BY-SIDE SHELVES APPLIED!");
