const fs = require('fs');

const appFile = 'src/App.jsx';
let code = fs.readFileSync(appFile, 'utf8');

// 1. Remove pendingApprovals polling (lines 1838-1845)
code = code.replace(
  /\/\/ Polling automático de segurança para a aba de Revisões.*?useEffect\(\(\) => \{\s*if \(\!user \|\| \(user\.role \!\=\= "admin" \&\& user\.code \!\=\= "019"\)\) return;\s*const interval \= setInterval\(\(\) => \{\s*loadAll\(\["pendingApprovals"\]\);\s*\}, 10000\);\s*return \(\) => clearInterval\(interval\);\s*\}, \[user, loadAll\]\);/gs,
  '// Polling removido para economizar banda do Supabase (Realtime já faz esse papel).'
);

// 2. Add caching to fetchAllCollections
const fetchAllRegex = /const fetchAllCollections=async\(onlyKeys\)=>\{\s*const allCols=\["machines","hashes","repairs","tests","feedbacks","pendingApprovals","customModels","pallets","clients","shipments","loadPhotos","orders","farmMachines"\];\s*const cols=onlyKeys\?onlyKeys\.map\(k=>META_TO_COL\[k\]\)\.filter\(Boolean\):allCols;/;

const newFetchAll = `const fetchAllCollections=async(onlyKeys)=>{
    const allCols=["machines","hashes","repairs","tests","feedbacks","pendingApprovals","customModels","pallets","clients","shipments","loadPhotos","orders","farmMachines"];
    const cols=onlyKeys?onlyKeys.map(k=>META_TO_COL[k]).filter(Boolean):allCols;
    
    // CACHE SYSTEM TO SAVE SUPABASE QUOTA
    let colsToFetch = [...cols];
    if (!onlyKeys) {
      const lastFetch = Number(localStorage.getItem("hs_lastFullFetch") || "0");
      if (Date.now() - lastFetch < 4 * 60 * 60 * 1000) {
        colsToFetch = colsToFetch.filter(c => {
           let cacheKey = "hs_" + (c === "pendingApprovals" ? "approvals" : c);
           return !localStorage.getItem(cacheKey);
        });
      }
    }`;

code = code.replace(fetchAllRegex, newFetchAll);

// 3. Inject cache filling logic into fetchAllCollections

code = code.replace('const _res=await Promise.allSettled(cols.map((c,i)=>new Promise(res=>setTimeout(res,i*120)).then(()=>fbList(c))));', 
  'const _res=await Promise.allSettled(colsToFetch.map((c,i)=>new Promise(res=>setTimeout(res,i*120)).then(()=>fbList(c))));');

code = code.replace('cols.forEach((c,i)=>{if(_res[i].status==="fulfilled")out[c]=_res[i].value;else{out[c]=[];errs.push(`${c}: ${_res[i].reason?.message||"falha"}`)}});',
  `colsToFetch.forEach((c,i)=>{if(_res[i].status==="fulfilled")out[c]=_res[i].value;else{out[c]=[];errs.push(\`\${c}: \${_res[i].reason?.message||"falha"}\`)}});
    cols.forEach(c => { 
       if (!colsToFetch.includes(c)) {
          let cacheKey = "hs_" + (c === "pendingApprovals" ? "approvals" : c);
          out[c] = JSON.parse(localStorage.getItem(cacheKey) || "[]");
       }
    });
    if (colsToFetch.length > 0 && !onlyKeys) localStorage.setItem("hs_lastFullFetch", String(Date.now()));`);

fs.writeFileSync(appFile, code);
console.log('Patched fetchAllCollections and polling!');
