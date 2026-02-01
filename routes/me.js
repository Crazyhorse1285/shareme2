const { sendJson, parseBody } = require('../lib/http');
const { getSessionUser } = require('../lib/auth');

function match(req) {
  const p = req.urlPath || req.url.split('?')[0];
  return (req.method === 'GET' && p === '/api/me') || (req.method === 'PUT' && p === '/api/me/share-info');
}

async function handle(req, res, db) {
  const urlPath = req.urlPath || req.url.split('?')[0];

  if (req.method === 'GET' && urlPath === '/api/me') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 200, { ok: false, user: null });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          display_name: user.display_name,
          username: user.username,
          share_name_prefix: user.share_name_prefix,
          share_name: user.share_name,
          share_email: user.share_email,
          share_country_code: user.share_country_code,
          share_phone: user.share_phone,
          share_street: user.share_street,
          share_city: user.share_city,
          share_state: user.share_state,
          share_postal_code: user.share_postal_code
        }
      });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { ok: false, user: null });
    }
    return;
  }

  if (req.method === 'PUT' && urlPath === '/api/me/share-info') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to update share info.' });
        return;
      }
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
        return;
      }
      const shareEmail = body.share_email != null ? String(body.share_email).trim() : null;
      if (shareEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shareEmail)) {
        sendJson(res, 400, { ok: false, error: 'Please enter a valid email address.' });
        return;
      }
      db.updateShareInfo(userId, {
        share_name_prefix: body.share_name_prefix,
        share_name: body.share_name,
        share_email: shareEmail,
        share_country_code: body.share_country_code,
        share_phone: body.share_phone,
        share_street: body.share_street,
        share_city: body.share_city,
        share_state: body.share_state,
        share_postal_code: body.share_postal_code
      });
      sendJson(res, 200, { ok: true, message: 'Share info saved.' });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to save share info.' });
    }
  }
}

module.exports = { match, handle };
