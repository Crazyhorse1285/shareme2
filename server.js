require('dotenv').config();
const http = require('http');
const { PORT } = require('./lib/config');
const usersRoute = require('./routes/users');
const adminRoute = require('./routes/admin');
const meRoute = require('./routes/me');
const authRoute = require('./routes/auth');
const staticRoute = require('./routes/static');

const routes = [usersRoute, adminRoute, meRoute, authRoute, staticRoute];

function createRouter(db) {
  return async function requestHandler(req, res) {
    req.urlPath = req.url.split('?')[0];
    for (const route of routes) {
      if (route.match(req)) {
        await route.handle(req, res, db);
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  };
}

async function main() {
  const db = await require('./db').initDb();
  const router = createRouter(db);
  const server = http.createServer(router);

  server.listen(PORT, () => {
    console.log(`ShareMe server at http://localhost:${PORT}/`);
    console.log(`  Landing: http://localhost:${PORT}/sharemelandingpage.html`);
    console.log(`  Register: http://localhost:${PORT}/createuser.html`);
    console.log(`  Dashboard: http://localhost:${PORT}/sharemedashboard.html`);
    console.log(`  Forgot password: http://localhost:${PORT}/forgot-password.html`);
    console.log(`  Reset password: http://localhost:${PORT}/reset-password.html`);
    console.log(`  Admin login: http://localhost:${PORT}/admin-login.html`);
    console.log('Press Ctrl+C to stop.');
  });

  server.on('error', (err) => {
    console.error('Server failed to start:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is in use. Set a different port: $env:PORT=3002; node server.js`);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
