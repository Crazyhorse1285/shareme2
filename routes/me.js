const { sendJson, parseBody } = require('../lib/http');
const { getSessionUser, sessions, clearSessionCookie, parseCookies, SESSION_COOKIE } = require('../lib/auth');
const { isEmail, trimOrNull } = require('../lib/utils/validation');

function match(req) {
  const p = req.urlPath || req.url.split('?')[0];
  return (req.method === 'GET' && p === '/api/me') ||
    (req.method === 'PUT' && (p === '/api/me/share-info' || p === '/api/me/professional-info' || p === '/api/me/business-info' || p === '/api/me/academics-info' || p === '/api/me/account')) ||
    (req.method === 'POST' && p === '/api/me/deactivate');
}

function isBodyTooLarge(err) {
  return err && err.message === 'Request body too large';
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
          country_code: user.country_code,
          share_name_prefix: user.share_name_prefix,
          share_name: user.share_name,
          share_email: user.share_email,
          share_country_code: user.share_country_code,
          share_phone: user.share_phone,
          share_street: user.share_street,
          share_city: user.share_city,
          share_state: user.share_state,
          share_postal_code: user.share_postal_code,
          prof_employer_name: user.prof_employer_name,
          prof_employer_phone: user.prof_employer_phone,
          prof_employer_address: user.prof_employer_address,
          prof_employee_title: user.prof_employee_title,
          prof_years_worked: user.prof_years_worked,
          biz_name: user.biz_name,
          biz_description: user.biz_description,
          biz_address: user.biz_address,
          biz_website: user.biz_website,
          biz_phone: user.biz_phone,
          biz_create_date: user.biz_create_date,
          biz_social_facebook: user.biz_social_facebook,
          biz_social_instagram: user.biz_social_instagram,
          biz_social_twitter: user.biz_social_twitter,
          biz_social_tiktok: user.biz_social_tiktok,
          acad_education: user.acad_education,
          acad_graduated_from: user.acad_graduated_from,
          acad_field_pursued: user.acad_field_pursued,
          acad_highest_level: user.acad_highest_level,
          acad_years_attended: user.acad_years_attended,
          acad_currently_enrolled: user.acad_currently_enrolled
        }
      });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
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
      const shareEmail = trimOrNull(body.share_email);
      if (shareEmail && !isEmail(shareEmail)) {
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
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to save share info.' });
    }
    return;
  }

  if (req.method === 'PUT' && urlPath === '/api/me/professional-info') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to update professional info.' });
        return;
      }
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
        return;
      }
      db.updateProfessionalInfo(userId, {
        prof_employer_name: body.prof_employer_name,
        prof_employer_phone: body.prof_employer_phone,
        prof_employer_address: body.prof_employer_address,
        prof_employee_title: body.prof_employee_title,
        prof_years_worked: body.prof_years_worked
      });
      sendJson(res, 200, { ok: true, message: 'Professional info saved.' });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to save professional info.' });
    }
    return;
  }

  if (req.method === 'PUT' && urlPath === '/api/me/business-info') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to update business info.' });
        return;
      }
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
        return;
      }
      db.updateBusinessInfo(userId, {
        biz_name: body.biz_name,
        biz_description: body.biz_description,
        biz_address: body.biz_address,
        biz_website: body.biz_website,
        biz_phone: body.biz_phone,
        biz_create_date: body.biz_create_date,
        biz_social_facebook: body.biz_social_facebook,
        biz_social_instagram: body.biz_social_instagram,
        biz_social_twitter: body.biz_social_twitter,
        biz_social_tiktok: body.biz_social_tiktok
      });
      sendJson(res, 200, { ok: true, message: 'Business info saved.' });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to save business info.' });
    }
    return;
  }

  if (req.method === 'PUT' && urlPath === '/api/me/account') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to update account info.' });
        return;
      }
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
        return;
      }
      const email = trimOrNull(body.email);
      if (!email || !isEmail(email)) {
        sendJson(res, 400, { ok: false, error: 'Please enter a valid email address.' });
        return;
      }
      const phone = trimOrNull(body.phone);
      if (!phone || phone.length < 7) {
        sendJson(res, 400, { ok: false, error: 'Phone number is required and must be at least 7 characters.' });
        return;
      }
      const username = trimOrNull(body.username);
      if (!username || username.length < 2) {
        sendJson(res, 400, { ok: false, error: 'Username is required and must be at least 2 characters.' });
        return;
      }
      db.updateAccountInfo(userId, {
        email,
        first_name: body.first_name,
        last_name: body.last_name,
        country_code: body.country_code,
        phone,
        username,
        display_name: body.display_name
      });
      sendJson(res, 200, { ok: true, message: 'Account updated.' });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to update account.' });
    }
    return;
  }

  if (req.method === 'PUT' && urlPath === '/api/me/academics-info') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to update academics info.' });
        return;
      }
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Invalid request body.' });
        return;
      }
      db.updateAcademicsInfo(userId, {
        acad_education: body.acad_education,
        acad_graduated_from: body.acad_graduated_from,
        acad_field_pursued: body.acad_field_pursued,
        acad_highest_level: body.acad_highest_level,
        acad_years_attended: body.acad_years_attended,
        acad_currently_enrolled: body.acad_currently_enrolled
      });
      sendJson(res, 200, { ok: true, message: 'Academics info saved.' });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to save academics info.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/me/deactivate') {
    try {
      const userId = getSessionUser(req);
      const user = userId ? db.getUserById(userId) : null;
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to deactivate your account.' });
        return;
      }
      const body = await parseBody(req);
      const email = body && body.email != null ? String(body.email).trim().toLowerCase() : '';
      const userEmail = (user.email || '').trim().toLowerCase();
      if (!email || email !== userEmail) {
        sendJson(res, 400, { ok: false, error: 'Email does not match this account. Enter your current email to deactivate.' });
        return;
      }
      db.deactivateUser(userId);
      const cookies = parseCookies(req);
      const sessionId = cookies[SESSION_COOKIE];
      if (sessionId) sessions.delete(sessionId);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true, message: 'Account deactivated.' });
    } catch (e) {
      if (isBodyTooLarge(e)) { sendJson(res, 413, { ok: false, error: 'Request body too large.' }); return; }
      console.error(e);
      sendJson(res, 500, { ok: false, error: 'Failed to deactivate account.' });
    }
  }
}

module.exports = { match, handle };
