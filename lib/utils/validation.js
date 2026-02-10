/**
 * Shared validation helpers. Used by routes for consistent input validation.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;

/**
 * @param {*} value
 * @returns {string} Trimmed string or empty string if invalid
 */
function trimString(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return String(value).trim();
  return value.trim();
}

/**
 * @param {*} value
 * @returns {string|null} Trimmed string or null
 */
function trimOrNull(value) {
  if (value == null) return null;
  const s = typeof value === 'string' ? value.trim() : String(value).trim();
  return s === '' ? null : s;
}

/**
 * @param {string} email
 * @returns {boolean}
 */
function isEmail(email) {
  return typeof email === 'string' && email.length > 0 && EMAIL_REGEX.test(email.trim());
}

/**
 * @param {string} str
 * @returns {boolean} True if 64-char hex (SHA-256 style)
 */
function isSha256Hex(str) {
  return typeof str === 'string' && str.length === 64 && SHA256_HEX_REGEX.test(str);
}

/**
 * @param {*} value
 * @returns {{ valid: boolean, email: string }} Normalized lowercase email and validity
 */
function parseEmail(value) {
  const email = trimString(value).toLowerCase();
  return { valid: email.length > 0, email };
}

/**
 * @param {*} value
 * @returns {{ valid: boolean, hash: string }}
 */
function parseEmailHash(value) {
  const hash = trimString(value).toLowerCase();
  return { valid: isSha256Hex(hash), hash };
}

/**
 * @param {*} value
 * @returns {{ valid: boolean, hash: string }}
 */
function parsePasswordHash(value) {
  const hash = typeof value === 'string' ? value.trim() : '';
  return { valid: isSha256Hex(hash), hash };
}

/**
 * @param {*} value
 * @returns {boolean}
 */
function hasPassword(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * @param {*} value
 * @returns {boolean} True if string and length >= 10 (plain password)
 */
function isAcceptablePlainPassword(value) {
  return typeof value === 'string' && value.length >= 10;
}

/**
 * @param {*} value
 * @returns {string} Trimmed token or ''
 */
function parseToken(value) {
  return (value != null && typeof value === 'string') ? value.trim() : '';
}

module.exports = {
  EMAIL_REGEX,
  SHA256_HEX_REGEX,
  trimString,
  trimOrNull,
  isEmail,
  isSha256Hex,
  parseEmail,
  parseEmailHash,
  parsePasswordHash,
  hasPassword,
  isAcceptablePlainPassword,
  parseToken
};
