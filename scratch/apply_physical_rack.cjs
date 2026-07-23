const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// Update rack rendering in DataCenterPage to reverse vaos for true bottom-up numbering (Slot #1 at bottom left)
// and style shelves like real metal racks
const oldRackCode = `                                        {(() => {
                                           const layoutMeta = (() => {
                                             try { return JSON.parse(localStorage.getItem("hs_layout_" + shelfName) || "{}"); } catch(e) { return {}; }
                                           })();
                                           const slotsPerVao = layoutMeta.machinesPerLevel || 6;
                                           const vaos = [];
                                           for (let i = 0; i < list.length; i += slotsPerVao) {
                                             vaos.push(list.slice(i, i + slotsPerVao));
                                           }

                                           return (
                                             <div style={{display:'flex', flexDirection:'column', gap:12}}>
                                               {vaos.map((vaoList, vaoIdx) => (`;

const newRackCode = `                                        {(() => {
                                           const layoutMeta = (() => {
                                             try { return JSON.parse(localStorage.getItem("hs_layout_" + shelfName) || "{}"); } catch(e) { return {}; }
                                           })();
                                           const slotsPerVao = layoutMeta.machinesPerLevel || 6;
                                           const vaos = [];
                                           for (let i = 0; i < list.length; i += slotsPerVao) {
                                             vaos.push(list.slice(i, i + slotsPerVao));
                                           }

                                           // Real physical rack display: Top Vão on top, Vão #1 at bottom (Slot #1 bottom-left)
                                           const reversedVaos = vaos.map((list, idx) => ({ list, realVaoNum: idx + 1 })).reverse();

                                           return (
                                             <div style={{display:'flex', flexDirection:'column', gap:12, background:'#0b1120', padding:12, borderRadius:12, border:'2px solid #1e293b', boxShadow:'inset 0 0 20px rgba(0,0,0,0.8)'}}>
                                               {reversedVaos.map(({ list: vaoList, realVaoNum }) => (`;

if (code.includes(oldRackCode)) {
  code = code.replace(oldRackCode, newRackCode);
  console.log("1. Replaced rack rendering for bottom-up physical slot numbering!");
} else {
  console.log("1. oldRackCode not matched");
}

// Also update the vao header line inside reversedVaos mapping
const oldVaoHeader = `<span>📍 VÃO #\${vaoIdx + 1} (\${vaoList.length} posições)</span>`;
const newVaoHeader = `<span>📍 VÃO #\${realVaoNum} (\${realVaoNum === 1 ? "Base / Chão · Slot #1 à esquerda" : realVaoNum === vaos.length ? "Topo" : "Nível " + realVaoNum}) — \${vaoList.length} slots</span>`;

if (code.includes(oldVaoHeader)) {
  code = code.replace(oldVaoHeader, newVaoHeader);
  console.log("2. Updated Vão header labels!");
} else {
  console.log("2. oldVaoHeader not matched");
}

fs.writeFileSync('src/App.jsx', code, 'utf8');
