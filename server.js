const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

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
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function main() {
  const { insertUser, getUserByEmail, getRecentRegistrations, getUserById, deleteUser, updateUser } = await require('./db').initDb();

  const server = http.createServer(async (req, res) => {
    const urlPath = req.url.split('?')[0];

    const usersIdMatch = urlPath.match(/^\/api\/users\/([^/]+)$/);
    if (usersIdMatch) {
      const id = usersIdMatch[1];
      if (req.method === 'GET') {
        try {
          const user = getUserById(id);
          if (!user) {
            sendJson(res, 404, { ok: false, error: 'User not found.' });
            return;
          }
          sendJson(res, 200, { ok: true, user });
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to fetch user.' });
        }
        return;
      }
      if (req.method === 'DELETE') {
        try {
          const user = getUserById(id);
          if (!user) {
            sendJson(res, 404, { ok: false, error: 'User not found.' });
            return;
          }
          deleteUser(id);
          sendJson(res, 200, { ok: true, message: 'User deleted.' });
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to delete user.' });
        }
        return;
      }
      if (req.method === 'PUT') {
        try {
          const user = getUserById(id);
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
          updateUser(id, {
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
        const url = new URL(req.url || '', 'http://localhost');
        const limit = url.searchParams.get('limit') || '50';
        const rows = getRecentRegistrations(limit);
        sendJson(res, 200, { ok: true, count: rows.length, registrations: rows });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Failed to fetch registrations.' });
      }
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
        if (getUserByEmail(email)) {
          sendJson(res, 409, { ok: false, error: 'An account with this email already exists.' });
          return;
        }
        const passwordHash = hashPassword(password);
        insertUser({
          email: email.trim(),
          firstName: firstName ? firstName.trim() : null,
          lastName: lastName ? lastName.trim() : null,
          countryCode: countryCode || null,
          phone: phone.trim(),
          passwordHash,
          username: username ? username.trim() : null,
          displayName: displayName ? displayName.trim() : null
        });
        console.log('User registered:', email.trim());
        sendJson(res, 201, { ok: true, message: 'Account created successfully.' });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Registration failed. Please try again.' });
      }
      return;
    }

    let fileUrlPath = req.url === '/' ? '/sharemelandingpage.html' : req.url;
    fileUrlPath = fileUrlPath.split('?')[0].replace(/^(\.\.(\/|\\)+)+/, '');
    const relativePath = fileUrlPath.startsWith('/') ? fileUrlPath.slice(1) : fileUrlPath;
    const filePath = path.join(__dirname, relativePath);

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(__dirname))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(resolvedPath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server error');
        }
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });

  server.listen(PORT, () => {
    console.log(`ShareMe server running at http://localhost:${PORT}/`);
    console.log(`  Landing:  http://localhost:${PORT}/sharemelandingpage.html`);
    console.log(`  Register: http://localhost:${PORT}/createuser.html`);
    console.log(`  Dashboard: http://localhost:${PORT}/sharemedashboard.html`);
    console.log('Press Ctrl+C to stop.');
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
