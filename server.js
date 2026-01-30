const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE = 'shareme_session';
const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2'
};

const sessions = new Map();

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce(function (acc, part) {
    const i = part.indexOf('=');
    if (i !== -1) acc[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    return acc;
  }, {});
}

function setSessionCookie(res, sessionId) {
  res.setHeader('Set-Cookie', SESSION_COOKIE + '=' + sessionId + '; Path=/; HttpOnly; SameSite=Lax');
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function withUser(id, db, fn) {
  const user = db.getUserById(id);
  if (!user) return { status: 404, body: { ok: false, error: 'User not found.' }};
  return fn(user);
}

async function main() {
  const db = await require('./db').initDb();

  const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];
    const usersIdMatch = urlPath.match(/^\/api\/users\/([^/]+)$/);

    if (usersIdMatch) {
      const id = usersIdMatch[1];
      if (req.method === 'GET') {
        try {
          const result = withUser(id, db, (user) => ({ status: 200, body: { ok: true, user } }));
          sendJson(res, result.status, result.body);
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to fetch user.' });
        }
        return;
      }
      if (req.method === 'DELETE') {
        try {
          const result = withUser(id, db, () => {
            db.deleteUser(id);
            return { status: 200, body: { ok: true, message: 'User deleted.' }};
          });
          sendJson(res, result.status, result.body);
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to delete user.' });
        }
        return;
      }
      if (req.method === 'PUT') {
        try {
          const user = db.getUserById(id);
          if (!user) {
            sendJson(res, 404, { ok: false, error: 'User not found.' });
            return;
          }
          const body = await parseBody(req);
          const { email, first_name, last_name, phone, username } = body;
          if (!email || !phone) {
            sendJson(res, 400, { ok: false, error: 'Email and phone are required.' });
            return;
          }
          db.updateUser(id, {
            email: (email || '').trim(),
            first_name: first_name != null ? String(first_name).trim() : null,
            last_name: last_name != null ? String(last_name).trim() : null,
            phone: (phone || '').trim(),
            username: username != null ? String(username).trim() : null
          });
          sendJson(res, 200, { ok: true, message: 'User updated.' });
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to update user.' });
        }
        return;
      }
    }

    if (req.method === 'GET' && urlPath === '/api/registrations') {
      try {
        const limit = new URL(req.url || '', 'http://localhost').searchParams.get('limit') || '50';
        const rows = db.getRecentRegistrations(limit);
        sendJson(res, 200, { ok: true, count: rows.length, registrations: rows });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Failed to fetch registrations.' });
      }
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/me') {
      try {
        const cookies = parseCookies(req);
        const sessionId = cookies[SESSION_COOKIE];
        const session = sessionId && sessions.get(sessionId);
        const userId = session && session.userId;
        const user = userId ? db.getUserById(userId) : null;
        if (!user) {
          sendJson(res, 200, { ok: false, user: null });
          return;
        }
        sendJson(res, 200, { ok: true, user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, display_name: user.display_name, username: user.username } });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, user: null });
      }
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/logout') {
      const cookies = parseCookies(req);
      const sessionId = cookies[SESSION_COOKIE];
      if (sessionId) sessions.delete(sessionId);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/register') {
      try {
        const body = await parseBody(req);
        const { email, firstName, lastName, countryCode, phone, password, username, displayName } = body;
        if (!email || !phone || !password) {
          sendJson(res, 400, { ok: false, error: 'Email, phone, and password are required.' });
          return;
        }
        if (db.getUserByEmail(email)) {
          sendJson(res, 409, { ok: false, error: 'An account with this email already exists.' });
          return;
        }
        const userId = db.insertUser({
          email: email.trim(),
          firstName: firstName ? firstName.trim() : null,
          lastName: lastName ? lastName.trim() : null,
          countryCode: countryCode || null,
          phone: phone.trim(),
          passwordHash: hashPassword(password),
          username: username ? username.trim() : null,
          displayName: displayName ? displayName.trim() : null
        });
        const sessionId = crypto.randomBytes(24).toString('hex');
        sessions.set(sessionId, { userId });
        setSessionCookie(res, sessionId);
        console.log('User registered:', email.trim());
        sendJson(res, 201, { ok: true, message: 'Account created successfully.' });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Registration failed. Please try again.' });
      }
      return;
    }

    // Static files
    const fileUrlPath = req.url === '/' ? '/sharemelandingpage.html' : urlPath.replace(/^(\.\.(\/|\\)+)+/, '');
    const relativePath = fileUrlPath.startsWith('/') ? fileUrlPath.slice(1) : fileUrlPath;
    const filePath = path.join(__dirname, relativePath);
    if (!path.resolve(filePath).startsWith(path.resolve(__dirname))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
      return;
    }
    const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
    fs.readFile(filePath, (err, data) => {
      if (err) {
        const status = err.code === 'ENOENT' ? 404 : 500;
        res.writeHead(status, { 'Content-Type': 'text/plain' }).end(status === 404 ? 'Not found' : 'Server error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType }).end(data);
    });
  });

  server.listen(PORT, () => {
    console.log(`ShareMe server at http://localhost:${PORT}/`);
    console.log(`  Landing: http://localhost:${PORT}/sharemelandingpage.html`);
    console.log(`  Register: http://localhost:${PORT}/createuser.html`);
    console.log(`  Dashboard: http://localhost:${PORT}/sharemedashboard.html`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
