const fs = require('fs');
let appJsx = fs.readFileSync('src/App.jsx', 'utf8');

// Replace the dayR and dayT mapping in EmpProfile to add an onClick handler that opens a HashDetails modal
const oldRender = `{dayR.map(r=>{
        const isRemove = r.type?.startsWith("remove");
        const accent = r.type==="already_good"?C.green:r.type==="rework"?C.amber:isRemove?C.red:C.blue;
        const icon = r.type==="already_good"?"✅":r.type==="rework"?"🔁 RETRABALHO":r.type==="remove_machine"?"🗑️ REMOVEU MÁQUINA":r.type==="remove_hash"?"🗑️ REMOVEU HASH":"🔧";
        return<Card key={r._id} accent={accent}><div style={{fontWeight:700,fontSize:13,color:accent}}>{icon} {r.hashSN||"SEM SN"} — {r.model}</div><div style={{fontSize:11,color:C.muted}}>{fmtTS(r._at)}</div>{!isRemove&&r.type!=="already_good"&&<div style={{fontSize:10,color:C.subtle}}>Chips:{r.chips||0} Sens:{r.sensores||0} LDOs:{r.ldos||0}{r.obsManual?\` · \${r.obsManual}\`:""}</div>}</Card>
      })}
      {dayT.map(t=>{const stC=t.status==="pending"?C.blue:t.status==="rejected"?C.amber:t.overallResult==="good"?C.green:C.red;return<Card key={t._id} accent={stC}><div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div><div style={{fontSize:11,color:C.muted}}>{fmtTS(t._at)}</div><Tag color={stC} small>{t.status==="pending"?"Aguard.Revisão":t.status==="rejected"?"REPROVADA":t.overallResult==="good"?"BOA":"RUIM"}</Tag></Card>})}`;

const newRender = `{dayR.map(r=>{
        const isRemove = r.type?.startsWith("remove");
        const accent = r.type==="already_good"?C.green:r.type==="rework"?C.amber:isRemove?C.red:C.blue;
        const icon = r.type==="already_good"?"✅":r.type==="rework"?"🔁 RETRABALHO":r.type==="remove_machine"?"🗑️ REMOVEU MÁQUINA":r.type==="remove_hash"?"🗑️ REMOVEU HASH":"🔧";
        return <Card key={r._id} accent={accent} style={{cursor:"pointer", transition:"all 0.2s"}} onClick={() => {
            const h = data.hashes?.find(x => x.sn === r.hashSN);
            ctx.setModal(<Modal title={\`\${r.hashSN || "SN"} - \${r.model}\`} onClose={()=>ctx.setModal(null)}>
                <div style={{padding: 10}}>
                    <h3 className="gold-text" style={{marginTop:0}}>Detalhes do Conserto</h3>
                    <div style={{fontSize: 13, marginBottom: 10}}><b>Data:</b> {fmtTS(r._at)}</div>
                    {!isRemove&&r.type!=="already_good"&&<div style={{fontSize: 13, marginBottom: 10}}><b>Intervenções:</b> Chips: {r.chips||0}, Sens: {r.sensores||0}, LDOs: {r.ldos||0}</div>}
                    {r.obsManual && <div style={{fontSize: 13, marginBottom: 10}}><b>Obs:</b> {r.obsManual}</div>}
                    {h && <div style={{marginTop: 20, padding: 15, background: 'rgba(0,0,0,0.4)', borderRadius: 10, border: \`1px solid \${C.border}\`}}>
                        <div style={{fontWeight: 900, marginBottom: 10, color: C.accent}}>Status Atual da HASH:</div>
                        <div style={{fontSize: 13}}><b>Situação:</b> <Tag color={SIT_C[h.situacao]||C.muted} small>{h.situacao}</Tag></div>
                        <div style={{fontSize: 13, marginTop: 5}}><b>Ultimo Local:</b> {h.farmLocation || h.palletId || "Estoque"}</div>
                    </div>}
                    {r.logPhoto && <div style={{marginTop: 20}}>
                        <div style={{fontWeight: 900, marginBottom: 10, color: C.accent}}>Foto / Log:</div>
                        <img src={r.logPhoto} alt="Log" style={{width: "100%", borderRadius: 10, border: \`1px solid \${C.border}\`}} />
                    </div>}
                </div>
            </Modal>);
        }}>
            <div style={{fontWeight:700,fontSize:13,color:accent}}>{icon} {r.hashSN||"SEM SN"} — {r.model}</div>
            <div style={{fontSize:11,color:C.muted}}>{fmtTS(r._at)}</div>
            {!isRemove&&r.type!=="already_good"&&<div style={{fontSize:10,color:C.subtle}}>Chips:{r.chips||0} Sens:{r.sensores||0} LDOs:{r.ldos||0}{r.obsManual?\` · \${r.obsManual}\`:""}</div>}
        </Card>
      })}
      {dayT.map(t=>{
        const stC=t.status==="pending"?C.blue:t.status==="rejected"?C.amber:t.overallResult==="good"?C.green:C.red;
        return <Card key={t._id} accent={stC} style={{cursor:"pointer", transition:"all 0.2s"}} onClick={() => {
            const m = data.machines?.find(x => x.sn === t.machineSN);
            ctx.setModal(<Modal title={\`Teste: \${t.machineSN || "SN"} - \${t.model}\`} onClose={()=>ctx.setModal(null)}>
                <div style={{padding: 10}}>
                    <h3 className="gold-text" style={{marginTop:0}}>Resultado do Teste</h3>
                    <div style={{fontSize: 13, marginBottom: 10}}><b>Data:</b> {fmtTS(t._at)}</div>
                    <div style={{fontSize: 13, marginBottom: 10}}><b>Resultado Global:</b> <Tag color={stC} small>{t.status==="pending"?"Aguard.Revisão":t.status==="rejected"?"REPROVADA":t.overallResult==="good"?"BOA":"RUIM"}</Tag></div>
                    {m && <div style={{marginTop: 20, padding: 15, background: 'rgba(0,0,0,0.4)', borderRadius: 10, border: \`1px solid \${C.border}\`}}>
                        <div style={{fontWeight: 900, marginBottom: 10, color: C.accent}}>Status Atual da Máquina:</div>
                        <div style={{fontSize: 13}}><b>Situação:</b> <Tag color={SIT_C[m.situacao]||C.muted} small>{m.situacao}</Tag></div>
                        <div style={{fontSize: 13, marginTop: 5}}><b>Ultimo Local:</b> {m.farmLocation || m.palletId || "Estoque"}</div>
                    </div>}
                    {t.testPhoto && <div style={{marginTop: 20}}>
                        <div style={{fontWeight: 900, marginBottom: 10, color: C.accent}}>Foto do Teste:</div>
                        <img src={t.testPhoto} alt="Teste" style={{width: "100%", borderRadius: 10, border: \`1px solid \${C.border}\`}} />
                    </div>}
                </div>
            </Modal>);
        }}>
            <div style={{fontWeight:700,fontSize:13}}>🧪 {t.machineSN||"SEM SN"} — {t.model}</div>
            <div style={{fontSize:11,color:C.muted}}>{fmtTS(t._at)}</div>
            <Tag color={stC} small>{t.status==="pending"?"Aguard.Revisão":t.status==="rejected"?"REPROVADA":t.overallResult==="good"?"BOA":"RUIM"}</Tag>
        </Card>
      })}`;

if (appJsx.includes(oldRender)) {
    appJsx = appJsx.replace(oldRender, newRender);
    fs.writeFileSync('src/App.jsx', appJsx);
    console.log("EmpProfile successfully patched.");
} else {
    console.log("Could not find oldRender to patch EmpProfile.");
}
