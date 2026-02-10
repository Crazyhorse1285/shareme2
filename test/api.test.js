/**
 * ShareMe API tests
 * Run: npm test (or node --test test/)
 * Requires: SHAREME_TEST_DB=1 and ADMIN_EMAIL, ADMIN_PASSWORD set for admin tests.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

process.env.SHAREME_TEST_DB = '1';
process.env.PORT = '0';

const TEST_EMAIL = 'testuser@example.com';
const TEST_PASSWORD = 'TestPass123!'; // 10+ chars, 1 special, not part of email
const MOCK = {
  firstName: 'Test',
  lastName: 'User',
  phone: '5551234567',
  countryCode: '+1',
  username: 'testuser99',
  displayName: 'Test User'
};

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

let baseUrl;
let server;
let userSessionCookie;
let adminSessionCookie;
let createdUserId;

async function fetchApi(method, pathname, body, cookies = {}) {
  const url = new URL(pathname, baseUrl);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const cookieParts = [];
  if (cookies.user) cookieParts.push('shareme_session=' + cookies.user);
  if (cookies.admin) cookieParts.push('shareme_admin_session=' + cookies.admin);
  if (cookieParts.length) headers.Cookie = cookieParts.join('; ');
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const setCookie = res.headers.get('set-cookie');
  let text = '';
  try { text = await res.text(); } catch (_) {}
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}
  return { status: res.status, data, setCookie, headers: res.headers };
}

function parseCookieFromSetCookie(header) {
  if (!header) return null;
  const part = header.split(';')[0].trim();
  const eq = part.indexOf('=');
  return eq !== -1 ? part.slice(eq + 1) : null;
}

describe('ShareMe API', () => {
  before(async () => {
    const dataDir = path.join(__dirname, '..', 'data');
    const testDbPath = path.join(dataDir, 'test-shareme.db');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    const db = await require('../db').initDb();
    const { createApp } = require('../server');
    server = createApp(db);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = 'http://127.0.0.1:' + port;
  });

  after(() => {
    if (server) server.close();
  });

  describe('User registration (create user)', () => {
    it('registers a new user with mock data and returns 201', async () => {
      const passwordHash = sha256Hex(TEST_PASSWORD);
      const payload = {
        email: TEST_EMAIL,
        phone: MOCK.phone,
        passwordHash,
        firstName: MOCK.firstName,
        lastName: MOCK.lastName,
        countryCode: MOCK.countryCode,
        username: MOCK.username,
        displayName: MOCK.displayName
      };
      const { status, data } = await fetchApi('POST', '/api/register', payload);
      assert.strictEqual(status, 201, 'Expected 201 on register');
      assert.strictEqual(data.ok, true, 'Expected ok: true');
      assert.ok(data.message, 'Expected message');
    });

    it('rejects duplicate email with 409', async () => {
      const passwordHash = sha256Hex(TEST_PASSWORD);
      const payload = {
        email: TEST_EMAIL,
        phone: MOCK.phone,
        passwordHash,
        firstName: MOCK.firstName,
        lastName: MOCK.lastName,
        countryCode: MOCK.countryCode,
        username: 'othername',
        displayName: MOCK.displayName
      };
      const { status, data } = await fetchApi('POST', '/api/register', payload);
      assert.strictEqual(status, 409);
      assert.strictEqual(data.ok, false);
    });
  });

  describe('Login', () => {
    it('logs in with email and password hash and returns session cookie', async () => {
      const emailHash = sha256Hex(TEST_EMAIL.toLowerCase());
      const passwordHash = sha256Hex(TEST_PASSWORD);
      const { status, data, setCookie } = await fetchApi('POST', '/api/login', {
        emailHash,
        passwordHash
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
      const sessionId = parseCookieFromSetCookie(setCookie);
      assert.ok(sessionId, 'Expected Set-Cookie with session');
      userSessionCookie = sessionId;
    });
  });

  describe('Get current user (GET /api/me)', () => {
    it('returns user when session is valid', async () => {
      const { status, data } = await fetchApi('GET', '/api/me', null, { user: userSessionCookie });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
      assert.ok(data.user);
      assert.strictEqual(data.user.email, TEST_EMAIL);
      assert.strictEqual(data.user.username, MOCK.username);
      assert.strictEqual(data.user.first_name, MOCK.firstName);
      assert.strictEqual(data.user.last_name, MOCK.lastName);
      createdUserId = data.user.id;
    });

    it('returns ok: false when no session', async () => {
      const { status, data } = await fetchApi('GET', '/api/me', null, {});
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, false);
      assert.strictEqual(data.user, null);
    });
  });

  describe('Update user information (PUT /api/me/account)', () => {
    it('updates account info when logged in', async () => {
      const updated = {
        email: TEST_EMAIL,
        first_name: 'Updated',
        last_name: 'Name',
        country_code: '+1',
        phone: '5559876543',
        username: 'updateduser99',
        display_name: 'Updated Display'
      };
      const { status, data } = await fetchApi('PUT', '/api/me/account', updated, {
        user: userSessionCookie
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
    });

    it('GET /api/me reflects updated info', async () => {
      const { status, data } = await fetchApi('GET', '/api/me', null, { user: userSessionCookie });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.user.first_name, 'Updated');
      assert.strictEqual(data.user.last_name, 'Name');
      assert.strictEqual(data.user.username, 'updateduser99');
      assert.strictEqual(data.user.display_name, 'Updated Display');
    });
  });

  describe('Deactivate user (POST /api/me/deactivate)', () => {
    it('deactivates account when email matches', async () => {
      const { status, data, setCookie } = await fetchApi(
        'POST',
        '/api/me/deactivate',
        { email: TEST_EMAIL },
        { user: userSessionCookie }
      );
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
      userSessionCookie = null;
    });

    it('login fails with 403 for deactivated account', async () => {
      const emailHash = sha256Hex(TEST_EMAIL.toLowerCase());
      const passwordHash = sha256Hex(TEST_PASSWORD);
      const { status, data } = await fetchApi('POST', '/api/login', {
        emailHash,
        passwordHash
      });
      assert.strictEqual(status, 403);
      assert.strictEqual(data.ok, false);
      assert.ok((data.error || '').toLowerCase().includes('deactivated'));
    });
  });

  const hasAdminEnv = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD;

  describe('Admin: reactivate user (POST /api/users/:id/reactivate)', () => {
    it('admin login succeeds when ADMIN_EMAIL and ADMIN_PASSWORD are set', async () => {
      if (!hasAdminEnv) {
        console.log('  (Skip: set ADMIN_EMAIL and ADMIN_PASSWORD to run admin tests)');
        return;
      }
      const { status, data, setCookie } = await fetchApi('POST', '/api/admin-login', {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
      const adminCookie = parseCookieFromSetCookie(setCookie);
      assert.ok(adminCookie);
      adminSessionCookie = adminCookie;
    });

    it('reactivates deactivated user when admin', { skip: !hasAdminEnv }, async () => {
      assert.ok(adminSessionCookie, 'admin session from previous test');
      assert.ok(createdUserId, 'user id from registration');
      const { status, data } = await fetchApi(
        'POST',
        '/api/users/' + createdUserId + '/reactivate',
        null,
        { admin: adminSessionCookie }
      );
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
    });

    it('login succeeds again after reactivation', { skip: !hasAdminEnv }, async () => {
      const emailHash = sha256Hex(TEST_EMAIL.toLowerCase());
      const passwordHash = sha256Hex(TEST_PASSWORD);
      const { status, data, setCookie } = await fetchApi('POST', '/api/login', {
        emailHash,
        passwordHash
      });
      assert.strictEqual(status, 200);
      assert.strictEqual(data.ok, true);
      userSessionCookie = parseCookieFromSetCookie(setCookie);
    });
  });
});
