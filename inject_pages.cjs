const fs = require('fs');

let code = fs.readFileSync('src/App.jsx', 'utf8');
let scannerCode = fs.readFileSync('ScannerPage_new.jsx', 'utf8');
let gridCode = fs.readFileSync('DataCenterPage_new2.jsx', 'utf8');

// Fix slashes
scannerCode = scannerCode.split('\\\\`').join('`');
scannerCode = scannerCode.split('\\\\$').join('$');
gridCode = gridCode.split('\\\\`').join('`');
gridCode = gridCode.split('\\\\$').join('$');

const startStr = 'function DataCenterPage({ctx}) {';
const endStr = 'function AddMachineModalWrapper({ctx, initialMode="single", onClose}) {';

let startIdx = code.indexOf(startStr);
let endIdx = code.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    let before = code.substring(0, startIdx);
    let after = code.substring(endIdx);
    
    // Check if the scanner tab is in sidebar
    if (!before.includes('id:"scanner"')) {
        // Find the line that has 'id:"datacenter"' and insert scanner tab before it
        before = before.replace('id:"datacenter"', 'id:"scanner",icon:"📡",label:"Scanner"}]:[]),...(user?.code==="019"?[{id:"datacenter"');
    }

    // Add Scanner tab mapping
    if (!before.includes('tab==="scanner"')) {
        before = before.replace('{tab==="datacenter"&&user?.code==="019"&&<DataCenterPage ctx={ctx}/>}', 
                                '{tab==="scanner"&&user?.code==="019"&&<ScannerPage ctx={ctx}/>}\n        {tab==="datacenter"&&user?.code==="019"&&<DataCenterPage ctx={ctx}/>}');
    }

    fs.writeFileSync('src/App.jsx', before + gridCode + '\n\n' + scannerCode + '\n\n' + after);
    console.log("Successfully replaced and injected pages!");
} else {
    console.log("Failed to find boundaries!", startIdx, endIdx);
}
