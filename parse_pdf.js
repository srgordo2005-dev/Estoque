import fs from 'fs';
import pdf from 'pdf-parse';

let dataBuffer = fs.readFileSync('C:\\Users\\Felip\\Downloads\\Guia de Reparo para Iniciantes - Antminer S19j Pro (Treinamento).pdf');

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('C:\\Users\\Felip\\.gemini\\antigravity\\scratch\\pdf_text.txt', data.text);
    console.log("PDF parsed successfully!");
}).catch(err => {
    console.error(err);
});
