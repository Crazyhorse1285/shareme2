const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE = 'shareme_session';
const ADMIN_SESSION_COOKIE = 'shareme_admin_session';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;
const RESEND_FROM = process.env.RESEND_FROM || 'ShareMe <onboarding@resend.dev>';
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

module.exports = { PORT, SESSION_COOKIE, ADMIN_SESSION_COOKIE, MIME_TYPES, RESEND_API_KEY, BASE_URL, RESEND_FROM };
