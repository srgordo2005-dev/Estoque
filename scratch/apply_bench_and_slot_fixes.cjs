const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Fix onlyOnline toggle to save per user ID in DataCenterPage
code = code.replace(
  `const [onlyOnline, setOnlyOnline] = useState(() => localStorage.getItem("hs_only_online") === "true");`,
  `const [onlyOnline, setOnlyOnline] = useState(() => {\n        const key = user?._id ? "hs_only_online_" + user._id : "hs_only_online";\n        return localStorage.getItem(key) === "true";\n    });`
);

code = code.replace(
  `const handleSetOnlyOnline = useCallback((val) => {\n        setOnlyOnline(val);\n        localStorage.setItem("hs_only_online", String(val));\n    }, []);`,
  `const handleSetOnlyOnline = useCallback((val) => {\n        setOnlyOnline(val);\n        const key = user?._id ? "hs_only_online_" + user._id : "hs_only_online";\n        localStorage.setItem(key, String(val));\n    }, [user?._id]);`
);
console.log("1. Updated onlyOnline to save per user!");

// 2. Ensure applyMinerDetailsToSession writes model, th, and slots into session
const oldApplyDetails = `        if (info.slots && Array.isArray(info.slots)) {
            info.slots.forEach((boardSN, idx) => {
                if (boardSN && idx < 3) {
                    const cleanSN = String(boardSN).toUpperCase().trim();
                    if (!updatedSlots[idx].hashSN || updatedSlots[idx].hashSN.trim() === '') {
                        updatedSlots[idx] = { 
                            ...updatedSlots[idx], 
                            hashSN: cleanSN,
                            status: info.status === 'mining' ? 'good' : updatedSlots[idx].status
                        };
                        hasChanges = true;
                    }
                }
            });
        }`;

const newApplyDetails = `        if (info.slots && Array.isArray(info.slots)) {
            info.slots.forEach((boardSN, idx) => {
                if (boardSN && idx < 3) {
                    const cleanSN = String(boardSN).toUpperCase().trim();
                    if (cleanSN && updatedSlots[idx].hashSN !== cleanSN) {
                        updatedSlots[idx] = { 
                            ...updatedSlots[idx], 
                            hashSN: cleanSN,
                            status: info.status === 'mining' ? 'good' : (updatedSlots[idx].status || 'good')
                        };
                        hasChanges = true;
                    }
                }
            });
        }`;

if (code.includes(oldApplyDetails)) {
  code = code.replace(oldApplyDetails, newApplyDetails);
  console.log("2. Updated applyMinerDetailsToSession slot filling!");
} else {
  console.log("2. oldApplyDetails not matched");
}

// 3. Update handleLinkToBench in OnlineMinersModal to close popup, apply details, and trigger auto-disappearing toast
const oldLinkBench = `  const handleLinkToBench = async (miner) => {
    if (session && saveSession) {
      saveSession({ ...session, ip: miner.ip, updatedAt: stamp() });
    }
    if (miner.sn) {
      setMacInput(miner.sn);
      loadMachine(miner.sn);
    }
    await fetchAndApplyMinerInfo(miner.ip);
    alert("✅ Máquina " + miner.ip + " (" + (miner.model || "Minerador") + ") vinculada à bancada!");
    onClose();
  };`;

const newLinkBench = `  const handleLinkToBench = async (miner) => {
    onClose();
    if (miner.sn) {
      setMacInput(miner.sn);
      loadMachine(miner.sn);
    }
    const info = await fetchAndApplyMinerInfo(miner.ip);
    if (triggerToast) {
      triggerToast("⚡ IP " + miner.ip + " (" + (miner.model || info?.model || "Minerador") + ") vinculado à bancada!");
    }
  };`;

if (code.includes(oldLinkBench)) {
  code = code.replace(oldLinkBench, newLinkBench);
  console.log("3. Updated handleLinkToBench for seamless auto-toast!");
} else {
  console.log("3. oldLinkBench not matched");
}

// 4. Update OnlineMinersModal call in BenchConnectionPanel to pass triggerToast
code = code.replace(
  `fetchAndApplyMinerInfo={fetchAndApplyMinerInfo}`,
  `fetchAndApplyMinerInfo={fetchAndApplyMinerInfo}\n                     triggerToast={triggerToast}`
);
console.log("4. Passed triggerToast to OnlineMinersModal!");

// 5. Update MarkSlotBadForm to auto-capture print log and append explicit slot number warning
const oldConfirmBad = `    const newSlots=[...session.slots];newSlots[slotIndex]={...slot,hashSN:"",status:"bad",logPhoto:logPhotoUrl,logNotes:notes};
    const sn=slot.hashSN?slot.hashSN.toUpperCase().trim():"";
    if(sn){
      // Não muda mais a HASH na hora — fica pendente até o Admin aprovar na Revisão
      const apprId=uid();
      const appr={type:"hashBad",sn,
        model:h?.model||newModel,material:h?.material||newMaterial,chips:h?.chips||newChips||gChips(newModel,newMaterial)||"",
        existingId:h?._id||"",
        logPhoto:logPhotoUrl,notes,location,machineSN:session.machineSN,
        employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};`;

const newConfirmBad = `    const slotNum = slotIndex + 1;
    const formattedNotes = "⚠️ RUIM NO SLOT #" + slotNum + " (Máquina: " + (session.machineSN || session.ip || "Bancada") + (session.model ? " · " + session.model : "") + ")" + (notes ? " | Log: " + notes : "");

    const newSlots=[...session.slots];
    newSlots[slotIndex]={
      ...slot,
      hashSN:"",
      status:"bad",
      logPhoto:logPhotoUrl,
      logNotes:formattedNotes,
      slotIndex:slotNum
    };
    const sn=slot.hashSN?slot.hashSN.toUpperCase().trim():"";
    if(sn){
      const apprId=uid();
      const appr={type:"hashBad",sn,
        model:h?.model||newModel,material:h?.material||newMaterial,chips:h?.chips||newChips||gChips(newModel,newMaterial)||" ",
        existingId:h?._id||"",
        logPhoto:logPhotoUrl,notes:formattedNotes,slotIndex:slotNum,location,machineSN:session.machineSN||session.ip||"",
        employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};`;

if (code.includes(oldConfirmBad)) {
  code = code.replace(oldConfirmBad, newConfirmBad);
  console.log("5. Updated MarkSlotBadForm with slot warning note and log screenshot!");
} else {
  console.log("5. oldConfirmBad not matched");
}

fs.writeFileSync('src/App.jsx', code);
