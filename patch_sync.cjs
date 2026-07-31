const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

const target = `    if(d.error){
      console.error("syncSheet erro:",d.error);
      onSyncSheetError?.(\`Planilha não salvou "\${b[0]?.action}": \${d.error}\`);
      // Re-queue
      wQ = [...b, ...wQ];
      saveSheetQueue();
    } else {
      console.log(\`✓ syncSheet: \${b.length} ação(ões) enviada(s) pra planilha\`,b.map(x=>x.action));
    }
  }catch(e){
    console.error("syncSheet falhou:",e);
    onSyncSheetError?.(\`Planilha não respondeu pra "\${b[0]?.action}": \${e.message}\`);
    // Re-queue
    wQ = [...b, ...wQ];
    saveSheetQueue();
  }`;

const replacement = `    if(d.error){
      console.error("syncSheet erro:",d.error);
      onSyncSheetError?.(\`Planilha não salvou "\${b[0]?.action}": \${d.error}\`);
      // Re-queue
      wQ = [...b, ...wQ];
      saveSheetQueue();
      setTimeout(() => triggerSheetSync(currentUrl), 15000); // Tenta de novo em 15s
    } else {
      console.log(\`✓ syncSheet: \${b.length} ação(ões) enviada(s) pra planilha\`,b.map(x=>x.action));
    }
  }catch(e){
    console.error("syncSheet falhou:",e);
    onSyncSheetError?.(\`Planilha não respondeu pra "\${b[0]?.action}": \${e.message}\`);
    // Re-queue
    wQ = [...b, ...wQ];
    saveSheetQueue();
    setTimeout(() => triggerSheetSync(currentUrl), 15000); // Tenta de novo em 15s
  }`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('src/App.jsx', code);
    console.log("Patched triggerSheetSync successfully!");
} else {
    console.log("Target string not found.");
}
