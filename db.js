const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'shareme.db');

let db = null;

async function initDb() {
  const initSqlJs = require('sql.js');
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      country_code TEXT,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      username TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  const pragma = db.exec('PRAGMA table_info(users)');
  const columns = pragma[0] && pragma[0].values ? pragma[0].values.map(function (row) { return row[1]; }) : [];
  if (columns.indexOf('username') === -1) {
    db.run('ALTER TABLE users ADD COLUMN username TEXT');
  }
  save();

  return { insertUser, getUserByEmail, getRecentRegistrations, getUserById, deleteUser, updateUser };
}

function getUserById(id) {
  const stmt = db.prepare('SELECT id, email, first_name, last_name, country_code, phone, username, display_name, created_at FROM users WHERE id = ?');
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function deleteUser(id) {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run([id]);
  stmt.free();
  save();
}

function updateUser(id, data) {
  const stmt = db.prepare(
    'UPDATE users SET email = ?, first_name = ?, last_name = ?, phone = ?, username = ? WHERE id = ?'
  );
  stmt.run([
    data.email || null,
    data.first_name || null,
    data.last_name || null,
    data.phone || null,
    data.username || null,
    id
  ]);
  stmt.free();
  save();
}

function getRecentRegistrations(limit) {
  const n = Math.min(Number(limit) || 50, 100);
  const stmt = db.prepare(
    'SELECT id, email, first_name, last_name, username, phone, created_at FROM users ORDER BY created_at DESC LIMIT ?'
  );
  stmt.bind([n]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function save() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

function insertUser(user) {
  db.run(
    `INSERT INTO users (email, first_name, last_name, country_code, phone, password_hash, display_name, username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.email,
      user.firstName || null,
      user.lastName || null,
      user.countryCode || null,
      user.phone,
      user.passwordHash,
      user.displayName || null,
      user.username || null
    ]
  );
  save();
}

function getUserByEmail(email) {
  const stmt = db.prepare('SELECT id, email FROM users WHERE email = ?');
  stmt.bind([email]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

module.exports = { initDb, insertUser, getUserByEmail };
