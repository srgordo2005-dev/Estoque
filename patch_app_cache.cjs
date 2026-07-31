const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const target = `      const cachedFM=JSON.parse(localStorage.getItem("hs_farmMachines")||"[]");
      const gM=guardCount("machines",out.machines,cachedM);
      const gH=guardCount("hashes",out.hashes,cachedH);
      const gP=guardCount("pallets",out.pallets,cachedP);
      const gC=guardCount("clients",out.clients,cachedC);
      const gO=guardCount("orders",out.orders,cachedO);
      const gS=guardCount("shipments",out.shipments,cachedS);
      const gFM=guardCount("farmMachines",out.farmMachines,cachedFM);
      const warnings=[...errs,gM.warn,gH.warn,gP.warn,gC.warn,gO.warn,gS.warn,gFM.warn].filter(Boolean);
      setData(d=>({
        ...d,
        machines:gM.use.length?gM.use:cachedM,
        hashes:gH.use.length?gH.use:cachedH,
        repairs:out.repairs.length?out.repairs:d.repairs,
        tests:out.tests.length?out.tests:d.tests,
        feedbacks:out.feedbacks.length?out.feedbacks:d.feedbacks,
        approvals:out.pendingApprovals.length?out.pendingApprovals:d.approvals,
        customModels:out.customModels.length?out.customModels:d.customModels,
        pallets:gP.use.length?gP.use:cachedP,
        clients:gC.use.length?gC.use:cachedC,
        shipments:gS.use.length?gS.use:cachedS,
        loadPhotos:out.loadPhotos.length?out.loadPhotos:d.loadPhotos,
        orders:gO.use.length?gO.use:cachedO,
        farmMachines:gFM.use.length?gFM.use:cachedFM,
      }));`;

const replacement = `      const cachedFM=JSON.parse(localStorage.getItem("hs_farmMachines")||"[]");
      const cachedR=JSON.parse(localStorage.getItem("hs_repairs")||"[]");
      const cachedT=JSON.parse(localStorage.getItem("hs_tests")||"[]");
      const cachedF=JSON.parse(localStorage.getItem("hs_feedbacks")||"[]");
      const cachedA=JSON.parse(localStorage.getItem("hs_approvals")||"[]");
      const cachedCM=JSON.parse(localStorage.getItem("hs_customModels")||"[]");
      const cachedLP=JSON.parse(localStorage.getItem("hs_loadPhotos")||"[]");

      const gM=guardCount("machines",out.machines,cachedM);
      const gH=guardCount("hashes",out.hashes,cachedH);
      const gP=guardCount("pallets",out.pallets,cachedP);
      const gC=guardCount("clients",out.clients,cachedC);
      const gO=guardCount("orders",out.orders,cachedO);
      const gS=guardCount("shipments",out.shipments,cachedS);
      const gFM=guardCount("farmMachines",out.farmMachines,cachedFM);
      const warnings=[...errs,gM.warn,gH.warn,gP.warn,gC.warn,gO.warn,gS.warn,gFM.warn].filter(Boolean);
      setData(d=>({
        ...d,
        machines:gM.use.length?gM.use:cachedM,
        hashes:gH.use.length?gH.use:cachedH,
        repairs:out.repairs.length?out.repairs:cachedR,
        tests:out.tests.length?out.tests:cachedT,
        feedbacks:out.feedbacks.length?out.feedbacks:cachedF,
        approvals:out.pendingApprovals.length?out.pendingApprovals:cachedA,
        customModels:out.customModels.length?out.customModels:cachedCM,
        pallets:gP.use.length?gP.use:cachedP,
        clients:gC.use.length?gC.use:cachedC,
        shipments:gS.use.length?gS.use:cachedS,
        loadPhotos:out.loadPhotos.length?out.loadPhotos:cachedLP,
        orders:gO.use.length?gO.use:cachedO,
        farmMachines:gFM.use.length?gFM.use:cachedFM,
      }));`;

// Also fix loadAll to save to cache so that it doesn't get out of sync if server is up
const target2 = `      if(next.machines.length)localStorage.setItem("hs_machines",JSON.stringify(next.machines));
      if(next.hashes.length)localStorage.setItem("hs_hashes",JSON.stringify(next.hashes));
      if(next.pallets.length)localStorage.setItem("hs_pallets",JSON.stringify(next.pallets));
      if(next.clients.length)localStorage.setItem("hs_clients",JSON.stringify(next.clients));
      if(next.farmMachines.length)localStorage.setItem("hs_farmMachines",JSON.stringify(next.farmMachines));
      if(warnings.length)setDataWarnings(w=>[...warnings.map(m=>({msg:m,at:stamp()})),...w].slice(0,20));`;

const replacement2 = `      if(next.machines.length)localStorage.setItem("hs_machines",JSON.stringify(next.machines));
      if(next.hashes.length)localStorage.setItem("hs_hashes",JSON.stringify(next.hashes));
      if(next.pallets.length)localStorage.setItem("hs_pallets",JSON.stringify(next.pallets));
      if(next.clients.length)localStorage.setItem("hs_clients",JSON.stringify(next.clients));
      if(next.farmMachines.length)localStorage.setItem("hs_farmMachines",JSON.stringify(next.farmMachines));
      if(next.repairs.length)localStorage.setItem("hs_repairs",JSON.stringify(next.repairs));
      if(next.tests.length)localStorage.setItem("hs_tests",JSON.stringify(next.tests));
      if(next.feedbacks.length)localStorage.setItem("hs_feedbacks",JSON.stringify(next.feedbacks));
      if(next.approvals.length)localStorage.setItem("hs_approvals",JSON.stringify(next.approvals));
      if(next.customModels.length)localStorage.setItem("hs_customModels",JSON.stringify(next.customModels));
      if(next.loadPhotos.length)localStorage.setItem("hs_loadPhotos",JSON.stringify(next.loadPhotos));
      if(warnings.length)setDataWarnings(w=>[...warnings.map(m=>({msg:m,at:stamp()})),...w].slice(0,20));`;

if (code.includes(target) && code.includes(target2)) {
    code = code.replace(target, replacement);
    code = code.replace(target2, replacement2);
    fs.writeFileSync('src/App.jsx', code);
    console.log("Patched App.jsx");
} else {
    console.log("Could not find targets");
    if (!code.includes(target)) console.log("Target 1 not found");
    if (!code.includes(target2)) console.log("Target 2 not found");
}
