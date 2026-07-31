const fs = require('fs');
let code = fs.readFileSync('desktop/local-helper.js', 'utf8');

const target = 'const TelegramBot = require(\'node-telegram-bot-api\').default || require(\'node-telegram-bot-api\');';
const replacement = `const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');

// Telegram config placeholders to prevent ReferenceError crashes
let telegramChatId = null;
let bot = null;
`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('desktop/local-helper.js', code);
    console.log("Patched local-helper.js to fix ReferenceError");
} else {
    console.log("Target not found!");
}
