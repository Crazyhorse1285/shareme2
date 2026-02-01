/**
 * One-off script: if the database has a "role" column (from the RBAC changes),
 * set every user's role to 'user' so no one is admin anymore.
 * Run from project root: node reset-admin-role.js
 */
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'shareme.db');

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.log('No database found at data/shareme.db. Nothing to do.');
    process.exit(0);
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({
    locateFile: () => path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  });

  const db = new SQL.Database(fs.readFileSync(dbPath));
  const pragma = db.exec('PRAGMA table_info(users)');
  const columns = (pragma[0] && pragma[0].values) ? pragma[0].values.map(function (r) { return r[1]; }) : [];

  if (columns.indexOf('role') === -1) {
    console.log("No 'role' column in users table. Database was not modified by the admin feature. Nothing to do.");
    db.close();
    process.exit(0);
  }

  const stmt = db.prepare('UPDATE users SET role = ?');
  stmt.run(['user']);
  stmt.free();
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();

  console.log("Done. All users have been set to role 'user' (admin removed).");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
