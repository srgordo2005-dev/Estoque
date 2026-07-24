const fs = require('fs');

console.log("Applying complete visual, model cleaning, and cache protection fixes...");

// --- 1. UPDATE APP.JSX ---
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Add cleanModelName helper at the top of App.jsx or helper section
if (!appCode.includes('function cleanModelName')) {
  const cleanModelHelper = `
function cleanModelName(val, fallbackModel = "Antminer S19") {
    if (!val) return fallbackModel;
    let str = String(val).trim();
    if (/^cgminer/i.test(str) || /^bmminer/i.test(str)) {
        return fallbackModel && !/^cgminer/i.test(fallbackModel) ? fallbackModel : "Antminer S19";
    }
    str = str.replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();
    if (!str || /^cgminer$/i.test(str)) return fallbackModel && !/^cgminer/i.test(fallbackModel) ? fallbackModel : "Antminer S19";
    return str;
}
`;
  appCode = cleanModelHelper + appCode;
}

// Replace all occurrences of model formatting in Table view and modals with cleanModelName
appCode = appCode.replace(
  /const machineModelName = stat\?\.model \|\| m\.model \|\| "Antminer S19";/g,
  `const machineModelName = cleanModelName(stat?.model, cleanModelName(m.model, "Antminer S19"));`
);

appCode = appCode.replace(
  /<td style=\{\{padding:8, fontWeight:800, color:C\.accent\}\}>\{stat\?\.model \|\| m\.model \|\| "Antminer S19"\}<\/td>/g,
  `<td style={{padding:8, fontWeight:800, color:C.accent}}>{cleanModelName(stat?.model, cleanModelName(m.model, "Antminer S19"))}</td>`
);

// Fix shelfLabel formatting so it doesn't corrupt strings into "ao - Prateleira"
appCode = appCode.replace(
  /const shelfLabel = m\.shelf \? m\.shelf\.replace\(\/AutoSlot\/gi, "Prateleira"\) : "Prateleira";/g,
  `const shelfLabel = m.shelf || "Prateleira 1";`
);

// Fix top warning banner to include a 1-click "Recalcular e Limpar" button
const oldWarningBannerRegex = /\{dataWarnings\.length>0&&\(<div style=\{\{background:C\.red\+"22",border:"1px solid "\+C\.red[\s\S]*?<\/div>\)\}/;
const newWarningBannerJSX = `{dataWarnings.length>0&&(
    <div style={{background:C.red+"22",border:"1px solid "+C.red,borderRadius:8,padding:"8px 16px",margin:12,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,color:C.red,fontSize:12,fontWeight:700}}>
       <div>
          <span>⚠️ {dataWarnings[0].msg}</span>
       </div>
       <div style={{display:'flex', gap:8}}>
          <button 
             onClick={() => {
                resetMaxCount("machines", data.machines?.length || 0, data.machines);
                resetMaxCount("hashes", data.hashes?.length || 0, data.hashes);
                resetMaxCount("farmMachines", data.farmMachines?.length || 0, data.farmMachines || []);
                setDataWarnings([]);
                alert("✓ Avisos de integridade zerados! Os dados na tela viraram a nova referência.");
             }}
             style={{background:C.red, color:'#fff', border:'none', padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:800, cursor:'pointer'}}
          >
             ⚡ Recalcular & Limpar Aviso
          </button>
          <button 
             onClick={() => setDataWarnings([])}
             style={{background:'transparent', color:C.red, border:'1px solid '+C.red, padding:'4px 8px', borderRadius:6, fontSize:11, cursor:'pointer'}}
          >
             ✕ Fechar
          </button>
       </div>
    </div>
)}`;

if (oldWarningBannerRegex.test(appCode)) {
  appCode = appCode.replace(oldWarningBannerRegex, newWarningBannerJSX);
}

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ Updated model sanitizer, shelf labels, and warning banner in src/App.jsx");

// --- 2. UPDATE LOCAL-HELPER.JS & DESKTOP/LOCAL-HELPER.JS (Sanitize Cache) ---
function sanitizeHelperCache(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Inject cache sanitizer in updateFarmStatus
  const oldCacheSave = `try {\n            fs.writeFileSync(cacheFile, JSON.stringify(minerStatusCache, null, 2), 'utf8');\n        } catch(e) {}`;
  const newCacheSave = `try {
            // Sanitize cgminer model strings from cache
            for (const ipKey in minerStatusCache) {
                if (minerStatusCache[ipKey] && minerStatusCache[ipKey].model) {
                    let mStr = String(minerStatusCache[ipKey].model);
                    if (mStr.toLowerCase().includes('cgminer') || mStr.toLowerCase().includes('bmminer')) {
                        minerStatusCache[ipKey].model = 'Antminer S19';
                    }
                }
            }
            fs.writeFileSync(cacheFile, JSON.stringify(minerStatusCache, null, 2), 'utf8');
        } catch(e) {}`;

  if (code.includes(oldCacheSave)) {
    code = code.replace(oldCacheSave, newCacheSave);
  }

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Added cache sanitizer in ${filePath}`);
}

sanitizeHelperCache('local-helper.js');
sanitizeHelperCache('desktop/local-helper.js');

console.log("ALL VISUAL AND CACHE FIXES COMPLETED!");
