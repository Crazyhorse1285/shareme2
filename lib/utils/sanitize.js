/**
 * Request body sanitization and normalization.
 * Use to coerce body fields to a consistent shape (e.g. camelCase vs snake_case).
 */

const { trimOrNull, trimString } = require('./validation');

/**
 * Normalize common body field names (support both camelCase and snake_case).
 * @param {object} body
 * @param {Record<string, string[]>} fieldMap Map of target key -> [possible source keys]
 * @returns {object} New object with normalized keys and trimmed string values
 */
function normalizeBody(body, fieldMap) {
  if (!body || typeof body !== 'object') return {};
  const out = {};
  for (const [targetKey, sourceKeys] of Object.entries(fieldMap)) {
    let value;
    for (const k of sourceKeys) {
      if (body[k] !== undefined && body[k] !== null) {
        value = body[k];
        break;
      }
    }
    if (value !== undefined) {
      out[targetKey] = typeof value === 'string' ? value.trim() : value;
    }
  }
  return out;
}

/**
 * Trim all string values in an object (shallow). Null/undefined preserved.
 * @param {object} obj
 * @returns {object}
 */
function trimObjectValues(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v != null && typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** Common field map for registration body */
const REGISTRATION_FIELDS = {
  email: ['email', 'Email'],
  phone: ['phone', 'Phone'],
  passwordHash: ['passwordHash', 'PasswordHash'],
  firstName: ['firstName', 'first_name'],
  lastName: ['lastName', 'last_name'],
  countryCode: ['countryCode', 'country_code'],
  username: ['username'],
  displayName: ['displayName', 'display_name']
};

/**
 * @param {object} body
 * @returns {object} Normalized registration payload (trimmed strings, consistent keys)
 */
function normalizeRegistrationBody(body) {
  const normalized = normalizeBody(body, REGISTRATION_FIELDS);
  return {
    email: trimString(normalized.email ?? body?.email ?? ''),
    phone: trimString(normalized.phone ?? body?.phone ?? ''),
    passwordHash: trimString(normalized.passwordHash ?? body?.passwordHash ?? ''),
    firstName: trimOrNull(normalized.firstName ?? body?.firstName ?? body?.first_name),
    lastName: trimOrNull(normalized.lastName ?? body?.lastName ?? body?.last_name),
    countryCode: trimOrNull(normalized.countryCode ?? body?.countryCode ?? body?.country_code),
    username: trimOrNull(normalized.username ?? body?.username),
    displayName: trimOrNull(normalized.displayName ?? body?.displayName ?? body?.display_name),
    password: body?.password
  };
}

module.exports = {
  normalizeBody,
  trimObjectValues,
  REGISTRATION_FIELDS,
  normalizeRegistrationBody
};
