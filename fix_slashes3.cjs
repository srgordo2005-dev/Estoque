const fs = require('fs');

function fixFile(file) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Instead of regex, split and join
    code = code.split('\\\\`').join('`');
    code = code.split('\\\\$').join('$');
    
    fs.writeFileSync(file, code);
    console.log('Fixed ' + file);
}

fixFile('DataCenterPage_new.jsx');
fixFile('BenchConnectionPanel_new.jsx');
fixFile('src/App.jsx');
