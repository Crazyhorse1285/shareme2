/**
 * Pro tier upgrade flow.
 * - Mock: POST /api/checkout/mock-complete — accepts magic card and upgrades user to Pro.
 * - Stripe (optional): create-session + webhook when env is set.
 */
const { sendJson, parseBody, readRawBody } = require('../lib/http');
const { getSessionUser } = require('../lib/auth');
const { BASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, MOCK_CARD_NUMBER, MOCK_EXPIRATION, MOCK_CVV } = require('../lib/config');

function match(req) {
  const p = req.urlPath || req.url.split('?')[0];
  return (req.method === 'POST' && p === '/api/checkout/mock-complete') ||
    (req.method === 'POST' && p === '/api/checkout/create-session') ||
    (req.method === 'POST' && p === '/api/webhooks/stripe');
}

/** Normalize card number or exp for comparison (digits only). Exp: "10/30" or "1030" -> "1030". */
function normalizeDigits(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/\D/g, '');
}

function isBodyTooLarge(err) {
  return err && err.message === 'Request body too large';
}

async function handle(req, res, db) {
  const urlPath = req.urlPath || req.url.split('?')[0];

  if (req.method === 'POST' && urlPath === '/api/checkout/mock-complete') {
    try {
      const userId = getSessionUser(req);
      if (!userId) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to upgrade.' });
        return;
      }
      const user = db.getUserById(userId);
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Session invalid.' });
        return;
      }
      const plan = (user.plan || 'free').toLowerCase();
      if (plan === 'pro') {
        sendJson(res, 200, { ok: true, alreadyPro: true });
        return;
      }
      const body = await parseBody(req);
      if (!body || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, error: 'Card number, expiration, and CVV are required.' });
        return;
      }
      const cardNumber = normalizeDigits(body.card_number || body.cardNumber || '');
      const expiration = normalizeDigits(body.expiration || body.exp || '');
      const cvv = String(body.cvv || body.cvc || '').trim();
      if (cardNumber !== MOCK_CARD_NUMBER || expiration !== MOCK_EXPIRATION || cvv !== MOCK_CVV) {
        sendJson(res, 400, { ok: false, error: 'Payment declined. Please check your card details.' });
        return;
      }
      db.updateUserPlan(userId, 'pro');
      sendJson(res, 200, { ok: true });
    } catch (e) {
      if (isBodyTooLarge(e)) {
        sendJson(res, 413, { ok: false, error: 'Request body too large.' });
        return;
      }
      console.error('Mock checkout error:', e);
      sendJson(res, 500, { ok: false, error: 'Payment could not be processed.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/checkout/create-session') {
    try {
      const userId = getSessionUser(req);
      if (!userId) {
        sendJson(res, 401, { ok: false, error: 'You must be logged in to upgrade.' });
        return;
      }
      if (!STRIPE_SECRET_KEY || !STRIPE_PRO_PRICE_ID) {
        sendJson(res, 503, { ok: false, error: 'Upgrade is not configured. Please try again later.' });
        return;
      }
      const user = db.getUserById(userId);
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'Session invalid.' });
        return;
      }
      const plan = (user.plan || 'free').toLowerCase();
      if (plan === 'pro') {
        sendJson(res, 200, { ok: true, alreadyPro: true, message: 'You already have Pro.' });
        return;
      }
      const stripe = require('stripe')(STRIPE_SECRET_KEY);
      const successUrl = BASE_URL + '/sharemedashboard.html?upgrade=success';
      const cancelUrl = BASE_URL + '/sharemedashboard.html?upgrade=cancelled';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price: STRIPE_PRO_PRICE_ID,
          quantity: 1
        }],
        client_reference_id: userId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email || undefined
      });
      sendJson(res, 200, { ok: true, url: session.url });
    } catch (e) {
      if (isBodyTooLarge(e)) {
        sendJson(res, 413, { ok: false, error: 'Request body too large.' });
        return;
      }
      console.error('Checkout create-session error:', e);
      sendJson(res, 500, { ok: false, error: 'Could not start checkout. Please try again.' });
    }
    return;
  }

  if (req.method === 'POST' && urlPath === '/api/webhooks/stripe') {
    try {
      if (!STRIPE_WEBHOOK_SECRET) {
        sendJson(res, 503, { ok: false, error: 'Webhook not configured.' });
        return;
      }
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        sendJson(res, 400, { ok: false, error: 'Missing Stripe signature.' });
        return;
      }
      const rawBody = await readRawBody(req);
      const stripe = require('stripe')(STRIPE_SECRET_KEY);
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error('Stripe webhook signature verification failed:', err.message);
        sendJson(res, 400, { ok: false, error: 'Invalid signature.' });
        return;
      }
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (userId) {
          db.updateUserPlan(userId, 'pro');
        }
      }
      sendJson(res, 200, { ok: true });
    } catch (e) {
      if (e.message === 'Request body too large') {
        sendJson(res, 413, { ok: false, error: 'Body too large.' });
        return;
      }
      console.error('Stripe webhook error:', e);
      sendJson(res, 500, { ok: false, error: 'Webhook error.' });
    }
    return;
  }
}

module.exports = { match, handle };
