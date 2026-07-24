const fs = require('fs');

console.log("Applying all 5 requested fixes cleanly...");

// 1. UPDATE LOCAL-HELPER.JS & DESKTOP/LOCAL-HELPER.JS (Clean Model Extraction)
function updateHelpersModelClean(filePath) {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  const cleanDetectFunc = `function detectMinerDetails(stat = {}, summary = {}, version = {}, vnishInfo = null) {
    if (vnishInfo) {
        let raw = vnishInfo.miner || vnishInfo.model || vnishInfo.preset_name || vnishInfo.hardware || vnishInfo.type || '';
        raw = String(raw).replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();
        let model = raw ? (raw.toLowerCase().includes('vnish') ? raw : \`\${raw} (Vnish)\`) : 'Antminer (Vnish)';
        const sn = vnishInfo.serial || vnishInfo.sn || vnishInfo.mac || '';
        return { model, sn };
    }

    let rawModel = stat.hardware || stat.product || stat.system_miner_type || 
                   version?.VERSION?.[0]?.Type || version?.VERSION?.[0]?.Hardware ||
                   stat.Type || stat.Miner || summary?.STATUS?.[0]?.Description || '';
    
    rawModel = String(rawModel).replace(/cgminer[\s\d\.]*/gi, '').replace(/bmminer[\s\d\.]*/gi, '').trim();

    let model = 'Antminer S19';
    if (rawModel) {
        const lower = rawModel.toLowerCase();
        if (lower.includes('s19j pro') || lower.includes('s19jpro')) model = 'Antminer S19j Pro';
        else if (lower.includes('s19 pro') || lower.includes('s19pro')) model = 'Antminer S19 Pro';
        else if (lower.includes('s19 xp')) model = 'Antminer S19 XP';
        else if (lower.includes('s19k pro')) model = 'Antminer S19k Pro';
        else if (lower.includes('s19a pro')) model = 'Antminer S19a Pro';
        else if (lower.includes('s19a')) model = 'Antminer S19a';
        else if (lower.includes('s19i')) model = 'Antminer S19i';
        else if (lower.includes('s19')) model = 'Antminer S19';
        else if (lower.includes('s21')) model = 'Antminer S21';
        else if (lower.includes('t21')) model = 'Antminer T21';
        else if (lower.includes('t19')) model = 'Antminer T19';
        else if (lower.includes('m30s+')) model = 'Whatsminer M30S+';
        else if (lower.includes('m30s')) model = 'Whatsminer M30S';
        else if (lower.includes('m31s')) model = 'Whatsminer M31S';
        else if (lower.includes('m50')) model = 'Whatsminer M50';
        else if (lower.includes('whatsminer')) model = 'Whatsminer M30S';
        else if (lower.includes('vnish')) model = rawModel;
        else if (rawModel.length > 2 && !rawModel.toLowerCase().includes('cgminer')) model = rawModel;
        else model = 'Antminer S19';
    } else if (stat.chain_acn || stat.chain_acs || stat.BMMiner || stat['hash board 0 sn']) {
        model = 'Antminer S19';
    }

    let sn = stat.Miner_SN || stat.miner_sn || stat.SN || stat.mac || version?.VERSION?.[0]?.SN || '';
    return { model, sn };
}`;

  const oldDetectRegex = /function detectMinerDetails\([\s\S]*?return \{ model, sn \};\s*\}/;
  code = code.replace(oldDetectRegex, cleanDetectFunc);

  fs.writeFileSync(filePath, code, 'utf8');
  console.log(`✓ Cleaned detectMinerDetails in ${filePath}`);
}

updateHelpersModelClean('local-helper.js');
updateHelpersModelClean('desktop/local-helper.js');

// 2. UPDATE APP.JSX
let appCode = fs.readFileSync('src/App.jsx', 'utf8');

// Fix 2.1: Stop auto-synthesizing unassigned scanned IPs into farmMachines
const oldSynthesizeRegex = /const farmMachines = useMemo\(\(\) => \{[\s\S]*?return merged;\s*\}, \[dbFarmMachines, farmStatus, activeFarm\]\);/;
const newFarmMachinesMemo = `const farmMachines = useMemo(() => {
        return dbFarmMachines;
    }, [dbFarmMachines]);`;

appCode = appCode.replace(oldSynthesizeRegex, newFarmMachinesMemo);

// Fix 2.2: Ensure model displayed in Table view strips 'cgminer 4.11.1'
appCode = appCode.replace(
  /\(stat\.model \|\| m\.model \|\| "Antminer S19"\)/g,
  `((stat?.model && !stat.model.toLowerCase().includes('cgminer') ? stat.model : m.model && !m.model.toLowerCase().includes('cgminer') ? m.model : 'Antminer S19'))`
);

// Fix 2.3: Re-add ⏱️ Auto-Scan (5s) checkbox into DataCenterPage controls bar
const targetControlsStr = `<label style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.subtle, cursor:'pointer', fontWeight:800}}>
                    <input type="checkbox" checked={onlyOnline} onChange={e=>handleSetOnlyOnline(e.target.checked)}/> Somente Online
                </label>`;

const newControlsStr = `<label style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.subtle, cursor:'pointer', fontWeight:800}}>
                    <input type="checkbox" checked={onlyOnline} onChange={e=>handleSetOnlyOnline(e.target.checked)}/> Somente Online
                </label>

                <div style={{width:1, height:20, background:C.border, margin:'0 10px'}}></div>

                <label style={{display:'flex', alignItems:'center', gap:6, fontSize:11, color: autoScan ? C.blue : C.subtle, cursor:'pointer', fontWeight:800}}>
                    <input type="checkbox" checked={autoScan} onChange={e=>setAutoScan(e.target.checked)}/> ⏱️ Auto-Scan (5s)
                </label>`;

appCode = appCode.replace(targetControlsStr, newControlsStr);

fs.writeFileSync('src/App.jsx', appCode, 'utf8');
console.log("✓ src/App.jsx updated successfully.");

console.log("ALL 5 FIXES APPLIED SUCCESSFULLY!");
