const { sendJson, parseBody } = require('../lib/http');
const { requireAdmin } = require('../lib/auth');

function withUser(id, db, fn) {
  const user = db.getUserById(id);
  if (!user) return { status: 404, body: { ok: false, error: 'User not found.' } };
  return fn(user);
}

function match(req) {
  const path = req.urlPath || req.url.split('?')[0];
  const unlock = path.match(/^\/api\/users\/([^/]+)\/unlock$/);
  const reactivate = path.match(/^\/api\/users\/([^/]+)\/reactivate$/);
  const usersId = path.match(/^\/api\/users\/([^/]+)$/);
  return (unlock && req.method === 'POST') || (reactivate && req.method === 'POST') || (usersId && (req.method === 'GET' || req.method === 'DELETE' || req.method === 'PUT'));
}

async function handle(req, res, db) {
  const path = req.urlPath || req.url.split('?')[0];
  const unlockMatch = path.match(/^\/api\/users\/([^/]+)\/unlock$/);
  const reactivateMatch = path.match(/^\/api\/users\/([^/]+)\/reactivate$/);
  const usersIdMatch = path.match(/^\/api\/users\/([^/]+)$/);

  if (unlockMatch && req.method === 'POST') {
    const id = unlockMatch[1];
    return requireAdmin(req, res, () => {
      try {
        const user = db.getUserById(id);
        if (!user) {
          sendJson(res, 404, { ok: false, error: 'User not found.' });
          return;
        }
        db.clearLoginLock(id);
        sendJson(res, 200, { ok: true, message: 'User unlocked. They can try to log in again.' });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Failed to unlock user.' });
      }
    });
  }

  if (reactivateMatch && req.method === 'POST') {
    const id = reactivateMatch[1];
    return requireAdmin(req, res, () => {
      try {
        const user = db.getUserById(id);
        if (!user) {
          sendJson(res, 404, { ok: false, error: 'User not found.' });
          return;
        }
        db.reactivateUser(id);
        sendJson(res, 200, { ok: true, message: 'Account reactivated. User can log in again.' });
      } catch (e) {
        console.error(e);
        sendJson(res, 500, { ok: false, error: 'Failed to reactivate user.' });
      }
    });
  }

  if (usersIdMatch) {
    const id = usersIdMatch[1];
    if (req.method === 'GET') {
      return requireAdmin(req, res, () => {
        try {
          const result = withUser(id, db, (user) => ({ status: 200, body: { ok: true, user } }));
          sendJson(res, result.status, result.body);
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to fetch user.' });
        }
      });
    }
    if (req.method === 'DELETE') {
      return requireAdmin(req, res, () => {
        try {
          const result = withUser(id, db, () => {
            db.deleteUser(id);
            return { status: 200, body: { ok: true, message: 'User deleted.' } };
          });
          sendJson(res, result.status, result.body);
        } catch (e) {
          console.error(e);
          sendJson(res, 500, { ok: false, error: 'Failed to delete user.' });
        }
      });
    }
    if (req.method === 'PUT') {
      return requireAdmin(req, res, async () => {
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
      });
    }
  }
}

module.exports = { match, handle };
