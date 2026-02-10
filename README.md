# ShareMe

Personal information sharing — landing page, create account, and dashboard.

## Overview

- **What it is**: A Node.js web app for user registration, login, profile/dashboard, password reset, and email verification. Admins can view registrations and manage users.
- **Stack**: Node.js, vanilla HTTP server, sql.js (SQLite in-process), Resend for email.
- **Main URLs** (after starting the server):
  - Landing: http://localhost:3000/ or http://localhost:3000/sharemelandingpage.html
  - Register: http://localhost:3000/createuser.html
  - Dashboard: http://localhost:3000/sharemedashboard.html
  - Forgot password: http://localhost:3000/forgot-password.html
  - Admin login: http://localhost:3000/admin-login.html

## Install

1. Clone or download the project and open a terminal in the project folder.
2. Install dependencies (once):
   ```powershell
   npm install
   ```

## Commands

| Command | Description |
|--------|--------------|
| `npm start` | Start the server (default port 3000). |
| `node server.js` | Same as `npm start`. |
| `npm test` | Run API tests (uses test DB; see test folder). |
| `$env:PORT=3001; node server.js` | Start on a specific port (e.g. 3001). |

**Stop the server**: Press `Ctrl+C` in the terminal.

## Running locally (test before pushing to Render)

1. After **Install** and **Commands** above, start the server with `npm start` or `node server.js`.
2. Open in your browser: http://localhost:3000/ or http://localhost:3000/sharemelandingpage.html.

If port 3000 is in use, set a different port (e.g. `$env:PORT=3001; node server.js`).

### Password reset (Forgot password)

Password reset sends emails via [Resend](https://resend.com):

1. Sign up at https://resend.com and create an API key.
2. Set environment variables before starting the server:
   ```powershell
   $env:RESEND_API_KEY="re_xxxxxxxxxx"
   $env:BASE_URL="http://localhost:3000"
   node server.js
   ```
3. For production, set `BASE_URL` to your public URL (e.g. `https://yourdomain.com`) and optionally `RESEND_FROM` with a verified domain.

See `.env.example` for all options.

### Admin (View registrations / View database)

Only you (the sole admin) can open **View registrations** and **View database**. Use a separate admin login:

1. Set your admin credentials with environment variables, then start the server:
   ```powershell
   $env:ADMIN_EMAIL="your@email.com"; $env:ADMIN_PASSWORD="YourSecretPassword"; node server.js
   ```
2. Open **Admin login**: http://localhost:3000/admin-login.html  
3. Sign in with that email and password. You’ll be taken to View registrations (or View database if that’s where you were going).  
4. Anyone else who opens view-registrations.html or view-database.html will be redirected to the admin login; without your credentials they cannot access those pages.

Admin login uses a separate cookie from the main site, so you can be logged in as a normal user and as admin in different tabs.

### Pro upgrade (mock payment / Stripe)

**Mock payment (default):** For this pet project, upgrading uses a **mock card** — no real payment. Click “Upgrade to Pro”, enter in the modal:

- **Card number:** 6897689768971452  
- **Expiration:** 10/30 (or 1030)  
- **CVV:** 999  

Name and address can be dummy. On success you’re upgraded to Pro and redirected to the dashboard.

**Optional — real payments with Stripe:**

1. Create a [Stripe](https://stripe.com) account and in the Dashboard create a **Product** (e.g. “ShareMe Pro”) with a **one-time Price**.
2. Set environment variables (see `.env.example`):
   - `STRIPE_SECRET_KEY` — Stripe secret key (e.g. `sk_test_...`)
   - `STRIPE_PRO_PRICE_ID` — Price ID for the Pro one-time payment (e.g. `price_...`)
   - `STRIPE_WEBHOOK_SECRET` — From Stripe → Developers → Webhooks → Add endpoint `https://yourdomain.com/api/webhooks/stripe`, event `checkout.session.completed`
3. After payment, Stripe sends a webhook; the server sets the user’s plan to `pro` and they get access to Professional, Business, and Academics profiles.

Locally you can use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

## Move this project out of the Unity folder (optional)

This folder was created as a **standalone** copy of ShareMe with no Unity files. To use it as its own project:

1. **Move the folder**  
   In File Explorer, cut the entire **ShareMe-Standalone** folder and paste it where you want (e.g. `C:\Users\crazy\Documents\ShareMe` or your Desktop). You can rename it to **ShareMe** if you like.

2. **Open in Cursor**  
   In Cursor: **File → Open Folder** and select the moved folder. Your workspace will be only ShareMe (no Unity).

3. **Push to GitHub**  
   In the terminal (with the ShareMe folder as your workspace), run:

   ```powershell
   git init
   git remote add origin https://github.com/Crazyhorse1285/shareme2.git
   git add .
   git commit -m "Initial commit: ShareMe landing, create user, dashboard"
   git branch -M main
   git push -u origin main
   ```

## Project changes and refactors

All code changes and refactors are in **[project-changes/CHANGELOG.md](project-changes/CHANGELOG.md)**. Update that file when you make significant changes.

## Files

- **sharemelandingpage.html** — Landing page
- **createuser.html** — Sign-up / create account
- **forgot-password.html** — Request password reset email
- **reset-password.html** — Set new password (from email link)
- **sharemedashboard.html** — Dashboard (profile selection)
- **styles.css** — Shared styles

Open any `.html` file in a browser to view.
