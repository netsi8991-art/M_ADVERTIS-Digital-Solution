const config = require('../config');
const db = require('../database');

function isAdmin(msg) {
    if (!msg.from) return false;
    const byUsername = msg.from.username &&
        msg.from.username.toLowerCase() === config.ADMIN_USERNAME.toLowerCase();
    const byId = config.ADMIN_IDS.includes(msg.from.id);
    return byUsername || byId;
}

function handleAdmin(bot) {

    bot.onText(/\/help/, (msg) => {
        let text =
            `📋 Available Commands:\n\n` +
            `/start — Start bot & configure settings\n` +
            `/stats — Your usage stats\n` +
            `/help — Show this message\n\n` +
            `📄 Send an eFayda PDF to convert it to printable ID cards.\n` +
            `✅ Service is completely FREE.`;

        if (isAdmin(msg)) {
            text +=
                `\n\n🔧 Admin Commands:\n` +
                `/adminstats — Bot statistics\n` +
                `/users — List recent users\n` +
                `/broadcast <message> — Send to all users`;
        }

        bot.sendMessage(msg.chat.id, text);
    });

    bot.onText(/\/stats/, (msg) => {
        const userId = msg.from.id;
        let user = db.getUser(userId);
        if (!user) {
            user = db.createUser(userId, msg.from.username || '', msg.from.first_name || '');
        }
        bot.sendMessage(msg.chat.id,
            `📊 Your Stats\n\n` +
            `🆔 IDs Processed: ${user.total_ids_processed}\n` +
            `📅 Member since: ${new Date(user.created_at).toLocaleDateString()}\n\n` +
            `📊 የእርስዎ ስታቲስቲክስ\n` +
            `🆔 የተሰሩ መታወቂያዎች: ${user.total_ids_processed}`);
    });

    bot.onText(/\/adminstats/, (msg) => {
        if (!isAdmin(msg)) {
            bot.sendMessage(msg.chat.id, '❌ Admin only.');
            return;
        }
        const s = db.getStats();
        bot.sendMessage(msg.chat.id,
            `📊 Bot Statistics\n\n` +
            `👥 Total Users: ${s.total_users || 0}\n` +
            `🆔 Total IDs Processed: ${s.total_ids || 0}\n` +
            `📅 Today's IDs: ${s.today_ids || 0}`);
    });

    bot.onText(/\/users/, (msg) => {
        if (!isAdmin(msg)) {
            bot.sendMessage(msg.chat.id, '❌ Admin only.');
            return;
        }
        const users = db.getAllUsers();
        if (!users.length) {
            bot.sendMessage(msg.chat.id, 'No users yet.');
            return;
        }
        let text = `👥 Recent Users (${users.length}):\n\n`;
        users.slice(0, 30).forEach((u, i) => {
            text += `${i + 1}. @${u.username || 'N/A'} — ${u.first_name || 'N/A'} | IDs: ${u.total_ids_processed}\n`;
        });
        bot.sendMessage(msg.chat.id, text);
    });

    bot.onText(/\/broadcast (.+)/, (msg, match) => {
        if (!isAdmin(msg)) {
            bot.sendMessage(msg.chat.id, '❌ Admin only.');
            return;
        }
        const text  = match[1];
        const users = db.getAllUsers();
        let sent = 0, failed = 0;
        const sends = users.map(u =>
            bot.sendMessage(u.telegram_id, `📢 ${text}`)
                .then(() => { sent++; })
                .catch(() => { failed++; })
        );
        Promise.all(sends).then(() => {
            bot.sendMessage(msg.chat.id, `📢 Done! ✅ ${sent} sent, ❌ ${failed} failed.`);
        });
    });
}

module.exports = { handleAdmin, isAdmin };
