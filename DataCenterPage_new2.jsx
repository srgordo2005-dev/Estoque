function DataCenterPage({ctx}) {
    const {data, setModal, user, farmMachines, setFarmMachines, farmsConfig, setFarmsConfig} = ctx;
    
    // We will assume the default size is 10 rows (vãos) x 10 cols (máquinas)
    // Later this could be dynamic per farm.
    
    const [selectedFarm, setSelectedFarm] = useState("Fazenda Principal");
    const [viewMode, setViewMode] = useState("th"); // 'th', 'temp', 'uptime', 'status'
    
    // Derived from data
    const farmData = farmMachines.filter(m => (m.location || "Fazenda Principal") === selectedFarm);
    
    const getMachine = (vao, slot) => {
        return farmData.find(m => m.shelf === String(vao) && m.notes === String(slot));
    };

    const handleBoxClick = (vao, slot) => {
        const m = getMachine(vao, slot);
        if (m) {
            setModal({
                title: `Detalhes da Máquina - Vão ${vao} / Posição ${slot}`,
                content: (
                    <div style={{display:'flex', flexDirection:'column', gap:10}}>
                        <div style={{fontWeight:800, fontSize:18, color:C.blue}}>{m.ip}</div>
                        <div style={{background:C.card2, padding:10, borderRadius:8}}>
                            <div><strong>Modelo:</strong> {m.model || '-'}</div>
                            <div><strong>SN:</strong> {m.sn || '-'}</div>
                            <div><strong>Status:</strong> {m.status || '-'}</div>
                            <div><strong>Hash Rate:</strong> {m.hashrate ? m.hashrate.toFixed(1) + ' TH/s' : '0 TH/s'}</div>
                            <div><strong>Temperatura:</strong> {m.temp ? m.temp + '°C' : '-'}</div>
                            <div><strong>Uptime:</strong> {m.uptime ? formatUptime(m.uptime) : '-'}</div>
                            <div style={{marginTop:10, fontSize:12, color:C.subtle}}>
                                Clique duplo na caixa para abrir o painel web.
                            </div>
                        </div>
                        <Btn onClick={() => {
                            const newMachines = farmMachines.filter(x => x.id !== m.id);
                            setFarmMachines(newMachines);
                            setModal(null);
                        }} style={{background:C.red, color:"#fff"}}>Remover da Fazenda</Btn>
                    </div>
                )
            });
        } else {
            // Add new machine to this slot
            let newIP = prompt(`Qual o IP da máquina para o Vão ${vao}, Posição ${slot}?`);
            if (newIP) {
                const newMachine = {
                    id: Date.now().toString(),
                    location: selectedFarm,
                    shelf: String(vao),
                    notes: String(slot),
                    ip: newIP,
                    status: 'unknown',
                    temp: 0,
                    hashrate: 0,
                    uptime: 0,
                    model: '',
                    sn: ''
                };
                setFarmMachines([...farmMachines, newMachine]);
            }
        }
    };

    const handleDoubleClick = (vao, slot) => {
        const m = getMachine(vao, slot);
        if (m && m.ip) {
            window.open(`http://${m.ip}`, '_blank');
        }
    };

    // Calculate dynamic rows/cols based on max found, or default 10x10
    let maxVao = 10;
    let maxSlot = 10;
    farmData.forEach(m => {
        const v = parseInt(m.shelf) || 0;
        const s = parseInt(m.notes) || 0;
        if(v > maxVao) maxVao = v;
        if(s > maxSlot) maxSlot = s;
    });

    const rows = Array.from({length: maxVao}, (_, i) => i + 1);
    const cols = Array.from({length: maxSlot}, (_, i) => i + 1);

    const renderBoxContent = (m) => {
        if (!m) return <div style={{opacity:0.3, fontSize:10}}>Vazio</div>;
        if (m.status === 'error' || m.status === 'abnormal') return <span style={{fontSize:18}}>⚠️</span>;
        
        switch (viewMode) {
            case 'th': return <div style={{fontWeight:800}}>{m.hashrate ? m.hashrate.toFixed(0) + 'T' : '0T'}</div>;
            case 'temp': return <div style={{fontWeight:800, color: m.temp > 85 ? C.red : (m.temp > 75 ? '#ff9800' : 'inherit')}}>{m.temp ? m.temp + '°' : '-'}</div>;
            case 'uptime': return <div style={{fontWeight:800, fontSize:11}}>{m.uptime ? Math.floor(m.uptime / 60) + 'm' : '-'}</div>;
            default: return <div style={{fontWeight:800, fontSize:11}}>{m.ip.split('.').pop()}</div>;
        }
    };

    const getBoxColor = (m) => {
        if (!m) return C.card2;
        if (m.status === 'offline') return '#555';
        if (m.temp > 85 || (m.hashrate === 0 && m.status !== 'unknown')) return C.red;
        if (m.temp > 75) return '#ff9800';
        if (m.hashrate > 0) return C.green;
        return C.blue; // default active
    };

    return (
        <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 80px)", background: C.bg, padding: 20}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 20}}>
                <div style={{fontWeight:900, fontSize:22, color:C.blue, display:'flex', alignItems:'center', gap:10}}>
                   <span style={{fontSize:28}}>🏢</span> Fazenda
                </div>
                
                <div style={{display:'flex', gap:10, alignItems:'center'}}>
                    <select value={selectedFarm} onChange={e=>setSelectedFarm(e.target.value)} style={{background:C.card, border:`1px solid ${C.border}`, color:C.text, borderRadius:8, padding:'10px 14px', fontWeight:800}}>
                        <option value="Fazenda Principal">Fazenda Principal</option>
                        {farmsConfig?.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                    </select>

                    <div style={{background:C.card, borderRadius:8, display:'flex', overflow:'hidden', border:`1px solid ${C.border}`}}>
                        <button onClick={()=>setViewMode('th')} style={{background:viewMode==='th'?C.blue:'transparent', color:viewMode==='th'?'#fff':C.text, border:'none', padding:'10px 14px', fontWeight:800, cursor:'pointer'}}>TH/s</button>
                        <button onClick={()=>setViewMode('temp')} style={{background:viewMode==='temp'?C.blue:'transparent', color:viewMode==='temp'?'#fff':C.text, border:'none', padding:'10px 14px', fontWeight:800, cursor:'pointer'}}>Temp</button>
                        <button onClick={()=>setViewMode('uptime')} style={{background:viewMode==='uptime'?C.blue:'transparent', color:viewMode==='uptime'?'#fff':C.text, border:'none', padding:'10px 14px', fontWeight:800, cursor:'pointer'}}>Uptime</button>
                        <button onClick={()=>setViewMode('ip')} style={{background:viewMode==='ip'?C.blue:'transparent', color:viewMode==='ip'?'#fff':C.text, border:'none', padding:'10px 14px', fontWeight:800, cursor:'pointer'}}>Fim IP</button>
                    </div>
                </div>
            </div>

            <div style={{flex:1, overflow:"auto", background:C.card, borderRadius:12, border:`1px solid ${C.border}`, boxShadow:'0 4px 20px rgba(0,0,0,0.2)', padding: 20, display:'flex', flexDirection:'column', alignItems:'center'}}>
                {rows.map(vao => (
                    <div key={vao} style={{display:'flex', gap:10, marginBottom:10}}>
                        <div style={{width: 40, display:'flex', alignItems:'center', justifyContent:'flex-end', fontWeight:800, color:C.subtle}}>
                            V{vao}
                        </div>
                        {cols.map(slot => {
                            const m = getMachine(vao, slot);
                            return (
                                <div 
                                    key={slot} 
                                    onClick={() => handleBoxClick(vao, slot)}
                                    onDoubleClick={() => handleDoubleClick(vao, slot)}
                                    style={{
                                        width: 50, height: 50, 
                                        background: getBoxColor(m),
                                        borderRadius: 8, 
                                        display:'flex', alignItems:'center', justifyContent:'center',
                                        cursor:'pointer',
                                        color: '#fff',
                                        boxShadow: m ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                                        border: m ? 'none' : `1px dashed ${C.border}`,
                                        userSelect: 'none'
                                    }}
                                    title={m ? `Vão ${vao} - Slot ${slot} (${m.ip})` : `Vão ${vao} - Slot ${slot} (Vazio)`}
                                >
                                    {renderBoxContent(m)}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
