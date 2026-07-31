function BenchConnectionPanel({ctx, session, setMacInput, loadMachine, saveSession, doSubmit, triggerToast}) {
    const [listening, setListening] = useState(false);
    const [lastCapturedIP, setLastCapturedIP] = useState(session?.ip || "");
    const [blinkOn, setBlinkOn] = useState(false);
    const [isTakingPrint, setIsTakingPrint] = useState(false);
    const [targetUptimeHours, setTargetUptimeHours] = useState(session?.targetUptimeHours || 3);
    const [autoSubmitTriggered, setAutoSubmitTriggered] = useState(false);
    const [currentUptimeSec, setCurrentUptimeSec] = useState(0);

    const startManualCapture = async () => {
        try { await fetch('http://localhost:3001/api/ipreport?clear=true'); } catch(e) {}
        setListening(true);
    };

    const applyMinerDetailsToSession = (info, ip) => {
        if (!session || !saveSession) return;
        let updatedSlots = [...session.slots];
        let hasChanges = false;
        
        if (info.slots && Array.isArray(info.slots)) {
            info.slots.forEach((boardSN, idx) => {
                if (boardSN && idx < 3) {
                    const cleanSN = String(boardSN).toUpperCase().trim();
                    if (cleanSN && updatedSlots[idx].hashSN !== cleanSN) {
                        updatedSlots[idx] = { ...updatedSlots[idx], hashSN: cleanSN, status: info.status === 'mining' ? 'good' : (updatedSlots[idx].status || 'good') };
                        hasChanges = true;
                    }
                }
            });
        }

        let updatedModel = session.model;
        if (info.model && info.model.trim()) {
            const detected = info.model.trim();
            const matched = ctx?.allModels?.()?.find(m => m.m.toLowerCase() === detected.toLowerCase()) || ctx?.allModels?.()?.find(m => detected.toLowerCase().includes(m.m.toLowerCase()));
            if (matched) { updatedModel = matched.m; hasChanges = true; }
            else if (detected) { updatedModel = detected; hasChanges = true; }
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
        
        if (hasChanges || session.ip !== ip) { saveSession(newSession); }
    };

    const fetchAndApplyMinerInfo = async (ip) => {
        if (!ip) return;
        try {
            const infoRes = await fetch(\`http://localhost:3001/api/miner-info?ip=\${ip}\`);
            if (infoRes.ok) {
                const info = await infoRes.json();
                if (info.sn) { setMacInput(info.sn); loadMachine(info.sn); }
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
                    alert(\`✅ IP REPORT CAPTURADO!\\n🌐 IP: \${latest.ip}\\n\${slotsFound > 0 ? \`📋 \${slotsFound} HASH SNs importados automaticamente!\` : ''}\`);
                }
            } catch(e) {}
        }, 1000);
        return () => clearInterval(interval);
    }, [listening, loadMachine, saveSession, session, setMacInput]);

    const capturePrintAndUpload = async (targetIP) => {
        const ip = targetIP || session?.ip || lastCapturedIP;
        if (!ip) { alert("Informe o IP da máquina na bancada para tirar o print."); return null; }
        setIsTakingPrint(true);
        try {
            const res = await fetch('http://localhost:3001/api/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.image) {
                    const driveUrl = await ctx.uploadPhoto(data.image, \`testes/print_\${session?.machineSN || ip}_\${uid()}.jpg\`);
                    if (driveUrl && session && saveSession) {
                        saveSession({ ...session, photoKey: driveUrl, testPhoto: driveUrl, updatedAt: stamp() });
                    }
                    setIsTakingPrint(false);
                    return driveUrl || data.image;
                }
            }
        } catch(e) { console.error("Erro ao tirar print da tela:", e); }
        setIsTakingPrint(false);
        return null;
    };

    useEffect(() => {
        const ip = session?.ip || lastCapturedIP;
        if (!ip) return;
        const checkUptime = async () => {
            try {
                const r = await fetch(\`http://localhost:3001/api/miner-info?ip=\${ip}\`);
                if (r.ok) {
                    const info = await r.json();
                    if (info.uptime) {
                        setCurrentUptimeSec(info.uptime);
                        const uptimeHours = info.uptime / 3600;
                        const isAutoOn = session?.autoEnabled !== false;
                        if (isAutoOn && uptimeHours >= targetUptimeHours && !autoSubmitTriggered && session && doSubmit) {
                            setAutoSubmitTriggered(true);
                            const photoUrl = await capturePrintAndUpload(ip);
                            const autoSlots = session.slots.map(s => ({ ...s, status: s.status || (s.hashSN ? "good" : "") }));
                            const updatedSess = {
                                ...session, slots: autoSlots, controladora: session.controladora || "ON", fonte: session.fonte || "ON", fans: session.fans || "ON",
                                isAutomatic: true, autoSubmitted: true, photoKey: photoUrl || session.photoKey,
                                adminNotes: [...(session.adminNotes || []), \`⚡ AUTOMÁTICO (\${uptimeHours.toFixed(1)}h Uptime / Alvo: \${targetUptimeHours}h)\`]
                            };
                            await doSubmit(updatedSess);
                            alert(\`🎉 UPTIME DE \${targetUptimeHours}h ALCANÇADO!\\n\\n⚡ Teste marcado como AUTOMÁTICO.\\n📸 Print salvo.\\n✅ Enviada para REVISÃO!\\n🔌 PODE DESLIGAR.\`);
                        }
                    }
                }
            } catch(e) {}
        };
        checkUptime(); // Check immediately on mount/render
        const interval = setInterval(checkUptime, 15000);
        return () => clearInterval(interval);
    }, [session?.ip, lastCapturedIP, targetUptimeHours, autoSubmitTriggered, session, doSubmit]);

    const toggleBlink = async () => {
        const ip = session?.ip || lastCapturedIP || prompt("Digite o IP da máquina na bancada para piscar:");
        if (!ip) return;
        try {
            await fetch('http://localhost:3001/api/blink', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ip, firmware: "vnish", on: !blinkOn}) });
            setBlinkOn(!blinkOn);
        } catch(e) { alert("Erro ao acionar pisca: " + e.message); }
        if(session && !session.ip) saveSession({...session, ip});
    };

    const uptimeHoursCalc = (currentUptimeSec / 3600).toFixed(1);
    const targetUptimeReached = currentUptimeSec / 3600 >= targetUptimeHours;
    const ipToUse = session?.ip || lastCapturedIP;

    return <div style={{background:C.card,borderRadius:8,padding:10,marginBottom:12,border:\`1px solid \${targetUptimeReached ? C.green : listening ? C.blue : C.border}\`}}>
        {targetUptimeReached && (
            <div style={{background: C.green + "22", border: "1px solid " + C.green, color: C.green, borderRadius: 6, padding: 8, marginBottom: 8, textAlign: 'center', fontWeight: 900, fontSize: 13}}>
                🎉 MÁQUINA APROVADA: {targetUptimeHours}H DE UPTIME! ({uptimeHoursCalc}h reais extraídos da placa)<br/>
                📸 Logs puxados. 🔌 PODE DESLIGAR.
            </div>
        )}

        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:6}}>
           <div style={{display:'flex', alignItems:'center', gap:10}}>
              {ipToUse ? (
                 <>
                    <span style={{fontSize:14, color:C.green, fontWeight:900, background:C.card2, padding:'4px 8px', borderRadius:6}}>🌐 {ipToUse}</span>
                    <span style={{fontSize:13, color:C.text, fontWeight:800}}>⏱️ {formatUptime(currentUptimeSec)} / {targetUptimeHours}h</span>
                 </>
              ) : (
                 <span style={{fontWeight:800, color: listening ? C.blue : C.subtle, fontSize:13}}>
                    {listening ? "📡 Aguardando IP Report..." : "🔌 Automação de Teste"}
                 </span>
              )}
           </div>
           
           <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
              <div style={{display:'flex', alignItems:'center', gap:4, background:C.card2, padding:'4px 8px', borderRadius:6, border:"1px solid " + C.border}}>
                 <span style={{fontSize:10, color:C.subtle, fontWeight:700}}>Alvo(H):</span>
                 <input type="number" value={targetUptimeHours} onChange={e => { const v = Number(e.target.value); setTargetUptimeHours(v); if (session && saveSession) saveSession({ ...session, targetUptimeHours: v }); }} style={{width:35, background:'transparent', color:C.accent, border:'none', fontWeight:900, fontSize:12, textAlign:'center'}} />
              </div>

              {ipToUse && (
                 <>
                    <Btn v="s" onClick={() => window.open(\`http://\${ipToUse}\`, '_blank')} title="Abrir painel da mineradora">
                       🌍 Abrir Dashboard
                    </Btn>
                    <Btn v="s" onClick={() => fetchAndApplyMinerInfo(ipToUse)} title="Extrair SNs">📋 HASH SNs</Btn>
                 </>
              )}

              <Btn v="s" onClick={() => capturePrintAndUpload(ipToUse)} disabled={isTakingPrint}>📸 {isTakingPrint ? "..." : "Print"}</Btn>
              
              {!listening ? (
                  <Btn v="b" onClick={startManualCapture}>📡 IP Report</Btn>
              ) : (
                  <Btn v="s" onClick={()=>setListening(false)}>❌ Parar</Btn>
              )}
              
              <button onClick={() => { const n = !(session?.autoEnabled !== false); if (session && saveSession) saveSession({ ...session, autoEnabled: n }); }} style={{ background: (session?.autoEnabled !== false) ? C.green + "22" : C.card2, border: "1px solid " + ((session?.autoEnabled !== false) ? C.green : C.border), color: (session?.autoEnabled !== false) ? C.green : C.subtle, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }} title="Automação">
                  {(session?.autoEnabled !== false) ? "⚡ Auto: ON" : "⏸️ Auto: OFF"}
              </button>
           </div>
        </div>
    </div>;
}
