const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'shareme.db');

const USERS_SCHEMA = `
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  country_code TEXT,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
`;

function emailToHash(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

let db = null;

function queryOne(sql, params, mapRow) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  const row = stmt.step() ? (mapRow ? mapRow(stmt.getAsObject()) : stmt.getAsObject()) : null;
  stmt.free();
  return row;
}

function queryAll(sql, params, mapRow) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  const rows = [];
  while (stmt.step()) {
    rows.push(mapRow ? mapRow(stmt.getAsObject()) : stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function runSql(sql, params) {
  const stmt = db.prepare(sql);
  stmt.run(params || []);
  stmt.free();
  save();
}

function save() {
  if (db) {
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  }
}

function migrateToUuidIfNeeded() {
  const pragma = db.exec('PRAGMA table_info(users)');
  const values = (pragma[0] && pragma[0].values) ? pragma[0].values : [];
  const columns = values.map(function (r) { return r[1]; });
  const idCol = values.find(function (r) { return r[1] === 'id'; });
  const idType = (idCol && idCol[2] ? idCol[2] : '').toUpperCase();

  if (idType !== 'INTEGER') return columns;

  db.run('CREATE TABLE users_new (' + USERS_SCHEMA.trim() + ')');
  const sel = db.prepare('SELECT email, first_name, last_name, country_code, phone, password_hash, display_name, username, created_at FROM users');
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
  return db.exec('PRAGMA table_info(users)')[0].values.map(function (r) { return r[1]; });
}

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: () => path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') });

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    db = new SQL.Database();
  }

  db.run('CREATE TABLE IF NOT EXISTS users (' + USERS_SCHEMA.trim() + ')');
  const columns = migrateToUuidIfNeeded();
  if (columns.indexOf('username') === -1) {
    db.run('ALTER TABLE users ADD COLUMN username TEXT');
    save();
  }
  if (columns.indexOf('email_hash') === -1) {
    db.run('ALTER TABLE users ADD COLUMN email_hash TEXT');
  }
  var needBackfill = queryOne('SELECT 1 FROM users WHERE email_hash IS NULL AND email IS NOT NULL AND email != \'\'');
  if (needBackfill) {
    const all = queryAll('SELECT id, email FROM users WHERE email_hash IS NULL');
    for (let i = 0; i < all.length; i++) {
      const row = all[i];
      const hash = emailToHash(row.email);
      if (hash) runSql('UPDATE users SET email_hash = ? WHERE id = ?', [hash, row.id]);
    }
    save();
  }
  var currentCols = db.exec('PRAGMA table_info(users)')[0].values.map(function (r) { return r[1]; });
  if (currentCols.indexOf('failed_login_attempts') === -1) {
    db.run('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0');
    save();
  }
  if (currentCols.indexOf('locked_until') === -1) {
    db.run('ALTER TABLE users ADD COLUMN locked_until TEXT');
    save();
  }

  return { insertUser, getUserByEmail, getAuthUserByEmail, getAuthUserByEmailHash, recordFailedLogin, clearLoginLock, getRecentRegistrations, getUserById, deleteUser, updateUser };
}

function getUserById(id) {
  return queryOne('SELECT id, email, first_name, last_name, country_code, phone, username, display_name, created_at FROM users WHERE id = ?', [id]);
}

function deleteUser(id) {
  runSql('DELETE FROM users WHERE id = ?', [id]);
}

function updateUser(id, data) {
  const emailHash = data.email ? emailToHash(data.email) : null;
  runSql(
    'UPDATE users SET email = ?, email_hash = ?, first_name = ?, last_name = ?, phone = ?, username = ? WHERE id = ?',
    [data.email || null, emailHash, data.first_name || null, data.last_name || null, data.phone || null, data.username || null, id]
  );
}

function getRecentRegistrations(limit) {
  const n = Math.min(Number(limit) || 50, 100);
  return queryAll('SELECT id, email, first_name, last_name, username, phone, created_at, locked_until FROM users ORDER BY created_at DESC LIMIT ?', [n]);
}

function insertUser(user) {
  const id = crypto.randomUUID();
  const emailHash = emailToHash(user.email);
  db.run(
    'INSERT INTO users (id, email, email_hash, first_name, last_name, country_code, phone, password_hash, display_name, username) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, user.email, emailHash, user.firstName || null, user.lastName || null, user.countryCode || null, user.phone, user.passwordHash, user.displayName || null, user.username || null]
  );
  save();
  return id;
}

function getUserByEmail(email) {
  return queryOne('SELECT id, email FROM users WHERE email = ?', [email]);
}

function getAuthUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  var trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  return queryOne('SELECT id, email, password_hash, failed_login_attempts, locked_until FROM users WHERE LOWER(email) = ?', [trimmed]);
}

function getAuthUserByEmailHash(emailHash) {
  if (!emailHash || typeof emailHash !== 'string' || emailHash.length !== 64 || !/^[a-f0-9]+$/i.test(emailHash)) return null;
  return queryOne('SELECT id, email, password_hash, failed_login_attempts, locked_until FROM users WHERE email_hash = ?', [emailHash.toLowerCase()]);
}

const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

function recordFailedLogin(userId) {
  const user = queryOne('SELECT failed_login_attempts FROM users WHERE id = ?', [userId]);
  if (!user) return;
  const attempts = (user.failed_login_attempts || 0) + 1;
  if (attempts >= LOCKOUT_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    runSql('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockedUntil, userId]);
  } else {
    runSql('UPDATE users SET failed_login_attempts = ? WHERE id = ?', [attempts, userId]);
  }
}

function clearLoginLock(userId) {
  runSql('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [userId]);
}

module.exports = { initDb, insertUser, getUserByEmail, getAuthUserByEmail, getAuthUserByEmailHash, recordFailedLogin, clearLoginLock, emailToHash };
