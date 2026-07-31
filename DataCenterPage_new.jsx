function DataCenterPage({ctx}) {
    const {data, mutate, setModal, user} = ctx;
    
    const [viewType, setViewType] = useState("general_btc_tools"); // Default to the scanner
    const savedIps = user?.btcToolsIps ? user.btcToolsIps : ["192.168.1.1-255"];
    const [btcScanIpRange, setBtcScanIpRange] = useState(savedIps[0] || "");
    const [btcScanResults, setBtcScanResults] = useState([]);
    const [scanning, setScanning] = useState(false);
    
    // Pool configs
    const [pool1, setPool1] = useState("");
    const [pool2, setPool2] = useState("");
    const [pool3, setPool3] = useState("");
    const [workerSuffix, setWorkerSuffix] = useState("IP"); // IP, No Change, Empty

    // Selection
    const [selectedIPs, setSelectedIPs] = useState(new Set());

    const toggleIP = (ip) => {
        const s = new Set(selectedIPs);
        if(s.has(ip)) s.delete(ip);
        else s.add(ip);
        setSelectedIPs(s);
    };

    const toggleAll = () => {
        if(selectedIPs.size === btcScanResults.length && btcScanResults.length > 0) {
            setSelectedIPs(new Set());
        } else {
            setSelectedIPs(new Set(btcScanResults.map(m => m.ip)));
        }
    };

    const doScan = async () => {
        if (!btcScanIpRange) return alert("Preencha a faixa de IP. Ex: 192.168.1.1-255");
        setScanning(true);
        setBtcScanResults([]);
        try {
            // Usa o helper local
            const res = await fetch(\`http://localhost:3001/api/scan-range\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start: btcScanIpRange.split('-')[0], end: btcScanIpRange.split('-')[0].split('.').slice(0,3).join('.') + '.' + btcScanIpRange.split('-')[1] }) // Simplified parser
            });
            if (res.ok) {
                const data = await res.json();
                setBtcScanResults(data.miners || []);
            } else {
                alert("Erro ao executar scanner no servidor local.");
            }
        } catch(e) {
            alert("Servidor local (localhost:3001) não respondeu: " + e.message + "\\n\\nCertifique-se que o App Desktop está rodando!");
        }
        setScanning(false);
    };

    return (
        <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 120px)"}}>
            {/* TOP BAR / LOGO */}
            <div style={{padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:\`1px solid \${C.border}\`}}>
                <div style={{fontWeight:900, fontSize:18, color:C.blue, display:'flex', alignItems:'center', gap:10}}>
                   <span style={{fontSize:24}}>⚡</span> SCANER ASIC 
                </div>
                <div style={{fontSize:12, color:C.subtle}}>
                   Insira as faixas de IP e use os botões para controlar suas máquinas em lote.
                </div>
            </div>

            <div style={{display:"flex", flex:1, overflow:"hidden"}}>
                {/* LEFT SIDEBAR (IP RANGES) */}
                <div style={{width: 250, borderRight:\`1px solid \${C.border}\`, background:C.bg, display:"flex", flexDirection:"column"}}>
                    <div style={{padding: 10, borderBottom:\`1px solid \${C.border}\`, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                        <div style={{fontWeight:800, fontSize:12, color:C.accent}}>FAIXAS DE IP (Ranges)</div>
                        <div style={{display:'flex', gap:4}}>
                            <button style={{background:C.card2, border:'none', color:C.text, borderRadius:4, width:24, height:24, cursor:'pointer'}}>+</button>
                            <button style={{background:C.card2, border:'none', color:C.text, borderRadius:4, width:24, height:24, cursor:'pointer'}}>-</button>
                        </div>
                    </div>
                    <div style={{padding: 10, flex:1, overflowY:"auto"}}>
                        <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12}}>
                            <input type="checkbox" checked readOnly />
                            <input type="text" value={btcScanIpRange} onChange={e=>setBtcScanIpRange(e.target.value)} style={{background:'none', border:\`1px solid \${C.border}\`, color:C.text, flex:1, fontSize:12, padding:'2px 4px'}} placeholder="192.168.1.1-255"/>
                        </div>
                    </div>
                </div>

                {/* MAIN CONTENT AREA */}
                <div style={{flex:1, display:"flex", flexDirection:"column", overflow:"hidden"}}>
                    {/* BUTTONS BAR */}
                    <div style={{padding: 10, display:"flex", gap:10, borderBottom:\`1px solid \${C.border}\`, background:C.card, flexWrap:"wrap"}}>
                        <Btn onClick={doScan} style={{background:C.blue, color:"#fff", padding:"6px 20px", fontWeight:800}}>
                            {scanning ? "Escaneando..." : "Scan"}
                        </Btn>
                        <Btn onClick={doScan} style={{background:C.card2, color:C.text, padding:"6px 20px"}}>Monitor</Btn>
                        <Btn style={{background:C.card2, color:C.text, padding:"6px 20px"}}>Config All</Btn>
                        <Btn style={{background:C.card2, color:C.text, padding:"6px 20px"}}>Config Selected</Btn>
                        <Btn style={{background:C.red, color:"#fff", padding:"6px 20px"}}>Reboot All</Btn>
                        <Btn style={{background:C.card2, color:C.text, padding:"6px 20px"}}>Reboot Selected</Btn>
                        <Btn style={{background:C.card2, color:C.text, padding:"6px 20px"}}>Export</Btn>
                    </div>

                    {/* POOL CONFIG BAR */}
                    <div style={{padding: 10, borderBottom:\`1px solid \${C.border}\`, background:C.bg, fontSize:12, display:"flex", flexDirection:"column", gap:8}}>
                        {[1,2,3].map(n => (
                            <div key={n} style={{display:"flex", alignItems:"center", gap:10}}>
                                <input type="checkbox" />
                                <span style={{width: 50}}>Pool {n}:</span>
                                <input type="text" placeholder="stratum+tcp://pool..." style={{flex:1, background:C.card2, border:\`1px solid \${C.border}\`, color:C.text, padding:"4px 8px"}} />
                                <span style={{width: 60, textAlign:'right'}}>Worker:</span>
                                <input type="text" placeholder="Nome" style={{flex:0.5, background:C.card2, border:\`1px solid \${C.border}\`, color:C.text, padding:"4px 8px"}} />
                                <span style={{width: 40, textAlign:'right'}}>PWD:</span>
                                <input type="text" placeholder="123" style={{width:80, background:C.card2, border:\`1px solid \${C.border}\`, color:C.text, padding:"4px 8px"}} />
                            </div>
                        ))}
                    </div>

                    {/* TABLE AREA */}
                    <div style={{flex:1, overflow:"auto", background:C.card2}}>
                        <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, textAlign:'left'}}>
                            <thead style={{position:'sticky', top:0, background:C.bg, zIndex:10}}>
                                <tr style={{borderBottom:\`1px solid \${C.border}\`, color:C.accent}}>
                                    <th style={{padding:10, width:40}}><input type="checkbox" checked={selectedIPs.size === btcScanResults.length && btcScanResults.length > 0} onChange={toggleAll}/></th>
                                    <th style={{padding:10}}>IP</th>
                                    <th style={{padding:10}}>Status</th>
                                    <th style={{padding:10}}>Type</th>
                                    <th style={{padding:10}}>Hash Rate RT</th>
                                    <th style={{padding:10}}>Hash Rate avg</th>
                                    <th style={{padding:10}}>Temperature</th>
                                    <th style={{padding:10}}>Fan Speed</th>
                                    <th style={{padding:10}}>Elapsed</th>
                                    <th style={{padding:10}}>Pool 1</th>
                                </tr>
                            </thead>
                            <tbody>
                                {btcScanResults.length === 0 ? (
                                    <tr>
                                        <td colSpan="10" style={{textAlign:'center', padding:40, color:C.muted}}>
                                            {scanning ? "Procurando dispositivos (pulando DVRs)..." : "Clique em Scan para iniciar a varredura na rede."}
                                        </td>
                                    </tr>
                                ) : (
                                    btcScanResults.map((m, idx) => (
                                        <tr key={idx} style={{borderBottom:\`1px solid \${C.border}\`, background: selectedIPs.has(m.ip) ? 'rgba(255,215,0,0.1)' : 'transparent'}}>
                                            <td style={{padding:10}}><input type="checkbox" checked={selectedIPs.has(m.ip)} onChange={()=>toggleIP(m.ip)}/></td>
                                            <td style={{padding:10, fontWeight:800, color:C.text}}>{m.ip}</td>
                                            <td style={{padding:10}}><span style={{color: m.status === 'mining' ? C.green : C.red, fontWeight:800}}>● {m.status === 'mining' ? 'Normal' : 'Abnormal'}</span></td>
                                            <td style={{padding:10, color:C.text}}>{m.model || '-'}</td>
                                            <td style={{padding:10, fontWeight:800, color:C.green}}>{m.hashrate ? m.hashrate.toFixed(1) + ' TH/s' : '0 TH/s'}</td>
                                            <td style={{padding:10, fontWeight:800, color:C.green}}>{m.hashrate ? m.hashrate.toFixed(1) + ' TH/s' : '0 TH/s'}</td>
                                            <td style={{padding:10, color: m.temp > 80 ? C.red : C.text}}>{m.temp ? m.temp + '°C' : '-'}</td>
                                            <td style={{padding:10, color:C.subtle}}>{m.fan ? m.fan + '%' : '-'}</td>
                                            <td style={{padding:10, color:C.subtle}}>{m.uptime ? Math.floor(m.uptime / 60) + 'm' : '-'}</td>
                                            <td style={{padding:10, fontSize:11, color:C.subtle}}>{m.worker || m.pool || '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
