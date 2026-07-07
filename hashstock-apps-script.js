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
const COL_MAC_SN = 1;          // A - SN
const COL_MAC_REF = 2;         // B - Referência (REF)
const COL_MAC_MODEL = 3;       // C - Modelo
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
const COL_HASH_SN = 1;         // A - SN
const COL_HASH_MODEL = 2;      // B - Modelo
const COL_HASH_STATUS = 3;     // C - Status (STOCK, NA MAQUINA, etc.)
const COL_HASH_CHIPS = 4;      // D - Chips
const COL_HASH_TECNICO = 5;    // E - Técnico
const COL_HASH_MAQUINA = 6;    // F - Máquina (SN)
const COL_HASH_DEFEITO = 7;    // G - Defeito

// --- DIRETIVAS DO DOPOST ---
function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const batch = json.batch || [];
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetMac = ss.getSheetByName("MAQUINAS") || ss.getSheets()[0];
    const sheetHash = ss.getSheetByName("HASH");
    const sheetReparo = ss.getSheetByName("REPARO HASH");
    const sheetTestes = ss.getSheetByName("TESTES");
    
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
        hashApprovedRow(sheetMac, sheetHash, payload);
      } else if (action === "hashBad") {
        hashBadRow(sheetHash, payload);
      } else if (action === "updateHashChips") {
        updateHashChipsRow(sheetHash, payload);
      } else if (action === "updateHashTecnico") {
        updateHashTecnicoRow(sheetHash, payload);
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
      return ContentService.createTextOutput(JSON.stringify({ status: "ok", time: new Date().toISOString(), version: "v5" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === "getMachines") {
      const sheet = ss.getSheetByName("MAQUINAS") || ss.getSheets()[0];
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      const machines = [];
      
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const sn = String(row[COL_MAC_SN - 1] || "").trim();
        if (!sn) continue;
        
        machines.push({
          sheetRow: r + 1,
          sn: sn,
          ref: String(row[COL_MAC_REF - 1] || ""),
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
      const sheet = ss.getSheetByName("HASH");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({ hashes: [] })).setMimeType(ContentService.MimeType.JSON);
      
      const data = sheet.getDataRange().getValues();
      const hashes = [];
      
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const sn = String(row[COL_HASH_SN - 1] || "").trim();
        if (!sn) continue;
        
        hashes.push({
          sn: sn,
          model: String(row[COL_HASH_MODEL - 1] || ""),
          status: String(row[COL_HASH_STATUS - 1] || ""),
          chips: Number(row[COL_HASH_CHIPS - 1] || 0),
          tecnico: String(row[COL_HASH_TECNICO - 1] || ""),
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
  
  // Mapeia o campo do App para a coluna correspondente
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
    // Apenas atualiza
    sheet.getRange(existing, COL_MAC_MODEL).setValue(p.model || "");
    sheet.getRange(existing, COL_MAC_TH).setValue(p.th || 0);
    sheet.getRange(existing, COL_MAC_SITUACAO).setValue(p.situacao || "STOCK");
    sheet.getRange(existing, COL_MAC_REF).setValue(p.ref || "");
    return;
  }
  
  // Cria nova linha com o número padrão de colunas
  const lastRow = sheet.getLastRow();
  const rowData = [];
  // Inicializa colunas vazias
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
    // Se a HASH tem coluna de localização ou usa a coluna Máquina
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
  sheet.getRange(row, COL_MAC_DATA_SAIDA).setValue(todayStr); // DATA DE SAÍDA NA COLUNA O (15) configurada acima
}

function machineFromClientRow(sheet, p) {
  const row = findRowBySN(sheet, COL_MAC_SN, p.sn);
  if (row === -1) return;
  
  sheet.getRange(row, COL_MAC_DESTINO).setValue(""); // Limpa cliente
  sheet.getRange(row, COL_MAC_DATA_SAIDA).setValue(""); // Limpa data de saída da planilha
}

function hashSaidaRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row === -1) return;
  
  sheet.getRange(row, COL_HASH_STATUS).setValue("SAIDA");
  sheet.getRange(row, COL_HASH_MAQUINA).setValue(p.machineSN || "");
}

function hashApprovedRow(sheetMac, sheetHash, p) {
  // Atualiza os slots da máquina na planilha
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
  
  // Atualiza o status da HASH
  if (sheetHash && p.sn) {
    const hRow = findRowBySN(sheetHash, COL_HASH_SN, p.sn);
    if (hRow !== -1) {
      sheetHash.getRange(hRow, COL_HASH_STATUS).setValue("NA MAQUINA");
      sheetHash.getRange(hRow, COL_HASH_MAQUINA).setValue(p.machineSN || "");
    } else {
      // Cria a HASH se não existir, evitando duplicatas no app
      const rowData = [];
      for (let i = 0; i < 10; i++) rowData.push("");
      rowData[COL_HASH_SN - 1] = p.sn.toUpperCase().trim();
      rowData[COL_HASH_MODEL - 1] = p.model || "";
      rowData[COL_HASH_STATUS - 1] = "NA MAQUINA";
      rowData[COL_HASH_MAQUINA - 1] = p.machineSN || "";
      sheetHash.appendRow(rowData);
    }
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

function updateHashChipsRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row !== -1) {
    sheet.getRange(row, COL_HASH_CHIPS).setValue(Number(p.chips || 0));
  }
}

function updateHashTecnicoRow(sheet, p) {
  if (!sheet) return;
  const row = findRowBySN(sheet, COL_HASH_SN, p.sn);
  if (row !== -1) {
    sheet.getRange(row, COL_HASH_TECNICO).setValue(p.tecnico || "");
  }
}

function addRepairRow(sheet, sheetHash, p) {
  if (!sheet) return;
  
  // Grava o conserto na aba "REPARO HASH"
  const dateVal = p.date ? new Date(p.date + "T12:00:00") : new Date();
  const dateStr = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  const rowData = [
    p.hashSN || "",
    p.model || "",
    p.type === "rework" ? "RETRABALHO" : "CONSERTO",
    dateStr,
    p.tecnico || p.employeeName || "",
    p.chips || 0,
    p.sensores || 0,
    p.ldos || 0,
    p.obsManual || p.notes || ""
  ];
  sheet.appendRow(rowData);
  
  // Garante que o status da HASH na aba principal vira "TESTAR", vinculando o técnico correto
  if (sheetHash && p.hashSN) {
    const hRow = findRowBySN(sheetHash, COL_HASH_SN, p.hashSN);
    if (hRow !== -1) {
      sheetHash.getRange(hRow, COL_HASH_STATUS).setValue("TESTAR");
      sheetHash.getRange(hRow, COL_HASH_TECNICO).setValue(p.tecnico || p.employeeName || "");
      sheetHash.getRange(hRow, COL_HASH_MAQUINA).setValue(""); // Desvincula
      if (p.chips) {
        sheetHash.getRange(hRow, COL_HASH_CHIPS).setValue(Number(p.chips));
      }
    } else {
      // HASH nova sendo cadastrada via conserto
      const rowDataHash = [];
      for (let i = 0; i < 10; i++) rowDataHash.push("");
      rowDataHash[COL_HASH_SN - 1] = p.hashSN.toUpperCase().trim();
      rowDataHash[COL_HASH_MODEL - 1] = p.model || "";
      rowDataHash[COL_HASH_STATUS - 1] = "TESTAR";
      rowDataHash[COL_HASH_TECNICO - 1] = p.tecnico || p.employeeName || "";
      if (p.chips) {
        rowDataHash[COL_HASH_CHIPS - 1] = Number(p.chips);
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
