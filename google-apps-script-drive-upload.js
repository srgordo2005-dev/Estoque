/**
 * CÓDIGO DO GOOGLE APPS SCRIPT PARA SALVAR FOTOS NO DRIVE (google-apps-script-drive-upload.js)
 * 
 * Instalação:
 * 1. Crie um novo arquivo/projeto no Google Apps Script (pode ser o mesmo ou outro).
 * 2. Apague qualquer código existente e cole este código completo.
 * 3. Altere o FOLDER_ID para a ID da pasta do Google Drive onde você quer salvar as fotos.
 * 4. Implante como App da Web (Executar como: você, Acesso: Qualquer pessoa).
 * 5. Copie a URL e cole nas Configurações do App.
 */

const FOLDER_ID = "SEU_FOLDER_ID_DO_DRIVE_AQUI"; // Cole aqui a ID da pasta do Google Drive

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const filename = data.filename || "photo.jpg";
    const b64 = data.b64; // base64 string
    const folderName = data.folder || "photos";
    
    let rootFolder;
    if (FOLDER_ID && FOLDER_ID !== "SEU_FOLDER_ID_DO_DRIVE_AQUI") {
      rootFolder = DriveApp.getFolderById(FOLDER_ID);
    } else {
      rootFolder = DriveApp.getRootFolder();
    }
    
    // Procura ou cria a subpasta (ex: "hashes", "photos")
    let targetFolder;
    const subFolders = rootFolder.getFoldersByName(folderName);
    if (subFolders.hasNext()) {
      targetFolder = subFolders.next();
    } else {
      targetFolder = rootFolder.createFolder(folderName);
    }
    
    // Converte base64 para blob
    const contentType = b64.substring(b64.indexOf(":") + 1, b64.indexOf(";"));
    const base64Data = b64.substring(b64.indexOf(",") + 1);
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, contentType, filename);
    
    // Cria o arquivo no Drive
    const file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
    
    const viewUrl = file.getUrl();
    const downloadUrl = "https://docs.google.com/uc?export=download&id=" + file.getId();
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "ok",
      photoKey: file.getId(),
      url: downloadUrl
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
