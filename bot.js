require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const config = require('./src/config');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// Ensure required directories exist
[config.TEMP_DIR, path.join(__dirname, 'data')].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// HTTP health server for Render free plan (needs open port)
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200); res.end('eFayda Bot is running!');
}).listen(PORT, () => console.log(`Health server on port ${PORT}`));

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

console.log('🤖 eFayda ID Card Converter Bot starting...');
console.log(`👤 Admin: @${config.ADMIN_USERNAME}`);
console.log('✅ FREE MODE — no payment required');

const { handleStart, handleSettingsCallbacks } = require('./src/handlers/start');
const { handleDocument }                       = require('./src/handlers/document');
const { handleAdmin }                          = require('./src/handlers/admin');

handleStart(bot);
handleSettingsCallbacks(bot);
handleDocument(bot);
handleAdmin(bot);

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, error.message);
});

bot.on('error', (error) => {
    console.error('Bot error:', error.message);
});

process.on('SIGINT',  () => { console.log('Bot shutting down...'); bot.stopPolling(); process.exit(0); });
process.on('SIGTERM', () => { console.log('Bot shutting down...'); bot.stopPolling(); process.exit(0); });

console.log('✅ Bot is running!');
