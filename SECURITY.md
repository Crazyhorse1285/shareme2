# Security review and practices

This document summarizes the security posture of the ShareMe application and recommended practices.

## Implemented security measures

### Authentication and passwords
- **Password hashing**: Passwords are hashed with **scrypt** (salt + 64-byte output). Salt is stored with the hash; verification uses `crypto.timingSafeEqual` to avoid timing attacks.
- **Session IDs**: 24-byte cryptographically random session IDs; sessions stored server-side (in-memory Map).
- **Cookies**: Session cookies use `HttpOnly`, `SameSite=Lax`, and `Path=/` to reduce XSS and CSRF exposure.
- **Admin password**: Compared with `crypto.timingSafeEqual`; no plaintext admin password in responses or logs.

### Input validation and injection
- **SQL**: All queries use **parameterized statements** (e.g. `db.prepare(sql); stmt.bind(params)`). No string concatenation of user input into SQL. Migration column names are from a whitelist.
- **Request body size**: `parseBody()` enforces a **256 KB** maximum body size to mitigate DoS via large JSON payloads. Oversized requests are rejected with 413.
- **Validation**: Email, tokens, and password hashes are validated (format/length) before use. Shared validators live in `lib/utils/validation.js`.

### Authorization and information disclosure
- **User routes** (`/api/me/*`): Require a valid session; users only access their own data.
- **Admin routes** (`/api/registrations`, `/api/users/*`, etc.): Require admin session; redirect to admin login when not authenticated.
- **Password reset / forgot password**: Response is generic (“If an account exists…”) to avoid **email enumeration**.
- **Error messages**: Login and auth failures use generic messages (“Invalid email or password”) to avoid user enumeration.

### Other
- **Open redirect**: Admin login “next” URL is restricted to a small allowlist (`/view-registrations.html`, `/view-database.html`).
- **Static file serving**: Path traversal is mitigated by resolving the request path and ensuring it stays under the server root before reading files.

## Recommendations and considerations

1. **Rate limiting**: There is no application-level rate limiting. Consider adding rate limits (e.g. per IP or per user) for login, registration, and password reset to reduce brute-force and abuse. This could be done in a reverse proxy or in the app.
2. **Session storage**: Sessions are in-memory; they are lost on restart and do not scale across multiple processes. For production, consider a shared store (e.g. Redis) and secure session rotation.
3. **HTTPS**: Use HTTPS in production so cookies and credentials are not sent in cleartext.
4. **Sensitive data in logs**: Avoid logging passwords or tokens. Registration currently logs email; consider reducing or redacting in production.
5. **Environment variables**: Keep `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `RESEND_API_KEY` in environment or a secrets manager; do not commit them.
6. **Dependencies**: Run `npm audit` regularly and update dependencies for known vulnerabilities.

## Summary

- **Authentication**: Strong (scrypt, timing-safe compare, secure cookies).
- **Injection**: Mitigated (parameterized SQL, body size limit, validation).
- **Authorization**: Enforced for user and admin routes; no obvious IDOR in the current design.
- **Improvements**: Rate limiting, persistent/sharable session store, and HTTPS in production are the main next steps.
