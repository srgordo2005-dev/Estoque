const fs = require('fs');

let code = fs.readFileSync('src/App.jsx', 'utf8');

// The problematic lines with literal backslashes
const target1 = "const res = await fetch(\\`http://localhost:3001/api/scan-range\\`, {";
const replace1 = "const res = await fetch(`http://localhost:3001/api/scan-range`, {";

const target2 = "const infoRes = await fetch(\\`http://localhost:3001/api/miner-info?ip=\\${ip}\\`);";
const replace2 = "const infoRes = await fetch(`http://localhost:3001/api/miner-info?ip=${ip}`);";

const target3 = "alert(\\`✅ IP REPORT CAPTURADO!\\n🌐 IP: \\${latest.ip}\\n\\${slotsFound > 0 ? \\`📋 \\${slotsFound} HASH SNs importados automaticamente!\\` : ''}\\`);";
const replace3 = "alert(`✅ IP REPORT CAPTURADO!\\n🌐 IP: ${latest.ip}\\n${slotsFound > 0 ? `📋 ${slotsFound} HASH SNs importados automaticamente!` : ''}`);";

const target4 = "const driveUrl = await ctx.uploadPhoto(data.image, \\`testes/print_\\${session?.machineSN || ip}_\\${uid()}.jpg\\`);";
const replace4 = "const driveUrl = await ctx.uploadPhoto(data.image, `testes/print_${session?.machineSN || ip}_${uid()}.jpg`);";

const target5 = "const r = await fetch(\\`http://localhost:3001/api/miner-info?ip=\\${ip}\\`);";
const replace5 = "const r = await fetch(`http://localhost:3001/api/miner-info?ip=${ip}`);";

const target6 = "adminNotes: [...(session.adminNotes || []), \\`⚡ AUTOMÁTICO (\\${uptimeHours.toFixed(1)}h Uptime / Alvo: \\${targetUptimeHours}h)\\`]";
const replace6 = "adminNotes: [...(session.adminNotes || []), `⚡ AUTOMÁTICO (${uptimeHours.toFixed(1)}h Uptime / Alvo: ${targetUptimeHours}h)`]";

const target7 = "alert(\\`🎉 UPTIME DE \\${targetUptimeHours}h ALCANÇADO!\\n\\n⚡ Teste marcado como AUTOMÁTICO.\\n📸 Print salvo.\\n✅ Enviada para REVISÃO!\\n🔌 PODE DESLIGAR.\\`);";
const replace7 = "alert(`🎉 UPTIME DE ${targetUptimeHours}h ALCANÇADO!\\n\\n⚡ Teste marcado como AUTOMÁTICO.\\n📸 Print salvo.\\n✅ Enviada para REVISÃO!\\n🔌 PODE DESLIGAR.`);";

const target8 = "<Btn v=\"s\" onClick={() => window.open(\\`http://\\${ipToUse}\\`, '_blank')} title=\"Abrir painel da mineradora\">";
const replace8 = "<Btn v=\"s\" onClick={() => window.open(`http://${ipToUse}`, '_blank')} title=\"Abrir painel da mineradora\">";

code = code.split(target1).join(replace1);
code = code.split(target2).join(replace2);
code = code.split(target3).join(replace3);
code = code.split(target4).join(replace4);
code = code.split(target5).join(replace5);
code = code.split(target6).join(replace6);
code = code.split(target7).join(replace7);
code = code.split(target8).join(replace8);

// General fallback just in case
code = code.split('\\\\`').join('`');
code = code.split('\\\\$').join('$');

fs.writeFileSync('src/App.jsx', code);
console.log('Fixed explicitly');
