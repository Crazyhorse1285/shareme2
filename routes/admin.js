const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { sendJson, parseBody } = require('../lib/http');
const { requireAdmin, isAdminSession, adminSessions, setAdminSessionCookie, clearAdminSessionCookie, parseCookies, ADMIN_SESSION_COOKIE } = require('../lib/auth');
const { MIME_TYPES } = require('../lib/config');
const { trimString } = require('../lib/utils/validation');

function isBodyTooLarge(err) {
  return err && err.message === 'Request body too large';
}

function match(req) {
  const p = req.urlPath || req.url.split('?')[0];
  return (
    (req.method === 'GET' && (p === '/api/registrations' || p === '/api/db' || p === '/api/admin-check')) ||
    (req.method === 'POST' && (p === '/api/admin-login' || p === '/api/admin-logout')) ||
    (req.method === 'GET' && (p === '/view-registrations.html' || p === '/view-database.html'))
  );
}

async function handle(req, res, db) {
  const urlPath = req.urlPath || req.url.split('?')[0];

  if (req.method === 'POST' && urlPath === '/api/admin-login') {
    try {
      const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      const adminPassword = process.env.ADMIN_PASSWORD || '';
      if (!adminEmail || !adminPassword) {
        sendJson(res, 503, { ok: false, error: 'Admin login is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD.' });
        return;
      }
      const body = await parseBody(req);
      const email = trimString(body?.email ?? '').toLowerCase();
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!email || !password) {
        sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
        return;
      }
      if (email !== adminEmail) {
        sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
        return;
      }
      const a = Buffer.from(password, 'utf8');
      const b = Buffer.from(adminPassword, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
        return;
      }
      const sessionId = crypto.randomBytes(24).toString('hex');
      adminSessions.set(sessionId, { admin: true });
      setAdminSessionCookie(res, sessionId);
      const nextUrl = (new URL(req.url || '', 'http://localhost').searchParams.get('next')) || '/view-registrations.html';
      const safeNext = nextUrl.startsWith('/') && (nextUrl === '/view-registrations.html' || nextUrl === '/view-database.html') ? nextUrl : '/view-registrations.html';
      sendJson(res, 200, { ok: true, redirect: safeNext });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Admin login failed.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/admin-logout') {
    const cookies = parseCookies(req);
    const sessionId = cookies[ADMIN_SESSION_COOKIE];
    if (sessionId) adminSessions.delete(sessionId);
    clearAdminSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/admin-check') {
    const admin = isAdminSession(req);
    sendJson(res, 200, { ok: true, admin: !!admin });
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/registrations') {
    return requireAdmin(req, res, () => {
      try {
        const limit = new URL(req.url || '', 'http://localhost').searchParams.get('limit') || '50';
        const rows = db.getRecentRegistrations(limit);
        sendJson(res, 200, { ok: true, count: rows.length, registrations: rows });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Failed to fetch registrations.' });
      }
    });
  }

  if (req.method === 'GET' && urlPath === '/api/db') {
    return requireAdmin(req, res, () => {
      try {
        const rows = db.getRecentRegistrations('500');
        const toLowerKeys = (obj) => {
          if (!obj || typeof obj !== 'object') return obj;
          const out = {};
          for (const k of Object.keys(obj)) out[k.toLowerCase()] = obj[k];
          return out;
        };
        sendJson(res, 200, {
          ok: true,
          tables: [{ name: 'users', rowCount: rows.length }],
          users: rows.map(toLowerKeys)
        });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Failed to fetch database contents.' });
      }
    });
  }

  if (req.method === 'GET' && (urlPath === '/view-registrations.html' || urlPath === '/view-database.html')) {
    return requireAdmin(req, res, () => {
      const root = path.join(path.dirname(require.main.filename));
      const filePath = path.join(root, urlPath.slice(1));
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
  }
}

module.exports = { match, handle };
