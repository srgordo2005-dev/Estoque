const fs = require('fs');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add farmsConfig to App state
const appStateSearch = `const [webhookUrl,setWebhookUrl]=usePersistedField("hs_webhook","");`;
const appStateReplace = `const [webhookUrl,setWebhookUrl]=usePersistedField("hs_webhook","");\n  const [farmsConfig, setFarmsConfig] = usePersistedField("hs_farmsConfig", []);`;

if (appCode.includes(appStateSearch)) {
    appCode = appCode.replace(appStateSearch, appStateReplace);
}

// 2. Add farmsConfig to ctx
const ctxSearch = `const ctx={user,data,setCol,mutate,setModal,setTab:changeTab,loadAll,webhookUrl,setWebhookUrl,allModels,gTH,gChips,dataWarnings,resetMaxCount};`;
const ctxReplace = `const ctx={user,data,setCol,mutate,setModal,setTab:changeTab,loadAll,webhookUrl,setWebhookUrl,allModels,gTH,gChips,dataWarnings,resetMaxCount, farmsConfig, setFarmsConfig};`;

if (appCode.includes(ctxSearch)) {
    appCode = appCode.replace(ctxSearch, ctxReplace);
}

// 3. Fix DataCenterPage
const dcPageSearch = `const {data, setModal, user, farmMachines, setFarmMachines, farmsConfig, setFarmsConfig} = ctx;`;
const dcPageReplace = `const {data, setModal, user, farmsConfig, setFarmsConfig, mutate} = ctx;\n    const farmMachines = data.farmMachines || [];`;

if (appCode.includes(dcPageSearch)) {
    appCode = appCode.replace(dcPageSearch, dcPageReplace);
}

// 4. Fix remove machine
const removeSearch = `const newMachines = farmMachines.filter(x => x.id !== m.id);
                            setFarmMachines(newMachines);
                            setModal(null);`;
const removeReplace = `const targetId = m._id || m.id;
                            const newMachines = farmMachines.filter(x => (x._id || x.id) !== targetId);
                            mutate("farmMachines", newMachines);
                            if (m._id) { fbDelete("farmMachines", m._id); }
                            setModal(null);`;

if (appCode.includes(removeSearch)) {
    appCode = appCode.replace(removeSearch, removeReplace);
}

// 5. Fix add machine
const addSearch = `const newMachine = {
                    id: Date.now().toString(),`;
const addReplace = `const newMachine = {
                    _id: 'farm_' + Date.now().toString(),`;

if (appCode.includes(addSearch)) {
    appCode = appCode.replace(addSearch, addReplace);
}

const mutateSearch = `setFarmMachines([...farmMachines, newMachine]);`;
const mutateReplace = `mutate("farmMachines", prev => [...prev, newMachine]);\n                fbSet("farmMachines", newMachine._id, newMachine);`;

if (appCode.includes(mutateSearch)) {
    appCode = appCode.replace(mutateSearch, mutateReplace);
}

fs.writeFileSync('src/App.jsx', appCode);
console.log("App.jsx patched for DataCenterPage errors!");
