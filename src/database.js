const Database = require('better-sqlite3');
const config = require('./config');
const path = require('path');
const fs = require('fs');

const dataDir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        photo_mode TEXT DEFAULT 'Grey',
        template TEXT DEFAULT 'A',
        oval_cut INTEGER DEFAULT 0,
        total_ids_processed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS processing_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        person_name TEXT,
        fin_number TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
`);

const stmts = {
    getUser:     db.prepare('SELECT * FROM users WHERE telegram_id = ?'),
    createUser:  db.prepare('INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)'),
    setPhotoMode:db.prepare('UPDATE users SET photo_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'),
    setTemplate: db.prepare('UPDATE users SET template = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'),
    setOvalCut:  db.prepare('UPDATE users SET oval_cut = ?, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'),
    logProcessing: db.prepare('INSERT INTO processing_log (telegram_id, person_name, fin_number) VALUES (?, ?, ?)'),
    getStats:    db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM users) as total_users,
            (SELECT COUNT(*) FROM processing_log) as total_ids,
            (SELECT COUNT(*) FROM processing_log WHERE date(created_at) = date('now')) as today_ids
    `),
    getAllUsers: db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 100'),
    incrProcessed: db.prepare('UPDATE users SET total_ids_processed = total_ids_processed + 1, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'),
};

module.exports = {
    getUser(id)                     { return stmts.getUser.get(id); },
    createUser(id, username, first) { stmts.createUser.run(id, username, first); return stmts.getUser.get(id); },
    setPhotoMode(id, mode)          { stmts.setPhotoMode.run(mode, id); },
    setTemplate(id, tmpl)           { stmts.setTemplate.run(tmpl, id); },
    setOvalCut(id, val)             { stmts.setOvalCut.run(val ? 1 : 0, id); },
    logProcessing(id, name, fin)    { stmts.logProcessing.run(id, name, fin); stmts.incrProcessed.run(id); },
    getStats()                      { return stmts.getStats.get(); },
    getAllUsers()                    { return stmts.getAllUsers.all(); },
};
