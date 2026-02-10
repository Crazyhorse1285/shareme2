const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE = 'shareme_session';
const ADMIN_SESSION_COOKIE = 'shareme_admin_session';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;
const RESEND_FROM = process.env.RESEND_FROM || 'ShareMe <onboarding@resend.dev>';

// Stripe (optional; upgrade flow disabled if not set)
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const STRIPE_PRO_PRICE_ID = (process.env.STRIPE_PRO_PRICE_ID || '').trim();

// Mock payment (pet project): card that "accepts" and upgrades to Pro
const MOCK_CARD_NUMBER = '6897689768971452';
const MOCK_EXPIRATION = '1030';   // MMYY, e.g. 10/30
const MOCK_CVV = '999';
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

module.exports = { PORT, SESSION_COOKIE, ADMIN_SESSION_COOKIE, MIME_TYPES, RESEND_API_KEY, BASE_URL, RESEND_FROM, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, MOCK_CARD_NUMBER, MOCK_EXPIRATION, MOCK_CVV };
