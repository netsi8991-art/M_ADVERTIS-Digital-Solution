const db = require('../database');

function buildSettingsKeyboard(user) {
    return {
        inline_keyboard: [
            [
                { text: user.photo_mode === 'Color' ? '✅ Color' : '🖼 Color', callback_data: 'set_photo_Color' },
                { text: user.photo_mode === 'Grey'  ? '✅ Grey'  : '🖤 Grey',  callback_data: 'set_photo_Grey'  },
            ],
            [
                { text: user.template === 'A' ? '✅ Template A' : '🅰 Template A', callback_data: 'set_template_A' },
                { text: user.template === 'B' ? '✅ Template B' : '🅱 Template B', callback_data: 'set_template_B' },
            ],
            [
                { text: !user.oval_cut ? '✅ Oval Off' : '⭕ Oval Off', callback_data: 'set_oval_0' },
                { text:  user.oval_cut ? '✅ Oval On'  : '⭕ Oval On',  callback_data: 'set_oval_1' },
            ],
        ],
    };
}

function handleStart(bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const user = db.createUser(msg.from.id, msg.from.username || '', msg.from.first_name || '');

        const welcomeText =
            `👋 Welcome to eFayda ID Card Converter Bot!\n` +
            `ወደ eFayda ID Card ቦት እንኳን ደህና መጡ!\n\n` +
            `📄 Send your eFayda PDF and get 4 printable ID card images:\n` +
            `📄 eFayda PDF ፋይልዎን ይላኩ 4 ካርድ ምስሎች ይደርስዎታል:\n\n` +
            `   • Normal card\n` +
            `   • Mirror card (for printing)\n` +
            `   • A4 Color sheet\n` +
            `   • A4 Gray sheet\n\n` +
            `✅ This service is completely FREE!\n` +
            `✅ ይህ አገልግሎት ሙሉ በሙሉ ነፃ ነው!\n\n` +
            `⚙️ Customize your card settings below:\n` +
            `⚙️ ካርድ ቅንብሮችዎን ከታች ያስተካክሉ:\n\n` +
            `Photo mode: ${user.photo_mode} | Template: ${user.template} | Oval: ${user.oval_cut ? 'On' : 'Off'}`;

        bot.sendMessage(chatId, welcomeText, { reply_markup: buildSettingsKeyboard(user) });
    });
}

function handleSettingsCallbacks(bot) {
    bot.on('callback_query', (query) => {
        const chatId = query.message.chat.id;
        const data   = query.data;
        const userId = query.from.id;

        if (!data.startsWith('set_')) return;

        let user = db.getUser(userId);
        if (!user) {
            user = db.createUser(userId, query.from.username || '', query.from.first_name || '');
        }

        if      (data.startsWith('set_photo_'))    db.setPhotoMode(userId, data.replace('set_photo_', ''));
        else if (data.startsWith('set_template_')) db.setTemplate(userId, data.replace('set_template_', ''));
        else if (data.startsWith('set_oval_'))     db.setOvalCut(userId, data === 'set_oval_1');

        user = db.getUser(userId);
        const updatedText =
            `⚙️ Settings updated!\n\n` +
            `Photo mode: ${user.photo_mode} | Template: ${user.template} | Oval: ${user.oval_cut ? 'On' : 'Off'}`;

        bot.editMessageText(updatedText, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: buildSettingsKeyboard(user),
        }).catch(() => {});

        bot.answerCallbackQuery(query.id, { text: '✅ Saved!' });
    });
}

module.exports = { handleStart, handleSettingsCallbacks };
