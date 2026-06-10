require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN environment variable is required!');
    process.exit(1);
}

module.exports = {
    BOT_TOKEN,
    ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'DrStone5869',
    ADMIN_IDS: (process.env.ADMIN_IDS || '').split(',').filter(Boolean).map(Number),
    FREE_MODE: true,
    DB_PATH: require('path').join(__dirname, '..', 'data', 'bot.db'),
    TEMP_DIR: require('path').join(__dirname, '..', 'data', 'temp'),
    ASSETS_DIR: require('path').join(__dirname, 'assets'),
    RATE_LIMIT_WINDOW_MS: 60 * 1000,
    RATE_LIMIT_MAX_REQUESTS: 3,
};
