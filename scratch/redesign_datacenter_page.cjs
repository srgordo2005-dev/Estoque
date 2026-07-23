const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. ADD CAMERA BUTTON TO SEQUENTIAL MAPPING MODAL
const sequentialModalSnInputRegex = /<input\s+autoFocus\s+value=\{snInput\}[\s\S]*?placeholder="Bipe o SN aqui\.\.\."\s+style=\{\{\.\.\.inp,\s*width:'100%',\s*fontSize:14,\s*fontWeight:700\}\}\s*\/>/;

const sequentialModalSnInputReplacement = `<div style={{display:'flex', gap:8}}>
          <input 
            autoFocus 
            value={snInput} 
            onChange={e => setSnInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveSlotAndAdvance(); }} 
            placeholder="Bipe o SN aqui..." 
            style={{...inp, flex:1, fontSize:14, fontWeight:700}}
          />
          <button 
            onClick={() => {
              // Stub for camera functionality
              alert("Integração com Câmera Nativa sendo aberta...");
              // Ideally here we would set camOpen(true) or use a barcode scanner component
            }}
            style={{background:C.blue, color:'#fff', border:'none', borderRadius:6, padding:'0 16px', fontWeight:800, cursor:'pointer'}}
          >
            📷
          </button>
        </div>`;

code = code.replace(sequentialModalSnInputRegex, sequentialModalSnInputReplacement);


// 2. UPDATE DATACENTERPAGE HEADER & NAVIGATION (Lobby vs Deep Navigation)
const dataCenterHeaderRegex = /<div style=\{\{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24\}\}>[\s\S]*?<\/div>\s*<\/div>\s*<div style=\{\{display:'flex', gap:6, marginTop:8, overflowX:'auto', maxWidth:'75vw', paddingBottom:4\}\}>[\s\S]*?<\/div>/;

const dataCenterHeaderReplacement = `<div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24}}>
             <div>
                <div style={{fontSize:24, fontWeight:900, display:'flex', alignItems:'center', gap:12}}>
                   🏭 Data Center / Fazendas
                </div>
                <div style={{color:C.subtle, fontSize:13, marginTop:4}}>
                   {activeFarm === "ALL" ? "Selecione uma fazenda abaixo para gerenciar as prateleiras" : "Gerenciando prateleiras da fazenda: " + activeFarm}
                </div>
             </div>
             
             <div style={{display:'flex', gap:8, alignItems:'center'}}>
                {activeFarm !== "ALL" && (
                   <Btn v="s" onClick={() => setActiveFarm("ALL")} style={{background:C.card2, border:'1px solid ' + C.border}}>
                      ⬅️ Voltar para Todas as Fazendas
                   </Btn>
                )}
                {activeFarm === "ALL" && (
                   <Btn v="b" onClick={() => setModal(<Modal title="🏭 Criar Nova Fazenda" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} onClose={()=>setModal(null)}/></Modal>)}>
                      + Criar Nova Fazenda
                   </Btn>
                )}
                
                {activeFarm !== "ALL" && (
                   <>
                      <Btn v="b" onClick={handleManualRefresh} disabled={isScanning}>
                         {isScanning ? "⏳ Escaneando..." : "📡 Escanear Frota Agora"}
                      </Btn>
                      <Btn v="b" onClick={() => setModal(<Modal title="🏢 Adicionar Armário/Prateleira" onClose={()=>setModal(null)}><AddFarmForm ctx={ctx} isRack={true} farmName={activeFarm} onClose={()=>setModal(null)}/></Modal>)}>
                         + Adicionar Armário à Fazenda
                      </Btn>
                   </>
                )}
             </div>
          </div>`;

code = code.replace(dataCenterHeaderRegex, dataCenterHeaderReplacement);


// 3. IMPROVE AddFarmForm TO HANDLE IP RANGES AND REALISTIC SHELF CREATION
const addFarmFormRegex = /function AddFarmForm\(\{ctx, onClose\}\) \{[\s\S]*?return \([\s\S]*?<\/form>\s*\);\s*\}/;

const addFarmFormReplacement = `function AddFarmForm({ctx, onClose, isRack, farmName}) {
    const {data, mutate, user} = ctx;
    const farmMachines = data.farmMachines || [];
    const [name, setName] = useState(isRack ? "Armário " + (Math.floor(Math.random() * 100)) : "Nova Fazenda");
    const [ipRanges, setIpRanges] = useState([{start: "192.168.1.1", end: "192.168.1.254"}]);
    
    // Dimensões do Armário
    const [racksQty, setRacksQty] = useState(1);
    const [vaosQty, setVaosQty] = useState(5);
    const [machinesPerVao, setMachinesPerVao] = useState(6);

    const handleSave = async (e) => {
        e.preventDefault();
        const finalFarmName = isRack ? farmName : name;
        
        let currentIpList = [];
        ipRanges.forEach(range => {
           const startParts = range.start.split('.');
           const endParts = range.end.split('.');
           const base = startParts.slice(0,3).join('.');
           const startNum = parseInt(startParts[3]);
           const endNum = parseInt(endParts[3]);
           for(let i = startNum; i <= endNum; i++) {
              currentIpList.push(base + "." + i);
           }
        });

        let totalSlotsNeeded = racksQty * vaosQty * machinesPerVao;
        if (currentIpList.length > 0 && currentIpList.length < totalSlotsNeeded) {
           if(!confirm("Você configurou menos IPs ("+currentIpList.length+") do que slots na estante ("+totalSlotsNeeded+"). Os últimos slots ficarão sem IP pré-definido. Deseja continuar?")) return;
        }

        let ipIndex = 0;
        
        for (let r = 1; r <= racksQty; r++) {
            const currentShelfName = isRack ? name : (racksQty > 1 ? "Prateleira " + r : "Prateleira 1");
            localStorage.setItem("hs_layout_" + currentShelfName, JSON.stringify({ machinesPerLevel: machinesPerVao, levelsCount: vaosQty }));
            
            for (let i = 1; i <= (vaosQty * machinesPerVao); i++) {
                const assignedIp = currentIpList[ipIndex] || "";
                ipIndex++;
                
                const newMachine = {
                    _id: uid(),
                    sn: "FARM-VAGO-" + Date.now() + "-" + r + "-" + i,
                    model: "Antminer S19", 
                    location: finalFarmName,
                    shelf: currentShelfName,
                    notes: String(i),
                    ip: assignedIp,
                    status: "MAPPED"
                };
                mutate("farmMachines", prev => [...prev, newMachine]);
                await fbSet("farmMachines", newMachine._id, newMachine);
            }
        }
        
        alert("Criado com sucesso!");
        onClose();
    };

    return (
        <form onSubmit={handleSave} style={{display:'flex', flexDirection:'column', gap:16, minWidth:400}}>
            <Inp label={isRack ? "Nome do Armário/Prateleira" : "Nome da Fazenda"} value={name} onChange={e => setName(e.target.value)} required />
            
            <div style={{background:C.card2, padding:14, borderRadius:8, border:'1px solid '+C.border}}>
               <div style={{fontWeight:800, marginBottom:10}}>Dimensões Físicas</div>
               <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
                  <Inp type="number" label="Qtd Prateleiras" value={racksQty} onChange={e => setRacksQty(Number(e.target.value))} min={1} max={50} />
                  <Inp type="number" label="Vãos (Andares)" value={vaosQty} onChange={e => setVaosQty(Number(e.target.value))} min={1} max={20} />
                  <Inp type="number" label="Máquinas por Vão" value={machinesPerVao} onChange={e => setMachinesPerVao(Number(e.target.value))} min={1} max={30} />
               </div>
               <div style={{fontSize:11, color:C.subtle, marginTop:8}}>
                  Total: {racksQty * vaosQty * machinesPerVao} slots físicos serão criados.
               </div>
            </div>

            <div style={{background:C.card2, padding:14, borderRadius:8, border:'1px solid '+C.border}}>
               <div style={{fontWeight:800, marginBottom:10}}>Faixas de IP (Opcional)</div>
               {ipRanges.map((range, idx) => (
                  <div key={idx} style={{display:'flex', gap:10, marginBottom:10, alignItems:'flex-end'}}>
                     <Inp label="IP Inicial" value={range.start} onChange={e => {
                        const newRanges = [...ipRanges];
                        newRanges[idx].start = e.target.value;
                        setIpRanges(newRanges);
                     }} />
                     <Inp label="IP Final" value={range.end} onChange={e => {
                        const newRanges = [...ipRanges];
                        newRanges[idx].end = e.target.value;
                        setIpRanges(newRanges);
                     }} />
                     <Btn v="d" onClick={() => setIpRanges(ipRanges.filter((_, i) => i !== idx))}>X</Btn>
                  </div>
               ))}
               <Btn type="button" onClick={() => setIpRanges([...ipRanges, {start:"", end:""}])} v="b">+ Adicionar Faixa</Btn>
            </div>

            <Btn submit>Salvar Configurações</Btn>
        </form>
    );
}`;

if(code.includes('function AddFarmForm({ctx, onClose}) {')) {
    code = code.replace(addFarmFormRegex, addFarmFormReplacement);
}

fs.writeFileSync('src/App.jsx', code, 'utf8');
console.log("REFACTORED DATACENTERPAGE, ADDFARMFORM, AND CAMERA BUTTON!");
