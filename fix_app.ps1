# Fix App.jsx with line-based edits
$lines = [System.IO.File]::ReadAllLines("$PWD\src\App.jsx")

# FIX 1: Line 87 (0-indexed: 86) - remove \n and misplaced button
$line87 = $lines[86]
$lines[86] = "       </div>"

# FIX 2: Lines 1934-1976 (0-indexed: 1933-1975) - remove misplaced downloadPDF from QHashEdit
# Replace line 1934 (the blank line after isInsideMachine) with nothing
# and remove lines 1935-1976 (the downloadPDF function)
# We need to keep line 1933 (isInsideMachine) and line 1977 (return <div>)
$newLines = [System.Collections.Generic.List[string]]::new()
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($i -ge 1933 -and $i -le 1975) {
        # Skip these lines (the misplaced downloadPDF function)
        continue
    }
    $newLines.Add($lines[$i])
}

# Now find the DailyTeamReport return statement and add buttons
# After removing 43 lines, line numbers shifted. Find the exact line.
$targetIdx = -1
for ($i = 0; $i -lt $newLines.Count; $i++) {
    if ($newLines[$i] -match "return<div>" -and $i -gt 7300) {
        # Check if previous lines have nRepairs/nTests (DailyTeamReport context)
        $prev = $newLines[$i - 1]
        if ($prev -match "nRemoves") {
            $targetIdx = $i
            break
        }
    }
}

if ($targetIdx -gt 0) {
    Write-Host "Found DailyTeamReport return at line $($targetIdx + 1)"
    
    # Build the PDF function + buttons to insert before the return
    $pdfBlock = @"
    const downloadTeamPDF = async () => {
      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();
        const eName = empFilter ? employees.find(e=>e._id===empFilter)?.name : 'Todos os Tecnicos';
        doc.setFillColor(31, 31, 31);
        doc.rect(0, 0, 210, 297, 'F');
        doc.setTextColor(240, 185, 11);
        doc.setFontSize(22);
        doc.text("HASHSTOCK", 105, 20, {align: 'center'});
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.text("Relatorio de Produtividade Tecnica", 105, 30, {align: 'center'});
        doc.setFontSize(11);
        doc.setTextColor(180, 180, 180);
        doc.text("Tecnico: " + eName, 20, 45);
        doc.text("Data: " + date, 20, 52);
        let y = 65;
        const drawLine = (text1, text2, isHeader = false) => {
          if (y > 270) { doc.addPage(); doc.setFillColor(31, 31, 31); doc.rect(0, 0, 210, 297, 'F'); y = 20; }
          if (isHeader) { doc.setTextColor(240, 185, 11); doc.setFontSize(12); }
          else { doc.setTextColor(255, 255, 255); doc.setFontSize(11); }
          doc.text(text1, 20, y);
          doc.text(String(text2), 160, y);
          y += 8;
        };
        drawLine("Movimentacao", "Detalhes", true);
        items.forEach(it => {
          drawLine(it.who + ": " + it.text.substring(0, 60), fmtTS(it.at) || "");
        });
        y += 5;
        drawLine("TOTAL CONSERTOS", String(nRepairs), true);
        drawLine("TOTAL TESTES", String(nTests), true);
        if (nAlreadyGood > 0) drawLine("JA BOAS", String(nAlreadyGood), true);
        if (nRemoves > 0) drawLine("REMOCOES", String(nRemoves), true);
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.text("Gerado automaticamente pelo HashStock Farm Management", 105, 290, {align: 'center'});
        doc.save("Relatorio_" + eName.replace(/\s+/g, '_') + "_" + date + ".pdf");
      } catch (err) {
        alert("Erro ao gerar PDF: " + err.message);
      }
    };
"@

    $newLines.Insert($targetIdx, $pdfBlock)
    $targetIdx++ # shift because we inserted

    # Now replace the return<div> block with one that includes the buttons
    # The original line is: return<div>
    # Following line is: <div style={{display:"flex",gap:8,marginBottom:10}}>
    # Then: <div style={{flex:1}}><DateInp label="DATA"...
    # Then: </div>
    
    # Replace the existing return block
    $newLines[$targetIdx] = '    return<div>'
    
    # Find the </div> that closes the date input container (next few lines)
    # Original: <div style={{display:"flex",...}}> ... <DateInp .../> ... </div>
    $dateCloseIdx = $targetIdx + 1
    for ($j = $targetIdx + 1; $j -lt $targetIdx + 5; $j++) {
        if ($newLines[$j] -match "DateInp") {
            $dateCloseIdx = $j
            break
        }
    }
    
    # Find the closing </div> for the flex container
    $closeDivIdx = $dateCloseIdx + 1
    for ($j = $dateCloseIdx; $j -lt $dateCloseIdx + 3; $j++) {
        if ($newLines[$j].Trim() -eq '</div>') {
            $closeDivIdx = $j
            break
        }
    }
    
    # Insert "Todo o Historico" button and PDF button after the DateInp div
    $buttonLines = @(
        '        <Btn onClick={()=>setDate("2000-01-01")} v="y" style={{height:40, alignSelf:"flex-end"}}>📜 Todo o Historico</Btn>'
        '      </div>'
        '      <div style={{display:"flex",gap:8,marginBottom:10}}>'
        '        <Btn v="p" onClick={downloadTeamPDF} style={{flex:1,justifyContent:"center"}}>📄 Baixar PDF Profissional</Btn>'
    )
    
    # Replace the </div> line with button + extra container
    $newLines[$closeDivIdx] = $buttonLines -join "`r`n"
    
    Write-Host "Buttons inserted after line $($closeDivIdx + 1)"
} else {
    Write-Host "ERROR: Could not find DailyTeamReport return statement"
}

[System.IO.File]::WriteAllLines("$PWD\src\App.jsx", $newLines)
Write-Host "Done. File saved."
