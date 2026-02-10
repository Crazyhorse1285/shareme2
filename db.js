const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// --- Config & schema ---

const dataDir = path.join(__dirname, 'data');
const dbPath = process.env.SHAREME_TEST_DB
  ? path.join(dataDir, 'test-shareme.db')
  : path.join(dataDir, 'shareme.db');

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

const PASSWORD_RESET_TOKENS_TABLE = `CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`;

const EMAIL_VERIFICATION_TABLE = `CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
)`;

/** Whitelist of TEXT columns added in migrations (safe to use in ALTER) */
const MIGRATION_TEXT_COLUMNS = [
  'share_name_prefix', 'share_name', 'share_email', 'share_country_code', 'share_phone',
  'share_street', 'share_city', 'share_state', 'share_postal_code',
  'prof_employer_name', 'prof_employer_phone', 'prof_employer_address', 'prof_employee_title', 'prof_years_worked',
  'biz_name', 'biz_description', 'biz_address', 'biz_website', 'biz_phone', 'biz_create_date',
  'biz_social_facebook', 'biz_social_instagram', 'biz_social_twitter', 'biz_social_tiktok',
  'acad_education', 'acad_graduated_from', 'acad_field_pursued', 'acad_highest_level', 'acad_years_attended', 'acad_currently_enrolled'
];

let db = null;

// --- Helpers ---

function emailToHash(email) {
  if (!email || typeof email !== 'string') return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** @returns {string[]} Column names for table users */
function getUsersColumnNames() {
  const pragma = db.exec('PRAGMA table_info(users)');
  const values = (pragma[0] && pragma[0].values) ? pragma[0].values : [];
  return values.map((r) => r[1]);
}

/** Add column to users if missing. colName must be in whitelist or use exact sqlSuffix. */
function ensureUsersColumn(colName, sqlSuffix = 'TEXT') {
  const cols = getUsersColumnNames();
  if (cols.indexOf(colName) !== -1) return;
  const safe = MIGRATION_TEXT_COLUMNS.includes(colName) ? colName : null;
  if (safe) db.run(`ALTER TABLE users ADD COLUMN ${safe} TEXT`);
  else db.run(`ALTER TABLE users ADD COLUMN ${colName} ${sqlSuffix}`);
  save();
}

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
  if (db) fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function migrateToUuidIfNeeded() {
  const columns = getUsersColumnNames();
  const idCol = db.exec('PRAGMA table_info(users)')[0].values.find((r) => r[1] === 'id');
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
  return getUsersColumnNames();
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
  migrateToUuidIfNeeded();

  ensureUsersColumn('username');
  ensureUsersColumn('email_hash');

  const needBackfill = queryOne('SELECT 1 FROM users WHERE email_hash IS NULL AND email IS NOT NULL AND email != \'\'');
  if (needBackfill) {
    const all = queryAll('SELECT id, email FROM users WHERE email_hash IS NULL');
    for (const row of all) {
      const hash = emailToHash(row.email);
      if (hash) runSql('UPDATE users SET email_hash = ? WHERE id = ?', [hash, row.id]);
    }
    save();
  }

  ensureUsersColumn('failed_login_attempts', 'INTEGER NOT NULL DEFAULT 0');
  ensureUsersColumn('locked_until');
  for (const col of MIGRATION_TEXT_COLUMNS) ensureUsersColumn(col);

  const cols = getUsersColumnNames();
  if (cols.indexOf('status') === -1) {
    db.run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
    runSql('UPDATE users SET status = ? WHERE status IS NULL', ['active']);
    save();
  }
  ensureUsersColumn('reactivation_requested_at');
  ensureUsersColumn('email_verified', 'INTEGER NOT NULL DEFAULT 0');
  ensureUsersColumn('plan', "TEXT DEFAULT 'free'");
  runSql("UPDATE users SET plan = 'free' WHERE plan IS NULL");
  save();

  db.run(PASSWORD_RESET_TOKENS_TABLE);
  db.run(EMAIL_VERIFICATION_TABLE);
  save();

  return { insertUser, getUserByEmail, getAuthUserByEmail, getAuthUserByEmailHash, recordFailedLogin, clearLoginLock, getRecentRegistrations, getUserById, deleteUser, updateUser, updateAccountInfo, updateUserPlan, deactivateUser, reactivateUser, setReactivationRequested, getShareInfo, updateShareInfo, updateProfessionalInfo, updateBusinessInfo, updateAcademicsInfo, createPasswordResetToken, getPasswordResetToken, consumePasswordResetToken, updateUserPassword, createEmailVerificationToken, getEmailVerificationToken, consumeEmailVerificationToken, setEmailVerified };
}

function getUserById(id) {
  const row = queryOne(
    'SELECT id, email, first_name, last_name, country_code, phone, username, display_name, created_at, status, reactivation_requested_at, email_verified, plan, share_name_prefix, share_name, share_email, share_country_code, share_phone, share_street, share_city, share_state, share_postal_code, prof_employer_name, prof_employer_phone, prof_employer_address, prof_employee_title, prof_years_worked, biz_name, biz_description, biz_address, biz_website, biz_phone, biz_create_date, biz_social_facebook, biz_social_instagram, biz_social_twitter, biz_social_tiktok, acad_education, acad_graduated_from, acad_field_pursued, acad_highest_level, acad_years_attended, acad_currently_enrolled FROM users WHERE id = ?',
    [id]
  );
  if (row && row.plan == null) row.plan = 'free';
  return row;
}

function deactivateUser(userId) {
  runSql('UPDATE users SET status = ? WHERE id = ?', ['deactivated', userId]);
}

function reactivateUser(userId) {
  runSql('UPDATE users SET status = ?, reactivation_requested_at = NULL WHERE id = ?', ['active', userId]);
}

function setReactivationRequested(userId) {
  runSql('UPDATE users SET reactivation_requested_at = datetime(\'now\') WHERE id = ?', [userId]);
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

function updateAccountInfo(userId, data) {
  const emailHash = data.email ? emailToHash(data.email) : null;
  runSql(
    'UPDATE users SET email = ?, email_hash = ?, first_name = ?, last_name = ?, country_code = ?, phone = ?, username = ?, display_name = ? WHERE id = ?',
    [
      data.email != null ? String(data.email).trim() : null,
      emailHash,
      data.first_name != null ? String(data.first_name).trim() : null,
      data.last_name != null ? String(data.last_name).trim() : null,
      data.country_code != null ? String(data.country_code).trim() : null,
      data.phone != null ? String(data.phone).trim() : null,
      data.username != null ? String(data.username).trim() : null,
      data.display_name != null ? String(data.display_name).trim() : null,
      userId
    ]
  );
}

function getRecentRegistrations(limit) {
  const n = Math.min(Number(limit) || 50, 500);
  return queryAll(
    'SELECT id, email, first_name, last_name, display_name, username, phone, created_at, locked_until, status, plan, reactivation_requested_at, email_verified, share_name_prefix, share_name, share_email, share_country_code, share_phone, share_street, share_city, share_state, share_postal_code, prof_employer_name, prof_employer_phone, prof_employer_address, prof_employee_title, prof_years_worked, biz_name, biz_description, biz_address, biz_website, biz_phone, biz_create_date, biz_social_facebook, biz_social_instagram, biz_social_twitter, biz_social_tiktok, acad_education, acad_graduated_from, acad_field_pursued, acad_highest_level, acad_years_attended, acad_currently_enrolled FROM users ORDER BY created_at DESC LIMIT ?',
    [n]
  );
}

function insertUser(user) {
  const id = crypto.randomUUID();
  const emailHash = emailToHash(user.email);
  db.run(
    'INSERT INTO users (id, email, email_hash, first_name, last_name, country_code, phone, password_hash, display_name, username, status, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, user.email, emailHash, user.firstName || null, user.lastName || null, user.countryCode || null, user.phone, user.passwordHash, user.displayName || null, user.username || null, 'active', 'free']
  );
  save();
  return id;
}

function getUserByEmail(email) {
  return queryOne('SELECT id, email FROM users WHERE email = ?', [email]);
}

function getAuthUserByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  return queryOne('SELECT id, email, password_hash, failed_login_attempts, locked_until, status FROM users WHERE LOWER(email) = ?', [trimmed]);
}

function getAuthUserByEmailHash(emailHash) {
  if (!emailHash || typeof emailHash !== 'string' || emailHash.length !== 64 || !/^[a-f0-9]+$/i.test(emailHash)) return null;
  return queryOne('SELECT id, email, password_hash, failed_login_attempts, locked_until, status FROM users WHERE email_hash = ?', [emailHash.toLowerCase()]);
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

function getShareInfo(userId) {
  return queryOne(
    'SELECT share_name_prefix, share_name, share_email, share_country_code, share_phone, share_street, share_city, share_state, share_postal_code FROM users WHERE id = ?',
    [userId]
  );
}

function updateShareInfo(userId, data) {
  runSql(
    'UPDATE users SET share_name_prefix = ?, share_name = ?, share_email = ?, share_country_code = ?, share_phone = ?, share_street = ?, share_city = ?, share_state = ?, share_postal_code = ? WHERE id = ?',
    [
      data.share_name_prefix != null ? String(data.share_name_prefix).trim() : null,
      data.share_name != null ? String(data.share_name).trim() : null,
      data.share_email != null ? String(data.share_email).trim() : null,
      data.share_country_code != null ? String(data.share_country_code).trim() : null,
      data.share_phone != null ? String(data.share_phone).trim() : null,
      data.share_street != null ? String(data.share_street).trim() : null,
      data.share_city != null ? String(data.share_city).trim() : null,
      data.share_state != null ? String(data.share_state).trim() : null,
      data.share_postal_code != null ? String(data.share_postal_code).trim() : null,
      userId
    ]
  );
}

function trimVal(v) {
  return v != null ? String(v).trim() : null;
}

function updateProfessionalInfo(userId, data) {
  runSql(
    'UPDATE users SET prof_employer_name = ?, prof_employer_phone = ?, prof_employer_address = ?, prof_employee_title = ?, prof_years_worked = ? WHERE id = ?',
    [trimVal(data.prof_employer_name), trimVal(data.prof_employer_phone), trimVal(data.prof_employer_address), trimVal(data.prof_employee_title), trimVal(data.prof_years_worked), userId]
  );
}

function updateBusinessInfo(userId, data) {
  runSql(
    'UPDATE users SET biz_name = ?, biz_description = ?, biz_address = ?, biz_website = ?, biz_phone = ?, biz_create_date = ?, biz_social_facebook = ?, biz_social_instagram = ?, biz_social_twitter = ?, biz_social_tiktok = ? WHERE id = ?',
    [trimVal(data.biz_name), trimVal(data.biz_description), trimVal(data.biz_address), trimVal(data.biz_website), trimVal(data.biz_phone), trimVal(data.biz_create_date), trimVal(data.biz_social_facebook), trimVal(data.biz_social_instagram), trimVal(data.biz_social_twitter), trimVal(data.biz_social_tiktok), userId]
  );
}

function updateAcademicsInfo(userId, data) {
  runSql(
    'UPDATE users SET acad_education = ?, acad_graduated_from = ?, acad_field_pursued = ?, acad_highest_level = ?, acad_years_attended = ?, acad_currently_enrolled = ? WHERE id = ?',
    [trimVal(data.acad_education), trimVal(data.acad_graduated_from), trimVal(data.acad_field_pursued), trimVal(data.acad_highest_level), trimVal(data.acad_years_attended), trimVal(data.acad_currently_enrolled), userId]
  );
}

function createPasswordResetToken(userId) {
  runSql('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  runSql('INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expiresAt]);
  return token;
}

function getPasswordResetToken(token) {
  if (!token || typeof token !== 'string') return null;
  const row = queryOne('SELECT token, user_id, expires_at FROM password_reset_tokens WHERE token = ?', [token.trim()]);
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    runSql('DELETE FROM password_reset_tokens WHERE token = ?', [token.trim()]);
    return null;
  }
  return row;
}

function consumePasswordResetToken(token) {
  if (!token || typeof token !== 'string') return false;
  runSql('DELETE FROM password_reset_tokens WHERE token = ?', [token.trim()]);
  return true;
}

function updateUserPassword(userId, passwordHash) {
  runSql('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

function createEmailVerificationToken(userId) {
  runSql('DELETE FROM email_verification_tokens WHERE user_id = ?', [userId]);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  runSql('INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expiresAt]);
  return token;
}

function getEmailVerificationToken(token) {
  if (!token || typeof token !== 'string') return null;
  const row = queryOne('SELECT token, user_id, expires_at FROM email_verification_tokens WHERE token = ?', [token.trim()]);
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) {
    runSql('DELETE FROM email_verification_tokens WHERE token = ?', [token.trim()]);
    return null;
  }
  return row;
}

function consumeEmailVerificationToken(token) {
  if (!token || typeof token !== 'string') return false;
  runSql('DELETE FROM email_verification_tokens WHERE token = ?', [token.trim()]);
  return true;
}

function setEmailVerified(userId) {
  runSql('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);
}

/** Set user plan (e.g. 'free', 'pro'). Used after successful payment via webhook. */
function updateUserPlan(userId, plan) {
  if (!userId || !plan || typeof plan !== 'string') return;
  const p = plan.trim().toLowerCase();
  if (p !== 'free' && p !== 'pro') return;
  runSql('UPDATE users SET plan = ? WHERE id = ?', [p, userId]);
}

module.exports = { initDb, insertUser, getUserByEmail, getAuthUserByEmail, getAuthUserByEmailHash, recordFailedLogin, clearLoginLock, emailToHash, createPasswordResetToken, getPasswordResetToken, consumePasswordResetToken, updateUserPassword, createEmailVerificationToken, getEmailVerificationToken, consumeEmailVerificationToken, setEmailVerified, updateUserPlan };
