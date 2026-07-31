const fs = require('fs');
let code = fs.readFileSync('desktop/local-helper.js', 'utf8');

const target = 'let bot = null;';
const replacement = 'let bot = { sendMessage: () => {} }; // Dummy bot to prevent TypeError if telegramChatId is set but bot is not initialized';

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('desktop/local-helper.js', code);
    console.log("Patched local-helper.js dummy bot");
} else {
    console.log("Target not found!");
}
