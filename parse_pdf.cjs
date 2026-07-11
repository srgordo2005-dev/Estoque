const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const dataBuffer = fs.readFileSync('C:\\Users\\Felip\\Downloads\\Guia de Reparo para Iniciantes - Antminer S19j Pro (Treinamento).pdf');
const uint8 = new Uint8Array(dataBuffer);
const parser = new PDFParse(uint8);

parser.getText().then(result => {
    fs.writeFileSync('C:\\Users\\Felip\\.gemini\\antigravity\\scratch\\pdf_text.txt', result.text);
    console.log("PDF parsed successfully!");
}).catch(err => {
    console.error("Error parsing PDF:", err);
});
