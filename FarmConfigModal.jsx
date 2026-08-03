function FarmConfigModal({ctx, onClose}) {
    const {farmsConfig = [], setFarmsConfig, data, user} = ctx;
    
    // Only Admin 019 can access
    if (user?.code !== "019") {
        return (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center'}}>
                <div style={{background:C.card, padding:20, borderRadius:12}}>Acesso Negado</div>
            </div>
        );
    }

    const [farms, setFarms] = useState(farmsConfig.length > 0 ? farmsConfig : [
        { id: "f1", name: "Fazenda Principal", ipRange: "192.168.1.1-255", tgToken: "", tgChatId: "", interval: 1, allowedUsers: [], wgConfig: "" }
    ]);

    const handleSave = () => {
        setFarmsConfig(farms);
        
        // Also send to local-helper if connected
        fetch('http://localhost:3001/api/farms-config', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({farms})
        }).catch(err => console.error("Helper não conectado", err));

        alert("Configurações salvas!");
        onClose();
    };

    const addFarm = () => {
        setFarms([...farms, { id: Date.now().toString(), name: "Nova Fazenda", ipRange: "", tgToken: "", tgChatId: "", interval: 1, allowedUsers: [], wgConfig: "" }]);
    };

    const updateFarm = (id, field, value) => {
        setFarms(farms.map(f => f.id === id ? {...f, [field]: value} : f));
    };

    const removeFarm = (id) => {
        if(confirm("Remover esta fazenda?")) {
            setFarms(farms.filter(f => f.id !== id));
        }
    };

    const toggleUser = (farmId, userId) => {
        setFarms(farms.map(f => {
            if (f.id === farmId) {
                const isSelected = f.allowedUsers.includes(userId);
                return {...f, allowedUsers: isSelected ? f.allowedUsers.filter(u => u !== userId) : [...f.allowedUsers, userId]};
            }
            return f;
        }));
    };

    const handleVpnConnect = (farm) => {
        fetch('http://localhost:3001/api/vpn-connect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ farmId: farm.id, wgConfig: farm.wgConfig })
        })
        .then(res => res.json())
        .then(data => {
            if(data.success) alert(`VPN ${farm.name} conectada!`);
            else alert("Erro: " + data.error);
        }).catch(err => alert("Erro ao conectar: " + err));
    };

    const handleVpnDisconnect = (farm) => {
        fetch('http://localhost:3001/api/vpn-disconnect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ farmId: farm.id })
        })
        .then(res => res.json())
        .then(data => {
            if(data.success) alert(`VPN ${farm.name} desconectada!`);
            else alert("Erro: " + data.error);
        }).catch(err => alert("Erro ao desconectar: " + err));
    };

    return (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
            <div style={{background:C.bg, width:'100%', maxWidth: 800, maxHeight:'90vh', borderRadius:16, border:`1px solid ${C.border}`, display:'flex', flexDirection:'column', boxShadow:'0 10px 40px rgba(0,0,0,0.5)'}}>
                <div style={{padding:20, borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div style={{fontWeight:900, fontSize:20, color:C.blue}}>⚙️ Configuração de Fazendas (Admin 019)</div>
                    <button onClick={onClose} style={{background:'none', border:'none', color:C.red, fontSize:20, cursor:'pointer'}}>✖</button>
                </div>

                <div style={{flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:20}}>
                    {farms.map(f => (
                        <div key={f.id} style={{background:C.card, padding:20, borderRadius:12, border:`1px solid ${C.border}`}}>
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:15}}>
                                <input 
                                    value={f.name} 
                                    onChange={e => updateFarm(f.id, 'name', e.target.value)}
                                    style={{background:'none', border:'none', color:C.accent, fontSize:18, fontWeight:900, borderBottom:`1px dashed ${C.subtle}`, width:'50%'}} 
                                />
                                <button onClick={() => removeFarm(f.id)} style={{background:C.red, color:'#fff', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer'}}>Remover</button>
                            </div>
                            
                            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:15, marginBottom:15}}>
                                <div>
                                    <label style={{fontSize:12, color:C.subtle, fontWeight:800}}>IP Range (Ex: 10.0.0.1-255)</label>
                                    <input value={f.ipRange} onChange={e => updateFarm(f.id, 'ipRange', e.target.value)} style={{width:'100%', background:C.bg, border:`1px solid ${C.border}`, padding:10, borderRadius:6, color:C.text, marginTop:5}} />
                                </div>
                                <div>
                                    <label style={{fontSize:12, color:C.subtle, fontWeight:800}}>Intervalo Telegram (Horas)</label>
                                    <select value={f.interval} onChange={e => updateFarm(f.id, 'interval', parseInt(e.target.value))} style={{width:'100%', background:C.bg, border:`1px solid ${C.border}`, padding:10, borderRadius:6, color:C.text, marginTop:5}}>
                                        <option value={1}>1 Hora</option>
                                        <option value={2}>2 Horas</option>
                                        <option value={6}>6 Horas</option>
                                        <option value={12}>12 Horas</option>
                                        <option value={24}>24 Horas</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{fontSize:12, color:C.subtle, fontWeight:800}}>Telegram Bot Token</label>
                                    <input value={f.tgToken} onChange={e => updateFarm(f.id, 'tgToken', e.target.value)} style={{width:'100%', background:C.bg, border:`1px solid ${C.border}`, padding:10, borderRadius:6, color:C.text, marginTop:5}} placeholder="00000:AAAAA..." />
                                </div>
                                <div>
                                    <label style={{fontSize:12, color:C.subtle, fontWeight:800}}>Telegram Chat ID</label>
                                    <input value={f.tgChatId} onChange={e => updateFarm(f.id, 'tgChatId', e.target.value)} style={{width:'100%', background:C.bg, border:`1px solid ${C.border}`, padding:10, borderRadius:6, color:C.text, marginTop:5}} placeholder="-1000..." />
                                </div>
                            </div>
                            
                            <div style={{marginBottom:15}}>
                                <label style={{fontSize:12, color:C.subtle, fontWeight:800}}>Configuração WireGuard (wg0.conf)</label>
                                <textarea value={f.wgConfig || ""} onChange={e => updateFarm(f.id, 'wgConfig', e.target.value)} style={{width:'100%', height:80, background:C.bg, border:`1px solid ${C.border}`, padding:10, borderRadius:6, color:C.text, marginTop:5, fontFamily:'monospace', fontSize:11}} placeholder="[Interface]\nPrivateKey = ...\n\n[Peer]\nPublicKey = ..."></textarea>
                                <div style={{display:'flex', gap:10, marginTop:10}}>
                                    <button onClick={() => handleVpnConnect(f)} style={{background:C.blue, color:'#fff', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700}}>🔗 Conectar VPN</button>
                                    <button onClick={() => handleVpnDisconnect(f)} style={{background:C.card2, color:C.text, border:`1px solid ${C.border}`, padding:'6px 12px', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700}}>🔌 Desconectar</button>
                                </div>
                            </div>

                            {/* Permissões de Usuário */}
                            <div style={{background:C.bg, padding:15, borderRadius:8, border:`1px solid ${C.border}`}}>
                                <label style={{fontSize:12, color:C.accent, fontWeight:800, display:'block', marginBottom:10}}>Usuários com Acesso (Visualização)</label>
                                <div style={{display:'flex', flexWrap:'wrap', gap:10}}>
                                    {data.employees?.map(emp => (
                                        <button 
                                            key={emp.code}
                                            onClick={() => toggleUser(f.id, emp.code)}
                                            style={{
                                                background: f.allowedUsers.includes(emp.code) ? C.blue : C.card2,
                                                color: f.allowedUsers.includes(emp.code) ? '#fff' : C.text,
                                                border: `1px solid ${f.allowedUsers.includes(emp.code) ? C.blue : C.border}`,
                                                padding: '6px 12px',
                                                borderRadius: 20,
                                                cursor: 'pointer',
                                                fontSize: 12
                                            }}
                                        >
                                            {emp.name} ({emp.code})
                                        </button>
                                    ))}
                                </div>
                                <div style={{fontSize:10, color:C.subtle, marginTop:10}}>*O Admin 019 sempre tem acesso total.</div>
                            </div>
                        </div>
                    ))}
                    
                    <button onClick={addFarm} style={{background:C.card2, color:C.text, border:`1px dashed ${C.border}`, padding:15, borderRadius:12, cursor:'pointer', fontWeight:800}}>+ Adicionar Nova Fazenda</button>
                </div>

                <div style={{padding:20, borderTop:`1px solid ${C.border}`, display:'flex', justifyContent:'flex-end'}}>
                    <Btn onClick={handleSave} style={{background:C.blue, color:'#fff', padding:'10px 30px', fontWeight:900, fontSize:16}}>SALVAR CONFIGURAÇÕES</Btn>
                </div>
            </div>
        </div>
    );
}
