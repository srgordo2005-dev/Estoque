const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// --- 1. FIX AUTO-DISCOVERY DEFAULT SHELF ---
// Prevent auto-discovery from generating "Prateleira 26", "Prateleira 31"...
code = code.replace(
  `shelf: 'Prateleira ' + lastOctet,`,
  `shelf: 'Prateleira 1',`
);

// --- 2. UPDATE ADDFARMFORM TO SAVE LEVELS COUNT & CLEAN SLOTS ---
const oldAddSave = `localStorage.setItem("hs_layout_" + currentShelfName, JSON.stringify({ machinesPerLevel: machinesPerVao }));`;
const newAddSave = `localStorage.setItem("hs_layout_" + currentShelfName, JSON.stringify({ machinesPerLevel: machinesPerVao, levelsCount: vaosQty }));`;

if (code.includes(oldAddSave)) {
  code = code.replace(oldAddSave, newAddSave);
  console.log("1. Updated layout metadata in AddFarmForm!");
}

// --- 3. REBUILD DATACENTER PAGE RACK RENDERING & ADD CLEAN RESET BUTTON ---
const oldResetBtnArea = `<Btn v="b" onClick={() => setModal(<Modal title="Nova Prateleira" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>)}>+ Adicionar Prateleira</Btn>`;

const newResetBtnArea = `
               <Btn v="d" onClick={async () => {
                  if (!confirm("Deseja APAGAR TODAS as prateleiras atuais e recriar a Prateleira do zero?")) return;
                  const allFm = data.farmMachines || [];
                  mutate("farmMachines", []);
                  await Promise.all(allFm.map(m => fbDel("farmMachines", m._id)));
                  setModal(<Modal title="📐 Criar Nova Prateleira Física do Zero" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>);
               }}>
                  🗑️ Recriar Prateleira do Zero
               </Btn>
               <Btn v="b" onClick={() => setModal(<Modal title="📐 Criar Nova Prateleira Física" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>)}>+ Adicionar Prateleira</Btn>
`;

if (code.includes(oldResetBtnArea)) {
  code = code.replace(oldResetBtnArea, newResetBtnArea);
  console.log("2. Added Reset Prateleira button to DataCenterPage!");
}

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("MANUAL FARM RACK FIXES APPLIED TO APP.JSX!");
