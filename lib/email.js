const { Resend } = require('resend');
const { RESEND_API_KEY, BASE_URL, RESEND_FROM } = require('./config');

let resend = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
}

async function sendPasswordResetEmail(to, token) {
  if (!resend || !RESEND_API_KEY) {
    throw new Error('Email not configured. Set RESEND_API_KEY in your environment.');
  }
  const resetUrl = BASE_URL.replace(/\/$/, '') + '/reset-password.html?token=' + encodeURIComponent(token);
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #1e293b;">Reset your ShareMe password</h2>
      <p style="color: #475569; line-height: 1.6;">You requested a password reset. Click the button below to choose a new password. This link expires in 1 hour.</p>
      <p style="margin: 1.5rem 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 0.75rem 1.5rem; background: #0ea5e9; color: white; text-decoration: none; font-weight: 600; border-radius: 12px;">Reset password</a>
      </p>
      <p style="color: #64748b; font-size: 0.875rem;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
  const { data, error } = await resend.emails.send({
    from: RESEND_FROM,
    to: [to],
    subject: 'Reset your ShareMe password',
    html
  });
  if (error) throw error;
  return data;
}

module.exports = { sendPasswordResetEmail };
