const path = require('path');
const fs = require('fs');
const config = require('../config');
const db = require('../database');
const { parseAndExtract } = require('../services/pdf-parser');
const { generateAllCards } = require('../services/card-generator');

const rateLimitMap = new Map();

function checkRateLimit(userId) {
    const now = Date.now();
    const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
    if (now - entry.windowStart > config.RATE_LIMIT_WINDOW_MS) {
        entry.count = 0;
        entry.windowStart = now;
    }
    entry.count++;
    rateLimitMap.set(userId, entry);
    return entry.count <= config.RATE_LIMIT_MAX_REQUESTS;
}

function handleDocument(bot) {
    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const doc = msg.document;

        if (!checkRateLimit(userId)) {
            bot.sendMessage(chatId,
                '⏳ Too many requests. Please wait a minute.\n\n⏳ ብዙ ጥያቄዎች ልከዋል። እባክዎ ትንሽ ይጠብቁ።');
            return;
        }

        if (!doc.file_name || !doc.file_name.toLowerCase().endsWith('.pdf')) {
            bot.sendMessage(chatId,
                '❌ Please send a PDF file.\n\n❌ እባክዎ PDF ፋይል ይላኩ።');
            return;
        }

        if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
            bot.sendMessage(chatId,
                '❌ File too large (max 20 MB).\n\n❌ ፋይሉ በጣም ትልቅ ነው (ከፍተኛ 20 MB)።');
            return;
        }

        let user = db.getUser(userId);
        if (!user) {
            user = db.createUser(userId, msg.from.username || '', msg.from.first_name || '');
        }

        const processingMsg = await bot.sendMessage(chatId,
            '⏳ Processing your ID card... Please wait.\n\n⏳ መታወቂያ ካርድዎን በማዘጋጀት ላይ። እባክዎ ይጠብቁ።');

        const pdfPath = path.join(config.TEMP_DIR, `${userId}_${Date.now()}.pdf`);

        try {
            if (!fs.existsSync(config.TEMP_DIR)) {
                fs.mkdirSync(config.TEMP_DIR, { recursive: true });
            }

            const fileLink = await bot.getFileLink(doc.file_id);
            await downloadFile(fileLink, pdfPath);

            const idData = await parseAndExtract(pdfPath);

            const personName = idData.fullNameEnglish || idData.fullNameAmharic || 'Unknown';
            const finNumber  = idData.finNumber || '';

            const userSettings = {
                photo_mode: user.photo_mode,
                template:   user.template,
                oval_cut:   user.oval_cut,
            };

            const cards = await generateAllCards(idData, userSettings);

            db.logProcessing(userId, personName, finNumber);

            const files = [
                { buffer: cards.normal,  filename: `Normal [${personName}].png` },
                { buffer: cards.mirror,  filename: `Mirror [${personName}].png` },
                { buffer: cards.a4color, filename: `A4 (Color Mirror) [${personName}].png` },
                { buffer: cards.a4gray,  filename: `A4 (BothGray Mirror) [${personName}].png` },
            ];

            for (const file of files) {
                await bot.sendDocument(chatId, file.buffer, {}, {
                    filename: file.filename,
                    contentType: 'image/png',
                });
            }

            await bot.sendMessage(chatId,
                `✅ Done! 4 card images sent.\n\n` +
                `👤 Name: ${personName}\n` +
                `🔢 FIN: ${finNumber}\n\n` +
                `✅ ተጠናቋል! 4 ካርድ ምስሎች ተላኩ።`);

            try { bot.deleteMessage(chatId, processingMsg.message_id); } catch (_) {}

        } catch (err) {
            console.error('Document processing error:', err);
            let userMsg = '❌ Could not process your PDF. Please make sure it is a valid eFayda PDF.\n\n❌ PDF ማዘጋጀት አልተቻለም። ትክክለኛ eFayda PDF መሆኑን ያረጋግጡ።';
            if (err.message && err.message.includes('password')) {
                userMsg = '❌ The PDF is password protected. Please send an unprotected version.\n\n❌ PDF ቁልፍ ያለው ነው። ያልተቆለፈ ስሪት ይላኩ።';
            }
            bot.sendMessage(chatId, userMsg);
        } finally {
            try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch (_) {}
        }
    });
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? require('https') : require('http');
        const file = fs.createWriteStream(destPath);
        proto.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            try { fs.unlinkSync(destPath); } catch (_) {}
            reject(err);
        });
    });
}

module.exports = { handleDocument };
