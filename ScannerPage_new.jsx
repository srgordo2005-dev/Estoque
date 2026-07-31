function ScannerPage({ctx}) {
    const {data, setActiveTab, setSession, setMode, user} = ctx;
    
    const savedIps = user?.btcToolsIps ? user.btcToolsIps : ["192.168.1.1-255"];
    const [btcScanIpRange, setBtcScanIpRange] = useState(savedIps[0] || "");
    const [btcScanResults, setBtcScanResults] = useState([]);
    const [scanning, setScanning] = useState(false);
    
    const doScan = async () => {
        if (!btcScanIpRange) return alert("Preencha a faixa de IP. Ex: 192.168.1.1-255");
        setScanning(true);
        setBtcScanResults([]);
        try {
            const res = await fetch(`http://localhost:3001/api/scan-range`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: btcScanIpRange.split('-')[0], end: btcScanIpRange.split('-')[0].split('.').slice(0,3).join('.') + '.' + btcScanIpRange.split('-')[1] })
            });
            if (res.ok) {
                const data = await res.json();
                setBtcScanResults(data.miners || []);
            } else {
                alert("Erro ao executar scanner no servidor local.");
            }
        } catch(e) {
            alert("Servidor local não respondeu: " + e.message + "\n\nCertifique-se que o App Desktop está rodando!");
        }
        setScanning(false);
    };

    const handleTestar = (m) => {
        // Prepare session data for Test page
        const newSession = {
            ip: m.ip,
            machineSN: m.sn || "",
            model: m.model || "",
            slotsFound: m.slots ? m.slots.filter(s => s).length : 0,
            adminNotes: []
        };
        setSession(newSession);
        
        // Also we should ideally inject the hashboard SNs into the test tab context. 
        // We'll set the active tab to Teste.
        // Wait, TestePage relies on \`session\`. We can pass hashboard SNs through session too, 
        // e.g. session.slots = m.slots
        newSession.slots = m.slots || [null, null, null];
        
        setActiveTab('teste');
    };

    return (
        <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 80px)", background: C.bg, padding: 20}}>
            <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 20}}>
                <div style={{fontWeight:900, fontSize:22, color:C.blue, display:'flex', alignItems:'center', gap:10}}>
                   <span style={{fontSize:28}}>📡</span> Scanner Geral 
                </div>
                <div style={{display:'flex', gap:10, alignItems:'center'}}>
                    <input type="text" value={btcScanIpRange} onChange={e=>setBtcScanIpRange(e.target.value)} style={{background:C.card, border:`1px solid ${C.border}`, color:C.text, borderRadius:8, padding:'10px 14px', width: 250}} placeholder="Faixa de IP (Ex: 192.168.1.1-255)"/>
                    <Btn onClick={doScan} disabled={scanning} style={{background:C.blue, color:"#fff", padding:"10px 24px", fontWeight:800}}>
                        {scanning ? "Escaneando..." : "Scan"}
                    </Btn>
                </div>
            </div>

            <div style={{flex:1, overflow:"auto", background:C.card, borderRadius:12, border:`1px solid ${C.border}`, boxShadow:'0 4px 20px rgba(0,0,0,0.2)'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:13, textAlign:'left'}}>
                    <thead style={{position:'sticky', top:0, background:C.card2, zIndex:10}}>
                        <tr style={{borderBottom:`1px solid ${C.border}`, color:C.accent}}>
                            <th style={{padding:16, fontWeight:800}}>IP</th>
                            <th style={{padding:16, fontWeight:800}}>Status</th>
                            <th style={{padding:16, fontWeight:800}}>Modelo</th>
                            <th style={{padding:16, fontWeight:800}}>Hash Rate</th>
                            <th style={{padding:16, fontWeight:800}}>Temp.</th>
                            <th style={{padding:16, fontWeight:800}}>Uptime</th>
                            <th style={{padding:16, fontWeight:800}}>SN Controladora</th>
                            <th style={{padding:16, fontWeight:800}}>Hashboards</th>
                            <th style={{padding:16, fontWeight:800}}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {btcScanResults.length === 0 ? (
                            <tr>
                                <td colSpan="9" style={{textAlign:'center', padding:60, color:C.muted}}>
                                    {scanning ? "Procurando dispositivos (ignorando DVRs)..." : "Insira uma faixa de IP e clique em Scan."}
                                </td>
                            </tr>
                        ) : (
                            btcScanResults.map((m, idx) => (
                                <tr key={idx} style={{borderBottom:`1px solid ${C.border}`, transition:'background 0.2s'}} onMouseOver={e=>e.currentTarget.style.background=C.card2} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                                    <td style={{padding:16}}>
                                        <a href={`http://${m.ip}`} target="_blank" rel="noreferrer" style={{color:C.blue, textDecoration:'none', fontWeight:800}}>{m.ip}</a>
                                    </td>
                                    <td style={{padding:16}}><span style={{background: m.status === 'mining' ? 'rgba(76,175,80,0.1)' : 'rgba(244,67,54,0.1)', color: m.status === 'mining' ? C.green : C.red, padding:'4px 8px', borderRadius:4, fontWeight:800, fontSize:11}}>● {m.status === 'mining' ? 'Normal' : 'Erro'}</span></td>
                                    <td style={{padding:16, color:C.text, fontWeight:600}}>{m.model || '-'}</td>
                                    <td style={{padding:16, fontWeight:800, color:C.green}}>{m.hashrate ? m.hashrate.toFixed(1) + ' TH/s' : '0 TH/s'}</td>
                                    <td style={{padding:16, color: m.temp > 85 ? C.red : (m.temp > 75 ? '#ff9800' : C.text), fontWeight: m.temp > 75 ? 800 : 400}}>
                                        {m.temp ? m.temp + '°C' : '-'}
                                    </td>
                                    <td style={{padding:16, color:C.subtle}}>{formatUptime(m.uptime)}</td>
                                    <td style={{padding:16, color:C.subtle, fontFamily:'monospace', fontSize:11}}>{m.sn || '-'}</td>
                                    <td style={{padding:16, color:C.subtle}}>
                                        {m.slots ? m.slots.filter(s=>s).length + ' lidas' : '-'}
                                    </td>
                                    <td style={{padding:16}}>
                                        <Btn onClick={() => handleTestar(m)} style={{background:C.blue, color:"#fff", padding:"6px 12px", fontSize:11, fontWeight:800}}>
                                            🧪 Testar
                                        </Btn>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}