const fs = require('fs');

console.log("Fixing strict Offline vs Idle status and Model display in App.jsx...");

let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Fix 1: Update filteredFarmMachines logic when onlyOnline is true
const oldFilterRegex = /const filteredFarmMachines = farmMachinesList\.filter\(m => \{[\s\S]*?if \(onlyOnline && m\.ip && farmStatus\[m\.ip\] \? farmStatus\[m\.ip\]\.status === 'offline' : false\) return false;/;
const newFilterLogic = `const filteredFarmMachines = farmMachinesList.filter(m => {
                   const stat = m.ip ? farmStatus[m.ip] : null;
                   const isOnline = stat && stat.status !== 'offline' && stat.hashrate > 0;
                   if (onlyOnline && !isOnline) return false;`;

appCode = appCode.replace(oldFilterRegex, newFilterLogic);

// Fix 2: Update status cell rendering in Table view
const oldTableStatusBlock = `const isMining = stat && stat.status !== 'offline' && (stat.hashrate > 0 || stat.status === 'mining');
                                             const isIdle = stat && stat.status !== 'offline' && stat.hashrate === 0;`;

const newTableStatusBlock = `const isOnline = stat && stat.status !== 'offline' && stat.status !== 'disconnected';
                                             const isMining = isOnline && (stat.hashrate > 0 || stat.status === 'mining');
                                             const isIdle = isOnline && stat.hashrate === 0 && (stat.status === 'idle' || stat.status === 'auto-tuning');`;

appCode = appCode.replace(oldTableStatusBlock, newTableStatusBlock);

// Fix 3: Update Model cell in Table view so offline machines don't default to Antminer S19
appCode = appCode.replace(
  /<td style=\{\{padding:8, fontWeight:800, color:C\.accent\}\}>\{cleanModelName\(stat\?\.model \|\| m\.model, m\.model \|\| "Antminer S19"\)\}<\/td>/g,
  `<td style={{padding:8, fontWeight:800, color:C.accent}}>{isOnline && stat?.model ? cleanModelName(stat.model) : (m.model && m.model !== 'Antminer S19' ? m.model : (isOnline ? 'Antminer S21' : '-'))}</td>`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ Fixed Offline vs Idle and Model cell in src/App.jsx!");
