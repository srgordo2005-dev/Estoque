const fs = require('fs');

function search(file, query) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(query)) {
            console.log(`[Line ${i+1}] ${lines[i].trim()}`);
            let start = Math.max(0, i - 2);
            let end = Math.min(lines.length, i + 5);
            console.log(lines.slice(start, end).join('\n'));
            console.log('---');
        }
    }
}

const query = process.argv[2];
if (query) {
    search('src/App.jsx', query);
} else {
    console.log("No query");
}
