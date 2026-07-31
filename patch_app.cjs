const fs = require('fs');

let code = fs.readFileSync('src/App.jsx', 'utf8');
code = code.replace(/\r\n/g, '\n');

// TARGET 1
const t1 = `      setCol("employees",cachedEmps);
      setData(d=>({
        ...d,
        machines:JSON.parse(localStorage.getItem("hs_machines")||"[]"),
        hashes:JSON.parse(localStorage.getItem("hs_hashes")||"[]"),
        pallets:JSON.parse(localStorage.getItem("hs_pallets")||"[]"),
        clients:JSON.parse(localStorage.getItem("hs_clients")||"[]"),
        orders:JSON.parse(localStorage.getItem("hs_orders")||"[]"),
        shipments:JSON.parse(localStorage.getItem("hs_shipments")||"[]"),
        farmMachines:JSON.parse(localStorage.getItem("hs_farmMachines")||"[]"),
      }));
      setLoading(false);
      return;`;

const r1 = `      setCol("employees",cachedEmps);
      setData(d=>({
        ...d,
        machines:JSON.parse(localStorage.getItem("hs_machines")||"[]"),
        hashes:JSON.parse(localStorage.getItem("hs_hashes")||"[]"),
        pallets:JSON.parse(localStorage.getItem("hs_pallets")||"[]"),
        clients:JSON.parse(localStorage.getItem("hs_clients")||"[]"),
        orders:JSON.parse(localStorage.getItem("hs_orders")||"[]"),
        shipments:JSON.parse(localStorage.getItem("hs_shipments")||"[]"),
        farmMachines:JSON.parse(localStorage.getItem("hs_farmMachines")||"[]"),
        repairs:JSON.parse(localStorage.getItem("hs_repairs")||"[]"),
        tests:JSON.parse(localStorage.getItem("hs_tests")||"[]"),
        feedbacks:JSON.parse(localStorage.getItem("hs_feedbacks")||"[]"),
        approvals:JSON.parse(localStorage.getItem("hs_approvals")||"[]"),
        customModels:JSON.parse(localStorage.getItem("hs_customModels")||"[]"),
        loadPhotos:JSON.parse(localStorage.getItem("hs_loadPhotos")||"[]"),
      }));
      setLoading(false);
      return;`;

if (code.includes(t1)) {
    code = code.replace(t1, r1);
    console.log("Target 1 replaced.");
} else {
    console.log("Target 1 not found!");
}

// TARGET 2
const t2 = `      if(gM.use.length)localStorage.setItem("hs_machines",JSON.stringify(gM.use));
      if(gH.use.length)localStorage.setItem("hs_hashes",JSON.stringify(gH.use));
      if(gP.use.length)localStorage.setItem("hs_pallets",JSON.stringify(gP.use));
      if(gC.use.length)localStorage.setItem("hs_clients",JSON.stringify(gC.use));
      if(gO.use.length)localStorage.setItem("hs_orders",JSON.stringify(gO.use));
      if(gS.use.length)localStorage.setItem("hs_shipments",JSON.stringify(gS.use));
      if(gFM.use.length)localStorage.setItem("hs_farmMachines",JSON.stringify(gFM.use));
      localStorage.setItem("hs_lastFullFetch",String(Date.now()));`;

const r2 = `      if(gM.use.length)localStorage.setItem("hs_machines",JSON.stringify(gM.use));
      if(gH.use.length)localStorage.setItem("hs_hashes",JSON.stringify(gH.use));
      if(gP.use.length)localStorage.setItem("hs_pallets",JSON.stringify(gP.use));
      if(gC.use.length)localStorage.setItem("hs_clients",JSON.stringify(gC.use));
      if(gO.use.length)localStorage.setItem("hs_orders",JSON.stringify(gO.use));
      if(gS.use.length)localStorage.setItem("hs_shipments",JSON.stringify(gS.use));
      if(gFM.use.length)localStorage.setItem("hs_farmMachines",JSON.stringify(gFM.use));
      if(out.repairs.length)localStorage.setItem("hs_repairs",JSON.stringify(out.repairs));
      if(out.tests.length)localStorage.setItem("hs_tests",JSON.stringify(out.tests));
      if(out.feedbacks.length)localStorage.setItem("hs_feedbacks",JSON.stringify(out.feedbacks));
      if(out.pendingApprovals.length)localStorage.setItem("hs_approvals",JSON.stringify(out.pendingApprovals));
      if(out.customModels.length)localStorage.setItem("hs_customModels",JSON.stringify(out.customModels));
      if(out.loadPhotos.length)localStorage.setItem("hs_loadPhotos",JSON.stringify(out.loadPhotos));
      localStorage.setItem("hs_lastFullFetch",String(Date.now()));`;

if (code.includes(t2)) {
    code = code.replace(t2, r2);
    console.log("Target 2 replaced.");
} else {
    console.log("Target 2 not found!");
}

// Re-write file keeping LF or CRLF (we just use LF now)
fs.writeFileSync('src/App.jsx', code);
console.log("Done");
