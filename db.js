const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
      id TEXT PRIMARY KEY,
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
  const idCol = pragma[0] && pragma[0].values ? pragma[0].values.find(function (row) { return row[1] === 'id'; }) : null;
  const idType = idCol && idCol[2] ? idCol[2].toUpperCase() : '';
  if (idType === 'INTEGER') {
    db.run(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
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
    const sel = db.prepare('SELECT id, email, first_name, last_name, country_code, phone, password_hash, display_name, username, created_at FROM users');
    const ins = db.prepare(
      'INSERT INTO users_new (id, email, first_name, last_name, country_code, phone, password_hash, display_name, username, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    while (sel.step()) {
      const row = sel.getAsObject();
      ins.run([crypto.randomUUID(), row.email, row.first_name, row.last_name, row.country_code, row.phone, row.password_hash, row.display_name, row.username, row.created_at]);
    }
    sel.free();
    ins.free();
    db.run('DROP TABLE users');
    db.run('ALTER TABLE users_new RENAME TO users');
    save();
  }
  var colsForUsername = columns;
  if (idType === 'INTEGER') {
    var pragmaAfter = db.exec('PRAGMA table_info(users)');
    colsForUsername = pragmaAfter[0] && pragmaAfter[0].values ? pragmaAfter[0].values.map(function (row) { return row[1]; }) : [];
  }
  if (colsForUsername.indexOf('username') === -1) {
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
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO users (id, email, first_name, last_name, country_code, phone, password_hash, display_name, username)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
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
