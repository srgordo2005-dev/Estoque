const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. In bootLoad, read the caches
const addCache = `
      const cachedR = JSON.parse(localStorage.getItem("hs_repairs")||"[]");
      const cachedT = JSON.parse(localStorage.getItem("hs_tests")||"[]");
      const cachedF = JSON.parse(localStorage.getItem("hs_feedbacks")||"[]");
      const cachedA = JSON.parse(localStorage.getItem("hs_approvals")||"[]");
      const cachedCM = JSON.parse(localStorage.getItem("hs_customModels")||"[]");
      const cachedLP = JSON.parse(localStorage.getItem("hs_loadPhotos")||"[]");
`;
code = code.replace('const warnings=[...errs,gM.warn,gH.warn,gP.warn,gC.warn,gO.warn,gS.warn,gFM.warn].filter(Boolean);', addCache + '      const warnings=[...errs,gM.warn,gH.warn,gP.warn,gC.warn,gO.warn,gS.warn,gFM.warn].filter(Boolean);');

// 2. In bootLoad setData, replace d.repairs with cachedR, etc
code = code.replace('repairs:out.repairs.length?out.repairs:d.repairs,', 'repairs:out.repairs.length?out.repairs:cachedR,');
code = code.replace('tests:out.tests.length?out.tests:d.tests,', 'tests:out.tests.length?out.tests:cachedT,');
code = code.replace('feedbacks:out.feedbacks.length?out.feedbacks:d.feedbacks,', 'feedbacks:out.feedbacks.length?out.feedbacks:cachedF,');
code = code.replace('approvals:out.pendingApprovals.length?out.pendingApprovals:d.approvals,', 'approvals:out.pendingApprovals.length?out.pendingApprovals:cachedA,');
code = code.replace('customModels:out.customModels.length?out.customModels:d.customModels,', 'customModels:out.customModels.length?out.customModels:cachedCM,');
code = code.replace('loadPhotos:out.loadPhotos.length?out.loadPhotos:d.loadPhotos,', 'loadPhotos:out.loadPhotos.length?out.loadPhotos:cachedLP,');

// 3. In loadAll, make sure we save to localStorage
const loadAllSetItems = `
      if(next.repairs.length)localStorage.setItem("hs_repairs",JSON.stringify(next.repairs));
      if(next.tests.length)localStorage.setItem("hs_tests",JSON.stringify(next.tests));
      if(next.feedbacks.length)localStorage.setItem("hs_feedbacks",JSON.stringify(next.feedbacks));
      if(next.approvals.length)localStorage.setItem("hs_approvals",JSON.stringify(next.approvals));
      if(next.customModels.length)localStorage.setItem("hs_customModels",JSON.stringify(next.customModels));
      if(next.loadPhotos.length)localStorage.setItem("hs_loadPhotos",JSON.stringify(next.loadPhotos));
`;
code = code.replace('if(warnings.length)setDataWarnings(w=>[...warnings.map(m=>({msg:m,at:stamp()})),...w].slice(0,20));', loadAllSetItems + '      if(warnings.length)setDataWarnings(w=>[...warnings.map(m=>({msg:m,at:stamp()})),...w].slice(0,20));');

fs.writeFileSync('src/App.jsx', code);
console.log("Patched successfully");
