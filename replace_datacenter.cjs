const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');
const newComponent = fs.readFileSync('DataCenterPage_new.jsx', 'utf8');

// Find start and end of DataCenterPage
let lines = code.split('\\n');
let startIdx = -1;
let endIdx = -1;
let depth = 0;
let inFunc = false;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('function DataCenterPage({ctx})') && !inFunc) {
        inFunc = true;
        startIdx = i;
    }
    if (inFunc) {
        for (let c of lines[i]) {
            if (c === '{') depth++;
            if (c === '}') depth--;
        }
        if (depth === 0) {
            endIdx = i;
            break;
        }
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    let before = lines.slice(0, startIdx).join('\\n');
    let after = lines.slice(endIdx + 1).join('\\n');
    fs.writeFileSync('src/App.jsx', before + '\\n\\n' + newComponent + '\\n\\n' + after);
    console.log("Successfully replaced DataCenterPage in App.jsx");
} else {
    console.log("Could not find DataCenterPage boundaries");
}
