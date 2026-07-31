const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
let newComponent = fs.readFileSync('DataCenterPage_new.jsx', 'utf8');

newComponent = newComponent.split('\\\\`').join('`');
newComponent = newComponent.split('\\\\$').join('$');

const startStr = 'function DataCenterPage({ctx}) {';
const endStr = 'function AddMachineModalWrapper({ctx, initialMode="single", onClose}) {';

let startIdx = code.indexOf(startStr);
let endIdx = code.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    let before = code.substring(0, startIdx);
    let after = code.substring(endIdx);
    fs.writeFileSync('src/App.jsx', before + newComponent + '\n\n' + after);
    console.log("Successfully replaced DataCenterPage safely!");
} else {
    console.log("Failed to find boundaries!", startIdx, endIdx);
}
