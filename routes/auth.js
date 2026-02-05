const crypto = require('crypto');
const { sendJson, parseBody } = require('../lib/http');
const { sessions, setSessionCookie, clearSessionCookie, parseCookies, SESSION_COOKIE, hashPassword, verifyPassword } = require('../lib/auth');
const { sendPasswordResetEmail } = require('../lib/email');

function match(req) {
  const p = req.urlPath || req.url.split('?')[0];
  return (
    (req.method === 'POST' && p === '/api/logout') ||
    (req.method === 'POST' && p === '/api/login') ||
    (req.method === 'POST' && p === '/api/register') ||
    (req.method === 'POST' && p === '/api/forgot-password') ||
    (req.method === 'POST' && p === '/api/reset-password')
  );
}

async function handle(req, res, db) {
  const urlPath = req.urlPath || req.url.split('?')[0];

  if (req.method === 'POST' && urlPath === '/api/logout') {
    const cookies = parseCookies(req);
    const sessionId = cookies[SESSION_COOKIE];
    if (sessionId) sessions.delete(sessionId);
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/login') {
    try {
      const body = await parseBody(req);
      const { email, emailHash, password, passwordHash } = body;
      const hasHash = typeof passwordHash === 'string' && passwordHash.length === 64;
      const hasPassword = typeof password === 'string' && password.length > 0;
      const hasEmailHash = typeof emailHash === 'string' && emailHash.length === 64 && /^[a-f0-9]+$/i.test(emailHash);
      const emailTrim = (email != null && typeof email === 'string') ? String(email).trim() : '';
      const hasEmail = emailTrim.length > 0;
      if ((!hasEmailHash && !hasEmail) || (!hasHash && !hasPassword)) {
        sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
        return;
      }
      const authUser = hasEmailHash
        ? db.getAuthUserByEmailHash(emailHash.toLowerCase())
        : db.getAuthUserByEmail(emailTrim);
      const storedHash = authUser && (authUser.password_hash || authUser.PASSWORD_HASH);
      if (!authUser || !storedHash) {
        sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
        return;
      }
      const status = authUser.status || authUser.STATUS;
      if (status === 'deactivated') {
        sendJson(res, 403, { ok: false, error: 'This account has been deactivated.' });
        return;
      }
      const lockedUntil = authUser.locked_until || authUser.LOCKED_UNTIL;
      if (lockedUntil && new Date(lockedUntil) > new Date()) {
        const mins = Math.ceil((new Date(lockedUntil) - new Date()) / 60000);
        sendJson(res, 423, { ok: false, error: 'Account locked. Try again in ' + mins + ' minute' + (mins !== 1 ? 's' : '') + '.' });
        return;
      }
      let verified = hasHash && verifyPassword(passwordHash, storedHash);
      if (!verified && hasPassword) verified = verifyPassword(password, storedHash);
      if (!verified) {
        db.recordFailedLogin(authUser.id);
        sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
        return;
      }
      db.clearLoginLock(authUser.id);
      const sessionId = crypto.randomBytes(24).toString('hex');
      sessions.set(sessionId, { userId: authUser.id });
      setSessionCookie(res, sessionId);
      sendJson(res, 200, { ok: true, message: 'Logged in successfully.' });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Login failed. Please try again.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/register') {
    try {
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
        return;
      }
      const emailTrim = String(body.email ?? body.Email ?? '').trim();
      const phoneTrim = String(body.phone ?? body.Phone ?? '').trim();
      const hashStr = String(body.passwordHash ?? body.PasswordHash ?? '').trim();
      const plainPassword = body.password;
      const hasHash = hashStr.length === 64 && /^[a-f0-9]+$/i.test(hashStr);
      const hasPassword = typeof plainPassword === 'string' && plainPassword.length > 0;
      if (!emailTrim || !phoneTrim || (!hasHash && !hasPassword)) {
        sendJson(res, 400, { ok: false, error: 'Email, phone, and password are required.' });
        return;
      }
      if (db.getUserByEmail(emailTrim)) {
        sendJson(res, 409, { ok: false, error: 'An account with this email already exists.' });
        return;
      }
      const firstName = body.firstName ?? body.first_name;
      const lastName = body.lastName ?? body.last_name;
      const countryCode = body.countryCode ?? body.country_code;
      const username = body.username;
      const displayName = body.displayName ?? body.display_name;
      const toStore = hasHash ? hashPassword(hashStr) : hashPassword(plainPassword);
      const userId = db.insertUser({
        email: emailTrim,
        firstName: firstName != null ? String(firstName).trim() : null,
        lastName: lastName != null ? String(lastName).trim() : null,
        countryCode: countryCode != null ? String(countryCode).trim() : null,
        phone: phoneTrim,
        passwordHash: toStore,
        username: username != null ? String(username).trim() : null,
        displayName: displayName != null ? String(displayName).trim() : null
      });
      const sessionId = crypto.randomBytes(24).toString('hex');
      sessions.set(sessionId, { userId });
      setSessionCookie(res, sessionId);
      console.log('User registered:', emailTrim);
      sendJson(res, 201, { ok: true, message: 'Account created successfully.' });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Registration failed. Please try again.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/forgot-password') {
    try {
      const body = await parseBody(req);
      const email = (body.email != null && typeof body.email === 'string') ? String(body.email).trim().toLowerCase() : '';
      if (!email) {
        sendJson(res, 400, { ok: false, error: 'Please enter your email.' });
        return;
      }
      const user = db.getAuthUserByEmail(email);
      if (user) {
        const token = db.createPasswordResetToken(user.id);
        await sendPasswordResetEmail(email, token);
      }
      sendJson(res, 200, { ok: true, message: 'If an account exists with that email, we\'ve sent instructions to reset your password.' });
    } catch (e) {
      console.error('Forgot password error:', e);
      sendJson(res, 500, { ok: false, error: e.message && e.message.includes('not configured') ? 'Password reset email is not configured. Please contact support.' : 'Something went wrong. Please try again.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/reset-password') {
    try {
      const body = await parseBody(req);
      const token = (body.token != null && typeof body.token === 'string') ? String(body.token).trim() : '';
      const password = body.password;
      const passwordHash = body.passwordHash;
      const hasHash = typeof passwordHash === 'string' && passwordHash.length === 64 && /^[a-f0-9]+$/i.test(passwordHash);
      const hasPassword = typeof password === 'string' && password.length >= 10;
      if (!token) {
        sendJson(res, 400, { ok: false, error: 'Invalid or expired reset link.' });
        return;
      }
      if (!hasHash && !hasPassword) {
        sendJson(res, 400, { ok: false, error: 'Password is required (at least 8 characters).' });
        return;
      }
      const row = db.getPasswordResetToken(token);
      if (!row) {
        sendJson(res, 400, { ok: false, error: 'Invalid or expired reset link. Please request a new one.' });
        return;
      }
      const toStore = hasHash ? hashPassword(passwordHash) : hashPassword(password);
      db.updateUserPassword(row.user_id, toStore);
      db.consumePasswordResetToken(token);
      sendJson(res, 200, { ok: true, message: 'Your password has been reset. You can now log in.' });
    } catch (e) {
      console.error('Reset password error:', e);
      sendJson(res, 500, { ok: false, error: 'Something went wrong. Please try again.' });
    }
    return;
  }
}

module.exports = { match, handle };
