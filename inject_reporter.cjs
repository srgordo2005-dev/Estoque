const fs = require('fs');

let helperCode = fs.readFileSync('desktop/local-helper.js', 'utf8');

const search = `app.listen(PORT, () => {`;
const replace = `
// Import and initialize Farm Reporter
try {
    require('./farm-reporter.js')(app);
} catch (e) {
    console.error('[Farm Reporter] Failed to initialize:', e.message);
}

app.listen(PORT, () => {`;

if (helperCode.includes(search) && !helperCode.includes('require(\'./farm-reporter.js\')')) {
    helperCode = helperCode.replace(search, replace);
    fs.writeFileSync('desktop/local-helper.js', helperCode);
    console.log("Injected farm-reporter into local-helper.js");
} else {
    console.log("Could not find injection point or already injected.");
}
