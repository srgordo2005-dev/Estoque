const fs = require('fs');

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Find this:
// const farmData = farmMachines.filter(m => (m.location || "Fazenda Principal") === selectedFarm);
// But wait, the dropdown:
// <select value={selectedFarm} onChange={e=>setSelectedFarm(e.target.value)}
// {farmsConfig?.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}

const searchDropdown = `{farmsConfig?.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}`;
const replaceDropdown = `{farmsConfig?.filter(f => user?.code === "019" || f.allowedUsers?.includes(user?.code)).map(f => <option key={f.name} value={f.name}>{f.name}</option>)}`;

if (appCode.includes(searchDropdown)) {
    appCode = appCode.replace(searchDropdown, replaceDropdown);
    fs.writeFileSync('src/App.jsx', appCode);
    console.log("Farm Permissions patched!");
} else {
    console.log("Could not find dropdown to patch!");
}
