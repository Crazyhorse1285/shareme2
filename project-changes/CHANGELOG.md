# ShareMe project changelog

All notable code changes and refactors are recorded here. **Update this file when you make significant changes** so the project has a single reference for its evolution.

---

## 2025-02-09 — Mock payment upgrade (pet project)
### Summary
Stripe redirect is replaced with a **mock payment** flow for local/pet use: user enters card number, expiration (MM/YY), and CVV in a modal. A single “magic” card is accepted and upgrades the user to Pro; no real payment is processed.

### What changed
- **`lib/config.js`**: `MOCK_CARD_NUMBER` (6897689768971452), `MOCK_EXPIRATION` (1030 = 10/30), `MOCK_CVV` (999).
- **`routes/subscription.js`**: `POST /api/checkout/mock-complete` — auth required; body `card_number`, `expiration`, `cvv`; if they match the mock values, `updateUserPlan(userId, 'pro')` and return success. Accepts expiration as digits or MM/YY.
- **Dashboard & landing**: “Upgrade to Pro” opens a payment modal (card number, expiration, CVV). Form submits to `mock-complete`; on success redirect to dashboard with `?upgrade=success`. Name/address not required (dummy accepted).

---

## 2025-02-09 — Pro tier upgrade flow (Stripe)

### Summary
Users can purchase an upgrade to the Pro tier via Stripe Checkout. Flow follows industry practice: server creates a Checkout Session, user pays on Stripe, webhook updates plan to `pro`.

### What changed

- **Backend**
  - **`db.js`**: `updateUserPlan(userId, plan)` to set user plan (e.g. `pro`); exported from `initDb`.
  - **`lib/config.js`**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` (optional; upgrade disabled if unset).
  - **`lib/http.js`**: `readRawBody(req, maxSize)` for webhook signature verification (raw body required by Stripe).
  - **`routes/subscription.js`** (new):
    - `POST /api/checkout/create-session`: authenticated; creates Stripe Checkout Session (one-time payment), returns `{ url }`; returns `alreadyPro: true` if user is already Pro.
    - `POST /api/webhooks/stripe`: verifies `Stripe-Signature`, on `checkout.session.completed` sets user plan to `pro` via `client_reference_id` (user id).
  - **`server.js`**: subscription route registered.

- **Frontend**
  - **Landing**: "Upgrade to Pro" creates checkout session when logged in, or opens login modal when not; Pro tile CTA shows "Go to Dashboard" for Pro users.
  - **Dashboard**: Free users see "Upgrade to Pro" CTA under the funnel; success/cancel return URLs with `?upgrade=success` / `?upgrade=cancelled`; success shows toast and cleans URL.

- **Config**
  - **`.env.example`**: `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` documented.
  - Stripe Dashboard: create a Product and one-time Price, add webhook endpoint `BASE_URL/api/webhooks/stripe` for `checkout.session.completed`.

### Why
Provide a standard, secure upgrade path to Pro (Stripe Checkout + webhook) without handling card data on our server.

---

## 2025-02-09 — Refactor, security hardening, and docs

### Summary
Application-wide refactor for clarity and maintainability, shared validation/sanitization utilities, request body size limit, and a written security review. README updated with Overview, Install, and Commands.

### What changed

- **New: `lib/utils/`**
  - `validation.js` — Shared validators: `trimString`, `trimOrNull`, `isEmail`, `isSha256Hex`, `parseEmail`, `parseEmailHash`, `parsePasswordHash`, `hasPassword`, `isAcceptablePlainPassword`, `parseToken`.
  - `sanitize.js` — Body normalization: `normalizeBody`, `trimObjectValues`, `normalizeRegistrationBody` (camelCase/snake_case, trimming).
  - `index.js` — Re-exports for a single import path.

- **Security**
  - `lib/http.js`: `parseBody()` now enforces a **256 KB** max body size; oversized requests are rejected with **413**.
  - All routes that use `parseBody` handle the "Request body too large" error and return 413.
  - **`SECURITY.md`** added: documents current measures (parameterized SQL, scrypt, cookies, no email enumeration, etc.) and recommendations (rate limiting, HTTPS, session store).

- **`routes/auth.js`**
  - Split into one handler per endpoint: `handleLogout`, `handleLogin`, `handleRegister`, `handleForgotPassword`, `handleResetPassword`, `handleRequestReactivation`, `handleVerifyEmail`.
  - Uses `lib/utils/validation` and `lib/utils/sanitize` (`normalizeRegistrationBody`).
  - Shared helpers: `createUserSession`, `isBodyTooLargeError`, `sendBodyTooLarge`.
  - Registration returns **201** for new accounts; reset-password error message aligned to "at least 10 characters."

- **`db.js`**
  - Schema and migration column names moved to constants: `USERS_SCHEMA`, `PASSWORD_RESET_TOKENS_TABLE`, `EMAIL_VERIFICATION_TABLE`, `MIGRATION_TEXT_COLUMNS`.
  - New helpers: `getUsersColumnNames()`, `ensureUsersColumn(colName, sqlSuffix)` to reduce repeated migration logic.
  - Replaced `var` with `const`/`let` where appropriate.

- **`routes/me.js`**, **`routes/users.js`**, **`routes/admin.js`**
  - Use `isEmail`, `trimOrNull`, `trimString` from `lib/utils/validation`.
  - All `parseBody` usage wrapped with 413 handling for body-too-large.

- **Bug fix**
  - `routes/auth.js` line 1: typo `gitconst` → `const`.

- **Docs**
  - **README.md**: Added **Overview** (what the app is, stack, main URLs), explicit **Install** and **Commands** sections with a quick reference table.
  - **project-changes/CHANGELOG.md** (this file) for centralized change tracking.

### Why
Improve readability, separate concerns (validation/sanitization), harden security (body limit, documented review), and give a single place to track project changes.

---

## Earlier — Core application and features

### Summary
Initial ShareMe app: landing, registration, dashboard, auth, password reset, email verification, admin area, and API tests.

### What changed

- **Server and routing**
  - `server.js`: HTTP server, route array (users, admin, me, auth, static), 404 fallback.
  - `routes/`: `auth.js`, `admin.js`, `me.js`, `users.js`, `static.js` — match by method/path, handle with shared `db` and `lib` helpers.

- **Auth and sessions**
  - `lib/auth.js`: Sessions (user + admin), cookies (HttpOnly, SameSite=Lax), `hashPassword`/`verifyPassword` (scrypt), `parseCookies`, `getSessionUser`, `requireAdmin`.
  - Auth routes: POST `/api/login`, `/api/logout`, `/api/register`, `/api/forgot-password`, `/api/reset-password`, `/api/request-reactivation`, `/api/verify-email`.

- **Database**
  - `db.js`: sql.js (SQLite in-process), `data/shareme.db`, migrations for users table (UUID, email_hash, failed_login_attempts, locked_until, share/profile/business/academics columns, status, reactivation_requested_at, email_verified), password_reset_tokens and email_verification_tokens tables.
  - User and token CRUD, `recordFailedLogin`/`clearLoginLock`, lockout after 5 failed attempts.

- **Email**
  - `lib/email.js`: Resend integration for password reset and welcome/verification emails; `BASE_URL`, `RESEND_API_KEY`, `RESEND_FROM` from env.

- **Admin**
  - Admin login (env: `ADMIN_EMAIL`, `ADMIN_PASSWORD`), separate admin session cookie.
  - GET `/api/registrations`, `/api/db`; POST `/api/admin-login`, `/api/admin-logout`; GET view-registrations.html, view-database.html (admin-only).
  - Users route: GET/PUT/DELETE `/api/users/:id`, POST `/api/users/:id/unlock`, `/api/users/:id/reactivate`.

- **Me (logged-in user)**
  - GET `/api/me`; PUT `/api/me/share-info`, `/api/me/professional-info`, `/api/me/business-info`, `/api/me/academics-info`, `/api/me/account`; POST `/api/me/deactivate`.

- **Static and config**
  - `lib/config.js`: PORT, cookie names, MIME_TYPES, Resend/BASE_URL.
  - `lib/http.js`: `sendJson`, `parseBody` (JSON).
  - `routes/static.js`: Serve HTML/CSS/JS etc., path traversal check, redirects for legacy sharemeview-* URLs.

- **Front-end**
  - HTML pages: sharemelandingpage, createuser, forgot-password, reset-password, verify-email, sharemedashboard, admin-login, view-registrations, view-database.
  - `styles.css`, `sharemedashboard.js`.

- **Tests**
  - `test/api.test.js`: Node test runner; registration, login, GET /api/me, PUT /api/me/account, deactivate, admin login/reactivate (when env set).

### Why
Deliver a working app with auth, profile, admin, and email flows, and a test suite for the API.
