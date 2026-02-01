const crypto = require('crypto');
const { SESSION_COOKIE, ADMIN_SESSION_COOKIE } = require('./config');
const { sendJson } = require('./http');

const sessions = new Map();
const adminSessions = new Map();

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw.split(';').reduce((acc, part) => {
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

function setAdminSessionCookie(res, sessionId) {
  res.setHeader('Set-Cookie', ADMIN_SESSION_COOKIE + '=' + sessionId + '; Path=/; HttpOnly; SameSite=Lax');
}

function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', ADMIN_SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  const session = sessionId && sessions.get(sessionId);
  return session ? session.userId : null;
}

function isAdminSession(req) {
  const cookies = parseCookies(req);
  const sessionId = cookies[ADMIN_SESSION_COOKIE];
  const session = sessionId && adminSessions.get(sessionId);
  return session && session.admin === true;
}

function requireAdmin(req, res, onSuccess) {
  if (!isAdminSession(req)) {
    const wantsJson = req.headers.accept && req.headers.accept.indexOf('application/json') !== -1;
    if (wantsJson) {
      sendJson(res, 403, { ok: false, error: 'Admin login required.' });
    } else {
      const next = encodeURIComponent(req.url || '/view-registrations.html');
      res.writeHead(302, { Location: '/admin-login.html?next=' + next }).end();
    }
    return;
  }
  onSuccess();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(plainPassword, storedHash) {
  if (!storedHash || typeof plainPassword !== 'string' || storedHash.indexOf(':') === -1) return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(plainPassword, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(computed, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  sessions,
  adminSessions,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  getSessionUser,
  isAdminSession,
  requireAdmin,
  hashPassword,
  verifyPassword,
  SESSION_COOKIE,
  ADMIN_SESSION_COOKIE
};
