/**
 * CÓDIGO DO GOOGLE APPS SCRIPT PARA INTEGRAÇÃO COM PLANILHA (hashstock-apps-script.js)
 * 
 * Instalação:
 * 1. Na sua planilha do Google Sheets, vá em Extensões -> Apps Script.
 * 2. Apague qualquer código existente e cole este código completo.
 * 3. Configure as letras ou índices das colunas no início do script, se necessário.
 * 4. Clique em Implantar -> Nova Implantação.
 * 5. Tipo: App da Web.
 * 6. Executar como: Você (seu e-mail).
 * 7. Quem tem acesso: Qualquer pessoa.
 * 8. Clique em Implantar, autorize os acessos e copie a URL gerada para colar nas Configurações do App.
 */

// --- CONFIGURAÇÃO DE COLUNAS DA ABA "MAQUINAS" (1-based: A=1, B=2, C=3, etc.) ---
// Estrutura: A=Data, B=SN, C=Modelo, D=TH, E=Situação, F=Localização, G=Destino, H=Slot1 SN...
const COL_MAC_REF = 1;         // A - Referência / Data de Entrada (Coluna A)
const COL_MAC_SN = 2;          // B - SN (Coluna B)
const COL_MAC_MODEL = 3;       // C - Modelo (Coluna C)
const COL_MAC_TH = 4;          // D - T/H
const COL_MAC_SITUACAO = 5;    // E - Situação
const COL_MAC_LOCATION = 6;    // F - Localização
const COL_MAC_DESTINO = 7;     // G - Destino (Cliente)
const COL_MAC_HASHSN0 = 8;     // H - Slot 1 (SN)
const COL_MAC_HASHSN1 = 9;     // I - Slot 2 (SN)
const COL_MAC_HASHSN2 = 10;    // J - Slot 3 (SN)
const COL_MAC_HASH0 = 11;      // K - Slot 1 (status)
const COL_MAC_HASH1 = 12;      // L - Slot 2 (status)
const COL_MAC_HASH2 = 13;      // M - Slot 3 (status)
const COL_MAC_CTR = 14;        // N - CTR (Controladora)
const COL_MAC_DATA_SAIDA = 15; // O - DATA DE SAÍDA (Coluna O = 15)
const COL_MAC_FONTE = 16;      // P - FONTE
const COL_MAC_FANS = 17;       // Q - FANS

// --- CONFIGURAÇÃO DE COLUNAS DA ABA "HASH" (1-based) ---
// Estrutura Real (Imagem 1): A=Data, B=SN, C=Modelo, D=Status, E=Máquina SN, F=Foto Log, G=Obs
const COL_HASH_SN = 2;         // B - SN (Coluna B)
const COL_HASH_MODEL = 3;      // C - Modelo (Coluna C)
const COL_HASH_STATUS = 4;     // D - Status (Coluna D)
const COL_HASH_MAQUINA = 5;    // E - Máquina (SN) (Coluna E)
const COL_HASH_FOTO = 6;       // F - Link da Foto (Coluna F)
const COL_HASH_DEFEITO = 7;    // G - Defeito / Obs (Coluna G)

// --- FUNÇÃO DE NORMALIZAÇÃO ROBUSTA DE TEXTO ---
function normalizeString(str) {
  if (!str) return "";
  return str.toString().toLowerCase()
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9]/g, ""); // Remove espaços e caracteres especiais
}

// --- FUNÇÃO PARA BUSCA ROBUSTA DE ABAS ---
function getSheetByNameRobust(ss, name) {
  const target = normalizeString(name);
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sName = normalizeString(sheets[i].getName());
    if (sName === target) {
      return sheets[i];
    }
  }
  return null;
}

// --- BUSCADOR INTELIGENTE DE ABA DE MÁQUINAS ---
function getMachinesSheet(ss) {
  // 1. Tenta achar pelo nome padrão robusto "MAQUINAS"
  let sheet = getSheetByNameRobust(ss, "MAQUINAS") || getSheetByNameRobust(ss, "MAQUINA");
  if (sheet) return sheet;
  
  // 2. Busca por uma aba cujo cabeçalho B1 seja "SN" (ignora históricos/reparos/testes/hashes)
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const name = normalizeString(s.getName());
    if (name.includes("reparo") || name.includes("teste") || name.includes("envio") || name.includes("saida") || name.includes("historico") || name.includes("hash")) {
      continue;
    }
    const hB = String(s.getRange(1, COL_MAC_SN).getValue() || "").trim().toLowerCase();
    if (hB === "sn" || hB === "s/n" || hB === "serial") {
      return s;
    }
  }
  
  // 3. Fallback
  return ss.getSheets()[0];
}

// --- BUSCADOR INTELIGENTE DE ABA DE HASH ---
function getHashesSheet(ss) {
  // 1. Tenta encontrar pelo nome exato robusto "HASH"
  let sheet = getSheetByNameRobust(ss, "HASH") || getSheetByNameRobust(ss, "HASHES") || getSheetByNameRobust(ss, "HASHBOARD");
  if (sheet) return sheet;
  
  // 2. Busca por uma aba cujo cabeçalho B1 seja "SN" (ignora históricos/reparos/testes)
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const name = normalizeString(s.getName());
    if (name.includes("reparo") || name.includes("teste") || name.includes("envio") || name.includes("saida") || name.includes("historico")) {
      continue;
    }
    const hB = String(s.getRange(1, COL_HASH_SN).getValue() || "").trim().toLowerCase();
    if (hB === "sn" || hB === "s/n" || hB === "serial") {
      return s;
    }
  }
  return null;
}

// --- DIRETIVAS DO DOPOST ---
function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const batch = json.batch || [];
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetMac = getMachinesSheet(ss);
    const sheetHash = getHashesSheet(ss) || getSheetByNameRobust(ss, "HASH");
    const sheetReparo = getSheetByNameRobust(ss, "REPARO DE HASH") || getSheetByNameRobust(ss, "REPARO HASH") || ss.getSheetByName("REPARO DE HASH");
    const sheetTestes = getSheetByNameRobust(ss, "TESTES") || ss.getSheetByName("TESTES");
    
    // Processa o lote (batch) de forma rápida
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const action = item.action;
      const payload = item.payload || {};
      
      if (action === "updateMachine") {
        updateMachineRow(sheetMac, payload);
      } else if (action === "addMachine") {
        addMachineRow(sheetMac, payload);
      } else if (action === "deleteMachineRow") {
        deleteMachineRow(sheetMac, payload);
      } else if (action === "updateHash") {
        updateHashRow(sheetHash, payload);
      } else if (action === "addHash") {
        addHashRow(sheetHash, payload);
      } else if (action === "deleteHashRow") {
        deleteHashRow(sheetHash, payload);
      } else if (action === "machineToClient") {
        machineToClientRow(sheetMac, payload);
      } else if (action === "machineFromClient") {
        machineFromClientRow(sheetMac, payload);
      } else if (action === "hashSaida") {
        hashSaidaRow(sheetHash, payload);
      } else if (action === "hashApproved") {
        hashApprovedRow(sheetMac, sheetHash, sheetReparo, payload);
      } else if (action === "hashBad") {
        hashBadRow(sheetHash, payload);
      } else if (action === "updateHashChips") {
        // No-op: aba HASH não tem coluna de Chips
      } else if (action === "updateHashTecnico") {
        // No-op: aba HASH não tem coluna de Técnico
      } else if (action === "repair" || action === "alreadyGood") {
        addRepairRow(sheetReparo, sheetHash, payload);
      } else if (action === "test") {
        addTestRow(sheetTestes, payload);
      }
    }
    
    SpreadsheetApp.flush();
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (action === "test") {
      const ssMac = getMachinesSheet(ss);
      const ssHash = getHashesSheet(ss);
      return ContentService.createTextOutput(JSON.stringify({ 
        status: "ok", 
        time: new Date().toISOString(), 
        version: "v11",
        detectedMachinesSheet: ssMac ? ssMac.getName() : "Nenhuma",
        detectedHashesSheet: ssHash ? ssHash.getName() : "Nenhuma",
        sheetsList: ss.getSheets().map(s => ({
          name: s.getName(),
          a1: String(s.getRange(1,1).getValue() || ""),
          b1: String(s.getRange(1,2).getValue() || "")
        }))
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "getMachines") {
      const sheet = getMachinesSheet(ss);
      const data = sheet.getDataRange().getValues();
      const machines = [];
      
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const rawSN = row[COL_MAC_SN - 1];
        
        // Pula se for objeto Date legítimo (não é SN de máquina)
        if (rawSN instanceof Date) continue;
        
        const sn = String(rawSN || "").trim();
        if (!sn) continue;
        
        // Pula se o SN tiver formato de data (ex: 23/03/2026 ou 2026-03-23)
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(sn) || /^\d{4}-\d{2}-\d{2}$/.test(sn)) {
          continue;
        }
        
        // Formata a Referência (Coluna A) se vier como Date da planilha
        let refVal = row[COL_MAC_REF - 1];
        let refStr = "";
        if (refVal instanceof Date) {
          refStr = Utilities.formatDate(refVal, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else {
          refStr = String(refVal || "").trim();
        }
        
        machines.push({
          sheetRow: r + 1,
          sn: sn,
          ref: refStr,
          model: String(row[COL_MAC_MODEL - 1] || ""),
          th: Number(row[COL_MAC_TH - 1] || 0),
          situacao: String(row[COL_MAC_SITUACAO - 1] || ""),
          location: String(row[COL_MAC_LOCATION - 1] || ""),
          destino: String(row[COL_MAC_DESTINO - 1] || ""),
          hashSN0: String(row[COL_MAC_HASHSN0 - 1] || ""),
          hashSN1: String(row[COL_MAC_HASHSN1 - 1] || ""),
          hashSN2: String(row[COL_MAC_HASHSN2 - 1] || ""),
          hash0: String(row[COL_MAC_HASH0 - 1] || ""),
          hash1: String(row[COL_MAC_HASH1 - 1] || ""),
          hash2: String(row[COL_MAC_HASH2 - 1] || ""),
          controladora: String(row[COL_MAC_CTR - 1] || ""),
          fonte: String(row[COL_MAC_FONTE - 1] || ""),
          fans: String(row[COL_MAC_FANS - 1] || "")
        });
      }
      return ContentService.createTextOutput(JSON.stringify({ machines: machines }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "getHashes") {
      const sheet = getHashesSheet(ss) || getSheetByNameRobust(ss, "HASH");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({ hashes: [] })).setMimeType(ContentService.MimeType.JSON);
      
      const data = sheet.getDataRange().getValues();
      const hashes = [];
      
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const rawSN = row[COL_HASH_SN - 1];
        
        if (rawSN instanceof Date) continue;
        
        const sn = String(rawSN || "").trim();
        if (!sn) continue;
        
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(sn) || /^\d{4}-\d{2}-\d{2}$/.test(sn)) {
          continue;
        }
        
        hashes.push({
          sn: sn,
          model: String(row[COL_HASH_MODEL - 1] || ""),
          status: String(row[COL_HASH_STATUS - 1] || ""),
          chips: 0, // Sem coluna de Chips na aba HASH
          tecnico: "", // Sem coluna de Técnico na aba HASH
          machineSN: String(row[COL_HASH_MAQUINA - 1] || ""),
          defeito: String(row[COL_HASH_DEFEITO - 1] || "")
        });
      }
      return ContentService.createTextOutput(JSON.stringify({ hashes: hashes }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ error: "Ação desconhecida" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- AUXILIARES PARA LOCALIZAÇÃO DE LINHAS ---
function findRowBySN(sheet, colIndex, sn) {
  if (!sn) return -1;
  const data = sheet.getDataRange().getValues();
  const searchSN = sn.toString().trim().toUpperCase();
  for (let i = 1; i < data.length; i++) {
    const val = String(data[i][colIndex - 1] || "").trim().toUpperCase();
    if (val === searchSN) {
      return i + 1; // 1-based index do Sheets
    }
  }
  return -1;
}

// --- IMPLEMENTAÇÃO DE CADA AÇÃO ---

function updateMachineRow(sheet, p) {
  let row = -1;
  if (p.row) {
    row = p.row;
  } else {
    row = findRowBySN(sheet, COL_MAC_SN, p.sn);
  }
  
  if (row === -1) return;
  
  let col = -1;
  const f = p.field;
  if (f === "situacao") col = COL_MAC_SITUACAO;
  else if (f === "model") col = COL_MAC_MODEL;
  else if (f === "th") col = COL_MAC_TH;
  else if (f === "ref") col = COL_MAC_REF;
  else if (f === "location") col = COL_MAC_LOCATION;
  else if (f === "destino") col = COL_MAC_DESTINO;
  else if (f === "hashSN0") col = COL_MAC_HASHSN0;
  else if (f === "hashSN1") col = COL_MAC_HASHSN1;
  else if (f === "hashSN2") col = COL_MAC_HASHSN2;
  else if (f === "hash0") col = COL_MAC_HASH0;
  else if (f === "hash1") col = COL_MAC_HASH1;
  else if (f === "hash2") col = COL_MAC_HASH2;
  else if (f === "controladora") col = COL_MAC_CTR;
  else if (f === "fonte") col = COL_MAC_FONTE;
  else if (f === "fans") col = COL_MAC_FANS;
  
  if (col !== -1) {
    sheet.getRange(row, col).setValue(p.to ?? "");
  }
}

function addMachineRow(sheet, p) {
  if (!p.sn) return;
  const existing = findRowBySN(sheet, COL_MAC_SN, p.sn);
  if (existing !== -1) {
    sheet.getRange(existing, COL_MAC_MODEL).setValue(p.model || "");
    sheet.getRange(existing, COL_MAC_TH).setValue(p.th || 0);
    sheet.getRange(existing, COL_MAC_SITUACAO).setValue(p.situacao || "STOCK");
    sheet.getRange(existing, COL_MAC_REF).setValue(p.ref || "");
    return;
  }
  
  const lastRow = sheet.getLastRow();
  const rowData = [];
  for (let i = 0; i < 20; i++) rowData.push("");
  
  rowData[COL_MAC_SN - 1] = p.sn.toUpperCase().trim();
  rowData[COL_MAC_REF - 1] = p.ref || "";
  rowData[COL_MAC_MODEL - 1] = p.model || "";
  rowData[COL_MAC_TH - 1] = p.th || 0;
  rowData[COL_MAC_SITUACAO - 1] = p.situacao || "STOCK";
  
  sheet.appendRow(rowData);
}

function deleteMachineRow(sheet, p) {
  const row = findRowBySN(sheet, COL_MAC_SN, p.sn);
  if (row !== -1) {
    sheet.deleteRow(row);
  }
}

function updateHashRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row === -1) return;
  
  if (p.field === "status") {
    sheet.getRange(row, COL_HASH_STATUS).setValue(p.to || "");
  } else if (p.field === "machineSN") {
    sheet.getRange(row, COL_HASH_MAQUINA).setValue(p.to || "");
  } else if (p.field === "location") {
    sheet.getRange(row, COL_HASH_MAQUINA).setValue(p.to || "");
  }
}

function addHashRow(sheet, p) {
  if (!sheet || !p.sn) return;
  const existing = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (existing !== -1) {
    sheet.getRange(existing, COL_HASH_MODEL).setValue(p.model || "");
    sheet.getRange(existing, COL_HASH_STATUS).setValue(p.status || "STOCK");
    return;
  }
  
  const rowData = [];
  for (let i = 0; i < 10; i++) rowData.push("");
  
  rowData[COL_HASH_SN - 1] = p.sn.toUpperCase().trim();
  rowData[COL_HASH_MODEL - 1] = p.model || "";
  rowData[COL_HASH_STATUS - 1] = p.status || "STOCK";
  
  sheet.appendRow(rowData);
}

function deleteHashRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row !== -1) {
    sheet.deleteRow(row);
  }
}

function machineToClientRow(sheet, p) {
  const row = findRowBySN(sheet, COL_MAC_SN, p.sn);
  if (row === -1) return;
  
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  sheet.getRange(row, COL_MAC_SITUACAO).setValue("SAIDA");
  sheet.getRange(row, COL_MAC_DESTINO).setValue(p.destino || "");
  sheet.getRange(row, COL_MAC_DATA_SAIDA).setValue(todayStr);
}

function machineFromClientRow(sheet, p) {
  const row = findRowBySN(sheet, COL_MAC_SN, p.sn);
  if (row === -1) return;
  
  sheet.getRange(row, COL_MAC_DESTINO).setValue(""); // Limpa cliente
  sheet.getRange(row, COL_MAC_DATA_SAIDA).setValue(""); // Limpa data de saída
}

function hashSaidaRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row === -1) return;
  
  sheet.getRange(row, COL_HASH_STATUS).setValue("SAIDA");
  sheet.getRange(row, COL_HASH_MAQUINA).setValue(p.machineSN || "");
}

function hashApprovedRow(sheetMac, sheetHash, sheetReparo, p) {
  let modelVal = p.model || "";
  let chipsVal = p.chips || 0;
  let tecVal = p.employeeName || "";
  
  // 1. Atualiza o status da HASH na aba principal "HASH" (Fica "NA MAQUINA")
  if (sheetHash && p.sn) {
    const hRow = findRowBySN(sheetHash, COL_HASH_SN, p.sn);
    if (hRow !== -1) {
      modelVal = String(sheetHash.getRange(hRow, COL_HASH_MODEL).getValue() || modelVal);
      sheetHash.getRange(hRow, COL_HASH_STATUS).setValue("NA MAQUINA");
      sheetHash.getRange(hRow, COL_HASH_MAQUINA).setValue(p.machineSN || "");
    } else {
      const rowData = [];
      for (let i = 0; i < 10; i++) rowData.push("");
      rowData[COL_HASH_SN - 1] = p.sn.toUpperCase().trim();
      rowData[COL_HASH_MODEL - 1] = modelVal;
      rowData[COL_HASH_STATUS - 1] = "NA MAQUINA";
      rowData[COL_HASH_MAQUINA - 1] = p.machineSN || "";
      sheetHash.appendRow(rowData);
    }
  }

  // 2. Atualiza os slots da máquina na planilha (Fica "ON")
  if (sheetMac && p.machineSN) {
    const mRow = findRowBySN(sheetMac, COL_MAC_SN, p.machineSN);
    if (mRow !== -1) {
      const idx = Number(p.slot);
      const slotSNCol = idx === 0 ? COL_MAC_HASHSN0 : idx === 1 ? COL_MAC_HASHSN1 : COL_MAC_HASHSN2;
      const slotStCol = idx === 0 ? COL_MAC_HASH0 : idx === 1 ? COL_MAC_HASH1 : COL_MAC_HASH2;
      
      sheetMac.getRange(mRow, slotSNCol).setValue(p.sn || "");
      sheetMac.getRange(mRow, slotStCol).setValue("ON");
    }
  }
  
  // 3. Grava uma nova linha na aba "REPARO DE HASH" com SITUACAO = "BOA" (Imagem 2)
  if (sheetReparo && p.sn) {
    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    // A=Data, B=MODELO, C=CHIPS, D=SN / MAC, E=LOCAL (deixado vazio), F=SITUACAO (BOA), G=TECNICO, H=DEFEITO
    const rowData = [
      todayStr,                             // A - Data
      modelVal,                             // B - MODELO
      chipsVal,                             // C - CHIPS
      p.sn.toUpperCase().trim(),            // D - SN / MAC
      "",                                   // E - LOCAL (Deixado em branco)
      "BOA",                                // F - SITUACAO (Fica "BOA" conforme pedido!)
      tecVal,                               // G - TECNICO
      ""                                    // H - DEFEITO
    ];
    sheetReparo.appendRow(rowData);
  }
}

function hashBadRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row !== -1) {
    sheet.getRange(row, COL_HASH_STATUS).setValue("REPARO");
    sheet.getRange(row, COL_HASH_MAQUINA).setValue(""); // Desvincula da máquina
    if (p.obs) {
      sheet.getRange(row, COL_HASH_DEFEITO).setValue(p.obs);
    }
  }
}

function addRepairRow(sheet, sheetHash, p) {
  if (!sheet) return;
  
  // Grava o conserto na aba "REPARO DE HASH" (Estrutura Real do Usuário - Imagem 2)
  const dateVal = p.date ? new Date(p.date + "T12:00:00") : new Date();
  const dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  const statusVal = p.type === "rework" ? "REPARAR" : "TESTAR";
  
  // A=Data, B=MODELO, C=CHIPS, D=SN / MAC, E=LOCAL (deixado vazio conforme pedido!), F=SITUACAO, G=TECNICO, H=DEFEITO
  const rowData = [
    dateStr,                              // A - Data
    p.model || "",                        // B - MODELO
    p.chips || 0,                         // C - CHIPS
    p.hashSN || "",                       // D - SN / MAC
    "",                                   // E - LOCAL (Deixado em branco para você selecionar manualmente na planilha)
    statusVal,                            // F - SITUACAO (TESTAR ou REPARAR)
    p.tecnico || p.employeeName || "",    // G - TECNICO (Nome do técnico)
    p.obsManual || p.notes || ""          // H - DEFEITO (Obs)
  ];
  sheet.appendRow(rowData);
  
  // Garante que o status da HASH na aba principal "HASH" vira "TESTAR" ou "REPARO"
  if (sheetHash && p.hashSN) {
    const hRow = findRowBySN(sheetHash, COL_HASH_SN, p.hashSN);
    if (hRow !== -1) {
      sheetHash.getRange(hRow, COL_HASH_STATUS).setValue(statusVal);
      sheetHash.getRange(hRow, COL_HASH_MAQUINA).setValue(""); // Desvincula
      if (p.obsManual || p.notes) {
        sheetHash.getRange(hRow, COL_HASH_DEFEITO).setValue(p.obsManual || p.notes);
      }
    } else {
      // HASH nova sendo cadastrada via conserto
      const rowDataHash = [];
      for (let i = 0; i < 10; i++) rowDataHash.push("");
      rowDataHash[COL_HASH_SN - 1] = p.hashSN.toUpperCase().trim();
      rowDataHash[COL_HASH_MODEL - 1] = p.model || "";
      rowDataHash[COL_HASH_STATUS - 1] = statusVal;
      if (p.obsManual || p.notes) {
        rowDataHash[COL_HASH_DEFEITO - 1] = p.obsManual || p.notes;
      }
      sheetHash.appendRow(rowDataHash);
    }
  }
}

function addTestRow(sheet, p) {
  if (!sheet) return;
  const dateVal = p.date ? new Date(p.date) : new Date();
  const dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
  
  const rowData = [
    p.machineSN || "",
    p.model || "",
    dateStr,
    p.overallResult === "good" ? "BOA" : "RUIM",
    p.employeeName || "",
    p.slot0HashSN || "",
    p.slot0Result || "",
    p.slot1HashSN || "",
    p.slot1Result || "",
    p.slot2HashSN || "",
    p.slot2Result || ""
  ];
  sheet.appendRow(rowData);
}
