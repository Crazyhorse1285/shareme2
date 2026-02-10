const crypto = require('crypto');
const { sendJson, parseBody } = require('../lib/http');
const {
  sessions,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  SESSION_COOKIE,
  hashPassword,
  verifyPassword
} = require('../lib/auth');
const { sendPasswordResetEmail, sendWelcomeVerificationEmail } = require('../lib/email');
const {
  parseEmail,
  parseEmailHash,
  parsePasswordHash,
  hasPassword,
  isSha256Hex,
  isAcceptablePlainPassword,
  parseToken
} = require('../lib/utils/validation');
const { normalizeRegistrationBody } = require('../lib/utils/sanitize');

// --- Route match ---

const AUTH_PATHS = [
  '/api/logout',
  '/api/login',
  '/api/register',
  '/api/forgot-password',
  '/api/reset-password',
  '/api/request-reactivation',
  '/api/verify-email'
];

function match(req) {
  const path = req.urlPath || req.url.split('?')[0];
  return req.method === 'POST' && AUTH_PATHS.includes(path);
}

// --- Helpers ---

function getPath(req) {
  return req.urlPath || req.url.split('?')[0];
}

function isBodyTooLargeError(err) {
  return err && err.message === 'Request body too large';
}

function sendBodyTooLarge(res) {
  sendJson(res, 413, { ok: false, error: 'Request body too large.' });
}

/** Create session for user and send success response. Use status 201 for new account creation. */
function createUserSession(res, userId, message = 'Logged in successfully.', status = 200) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, { userId });
  setSessionCookie(res, sessionId);
  sendJson(res, status, { ok: true, message });
}

// --- Handlers ---

function handleLogout(req, res) {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) sessions.delete(sessionId);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

async function handleLogin(req, res, db) {
  try {
    const body = await parseBody(req);
    const { email, emailHash, password, passwordHash } = body;
    const hasHash = isSha256Hex(passwordHash);
    const hasPw = hasPassword(password);
    const emailParsed = parseEmail(email);
    const emailHashParsed = parseEmailHash(emailHash);

    if ((!emailHashParsed.valid && !emailParsed.valid) || (!hasHash && !hasPw)) {
      sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
      return;
    }

    const authUser = emailHashParsed.valid
      ? db.getAuthUserByEmailHash(emailHashParsed.hash)
      : db.getAuthUserByEmail(emailParsed.email);
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
      sendJson(res, 423, {
        ok: false,
        error: `Account locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`
      });
      return;
    }

    let verified = hasHash && verifyPassword(passwordHash, storedHash);
    if (!verified && hasPw) verified = verifyPassword(password, storedHash);
    if (!verified) {
      db.recordFailedLogin(authUser.id);
      sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
      return;
    }

    db.clearLoginLock(authUser.id);
    createUserSession(res, authUser.id);
  } catch (err) {
    if (isBodyTooLargeError(err)) return sendBodyTooLarge(res);
    console.error(err);
    sendJson(res, 500, { ok: false, error: 'Login failed. Please try again.' });
  }
}

async function handleRegister(req, res, db) {
  try {
    const body = await parseBody(req);
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
      return;
    }

    const reg = normalizeRegistrationBody(body);
    const hasHash = isSha256Hex(reg.passwordHash);
    const hasPw = hasPassword(reg.password);

    if (!reg.email || !reg.phone || (!hasHash && !hasPw)) {
      sendJson(res, 400, { ok: false, error: 'Email, phone, and password are required.' });
      return;
    }

    const emailTrim = reg.email.trim().toLowerCase();
    if (db.getUserByEmail(emailTrim)) {
      sendJson(res, 409, { ok: false, error: 'An account with this email already exists.' });
      return;
    }

    const toStore = hasHash ? hashPassword(reg.passwordHash) : hashPassword(reg.password);
    const userId = db.insertUser({
      email: emailTrim,
      firstName: reg.firstName,
      lastName: reg.lastName,
      countryCode: reg.countryCode,
      phone: reg.phone,
      passwordHash: toStore,
      username: reg.username,
      displayName: reg.displayName
    });

    try {
      const verifyToken = db.createEmailVerificationToken(userId);
      await sendWelcomeVerificationEmail(emailTrim, verifyToken);
    } catch (e) {
      console.error('Welcome/verification email failed:', e.message);
    }

    createUserSession(res, userId, 'Account created successfully.', 201);
  } catch (err) {
    if (isBodyTooLargeError(err)) return sendBodyTooLarge(res);
    console.error(err);
    sendJson(res, 500, { ok: false, error: 'Registration failed. Please try again.' });
  }
}

async function handleForgotPassword(req, res, db) {
  try {
    const body = await parseBody(req);
    const { valid, email } = parseEmail(body?.email);
    if (!valid) {
      sendJson(res, 400, { ok: false, error: 'Please enter your email.' });
      return;
    }
    const user = db.getAuthUserByEmail(email);
    if (user) {
      const token = db.createPasswordResetToken(user.id);
      await sendPasswordResetEmail(email, token);
    }
    sendJson(res, 200, {
      ok: true,
      message: "If an account exists with that email, we've sent instructions to reset your password."
    });
  } catch (err) {
    if (isBodyTooLargeError(err)) return sendBodyTooLarge(res);
    console.error('Forgot password error:', err);
    const msg = err.message && err.message.includes('not configured')
      ? 'Password reset email is not configured. Please contact support.'
      : 'Something went wrong. Please try again.';
    sendJson(res, 500, { ok: false, error: msg });
  }
}

async function handleResetPassword(req, res, db) {
  try {
    const body = await parseBody(req);
    const token = parseToken(body?.token);
    const password = body?.password;
    const passwordHash = body?.passwordHash;
    const hasHash = isSha256Hex(passwordHash);
    const hasPw = isAcceptablePlainPassword(password);

    if (!token) {
      sendJson(res, 400, { ok: false, error: 'Invalid or expired reset link.' });
      return;
    }
    if (!hasHash && !hasPw) {
      sendJson(res, 400, { ok: false, error: 'Password is required (at least 10 characters).' });
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
  } catch (err) {
    if (isBodyTooLargeError(err)) return sendBodyTooLarge(res);
    console.error('Reset password error:', err);
    sendJson(res, 500, { ok: false, error: 'Something went wrong. Please try again.' });
  }
}

async function handleRequestReactivation(req, res, db) {
  try {
    const body = await parseBody(req);
    const emailHashParsed = parseEmailHash(body?.emailHash);
    const pwHashParsed = parsePasswordHash(body?.passwordHash);

    if (!emailHashParsed.valid || !pwHashParsed.valid) {
      sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
      return;
    }

    const authUser = db.getAuthUserByEmailHash(emailHashParsed.hash);
    if (!authUser) {
      sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
      return;
    }
    const status = authUser.status || authUser.STATUS;
    if (status !== 'deactivated') {
      sendJson(res, 400, { ok: false, error: 'This account is not deactivated.' });
      return;
    }
    const storedHash = authUser.password_hash || authUser.PASSWORD_HASH;
    if (!verifyPassword(pwHashParsed.hash, storedHash)) {
      sendJson(res, 401, { ok: false, error: 'Invalid email or password.' });
      return;
    }

    db.setReactivationRequested(authUser.id);
    sendJson(res, 200, {
      ok: true,
      message: 'Your reactivation request has been submitted. An administrator will review it.'
    });
  } catch (err) {
    if (isBodyTooLargeError(err)) return sendBodyTooLarge(res);
    console.error(err);
    sendJson(res, 500, { ok: false, error: 'Unable to submit reactivation request. Please try again.' });
  }
}

async function handleVerifyEmail(req, res, db) {
  try {
    const body = await parseBody(req);
    const token = parseToken(body?.token);
    if (!token) {
      sendJson(res, 400, { ok: false, error: 'Verification token is required.' });
      return;
    }
    const row = db.getEmailVerificationToken(token);
    if (!row) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid or expired verification link. You can request a new one from your account settings.'
      });
      return;
    }
    db.setEmailVerified(row.user_id);
    db.consumeEmailVerificationToken(token);
    sendJson(res, 200, { ok: true, message: 'Your email address has been verified.' });
  } catch (err) {
    if (isBodyTooLargeError(err)) return sendBodyTooLarge(res);
    console.error(err);
    sendJson(res, 500, { ok: false, error: 'Verification failed. Please try again.' });
  }
}

// --- Router ---

const HANDLERS = {
  '/api/logout': handleLogout,
  '/api/login': handleLogin,
  '/api/register': handleRegister,
  '/api/forgot-password': handleForgotPassword,
  '/api/reset-password': handleResetPassword,
  '/api/request-reactivation': handleRequestReactivation,
  '/api/verify-email': handleVerifyEmail
};

async function handle(req, res, db) {
  const path = getPath(req);
  const handler = HANDLERS[path];
  if (!handler) return;

  if (path === '/api/logout') {
    handleLogout(req, res);
    return;
  }
  await handler(req, res, db);
}

module.exports = { match, handle };
