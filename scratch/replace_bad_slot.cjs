const fs = require('fs');
let lines = fs.readFileSync('src/App.jsx', 'utf8').split('\n');

const targetIdx = lines.findIndex((l, i) => i > 6365 && l.includes('const newSlots=[...session.slots];'));
console.log('Target line idx:', targetIdx);

if (targetIdx !== -1) {
  const replacement = [
    `    const slotNum = slotIndex + 1;`,
    `    const formattedNotes = "⚠️ RUIM NO SLOT #" + slotNum + " (Máquina: " + (session.machineSN || session.ip || "Bancada") + (session.model ? " · " + session.model : "") + ")" + (notes ? " | Log: " + notes : "");`,
    ``,
    `    const newSlots=[...session.slots];`,
    `    newSlots[slotIndex]={`,
    `      ...slot,`,
    `      hashSN:"",`,
    `      status:"bad",`,
    `      logPhoto:logPhotoUrl,`,
    `      logNotes:formattedNotes,`,
    `      slotIndex:slotNum`,
    `    };`,
    `    const sn=slot.hashSN?slot.hashSN.toUpperCase().trim():"";`,
    `    if(sn){`,
    `      const apprId=uid();`,
    `      const appr={type:"hashBad",sn,`,
    `        model:h?.model||newModel,material:h?.material||newMaterial,chips:h?.chips||newChips||gChips(newModel,newMaterial)||" ",`,
    `        existingId:h?._id||"",`,
    `        logPhoto:logPhotoUrl,notes:formattedNotes,slotIndex:slotNum,location,machineSN:session.machineSN||session.ip||"",`,
    `        employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",...audit(user)};`
  ];

  lines.splice(targetIdx, 13, ...replacement);
  fs.writeFileSync('src/App.jsx', lines.join('\n'), 'utf8');
  console.log("REPLACED BAD SLOT LOGIC CLEANLY");
}
