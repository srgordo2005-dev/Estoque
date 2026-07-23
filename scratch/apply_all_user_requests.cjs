const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Persist onlyOnline per user ID
code = code.replace(
  `const [onlyOnline, setOnlyOnline] = useState(() => localStorage.getItem("hs_only_online") === "true");`,
  `const [onlyOnline, setOnlyOnline] = useState(() => {\n        const key = user?._id ? "hs_only_online_" + user._id : "hs_only_online";\n        return localStorage.getItem(key) === "true";\n    });`
);

code = code.replace(
  `const handleSetOnlyOnline = useCallback((val) => {\n        setOnlyOnline(val);\n        localStorage.setItem("hs_only_online", String(val));\n    }, []);`,
  `const handleSetOnlyOnline = useCallback((val) => {\n        setOnlyOnline(val);\n        const key = user?._id ? "hs_only_online_" + user._id : "hs_only_online";\n        localStorage.setItem(key, String(val));\n    }, [user?._id]);`
);

// 2. Update applyMinerDetailsToSession to write board SNs, model, th
code = code.replace(
  `        if (info.slots && Array.isArray(info.slots)) {\n            info.slots.forEach((boardSN, idx) => {\n                if (boardSN && idx < 3) {\n                    const cleanSN = String(boardSN).toUpperCase().trim();\n                    if (!updatedSlots[idx].hashSN || updatedSlots[idx].hashSN.trim() === '') {\n                        updatedSlots[idx] = { \n                            ...updatedSlots[idx], \n                            hashSN: cleanSN,\n                            status: info.status === 'mining' ? 'good' : updatedSlots[idx].status\n                        };\n                        hasChanges = true;\n                    }\n                }\n            });\n        }`,
  `        if (info.slots && Array.isArray(info.slots)) {\n            info.slots.forEach((boardSN, idx) => {\n                if (boardSN && idx < 3) {\n                    const cleanSN = String(boardSN).toUpperCase().trim();\n                    if (cleanSN && updatedSlots[idx].hashSN !== cleanSN) {\n                        updatedSlots[idx] = { \n                            ...updatedSlots[idx], \n                            hashSN: cleanSN,\n                            status: info.status === 'mining' ? 'good' : (updatedSlots[idx].status || 'good')\n                        };\n                        hasChanges = true;\n                    }\n                }\n            });\n        }`
);

// 3. Update handleLinkToBench to close modal pop-up, fetch details and trigger auto-toast
code = code.replace(
  `  const handleLinkToBench = async (miner) => {\n    if (session && saveSession) {\n      saveSession({ ...session, ip: miner.ip, updatedAt: stamp() });\n    }\n    if (miner.sn) {\n      setMacInput(miner.sn);\n      loadMachine(miner.sn);\n    }\n    await fetchAndApplyMinerInfo(miner.ip);\n    alert("✅ Máquina " + miner.ip + " (" + (miner.model || "Minerador") + ") vinculada à bancada!");\n    onClose();\n  };`,
  `  const handleLinkToBench = async (miner) => {\n    onClose();\n    if (miner.sn) {\n      setMacInput(miner.sn);\n      loadMachine(miner.sn);\n    }\n    const info = await fetchAndApplyMinerInfo(miner.ip);\n    if (triggerToast) {\n      triggerToast("⚡ IP " + miner.ip + " (" + (miner.model || info?.model || "Minerador") + ") vinculado à bancada!");\n    }\n  };`
);

// 4. Pass triggerToast to OnlineMinersModal
code = code.replace(
  `fetchAndApplyMinerInfo={fetchAndApplyMinerInfo}`,
  `fetchAndApplyMinerInfo={fetchAndApplyMinerInfo}\n                     triggerToast={triggerToast}`
);

// 5. Update MarkSlotBadForm to record slot index warning and log photo
code = code.replace(
  `    const newSlots=[...session.slots];newSlots[slotIndex]={...slot,hashSN:"",status:"bad",logPhoto:logPhotoUrl,logNotes:notes};\n    const sn=slot.hashSN?slot.hashSN.toUpperCase().trim():"";\n    if(sn){\n      // Não muda mais a HASH na hora — fica pendente até o Admin aprovar na Revisão\n      const apprId=uid();\n      const appr={type:"hashBad",sn,\n        model:h?.model||newModel,material:h?.material||newMaterial,chips:h?.chips||newChips||gChips(newModel,newMaterial)||"",\n        existingId:h?._id||"",\n        logPhoto:logPhotoUrl,notes,location,machineSN:session.machineSN,\n        employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};`,
  `    const slotNum = slotIndex + 1;\n    const formattedNotes = "⚠️ RUIM NO SLOT #" + slotNum + " (Máquina: " + (session.machineSN || session.ip || "Bancada") + (session.model ? " · " + session.model : "") + ")" + (notes ? " | Log: " + notes : "");\n\n    const newSlots=[...session.slots];\n    newSlots[slotIndex]={\n      ...slot,\n      hashSN:"",\n      status:"bad",\n      logPhoto:logPhotoUrl,\n      logNotes:formattedNotes,\n      slotIndex:slotNum\n    };\n    const sn=slot.hashSN?slot.hashSN.toUpperCase().trim():"";\n    if(sn){\n      const apprId=uid();\n      const appr={type:"hashBad",sn,\n        model:h?.model||newModel,material:h?.material||newMaterial,chips:h?.chips||newChips||gChips(newModel,newMaterial)||" ",\n        existingId:h?._id||"",\n        logPhoto:logPhotoUrl,notes:formattedNotes,slotIndex:slotNum,location,machineSN:session.machineSN||session.ip||"",\n        employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};`
);

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("ALL 5 BENCH & SLOT FIXES APPLIED SUCCESSFULLY!");
