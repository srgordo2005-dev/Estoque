function BenchConnectionPanel({ctx, session, setMacInput, loadMachine, saveSession, doSubmit, triggerToast}) {
    const [listening, setListening] = useState(false);
    const [lastCapturedIP, setLastCapturedIP] = useState(session?.ip || "");
    const [blinkOn, setBlinkOn] = useState(false);
    const [isTakingPrint, setIsTakingPrint] = useState(false);
    const [targetUptimeHours, setTargetUptimeHours] = useState(session?.targetUptimeHours || 3);
    const [autoSubmitTriggered, setAutoSubmitTriggered] = useState(false);

    const startManualCapture = async () => {
        try {
            await fetch('http://localhost:3001/api/ipreport?clear=true');
        } catch(e) {}
        setListening(true);
    };

    // Auto-fill board SNs, model, and components from miner info
    const applyMinerDetailsToSession = (info, ip) => {
        if (!session || !saveSession) return;
        let updatedSlots = [...session.slots];
        let hasChanges = false;
        
        if (info.slots && Array.isArray(info.slots)) {
            info.slots.forEach((boardSN, idx) => {
                if (boardSN && idx < 3) {
                    const cleanSN = String(boardSN).toUpperCase().trim();
                    if (cleanSN && updatedSlots[idx].hashSN !== cleanSN) {
                        updatedSlots[idx] = { 
                            ...updatedSlots[idx], 
                            hashSN: cleanSN,
                            status: info.status === 'mining' ? 'good' : (updatedSlots[idx].status || 'good')
                        };
                        hasChanges = true;
                    }
                }
            });
        }

        let updatedModel = session.model;
        if (info.model && info.model.trim()) {
            const detected = info.model.trim();
            const matched = ctx?.allModels?.()?.find(m => m.m.toLowerCase() === detected.toLowerCase()) || 
                            ctx?.allModels?.()?.find(m => detected.toLowerCase().includes(m.m.toLowerCase()));
            if (matched) {
                updatedModel = matched.m;
                hasChanges = true;
            } else if (detected) {
                updatedModel = detected;
                hasChanges = true;
            }
        }

        const newSession = {
            ...session,
            ip: ip || session.ip,
            model: updatedModel,
            th: ctx?.gTH?.(updatedModel) || session.th,
            slots: updatedSlots,
            controladora: info.status === 'mining' ? 'ON' : (session.controladora || 'ON'),
            fonte: info.status === 'mining' ? 'ON' : (session.fonte || 'ON'),
            fans: info.status === 'mining' ? 'ON' : (session.fans || 'ON'),
            updatedAt: stamp()
        };
        
        if (hasChanges || session.ip !== ip) {
            saveSession(newSession);
        }
    };

    const fetchAndApplyMinerInfo = async (ip) => {
        if (!ip) return;
        try {
            const infoRes = await fetch(`http://localhost:3001/api/miner-info?ip=${ip}`);
            if (infoRes.ok) {
                const info = await infoRes.json();
                if (info.sn) {
                    setMacInput(info.sn);
                    loadMachine(info.sn);
                }
                applyMinerDetailsToSession(info, ip);
                return info;
            }
        } catch(e) {}
        return null;
    };

    useEffect(() => {
        if (!listening) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch('http://localhost:3001/api/ipreport');
                if (!res.ok) return;
                const reports = await res.json();
                if (reports && reports.length > 0) {
                    const latest = reports[0];
                    setListening(false);
                    setLastCapturedIP(latest.ip);
                    
                    const info = await fetchAndApplyMinerInfo(latest.ip);
                    const slotsFound = info?.slots?.filter(Boolean)?.length || 0;
                    alert(`✅ IP REPORT CAPTURADO!\n🌐 IP: ${latest.ip}\n${slotsFound > 0 ? `📋 ${slotsFound} HASH SNs importados automaticamente!` : ''}`);
                }
            } catch(e) {}
        }, 1000);
        return () => clearInterval(interval);
    }, [listening, loadMachine, saveSession, session, setMacInput]);

    const capturePrintAndUpload = async (targetIP) => {
        const ip = targetIP || session?.ip || lastCapturedIP;
        if (!ip) {
            alert("Informe o IP da máquina na bancada para tirar o print.");
            return null;
        }
        setIsTakingPrint(true);
        try {
            const res = await fetch('http://localhost:3001/api/screenshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.image) {
                    // Upload screenshot to Google Drive
                    const driveUrl = await ctx.uploadPhoto(data.image, `testes/print_${session?.machineSN || ip}_${uid()}.jpg`);
                    if (driveUrl && session && saveSession) {
                        saveSession({ ...session, photoKey: driveUrl, testPhoto: driveUrl, updatedAt: stamp() });
                    }
                    setIsTakingPrint(false);
                    return driveUrl || data.image;
                }
            }
        } catch(e) {
            console.error("Erro ao tirar print da tela:", e);
        }
        setIsTakingPrint(false);
        return null;
    };

    // Live Uptime Check & Auto-Submit on Target Reached (e.g., 3 Hours)
    const [currentUptimeSec, setCurrentUptimeSec] = useState(0);
    useEffect(() => {
        const ip = session?.ip || lastCapturedIP;
        if (!ip) return;

        const checkUptime = async () => {
            try {
                const r = await fetch(`http://localhost:3001/api/miner-info?ip=${ip}`);
                if (r.ok) {
                    const info = await r.json();
                    if (info.uptime) {
                        setCurrentUptimeSec(info.uptime);
                        const uptimeHours = info.uptime / 3600;
                        
                        // If target uptime is reached and autoSubmit not yet triggered
                        const isAutoOn = session?.autoEnabled !== false;
                        if (isAutoOn && uptimeHours >= targetUptimeHours && !autoSubmitTriggered && session && doSubmit) {
                            setAutoSubmitTriggered(true);
                            console.log(`Target Uptime of ${targetUptimeHours}h reached (${uptimeHours.toFixed(2)}h). Triggering auto-print & review submit.`);
                            
                            // 1. Take screenshot
                            const photoUrl = await capturePrintAndUpload(ip);
                            
                            // 2. Prepare automatic slots & components
                            const autoSlots = session.slots.map(s => ({
                                ...s,
                                status: s.status || (s.hashSN ? "good" : "")
                            }));

                            // 3. Submit session to review
                            const updatedSess = {
                                ...session,
                                slots: autoSlots,
                                controladora: session.controladora || "ON",
                                fonte: session.fonte || "ON",
                                fans: session.fans || "ON",
                                isAutomatic: true,
                                autoSubmitted: true,
                                photoKey: photoUrl || session.photoKey,
                                adminNotes: [...(session.adminNotes || []), `⚡ AUTOMÁTICO (${uptimeHours.toFixed(1)}h Uptime / Alvo: ${targetUptimeHours}h)`]
                            };
                            await doSubmit(updatedSess);
                            alert(`🎉 UPTIME DE ${targetUptimeHours}h ALCANÇADO COM SUCESSO!\n\n⚡ Teste marcado como AUTOMÁTICO (3h Uptime).\n📸 Print do Dashboard + Logs salvo.\n✅ Enviada para REVISÃO!\n\n🔌 PODE DESLIGAR A MÁQUINA DA BANCADA AGORA.`);
                        }
                    }
                }
            } catch(e) {}
        };

        checkUptime();
        const interval = setInterval(checkUptime, 15000); // Check every 15s
        return () => clearInterval(interval);
    }, [session?.ip, lastCapturedIP, targetUptimeHours, autoSubmitTriggered, session, doSubmit]);

    const toggleBlink = async () => {
        const ip = session?.ip || lastCapturedIP || prompt("Digite o IP da máquina na bancada para piscar:");
        if (!ip) return;
        try {
            await fetch('http://localhost:3001/api/blink', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ip, firmware: "vnish", on: !blinkOn})
            });
            setBlinkOn(!blinkOn);
        } catch(e) {
            alert("Erro ao acionar pisca: " + e.message);
        }
        if(session && !session.ip) {
            saveSession({...session, ip});
        }
    };

    const [udpErrors, setUdpErrors] = useState([]);
    useEffect(() => {
        const checkUdpDiagnostics = async () => {
            try {
                const res = await fetch('http://localhost:3001/api/ipreport-status');
                if (res.ok) {
                    const status = await res.json();
                    const errors = [];
                    for (const port in status) {
                        if (status[port].startsWith('erro')) {
                            errors.push(`Porta ${port} (${port === '4000' ? 'Bitmain' : 'Whatsminer'}): ${status[port]}`);
                        }
                    }
                    setUdpErrors(errors);
                }
            } catch(e) {}
        };
        checkUdpDiagnostics();
        const interval = setInterval(checkUdpDiagnostics, 6000);
        return () => clearInterval(interval);
    }, []);

    const uptimeHoursCalc = (currentUptimeSec / 3600).toFixed(1);
    const targetUptimeReached = currentUptimeSec / 3600 >= targetUptimeHours;

    return <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12,border:`2px solid ${targetUptimeReached ? C.green : listening ? C.blue : C.border}`}}>
        {udpErrors.length > 0 && (
            <div style={{background: C.red + "22", border: "1px solid " + C.red, color: C.red, borderRadius: 8, padding: 8, fontSize: 11, marginBottom: 10, fontWeight: 700}}>
                ⚠️ Conflito no IP Report local:
                <ul style={{margin:'4px 0 0 16px', padding:0}}>
                    {udpErrors.map(err => <li key={err}>{err}. Feche outros aplicativos de IP Reporter/BTC Tools!</li>)}
                </ul>
            </div>
        )}

        {targetUptimeReached && (
            <div style={{background: C.green + "22", border: "2px solid " + C.green, color: C.green, borderRadius: 10, padding: 12, marginBottom: 12, textAlign: 'center', fontWeight: 900, fontSize: 14}}>
                🎉 MÁQUINA ATINGIU {targetUptimeHours}H DE UPTIME! (Atual: {uptimeHoursCalc}h)<br/>
                📸 Print capturado automaticamente & Enviado para Revisão.<br/>
                <span style={{fontSize: 16, color: '#fff', background: C.green, padding: '4px 12px', borderRadius: 6, display: 'inline-block', marginTop: 6}}>
                    🔌 PODE DESLIGAR A MÁQUINA DA BANCADA
                </span>
            </div>
        )}

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10}}>
           <div>
              <div style={{fontWeight:800, color: listening ? C.blue : C.subtle, fontSize:13}}>
                 {listening ? "📡 AGUARDANDO BOTÃO IP REPORT... (Aperte o botão na máquina)" : "🔌 Automação de Bancada & IP Report"}
              </div>
              {session?.ip && (
                 <div style={{fontSize:11, color:C.green, marginTop:4, fontWeight:700, display: 'flex', alignItems: 'center', gap: 10}}>
                    <span>🌐 IP: {session.ip}</span>
                    <span>⏱️ Uptime: {formatUptime(currentUptimeSec)} / {targetUptimeHours}h</span>
                 </div>
              )}
           </div>
           
           <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <div style={{display:'flex', alignItems:'center', gap:4, background:C.card2, padding:'4px 8px', borderRadius:8, border:"1px solid " + C.border}}>
                 <span style={{fontSize:10, color:C.subtle, fontWeight:700}}>⏱️ Alvo (Horas):</span>
                 <input 
                   type="number" 
                   value={targetUptimeHours} 
                   onChange={e => {
                       const v = Number(e.target.value);
                       setTargetUptimeHours(v);
                       if (session && saveSession) saveSession({ ...session, targetUptimeHours: v });
                   }} 
                   style={{width:45, background:'transparent', color:C.accent, border:'none', fontWeight:900, fontSize:12, textAlign:'center'}} 
                 />
              </div>

              {session?.ip && (
                 <Btn v="s" onClick={() => fetchAndApplyMinerInfo(session.ip)} title="Extrair HASH SNs do log do minerador">
                    📋 Extrair HASH SNs
                 </Btn>
              )}

              <Btn v="s" onClick={() => capturePrintAndUpload(session?.ip)} disabled={isTakingPrint}>
                 📸 {isTakingPrint ? "Tirando Print..." : "Print Dashboard + Logs"}
              </Btn>

               <Btn v="p" onClick={() => ctx.setModal(
                 <Modal title="🌐 Máquinas Online na Rede Local (Escaneamento)" onClose={() => ctx.setModal(null)}>
                   <OnlineMinersModal 
                     ctx={ctx} 
                     session={session} 
                     setMacInput={setMacInput} 
                     loadMachine={loadMachine} 
                     saveSession={saveSession} 
                     fetchAndApplyMinerInfo={fetchAndApplyMinerInfo}
                     triggerToast={triggerToast} 
                     onClose={() => ctx.setModal(null)} 
                   />
                 </Modal>
               )}>
                  🌐 Ver Máquinas Online na Rede
               </Btn>

               {!listening ? (
                  <Btn v="b" onClick={startManualCapture}>📡 Capturar IP Report</Btn>
               ) : (
                  <Btn v="s" onClick={()=>setListening(false)}>❌ Cancelar Escuta</Btn>
               )}
              <button
                  onClick={() => {
                     const currentVal = session?.autoEnabled !== false;
                     const nextVal = !currentVal;
                     if (session && saveSession) saveSession({ ...session, autoEnabled: nextVal });
                  }}
                  style={{
                     background: (session?.autoEnabled !== false) ? C.green + "22" : C.card2,
                     border: "1px solid " + ((session?.autoEnabled !== false) ? C.green : C.border),
                     color: (session?.autoEnabled !== false) ? C.green : C.subtle,
                     borderRadius: 8,
                     padding: "5px 10px",
                     fontSize: 11,
                     fontWeight: 800,
                     cursor: "pointer",
                     display: "inline-flex",
                     alignItems: "center",
                     gap: 6
                  }}
                  title="Configuração por máquina: Ligar ou desligar envio automático de teste desta máquina ao atingir o tempo alvo"
               >
                  {(session?.autoEnabled !== false) ? "⚡ Automação: LIGADA" : "⏸️ Automação: DESLIGADA"}
               </button>

               <Btn v="s" onClick={toggleBlink}>
                 🔦 {blinkOn ? "Parar de Piscar" : "Piscar LED"}
              </Btn>
           </div>
        </div>
    </div>;
}