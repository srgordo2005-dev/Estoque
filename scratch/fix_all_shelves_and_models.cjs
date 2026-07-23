const fs = require('fs');

// --- 1. FIX LOCAL-HELPER.JS ---
let helperCode = fs.readFileSync('desktop/local-helper.js', 'utf8');

// Replace detectMinerDetails function
const oldDetect = `function detectMinerDetails(stat = {}, summary = {}, version = {}) {
    let rawModel = stat.Type || stat.Miner || stat['Miner Type'] || stat.hardware || stat.product || 
                   version?.VERSION?.[0]?.Miner || version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware || '';
    
    if (!rawModel && summary?.STATUS?.[0]?.Description) {
        rawModel = summary.STATUS[0].Description;
    }

    let model = 'Antminer S19j Pro'; // Default clean fallback if miner detected but model string is empty
    if (rawModel) {
        const lower = String(rawModel).toLowerCase();
        if (lower.includes('s19j pro') || lower.includes('s19jpro')) model = 'Antminer S19j Pro';
        else if (lower.includes('s19 pro') || lower.includes('s19pro')) model = 'Antminer S19 Pro';
        else if (lower.includes('s19 xp')) model = 'Antminer S19 XP';
        else if (lower.includes('s19')) model = 'Antminer S19';
        else if (lower.includes('s21')) model = 'Antminer S21';
        else if (lower.includes('t21')) model = 'Antminer T21';
        else if (lower.includes('m30s+')) model = 'Whatsminer M30S+';
        else if (lower.includes('m30s')) model = 'Whatsminer M30S';
        else if (lower.includes('m31s')) model = 'Whatsminer M31S';
        else if (lower.includes('m50')) model = 'Whatsminer M50';
        else if (lower.includes('whatsminer') || lower.includes('m20') || lower.includes('m32')) model = 'Whatsminer M30S';
        else model = String(rawModel).replace(/bmminer/gi, '').trim() || 'Antminer S19j Pro';
    } else if (stat.chain_acn || stat.chain_acs || stat.BMMiner || stat['hash board 0 sn']) {
        model = 'Antminer S19j Pro';
    } else if (stat['system_miner_type']) {
        model = stat['system_miner_type'];
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

const newDetect = `function detectMinerDetails(stat = {}, summary = {}, version = {}) {
    let rawModel = version?.VERSION?.[0]?.Miner || version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware || 
                   stat.Type || stat.Miner || stat['Miner Type'] || stat.hardware || stat.product || 
                   stat.system_miner_type || summary?.STATUS?.[0]?.Description || '';

    let model = 'Antminer S19';
    if (rawModel) {
        const lower = String(rawModel).toLowerCase();
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
        else model = String(rawModel).replace(/bmminer/gi, '').trim() || 'Antminer S19';
    } else if (stat.chain_acn || stat.chain_acs || stat.BMMiner || stat['hash board 0 sn']) {
        model = 'Antminer S19';
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

if (helperCode.includes("function detectMinerDetails")) {
    helperCode = helperCode.replace(/function detectMinerDetails[\s\S]*?return \{ model, sn \};\s*\}/, newDetect);
    fs.writeFileSync('desktop/local-helper.js', helperCode, 'utf8');
    console.log("Updated detectMinerDetails in local-helper.js!");
}

// --- 2. FIX SRC/APP.JSX ---
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Fix OnlineMinersModal signature & triggerToast
appCode = appCode.replace(
    `function OnlineMinersModal({ctx, session, setMacInput, loadMachine, saveSession, fetchAndApplyMinerInfo, onClose}){`,
    `function OnlineMinersModal({ctx, session, setMacInput, loadMachine, saveSession, fetchAndApplyMinerInfo, triggerToast, onClose}){`
);

appCode = appCode.replace(
    `    const info = await fetchAndApplyMinerInfo(miner.ip);\n    if (triggerToast) {\n      triggerToast("⚡ IP " + miner.ip + " (" + (miner.model || info?.model || "Minerador") + ") vinculado à bancada!");\n    }`,
    `    const info = await fetchAndApplyMinerInfo(miner.ip);\n    const toastFn = triggerToast || ctx?.triggerToast;\n    if (toastFn) {\n      toastFn("⚡ IP " + miner.ip + " (" + (miner.model || info?.model || "Minerador") + ") vinculado à bancada!");\n    }`
);

// Fix Virtual Shelf cleaned name, header string, and slot label
appCode = appCode.replace(
    `const cleanedShelfName = shelfName.replace(/AutoSlot/gi, "Prateleira");`,
    `const cleanedShelfName = shelfName.replace(/^ao\\s*-\\s*/gi, "").replace(/^AutoSlot\\s*/gi, "Prateleira ").replace(/AutoSlot/gi, "Prateleira").trim();`
);

appCode = appCode.replace(
    `<span>📍 VÃO #\${realVaoNum} (\${realVaoNum === 1 ? "Base / Chão · Slot #1 à esquerda" : realVaoNum === vaos.length ? "Topo" : "Nível " + realVaoNum}) — \${vaoList.length} slots</span>`,
    `<span>📍 VÃO #{realVaoNum} ({realVaoNum === 1 ? "Base / Chão · Slot #1 à esquerda" : realVaoNum === vaos.length ? "Topo" : "Nível " + realVaoNum}) — {vaoList.length} posições</span>`
);

appCode = appCode.replace(
    `<span style={{fontSize:10, color:C.muted}}>Slots #\${vaoList[0]?.notes} - #\${vaoList[vaoList.length-1]?.notes}</span>`,
    `<span style={{fontSize:10, color:C.muted}}>Slots #{vaoList[0]?.notes || 1} - #{vaoList[vaoList.length-1]?.notes || (realVaoNum * slotsPerVao)}</span>`
);

appCode = appCode.replace(
    `let valToShow = "Slot #" + m.notes;`,
    `const slotNumStr = (m.notes && m.notes !== "null" && m.notes !== "undefined" && !String(m.notes).includes("$")) ? m.notes : (vaoList.indexOf(m) + 1 + (realVaoNum - 1) * slotsPerVao);\n                                                       let valToShow = "Slot #" + slotNumStr;`
);

appCode = appCode.replace(
    `const machineModelName = (m.model && m.model !== "Antminer S19j Pro") ? m.model : (stat?.model || m.model || "Whatsminer M30S");`,
    `const machineModelName = stat?.model || m.model || "Antminer S19";`
);

appCode = appCode.replace(
    `<td style={{padding:8, fontWeight:800, color:C.accent}}>{machineModelName}</td>`,
    `<td style={{padding:8, fontWeight:800, color:C.accent}}>{stat?.model || m.model || "Antminer S19"}</td>`
);

// Add Cache-buster to package.json check for auto-update
appCode = appCode.replace(
    `fetch("https://raw.githubusercontent.com/srgordo2005-dev/Estoque/main/desktop/package.json")`,
    `fetch("https://raw.githubusercontent.com/srgordo2005-dev/Estoque/main/desktop/package.json?t=" + Date.now())`
);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("ALL VIRTUAL SHELF, MODEL, ONLINE MODAL & AUTO-UPDATE FIXES APPLIED TO APP.JSX!");
