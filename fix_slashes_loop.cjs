const fs = require('fs');

let code = fs.readFileSync('src/App.jsx', 'utf8');

let newCode = '';
for (let i = 0; i < code.length; i++) {
    if (code[i] === '\\' && code[i+1] === '`') {
        newCode += '`';
        i++;
    } else if (code[i] === '\\' && code[i+1] === '$') {
        newCode += '$';
        i++;
    } else {
        newCode += code[i];
    }
}

fs.writeFileSync('src/App.jsx', newCode);
console.log('Fixed backslashes using loop');
