function TestePage({ctx}){
  const{data,mutate,user,webhookUrl,allModels,gTH,gChips,setModal}=ctx;const models=allModels();
  // Item 10: agora o testador pode ter VÁRIAS máquinas em teste ao mesmo tempo.
  // Cada sessão é um documento próprio (não fica mais 1 sessão por usuário).
  const[sessions,setSessions]=useState([]),[allSessions,setAllSessions]=useState([]),[activeId,setActiveId]=useState(null),[macInput,setMacInput]=useState(""),[err,setErr]=useState(""),[submitting,setSubmitting]=useState(false),[done,setDone]=useState(false),[ruimModal,setRuimModal]=useState(null),[scanning,setScanning]=useState(false),[unlinkPrompt,setUnlinkPrompt]=useState(null);
  const[sessionOrder,setSessionOrder]=usePersistedField("session-order-"+user._id,[]);
  const orderedSessions=useMemo(()=>{
    return sessions.slice().sort((a,b)=>{
      let idxA=sessionOrder.indexOf(a._id);
      let idxB=sessionOrder.indexOf(b._id);
      if(idxA===-1)idxA=99999;
      if(idxB===-1)idxB=99999;
      return idxA-idxB;
    });
  },[sessions,sessionOrder]);
  const slotRefs=useRef([]);
  const recentlyCreated=useRef(new Set());
  // allSessions guarda TODAS as sessões (de todo mundo, não só as minhas) —
  // usado pra saber quais HASHs da fila de teste já estão sendo testadas
  // por outro usuário agora (some da fila compartilhada pra todo mundo
  // assim que alguém vincula, igual reserva de item de Pedido).
  const reloadSessions=useCallback(()=>{fbList("sessions").then(all=>{setAllSessions(all);setSessions(all.filter(s=>s.employeeId===user._id))})},[user._id]);
  useEffect(()=>{reloadSessions()},[reloadSessions]);
  // Tempo real: se o Admin reprovar um teste (ou qualquer outra sessão mudar),
  // o testador vê na hora, sem precisar recarregar a página.
  useEffect(()=>{
    const channel=supabase.channel("hashstock-sessions-"+user._id);
    channel.on("postgres_changes",{event:"*",schema:"public",table:"sessions"},()=>{reloadSessions()});
    channel.subscribe();
    return()=>{supabase.removeChannel(channel)};
  },[user._id,reloadSessions]);
  const session=sessions.find(s=>s._id===activeId)||null;
  const saveSession=async s=>{
    await fbSet("sessions",s._id,s);
    setSessions(prev=>prev.some(x=>x._id===s._id)?prev.map(x=>x._id===s._id?s:x):[...prev,s]);
  };
  const setSlotTechConfig = async (slotIdx, config) => {
    const newSlots = session.slots.map((s, idx) => {
      if (idx === slotIdx) {
        return {
          ...s,
          techId: config.techId,
          techName: config.techName,
          techCode: config.techCode,
          techDate: config.techDate,
          newHashModel: config.model,
          newHashMaterial: config.material,
          newHashChips: config.chips
        };
      }
      return s;
    });
    const s = { ...session, slots: newSlots, updatedAt: stamp() };
    await saveSession(s);
  };

  // Confere se outro testador já está com essa máquina em mãos, e se já tem
  // uma sessão aberta pra ela — usado tanto pelo teste normal quanto pelo
  // Preparar pra Envio.
  const checkSessionConflicts=async(sn)=>{
    const allSessions = await fbList("sessions");
    const existingOther = allSessions.find(s=>s.machineSN===sn && s.employeeId!==user._id);
    if(existingOther){
      const emp = data.employees.find(e=>e._id===existingOther.employeeId);
      if(!window.confirm(`⚠️ A máquina ${sn} já está em teste por: ${emp?.name||"Outro usuário"}.\nDeseja abrir a sessão de teste mesmo assim?`)){
        return false;
      }
    }
    const existing=sessions.find(s=>s.machineSN===sn);
    if(existing){setActiveId(existing._id);setMacInput(sn);return false}
    return true;
  };

  const loadMachine=async(snParam)=>{
    const sn=(snParam||macInput).toUpperCase().trim();if(!sn)return;
    
    // Se tiver sessão de teste ativa, confere se o SN escaneado deve preencher algum slot ruim
    if (session) {
      const badSlotIdx = session.slots.findIndex(s => s.status === "bad" && !s.hashSN);
      if (badSlotIdx !== -1 && sn !== session.machineSN) {
        await setSlotSN(badSlotIdx, sn);
        setMacInput("");
        return;
      }
    }

    resolveSNDuplicates(sn, "machine", ctx, async (ex) => {
      const actualSN = ex ? ex.sn : sn;
      if(!await checkSessionConflicts(actualSN))return;
      if(ex&&ex.situacao==="BOA"&&!window.confirm(`Essa máquina já está marcada como BOA na planilha/estoque.\nQuer mesmo testar de novo?`))return;
      // Guarda a situação de origem (mesmo fora do fluxo Preparar pra Envio) só
      // pra poder mostrar um aviso fixo durante todo o teste — não é usado
      // pra reverter nada aqui (isso só acontece com prepShipment).
      await startSession(actualSN,ex,false,ex?.situacao||"",null);
    });
  };

  // Itens de pedidos em aberto que ainda têm vaga (fulfilled < qty) —
  // oferecidos como opção ao clicar "Preparar pra Envio".
  const availableOrderItems=()=>{
    const list=[];
    (data.orders||[]).filter(o=>o.status==="open").forEach(o=>{
      (o.items||[]).forEach((it,idx)=>{if((it.fulfilled||0)<it.qty)list.push({order:o,item:it,idx})});
    });
    return list;
  };

  // Botão fixo — funciona com QUALQUER máquina (nova ou já cadastrada, em
  // qualquer status), diferente do teste normal. Muda o status pra
  // PREPARANDO NA HORA (app e planilha), guardando o status anterior: se o
  // testador cancelar a sessão sem mandar pra revisão, volta pro status de
  // antes — nunca fica "preso" em PREPARANDO à toa. Se tiver algum pedido em
  // aberto com vaga, pergunta antes se é pra vincular a máquina a ele.
  const prepareForShipment=async()=>{
    const sn=macInput.toUpperCase().trim();
    if(!sn){setErr("Digite ou bipe o SN da máquina primeiro.");return}
    setErr("");
    resolveSNDuplicates(sn, "machine", ctx, async (ex) => {
      const actualSN = ex ? ex.sn : sn;
      if(!await checkSessionConflicts(actualSN))return;
      const prevSituacao=ex?ex.situacao:"";
      const avail=availableOrderItems();
      if(avail.length===0){await applyPrepareShipment(actualSN,ex,prevSituacao,null);return}
      setModal(<Modal title="📦 Vincular a um Pedido?" onClose={()=>setModal(null)}>
        <div style={{color:C.muted,fontSize:12,marginBottom:12}}>Essa máquina vai ajudar a completar algum pedido em aberto?</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
          {avail.map((a,i)=>{
            // Se essa máquina já está cadastrada com outro modelo, avisa — mas
            // não bloqueia (o testador decide se quer mesmo assim ou escolhe
            // outro item/máquina).
            const mismatch=ex&&ex.model&&ex.model!==a.item.model;
            return<div key={i}>
              <Btn v="b" onClick={async()=>{setModal(null);await applyPrepareShipment(actualSN,ex,prevSituacao,a)}} style={{justifyContent:"space-between",width:"100%"}}>
                <span>📋 #{a.order.number} — {a.order.clientName}</span>
                <span>{a.item.model}{a.item.th?` ${a.item.th}TH`:""} ({a.item.fulfilled||0}/{a.item.qty})</span>
              </Btn>
              {mismatch&&<div style={{color:C.amber,fontSize:11,marginTop:4}}>⚠️ Essa máquina já está cadastrada como <b>{ex.model}</b> (o pedido pede {a.item.model})</div>}
            </div>;
          })}
        </div>
        <Btn v="s" onClick={async()=>{setModal(null);await applyPrepareShipment(actualSN,ex,prevSituacao,null)}} style={{width:"100%"}}>Nenhum pedido (fluxo padrão)</Btn>
      </Modal>);
    });
  };

  const applyPrepareShipment=async(sn,ex,prevSituacao,orderChoice)=>{
    if(ex){
      const u={...ex,situacao:"PREPARANDO",...audit(user)};
      mutate("machines",m=>m.map(x=>x._id===ex._id?u:x));
      await fbSet("machines",ex._id,u);
      await markChanged("machines");
      syncSheet(webhookUrl,"updateMachine",{sn:ex.sn,field:"situacao",to:"PREPARANDO",employeeName:user.name,employeeCode:user.code});
    }
    let orderRef=null;
    if(orderChoice){
      const{order,item,idx}=orderChoice;
      // Reserva a vaga na hora — se cancelar a sessão (ou o Admin reprovar),
      // isso volta a subir.
      const newItems=order.items.map((it,i)=>i===idx?{...it,fulfilled:(it.fulfilled||0)+1}:it);
      const u={...order,items:newItems};
      mutate("orders",arr=>arr.map(x=>x._id===order._id?u:x));
      const res=await fbSet("orders",order._id,u);
      if(!res.ok)alert(`⚠️ ERRO: não consegui reservar a vaga do pedido no banco de dados!\n\nErro: ${res.error}\n\nO app mostra reservado mas pode sumir se atualizar a página — avisa o Admin.`);
      await markChanged("orders");
      orderRef={orderId:order._id,orderNumber:order.number,itemIndex:idx,clientId:order.clientId,clientName:order.clientName,model:item.model,th:item.th};
    }
    await startSession(sn,ex,true,prevSituacao,orderRef);
  };

  // "Preparar pra Envio" abre uma sessão igualzinha a um teste normal (slots,
  // componentes, foto obrigatória) — só marca prepShipment pra, quando o
  // Admin aprovar lá na Revisão, o status PERMANECER PREPARANDO (em vez de
  // virar BOA). Continua indo pra fila de espera, exatamente como um teste comum.
  // Se a máquina já existe (ex), o modelo/TH dela sempre vencem — nunca
  // sobrescreve silenciosamente com o do pedido (só avisa, no modal de
  // escolha, quando são diferentes). O modelo do pedido só serve de padrão
  // pra máquina NOVA ainda não cadastrada.
  const startSession=async(sn,ex,prepShipment,prevSituacao,orderRef)=>{
    const id=uid();
    const s={_id:id,employeeId:user._id,machineSN:sn,model:ex?.model||orderRef?.model||models[0]?.m||"M30S",th:ex?.th||orderRef?.th||0,
      slots:[
        {hashSN:ex?.hashSN0||"",status:"",photoKey:null},
        {hashSN:ex?.hashSN1||"",status:"",photoKey:null},
        {hashSN:ex?.hashSN2||"",status:"",photoKey:null}
      ],controladora:"",fonte:"",fans:"",photoKey:null,adminNotes:[],prepShipment:!!prepShipment,prevSituacao:prevSituacao||"",orderRef:orderRef||null,updatedAt:stamp()};
    await saveSession(s);setActiveId(id);
  };

  // Só remove a sessão localmente (sem mexer em status de máquina) — usado
  // depois de ENVIAR com sucesso pra revisão, onde o PREPARANDO deve
  // continuar valendo.
  const removeSessionLocal=async(id)=>{await fbDel("sessions",id);setSessions(prev=>prev.filter(x=>x._id!==id));if(activeId===id){setActiveId(null);setMacInput("")}};

  // CANCELAR uma sessão de Preparar pra Envio (botão ✕/🗑, não o envio pra
  // revisão) desfaz a mudança pra PREPARANDO — a máquina volta pro status
  // que tinha antes de começar.
  const closeSession=async(id)=>{
    const sess=sessions.find(s=>s._id===id);
    if(sess?.prepShipment&&sess.prevSituacao){
      const ex=data.machines.find(m=>normSNField(m.sn)===sess.machineSN);
      if(ex&&ex.situacao==="PREPARANDO"){
        const u={...ex,situacao:sess.prevSituacao,...audit(user)};
        mutate("machines",m=>m.map(x=>x._id===ex._id?u:x));
        await fbSet("machines",ex._id,u);
        await markChanged("machines");
        syncSheet(webhookUrl,"updateMachine",{sn:ex.sn,field:"situacao",to:sess.prevSituacao,employeeName:user.name,employeeCode:user.code});
      }
    }
    // Se estava vinculada a um pedido, devolve a vaga (fulfilled--) — essa
    // máquina não vai mais contar pra esse item, já que a sessão foi cancelada.
    if(sess?.orderRef){
      const order=data.orders.find(o=>o._id===sess.orderRef.orderId);
      if(order){
        const newItems=order.items.map((it,i)=>i===sess.orderRef.itemIndex?{...it,fulfilled:Math.max(0,(it.fulfilled||0)-1)}:it);
        const u={...order,items:newItems};
        mutate("orders",arr=>arr.map(x=>x._id===order._id?u:x));
        const res=await fbSet("orders",order._id,u);
        if(!res.ok)alert(`⚠️ ERRO: não consegui devolver a vaga do pedido no banco de dados!\n\nErro: ${res.error}\n\nAvisa o Admin — o pedido pode ficar com a contagem errada.`);
        await markChanged("orders");
      }
    }
    if(sess){
      if(sess.testPhoto) deleteDrivePhoto(sess.testPhoto);
      sess.slots?.forEach(slot=>{
        if(slot.photoKey) deleteDrivePhoto(slot.photoKey);
      });
    }
    await removeSessionLocal(id);
  };

  const applySlotSN=async(i,upperSn,existing,extraNote)=>{
    const newSlots=[...session.slots];
    const oldSN = newSlots[i].hashSN;
    const wasBad=newSlots[i].status==="bad";

    // Se estiver substituindo uma HASH existente por outra nova
    if (oldSN && upperSn && oldSN.toUpperCase().trim() !== upperSn.toUpperCase().trim()) {
      const oldH = data.hashes.find(x => x.sn === oldSN.toUpperCase().trim());
      const apprId = uid();
      let logPhotoUrl = "";
      
      // Tentar tirar print/foto da tela do log do minerador físico e salvar no Google Drive
      const machine = data.farmMachines.find(m => m.sn === session.machineSN) || data.machines.find(m => m.sn === session.machineSN);
      if (machine?.ip) {
        try {
          const r = await fetch('http://localhost:3001/api/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip: machine.ip })
          });
          if (r.ok) {
            const res = await r.json();
            if (res.success && res.image) {
              // Upload base64 screenshot to Google Drive
              const driveRes = await uploadPhoto(res.image, `logs-teste/${oldSN.toUpperCase().trim()}_swap_${uid()}.jpg`);
              if (driveRes) {
                logPhotoUrl = driveRes;
              }
            }
          }
        } catch (e) {
          console.error("Erro ao tirar print da tela ao substituir HASH:", e);
        }
      }

      const appr = {
        type: "hashBad",
        sn: oldSN.toUpperCase().trim(),
        model: oldH?.model || session.model || "M30S",
        material: oldH?.material || "",
        chips: oldH?.chips || "",
        existingId: oldH?._id || "",
        logPhoto: logPhotoUrl,
        notes: `Substituída no teste por ${upperSn}`,
        location: "",
        machineSN: session.machineSN,
        employeeId: user._id,
        employeeName: user.name,
        employeeCode: user.code,
        date: TODAY(),
        status: "pending",
        ...audit(user)
      };
      await fbSet("pendingApprovals", apprId, appr);
      mutate("approvals", a => [...a, { ...appr, _id: apprId }]);
      await markChanged("approvals");
    }

    newSlots[i]={...newSlots[i],hashSN:upperSn,status:(wasBad&&upperSn)?"":newSlots[i].status};
    let newSession={...session,slots:newSlots,updatedAt:stamp()};
    // Nunca deixa ir pra revisão com a carcaça de um modelo e a HASH de outro
    // — corrige o modelo da máquina sozinho pro modelo da HASH bipada.
    if(existing&&existing.model&&existing.model!==session.model){
      newSession={...newSession,model:existing.model};
    }
    if(extraNote)newSession={...newSession,adminNotes:[...(newSession.adminNotes||[]),extraNote]};
    await saveSession(newSession);
    // IMPORTANTE: a HASH só é criada de verdade quando o resultado é definido
    // (marcada RUIM, ou aprovada como boa) — nunca aqui, enquanto ainda está
    // só digitando/bipando o SN (evitava criar uma HASH nova a cada letra).
    // O avanço pro próximo slot só acontece com Enter (o próprio input já
    // trata isso no onKeyDown) — nunca a cada letra digitada, senão atrapalha
    // quem está digitando manualmente.
  };

  const setSlotSN=async(i,sn)=>{
    if(!session)return;
    const upperSn=sn.toUpperCase().trim();
    setErr("");
    if(upperSn){
      // Nunca deixa repetir o mesmo SN em outro slot desta máquina, nem em
      // outra máquina que já esteja em teste ao mesmo tempo.
      const usedHere=session.slots.some((s,idx)=>idx!==i&&s.hashSN&&s.hashSN.toUpperCase()===upperSn);
      const usedElsewhere=sessions.some(s2=>s2._id!==session._id&&s2.slots.some(s=>s.hashSN&&s.hashSN.toUpperCase()===upperSn));
      if(usedHere||usedElsewhere){setErr(`⚠️ SN ${upperSn} já está sendo usado em outra máquina em teste agora — não pode repetir.`);return}
    }
    const existing=upperSn?data.hashes.find(x=>normSNField(x.sn)===upperSn):null;
    // Só avisa se essa HASH estiver REALMENTE sendo testada agora por outro
    // usuário (dentro da sessão ativa dele) — antes isso avisava baseado em
    // quem CONSERTOU a HASH, o que não tem nada a ver com quem está
    // testando, e disparava sempre que o testador era diferente do técnico.
    if(existing&&upperSn){
      const allS=await fbList("sessions");
      const conflict=allS.find(s=>s.employeeId!==user._id&&s.slots.some(sl=>sl.hashSN&&sl.hashSN.toUpperCase()===upperSn));
      if(conflict){
        const emp=data.employees.find(e=>e._id===conflict.employeeId);
        if(!window.confirm(`⚠️ Essa HASH já está sendo testada agora por: ${emp?.name||"Outro usuário"}.\nDeseja continuar mesmo assim?`))return;
      }
    }
    // A HASH já está instalada em OUTRA máquina, ou já foi vendida pro
    // cliente — pergunta se quer desvincular antes de usar aqui
    if(existing&&(existing.status==="NA MAQUINA"||existing.status==="SAIDA")&&existing.machineSN!==session.machineSN){
      setUnlinkPrompt({slotIndex:i,sn:upperSn,hash:existing});
      return;
    }
    await applySlotSN(i,upperSn,existing);
  };

  const confirmUnlink=async()=>{
    if(!unlinkPrompt)return;
    const{slotIndex,sn,hash}=unlinkPrompt;
    const wasSaida=hash.status==="SAIDA";
    const note=wasSaida
      ? `HASH ${sn} será desvinculada do cliente e movida pra essa máquina quando o teste for aprovado (a máquina antiga continua como está).`
      : `HASH ${sn} será desvinculada da máquina ${hash.machineSN} e movida pra essa quando o teste for aprovado.`;
    setUnlinkPrompt(null);
    // Não mexe em nada agora — só na aprovação é que a HASH realmente muda
    // de máquina/sai do cliente. Assim o "desfazer" fica simples: é só
    // cancelar essa sessão de teste sem aprovar.
    await applySlotSN(slotIndex,sn,hash,note);
  };

  const markAllGood=async()=>{
    if(!session)return;
    if(unknownSlots.length>0&&!session.newHashChars){setErr("Defina as características das HASHs novas primeiro!");return}
    // Slot marcado RUIM mas sem HASH nenhuma nele (a antiga foi removida e
    // ninguém colocou uma nova pra substituir) — não bloqueia, só avisa e
    // deixa o testador confirmar que sabe que vai mandar assim mesmo.
    const emptySlotNums=session.slots.map((s,i)=>s.status==="bad"&&!s.hashSN?i+1:null).filter(Boolean);
    if(emptySlotNums.length>0&&!window.confirm(`⚠️ Vai mandar pra aprovação sem o SN do Slot ${emptySlotNums.join(", ")} (marcado RUIM e ainda sem substituta).\nContinuar mesmo assim?`))return;
    const newSlots=session.slots.map(s=>({...s,status:s.status==="bad"?"bad":"good"}));
    const s={...session,slots:newSlots,controladora:"ON",fonte:"ON",fans:"ON",updatedAt:stamp()};
    await saveSession(s);
    await doSubmit(s);
  };

  // Máquina que não funciona como deveria (mesmo com HASHs boas, ou nem
  // ligou) — diferente de marcar só uma HASH RUIM (isso já existe por
  // slot). Aqui é a máquina inteira. NÃO força nada pra ON: vai pra revisão
  // exatamente com o que o testador marcou em cada slot/componente (o que
  // não foi marcado bom fica OFF na aprovação) — e, ao aprovar, o status
  // final é RUIM em vez de BOA/PREPARANDO.
  const markMachineBad=async()=>{
    if(!session)return;
    if(unknownSlots.length>0&&!session.newHashChars){setErr("Defina as características das HASHs novas primeiro!");return}
    const reason=window.prompt("Por que essa máquina está RUIM? (obrigatório)","");
    if(!reason||!reason.trim())return;
    const s={...session,machineBad:true,adminNotes:[...(session.adminNotes||[]),"Máquina marcada RUIM: "+reason.trim()],updatedAt:stamp()};
    await saveSession(s);
    await doSubmit(s);
  };

  const doSubmit=async(s)=>{
    const sess=s||session;if(!sess)return;
    setSubmitting(true);
    
    // Movimentação imediata para o palete sem precisar de aprovação
    const palletId=sess.slots?.[0]?.palletId;
    if(palletId){
      const pallet=data.pallets.find(p=>p._id===palletId);
      if(pallet){
        for(const pl of data.pallets){
          if(pl._id===palletId) continue;
          if((pl.machinesSN||[]).includes(sess.machineSN)){
            const ns=(pl.machinesSN||[]).filter(sn=>sn!==sess.machineSN);
            const upd2={...pl,machinesSN:ns,...audit(user)};
            mutate("pallets",arr=>arr.map(x=>x._id===pl._id?upd2:x));
            await fbSet("pallets",pl._id,upd2);
          }
        }
        const upd={...pallet,machinesSN:[...new Set([...(pallet.machinesSN||[]),sess.machineSN])],...audit(user)};
        mutate("pallets",arr=>arr.map(x=>x._id===pallet._id?upd:x));
        await fbSet("pallets",pallet._id,upd);
        await markChanged("pallets");
      }
    }

    const exMac=data.machines.find(m=>normSNField(m.sn)===sess.machineSN);
    const prevSituacao=exMac?exMac.situacao:"";
    const id=uid();
    const rec={machineSN:sess.machineSN,model:sess.model,th:sess.th,employeeId:user._id,employeeName:user.name,employeeCode:user.code,...audit(user),date:TODAY(),status:"pending",
      prevSituacao,
      slot0HashSN:sess.slots[0].hashSN||"",slot0Result:sess.slots[0].status||"",slot0Photo:sess.slots[0].photoKey||"",
      slot1HashSN:sess.slots[1].hashSN||"",slot1Result:sess.slots[1].status||"",slot1Photo:sess.slots[1].photoKey||"",
      slot2HashSN:sess.slots[2].hashSN||"",slot2Result:sess.slots[2].status||"",slot2Photo:sess.slots[2].photoKey||"",
      slot0TechId:sess.slots[0].techId||"",slot0TechName:sess.slots[0].techName||"",slot0TechCode:sess.slots[0].techCode||"",slot0TechDate:sess.slots[0].techDate||"",
      slot0NewHashModel:sess.slots[0].newHashModel||"",slot0NewHashMaterial:sess.slots[0].newHashMaterial||"",slot0NewHashChips:sess.slots[0].newHashChips||"",
      slot1TechId:sess.slots[1].techId||"",slot1TechName:sess.slots[1].techName||"",slot1TechCode:sess.slots[1].techCode||"",slot1TechDate:sess.slots[1].techDate||"",
      slot1NewHashModel:sess.slots[1].newHashModel||"",slot1NewHashMaterial:sess.slots[1].newHashMaterial||"",slot1NewHashChips:sess.slots[1].newHashChips||"",
      slot2TechId:sess.slots[2].techId||"",slot2TechName:sess.slots[2].techName||"",slot2TechCode:sess.slots[2].techCode||"",slot2TechDate:sess.slots[2].techDate||"",
      slot2NewHashModel:sess.slots[2].newHashModel||"",slot2NewHashMaterial:sess.slots[2].newHashMaterial||"",slot2NewHashChips:sess.slots[2].newHashChips||"",
      controladora:sess.controladora,fonte:sess.fonte,fans:sess.fans,testPhoto:sess.photoKey,overallResult:"pending",
      prepShipment:!!sess.prepShipment,orderRef:sess.orderRef||null,machineBad:!!sess.machineBad,
      newHashModel:sess.newHashChars?.model||"",newHashMaterial:sess.newHashChars?.material||"",newHashChips:sess.newHashChars?.chips||""};
    await fbSet("tests",id,rec);mutate("tests",t=>[...t,{...rec,_id:id}]);
    const apprId=uid();const appr={testId:id,machineSN:sess.machineSN,model:sess.model,th:sess.th,employeeId:user._id,employeeName:user.name,employeeCode:user.code,date:TODAY(),status:"pending",prepShipment:!!sess.prepShipment,orderRef:sess.orderRef||null,machineBad:!!sess.machineBad,adminNote:(sess.adminNotes||[]).join(" | "),...audit(user)};
    await fbSet("pendingApprovals",apprId,appr);mutate("approvals",a=>[...a,{...appr,_id:apprId}]);
    // Preparar pra Envio já deixou a máquina em PREPARANDO (e já sincronizou
    // a planilha) desde que a sessão começou — aqui só garante isso e marca
    // quem testou. Teste comum vai pra AGUARD. REVISÃO (só some quando o
    // Admin aprovar/reprovar de verdade). Se foi marcada RUIM, também fica
    // AGUARD. REVISÃO até o Admin decidir (nunca continua "PREPARANDO" pra
    // um pedido/envio com máquina possivelmente quebrada).
    const pendingSituacao=(sess.prepShipment&&!sess.machineBad)?"PREPARANDO":"AGUARD. REVISÃO";
    if(exMac){const u={...exMac,situacao:pendingSituacao,lastTesterId:user._id,...audit(user)};mutate("machines",m=>m.map(x=>x._id===exMac._id?u:x));await fbSet("machines",exMac._id,u);}
    // Máquina Ruim vinculada a um Pedido: a vaga volta na hora, já no envio
    // pra revisão — não precisa esperar o Admin decidir, já que essa máquina
    // não vai cumprir o pedido de jeito nenhum. O orderRef continua salvo no
    // teste/aprovação só pra aparecer no histórico ("era pro pedido tal"),
    // mas o "fulfilled" do pedido já libera pra outra máquina ser vinculada.
    if(sess.machineBad&&sess.orderRef){
      const order=data.orders.find(o=>o._id===sess.orderRef.orderId);
      if(order){
        const newItems=order.items.map((it,i)=>i===sess.orderRef.itemIndex?{...it,fulfilled:Math.max(0,(it.fulfilled||0)-1)}:it);
        const u={...order,items:newItems};
        mutate("orders",arr=>arr.map(x=>x._id===order._id?u:x));
        const res=await fbSet("orders",order._id,u);
        if(!res.ok)alert(`⚠️ ERRO: não consegui devolver a vaga do pedido no banco de dados!\n\nErro: ${res.error}\n\nAvisa o Admin — o pedido pode ficar com a contagem errada.`);
        await markChanged("orders");
      }
    }
    await markChanged("tests");await markChanged("approvals");await markChanged("machines");
    syncSheet(webhookUrl,"test",{...rec,employeeCode:user.code,employeeName:user.name});
    await removeSessionLocal(sess._id);setSubmitting(false);setDone(true);setTimeout(()=>setDone(false),3000);
  };

  const otherSessions=sessions.filter(s=>s._id!==activeId);
  // SNs bipados que ainda não existem em lugar nenhum — precisa definir as
  // características (modelo/material/chips) deles antes de poder enviar.
  const unknownSlots=session?session.slots.map((s,i)=>({i,sn:s.hashSN,hasTech:!!s.newHashModel})).filter(x=>x.sn&&!x.hasTech&&!data.hashes.find(h=>h.sn===x.sn.toUpperCase())):[];
  // Se tiver 1 HASH já existente nesse teste, usa as características dela
  // como ponto de partida pra preencher as novas (não muda nada nela).
  const existingHashesInSession=session?session.slots.map(s=>s.hashSN?data.hashes.find(h=>h.sn===s.hashSN.toUpperCase()):null).filter(Boolean):[];
  const templateHash=existingHashesInSession.length===1?existingHashesInSession[0]:null;
  const needsChars=unknownSlots.length>0&&!session?.newHashChars;
  // Slot marcado RUIM sem HASH substituta nele — não pode liberar "TUDO
  // BOA" assim (o botão já fica desabilitado, não é só um erro depois de clicar).
  const hasEmptyBadSlot=session?session.slots.some(s=>s.status==="bad"&&!s.hashSN):false;

  const availItems=availableOrderItems();
  // Fila de HASHs prontas pra testar, visível pra TODO mundo que tem acesso
  // ao Teste — não só quem consertou. Some da lista assim que alguém já
  // colocou ela numa sessão ativa (dele ou de outro testador), igual a
  // reserva de item de Pedido — pra dois testadores não pegarem a mesma.
  const availableHashQueue=data.hashes.filter(h=>h.status==="TESTAR"&&!allSessions.some(s=>s.slots.some(sl=>sl.hashSN&&sl.hashSN.toUpperCase()===(h.sn||"").toUpperCase())));
  return<div>
    {availItems.length>0&&<>
      <style>{`@keyframes pedidoGlow{0%,100%{box-shadow:0 0 6px 1px ${C.accent}77}50%{box-shadow:0 0 14px 5px ${C.accent}cc}}`}</style>
      <button onClick={()=>setModal(<Modal title="📦 Pedidos em Aberto" onClose={()=>setModal(null)}>
          {[...new Set(availItems.map(a=>a.order._id))].map(oid=>availItems.find(a=>a.order._id===oid).order).map(o=><OrderCard key={o._id} ctx={ctx} order={o} hideClient/>)}
        </Modal>)} style={{display:"flex",alignItems:"center",gap:6,background:C.accent,border:"none",color:"#fff",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:800,cursor:"pointer",marginBottom:12,animation:"pedidoGlow 1.8s ease-in-out infinite"}}>📋 {availItems.length} item(ns) de pedido em aberto</button>
    </>}
    {availableHashQueue.length>0&&<>
      <style>{`@keyframes hashQueueGlow{0%,100%{box-shadow:0 0 6px 1px ${C.blue}77}50%{box-shadow:0 0 14px 5px ${C.blue}cc}}`}</style>
      <button onClick={()=>setModal(<Modal title="🔧 Fila de HASHs pra Testar" onClose={()=>setModal(null)}>
          <div style={{color:C.muted,fontSize:12,marginBottom:12}}>Essas HASHs já foram consertadas e estão liberadas pra qualquer um testar. Assim que alguém colocar uma delas numa sessão de teste, ela some daqui pros outros.</div>
          {availableHashQueue.map(h=>{const rep=data.employees.find(e=>e._id===h.repairedBy);const repName=rep?.name||h.repairedByName;return<Card key={h._id} style={{marginBottom:8}}>
            <div style={{fontWeight:800,fontSize:13,color:C.blue}}>⚡ {h.sn||"SEM SN"}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>{h.model}{h.material?` · ${h.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{repName?` · consertada por 👷 ${repName}`:""}</div>
          </Card>;})}
        </Modal>)} style={{display:"flex",alignItems:"center",gap:6,background:C.blue,border:"none",color:"#fff",borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:800,cursor:"pointer",marginBottom:12,animation:"hashQueueGlow 1.8s ease-in-out infinite"}}>🔧 {availableHashQueue.length} HASH(s) prontas pra teste</button>
    </>}
    <HashSearchBox ctx={ctx}/>
    {scanning&&<BarcodeScanner onScan={v=>{setMacInput(v.toUpperCase());setScanning(false);loadMachine(v)}} onClose={()=>setScanning(false)}/>}
    {done&&<Alrt type="ok">✓ Enviado para revisão do admin!</Alrt>}
    {err&&<Alrt type="err">{err}</Alrt>}

    {/* Sessões em aberto — pode ter várias máquinas em teste ao mesmo tempo */}
    {orderedSessions.length>0&&<div style={{marginBottom:12}}>
      <SL>🖥️ MÁQUINAS EM TESTE ({orderedSessions.length})</SL>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {orderedSessions.map((s,index)=><button
          key={s._id}
          draggable
          onDragStart={e=>{
            e.dataTransfer.setData("text/plain",String(index));
            e.dataTransfer.effectAllowed="move";
          }}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{
            e.preventDefault();
            const fromIdx=Number(e.dataTransfer.getData("text/plain"));
            const toIdx=index;
            if(fromIdx===toIdx)return;
            const next=[...orderedSessions];
            const[dragged]=next.splice(fromIdx,1);
            next.splice(toIdx,0,dragged);
            setSessionOrder(next.map(x=>x._id));
          }}
          onClick={()=>{setActiveId(s._id);setMacInput(s.machineSN)}}
          style={{background:s._id===activeId?C.accent:(s.rejected?"#3a0a0a":C.card),color:"#fff",border:`1px solid ${s._id===activeId?C.accent:(s.rejected?C.red:C.border)}`,borderRadius:8,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"grab",display:"flex",alignItems:"center",gap:6}}
        >
          {index+1}. {s.rejected?"❌":s.machineBad?"💀":s.orderRef?"📋":s.prepShipment?"📦":"🖥️"} {s.machineSN} {s.slots.filter(sl=>sl.status).length}/3
          <span onClick={e=>{e.stopPropagation();closeSession(s._id)}} style={{color:s._id===activeId?"#fff":C.red,fontWeight:900,marginLeft:4}}>✕</span>
        </button>)}
        <button onClick={()=>{setActiveId(null);setMacInput("")}} style={{background:C.card2,color:C.accent,border:`1px dashed ${C.accent}`,borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="Iniciar novo teste">+</button>
      </div>
    </div>}

    {session?.rejected&&<Alrt type="err">{(session.adminNotes||[]).join(" · ")||"❌ Essa máquina foi reprovada na revisão. Corrija e envie de novo."}</Alrt>}
    {/* Aviso fixo (não some sozinho) pra deixar claro, o teste inteiro, que
        essa máquina já estava BOA antes desse reteste — se algum HASH sair
        RUIM agora, ela some desse status. Só no fluxo padrão (sem prep/pedido,
        que já tem avisos próprios abaixo). */}
    {session&&!session.rejected&&!session.prepShipment&&!session.orderRef&&session.prevSituacao==="BOA"&&<Alrt type="err">⚠️ Essa máquina já estava marcada como BOA. Se algum HASH der RUIM nesse reteste, ela sai desse status ao aprovar.</Alrt>}
    {/* Um ou outro — nunca os dois juntos: vinculada a pedido tem seu próprio
        aviso (com o que acontece ao aprovar), fluxo padrão de Preparar pra
        Envio mostra o genérico. */}
    {session?.orderRef&&!session.rejected?
      <Alrt type="ok">📋 Vinculada ao Pedido #{session.orderRef.orderNumber} — {session.orderRef.clientName}. Status já está PREPARANDO. Quando o Admin aprovar, a máquina vai direto pra esse cliente (SAIDA). Se cancelar essa sessão, volta pro status de antes e devolve a vaga do pedido.</Alrt>
      :session?.prepShipment&&!session.rejected&&<Alrt type="ok">📦 Preparação para Envio — status já está PREPARANDO (planilha atualizada). Quando o Admin aprovar, permanece PREPARANDO. Se cancelar essa sessão, volta pro status de antes.</Alrt>}

    <BenchConnectionPanel ctx={ctx} session={session} setMacInput={setMacInput} loadMachine={loadMachine} saveSession={saveSession} doSubmit={doSubmit} triggerToast={(msg) => alert(msg)} />

    {/* Machine input — sempre inicia uma NOVA máquina (ou retoma se já tiver sessão pro SN) */}
    <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
      <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>SN DA MÁQUINA {session?"(sessão ativa)":"(nova)"}</div>

      <div style={{display:"flex",gap:8}}>
        <input value={macInput} onChange={e=>setMacInput(e.target.value.toUpperCase())} onKeyDown={e=>{if(e.key==="Enter")e.preventDefault();}} placeholder="Bipe ou digite o SN..." list="mac-list" style={{...inp,flex:1}}/>
        <button onClick={()=>setScanning(true)} style={{background:C.blue,border:"none",color:"#fff",borderRadius:10,padding:"10px 14px",cursor:"pointer",fontSize:18}}>📷</button>
        <Btn v="b" onClick={()=>ctx.setModal(<Modal title="Gerar SN" onClose={()=>ctx.setModal(null)}><GenerateSNModal ctx={ctx} testMode={true} onClose={(newSN)=>{ctx.setModal(null);if(typeof newSN==='string'&&newSN){setMacInput(newSN);loadMachine(newSN)}}}/></Modal>)} style={{height:43,marginBottom:0,padding:"0 10px"}}>+ SN</Btn>
      </div>
      {!session&&<div style={{display:"flex",gap:8,marginTop:8}}>
        <Btn onClick={()=>loadMachine(macInput)} style={{flex:1,justifyContent:"center"}}>🔍 Carregar Máquina</Btn>
        <Btn v="y" onClick={prepareForShipment} style={{flex:1,justifyContent:"center"}}>📦 Preparar pra Envio</Btn>
      </div>}
      <datalist id="mac-list">{data.machines.map(m=><option key={m._id} value={m.sn||""}>{m.model}</option>)}</datalist>
      {session&&<div style={{marginTop:8}}>
        <div style={{fontWeight:800,color:C.accent,marginBottom:6}}>{session.machineSN}</div>
        <div style={{display:"flex",gap:8}}>
          <Sel value={session.model} onChange={e=>{const newModel=e.target.value;saveSession({...session,model:newModel,th:gTH(newModel),updatedAt:stamp()})}} style={{flex:2,marginBottom:0}}>{models.map(m=><option key={m.m}>{m.m}</option>)}{session.model&&!models.some(m=>m.m===session.model)&&<option key={session.model}>{session.model}</option>}</Sel>
          <Inp type="number" value={session.th} onChange={e=>saveSession({...session,th:Number(e.target.value),updatedAt:stamp()})} placeholder="TH" style={{width:70,marginBottom:0}}/>
        </div>
      </div>}
      {!session&&macInput===""&&otherSessions.length>0&&<div style={{color:C.muted,fontSize:11,marginTop:6}}>Bipe outro SN pra abrir uma nova máquina em paralelo, sem perder as outras.</div>}
    </div>

    {session&&<>
      {/* Slots */}
      {[0,1,2].map(i=>{
        const slot=session.slots[i];
        const h=slot.hashSN?data.hashes.find(x=>x.sn===slot.hashSN.toUpperCase()):null;
        const modelMismatch=h&&h.model&&session.model&&h.model!==session.model;
        return<div key={i} style={{background:C.card,borderRadius:14,padding:14,marginBottom:8,border:"1px solid "+(slot.status==="bad"?C.red:slot.status==="good"?C.green:C.border)}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontWeight:800,fontSize:12,color:C.subtle}}>SLOT {i+1}</div>
            {slot.status==="good"&&<Tag color={C.green}>✓ BOA</Tag>}
            {slot.status==="bad"&&<Tag color={C.red}>✗ RUIM</Tag>}
            {!slot.status&&<Tag color={C.muted}>Aguardando</Tag>}
          </div>
          <TestSlotSNInput slotRefs={slotRefs} i={i} value={slot.hashSN||""} onCommit={sn=>setSlotSN(i,sn)} listId={"hash-list-"+i}/>
          <datalist id={"hash-list-"+i}>{data.hashes.map(x=><option key={x._id} value={x.sn||""}>{x.model} — {x.status}</option>)}</datalist>
          {h&&<div style={{display:"flex",gap:8,alignItems:"center",padding:"6px 10px",background:C.card2,borderRadius:8,marginBottom:6,flexWrap:"wrap"}}>
            <HP s={h.status}/><span style={{fontSize:12,fontWeight:700,color:C.blue}}>⚡ {h.model}{h.material?` · ${h.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{` · ${h.chips||gChips(h.model,h.material)||0} chips`}{h.repairedByName?` · 🔧 ${h.repairedByName}`:""}</span>
            {h.location&&<span style={{fontSize:10,color:C.muted}}>📍{h.location}</span>}
            <button onClick={()=>setModal(<Modal title={`⚡ ${h.sn||"SEM SN"}`} onClose={()=>setModal(null)}><HashDetail ctx={ctx} hash={h}/></Modal>)} style={{marginLeft:"auto",background:C.card2,border:"none",color:C.subtle,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:10}}>✏️ Editar</button>
          </div>}
          {!h&&slot.hashSN&&(slot.newHashModel?
            <div style={{background:C.green+"15",border:`1px solid ${C.green}44`,borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.green,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <span>✓ HASH nova (Conserto de {slot.techName}) — {slot.newHashModel}{slot.newHashMaterial?` · ${slot.newHashMaterial==="FIBRA"?"Fibra":"Alumínio"}`:""}{slot.newHashChips?` · ${slot.newHashChips} chips`:""}</span>
              {(user.permissions?.repairs||user.permissions?.admin||user.code==="019")&&<button onClick={()=>setModal(<Modal title="Vincular Técnico & Cadastrar HASH" onClose={()=>setModal(null)}><LinkNewHashTechForm ctx={ctx} sn={slot.hashSN} initialModel={slot.newHashModel} onSave={(config)=>setSlotTechConfig(i,config)} onClose={()=>setModal(null)}/></Modal>)} style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:800,cursor:"pointer"}}>✏️ Alterar</button>}
            </div>
            : (session.newHashChars?
              <div style={{background:C.green+"15",border:`1px solid ${C.green}44`,borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.green,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <span>✓ HASH nova — {session.newHashChars.model}{session.newHashChars.material?` · ${session.newHashChars.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{session.newHashChars.chips?` · ${session.newHashChars.chips} chips`:""}</span>
                {(user.permissions?.repairs||user.permissions?.admin||user.code==="019")&&<button onClick={()=>setModal(<Modal title="Vincular Técnico & Cadastrar HASH" onClose={()=>setModal(null)}><LinkNewHashTechForm ctx={ctx} sn={slot.hashSN} initialModel={session.newHashChars.model||session.model} onSave={(config)=>setSlotTechConfig(i,config)} onClose={()=>setModal(null)}/></Modal>)} style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:800,cursor:"pointer"}}>➕ Vincular Técnico</button>}
              </div>
              :<div style={{background:C.red+"15",border:`1px solid ${C.red}44`,borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.red,fontWeight:700,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <span>❌ Essa HASH não existe ainda — vincule um técnico ou defina as características abaixo</span>
                {(user.permissions?.repairs||user.permissions?.admin||user.code==="019")&&<button onClick={()=>setModal(<Modal title="Vincular Técnico & Cadastrar HASH" onClose={()=>setModal(null)}><LinkNewHashTechForm ctx={ctx} sn={slot.hashSN} initialModel={session.model} onSave={(config)=>setSlotTechConfig(i,config)} onClose={()=>setModal(null)}/></Modal>)} style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"3px 8px",fontSize:10,fontWeight:800,cursor:"pointer"}}>➕ Vincular Técnico</button>}
              </div>
            )
          )}
          {modelMismatch&&<div style={{background:C.amber+"22",border:"1px solid "+C.amber+"44",borderRadius:8,padding:"6px 10px",marginBottom:6,fontSize:11,color:C.amber}}>⚠️ HASH é <b>{h.model}</b> mas máquina é <b>{session.model}</b></div>}
          {slot.status!=="bad"&&slot.hashSN&&<button onClick={()=>setRuimModal(i)} style={{background:C.red+"22",border:"1px solid "+C.red+"44",color:C.red,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:700,width:"100%"}}>✗ Marcar como RUIM</button>}
        </div>;
      })}

      {/* Componentes */}
      <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
        <SL>Componentes</SL>
        {[["controladora","Controladora"],["fonte","Fonte"],["fans","Cooler"]].map(([k,l])=><div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid "+C.border}}><span style={{fontSize:13}}>{l}</span><div style={{display:"flex",gap:6}}>{["ON","OFF"].map(v=><button key={v} onClick={()=>saveSession({...session,[k]:v,updatedAt:stamp()})} style={{background:session[k]===v?(v==="ON"?C.green:C.red)+"22":C.card2,color:session[k]===v?(v==="ON"?C.green:C.red):C.muted,border:"1px solid "+(session[k]===v?(v==="ON"?C.green:C.red):C.border),borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>{v==="ON"?"Bom":"Ruim"}</button>)}</div></div>)}
      </div>

      {/* Foto */}
      <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
        <PhotoCapture label="📸 Foto da Tela / App Fabricante (opcional)" photoKey={session.photoKey||null} onChange={k=>saveSession({...session,photoKey:k,updatedAt:stamp()})} folder="testes" snHint={session.machineSN}/>
      </div>

      {/* Pending & Automatic Tests Section for Tester Review/Edit */}
      {data.approvals.filter(a => a.status === "pending" && (a.employeeId === user._id || user.code === "019")).length > 0 && (
        <div style={{background: C.card, borderRadius: 14, padding: 14, marginTop: 16, border: "1px solid " + C.border}}>
          <SL>⚡ TESTES PENDENTES & AUTOMÁTICOS (Aguardando Aprovação)</SL>
          <div style={{fontSize: 11, color: C.subtle, marginBottom: 10}}>
            Você pode verificar e editar qualquer dado dessas máquinas enquanto o Admin ainda não aprovou.
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {data.approvals.filter(a => a.status === "pending" && (a.employeeId === user._id || user.code === "019")).map(appr => {
               const isAuto = appr.isAutomatic || appr.adminNote?.includes("AUTOMÁTICO");
               const testRec = data.tests.find(t => t._id === appr.testId);
               return (
                 <Card key={appr._id} accent={isAuto ? C.green : C.blue} style={{marginBottom: 0}}>
                   <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8}}>
                     <div>
                       <div style={{fontWeight: 800, fontSize: 13, color: isAuto ? C.green : C.text, display: 'flex', alignItems: 'center', gap: 6}}>
                         <span>🖥️ {appr.machineSN}</span>
                         <span style={{color: C.subtle, fontSize: 11}}>({appr.model} · {appr.th}TH)</span>
                         {isAuto && (
                           <span style={{background: C.green + "22", border: "1px solid " + C.green, color: C.green, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 900}}>
                             ⚡ AUTOMÁTICO (3h)
                           </span>
                         )}
                       </div>
                       <div style={{fontSize: 11, color: C.muted, marginTop: 2}}>
                         👷 {appr.employeeName} · {fmtTS(appr._at || appr.date)}
                       </div>
                       {appr.adminNote && (
                         <div style={{fontSize: 10, color: C.subtle, marginTop: 2}}>📝 {appr.adminNote}</div>
                       )}
                     </div>

                     <button 
                       onClick={() => setModal(
                         <Modal title={"✏️ Editar Teste Pendente — " + appr.machineSN} onClose={() => setModal(null)}>
                           <EditPendingTestForm ctx={ctx} appr={appr} test={testRec} onSaved={() => setModal(null)} />
                         </Modal>
                       )}
                       style={{background: C.accent, color: '#000', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer'}}
                     >
                       ✏️ Editar Teste
                     </button>
                   </div>
                 </Card>
               );
            })}
          </div>
        </div>
      )}

      {/* Vinculação de palete imediata */}
      <div style={{background:C.card,borderRadius:14,padding:14,marginBottom:12}}>
        <div style={{color:C.subtle,fontSize:10,fontWeight:800,marginBottom:6,letterSpacing:1}}>VINCULAR A UM PALETE (MOVIMENTAÇÃO IMEDIATA)</div>
        <select value={session.slots?.[0]?.palletId||""} onChange={e=>{const val=e.target.value;const newSlots=[...session.slots];newSlots[0]={...newSlots[0],palletId:val};saveSession({...session,slots:newSlots,updatedAt:stamp()})}} style={{...inp,marginBottom:0}}>
          <option value="">Nenhum palete</option>
          {(data.pallets||[]).map(p=><option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      </div>

      {unknownSlots.length>0&&<div style={{background:needsChars?C.red+"15":C.green+"15",border:`1px solid ${needsChars?C.red:C.green}44`,borderRadius:12,padding:14,marginBottom:12}}>
        <div style={{fontWeight:800,fontSize:13,color:needsChars?C.red:C.green,marginBottom:6}}>{needsChars?"⚠️":"✓"} {unknownSlots.length} HASH(s) nova(s) {needsChars?"— falta definir as características":"— características definidas"}</div>
        {!needsChars&&session.newHashChars&&<div style={{fontSize:12,color:C.muted,marginBottom:8}}>{session.newHashChars.model}{session.newHashChars.material?` · ${session.newHashChars.material==="FIBRA"?"Fibra":"Alumínio"}`:""}{session.newHashChars.chips?` · ${session.newHashChars.chips} chips`:""}</div>}
        <Btn v={needsChars?"d":"s"} onClick={()=>setModal(<Modal title="Características das HASHs novas" onClose={()=>setModal(null)}><NewHashCharsForm ctx={ctx} unknownSlots={unknownSlots} initial={session.newHashChars} templateHash={templateHash} onSave={async(chars)=>{await saveSession({...session,newHashChars:chars,model:chars.model||session.model,updatedAt:stamp()});setModal(null)}}/></Modal>)} style={{width:"100%"}}>{needsChars?"📋 Definir características (obrigatório)":"✏️ Editar características"}</Btn>
      </div>}

      <Btn v="g" onClick={markAllGood} disabled={submitting||needsChars} style={{width:"100%",padding:"16px",fontSize:15,marginBottom:8}}>
        {submitting?"Enviando...":session.prepShipment?"📦 Enviar Preparação para Revisão":"✅ TUDO BOA — Enviar para Revisão"}
      </Btn>
      <Btn v="d" onClick={markMachineBad} disabled={submitting||needsChars} style={{width:"100%",padding:"12px",fontSize:13,marginBottom:8}}>💀 Máquina Ruim — Enviar para Revisão</Btn>
      <div style={{display:"flex",gap:8}}>
        <Btn v="s" onClick={()=>{setActiveId(null);setMacInput("")}} style={{flex:1,fontSize:12}}>👋 Deixar na fila e trocar de máquina</Btn>
        <Btn v="d" onClick={()=>closeSession(session._id)} style={{flex:1,fontSize:12}}>🗑 Cancelar esta</Btn>
      </div>
      {needsChars&&<div style={{color:C.red,fontSize:11,textAlign:"center",marginTop:6}}>⚠️ Defina as características das HASHs novas pra enviar</div>}
      {hasEmptyBadSlot&&<div style={{color:C.amber,fontSize:11,textAlign:"center",marginTop:6}}>⚠️ Tem slot RUIM sem HASH substituta — pode mandar assim, mas vai pedir confirmação</div>}
    </>}

    {/* Pending & Automatic Tests Section for Tester Review/Edit */}
    {data.approvals.filter(a => a.status === "pending" && (a.employeeId === user._id || user.code === "019")).length > 0 && (
      <div style={{background: C.card, borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 16, border: "1px solid " + C.border}}>
        <SL>⚡ TESTES PENDENTES & AUTOMÁTICOS (Aguardando Aprovação)</SL>
        <div style={{fontSize: 11, color: C.subtle, marginBottom: 10}}>
          Você pode verificar e editar qualquer dado dessas máquinas enquanto o Admin ainda não aprovou.
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          {data.approvals.filter(a => a.status === "pending" && (a.employeeId === user._id || user.code === "019")).map(appr => {
             const isAuto = appr.isAutomatic || (appr.adminNote && appr.adminNote.includes("AUTOMÁTICO"));
             const testRec = data.tests.find(t => t._id === appr.testId);
             return (
               <Card key={appr._id} accent={isAuto ? C.green : C.blue} style={{marginBottom: 0}}>
                 <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8}}>
                   <div>
                     <div style={{fontWeight: 800, fontSize: 13, color: isAuto ? C.green : C.text, display: 'flex', alignItems: 'center', gap: 6}}>
                       <span>🖥️ {appr.machineSN}</span>
                       <span style={{color: C.subtle, fontSize: 11}}>({appr.model} · {appr.th}TH)</span>
                       {isAuto && (
                         <span style={{background: C.green + "22", border: "1px solid " + C.green, color: C.green, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 900}}>
                           ⚡ AUTOMÁTICO (3h)
                         </span>
                       )}
                     </div>
                     <div style={{fontSize: 11, color: C.muted, marginTop: 2}}>
                       👷 {appr.employeeName} · {fmtTS(appr._at || appr.date)}
                     </div>
                     {appr.adminNote && (
                       <div style={{fontSize: 10, color: C.subtle, marginTop: 2}}>📝 {appr.adminNote}</div>
                     )}
                   </div>

                   <button 
                     onClick={() => setModal(
                       <Modal title={"✏️ Editar Teste Pendente — " + appr.machineSN} onClose={() => setModal(null)}>
                         <EditPendingTestForm ctx={ctx} appr={appr} test={testRec} onSaved={() => setModal(null)} />
                       </Modal>
                     )}
                     style={{background: C.accent, color: '#000', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer'}}
                   >
                     ✏️ Editar Teste
                   </button>
                 </div>
               </Card>
             );
          })}
        </div>
      </div>
    )}

    {/* Pergunta de desvincular HASH que já está em outra máquina */}
    {unlinkPrompt&&<Modal title={unlinkPrompt.hash.status==="SAIDA"?"⚠️ HASH já foi vendida":"⚠️ HASH já está em uma máquina"} onClose={()=>setUnlinkPrompt(null)}>
      <div style={{marginBottom:16}}>
        <div style={{fontWeight:800,fontSize:14,marginBottom:6}}>⚡ {unlinkPrompt.sn}</div>
        {unlinkPrompt.hash.status==="SAIDA"
          ?<div style={{color:C.text,fontSize:13}}>Essa HASH já foi vendida{unlinkPrompt.hash.location?" ("+unlinkPrompt.hash.location+")":""}.</div>
          :<div style={{color:C.text,fontSize:13}}>Essa HASH já está instalada na máquina <b style={{color:C.accent}}>{unlinkPrompt.hash.machineSN}</b>.</div>}
        <div style={{color:C.muted,fontSize:12,marginTop:6}}>Nada muda agora — ela só sai de lá de verdade e passa pra essa máquina quando esse teste for <b>aprovado</b>. A {unlinkPrompt.hash.status==="SAIDA"?"venda antiga":"máquina antiga"} continua como está até lá.</div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn v="s" onClick={()=>setUnlinkPrompt(null)} style={{flex:1}}>Cancelar</Btn>
        <Btn v="y" onClick={confirmUnlink} style={{flex:1}}>🔓 Desvincular e usar aqui</Btn>
      </div>
    </Modal>}

    {/* RUIM Modal */}
    {ruimModal!==null&&<Modal title={"✗ Slot "+(ruimModal+1)+" RUIM"} onClose={()=>setRuimModal(null)}>
      <RuimSlotForm ctx={ctx} session={session} slotIndex={ruimModal} onSave={async(s)=>{await saveSession(s);setRuimModal(null)}}/>
    </Modal>}
  </div>;