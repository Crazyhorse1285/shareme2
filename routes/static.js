const path = require('path');
const fs = require('fs');
const { MIME_TYPES } = require('../lib/config');

function match(req) {
  return true;
}

function handle(req, res, db) {
  const urlPath = req.urlPath || req.url.split('?')[0];
  const root = path.join(path.dirname(require.main.filename));

  if (req.method === 'GET' && (urlPath === '/sharemeview-database.html' || urlPath === '/sharemeview-registrations.html')) {
    const target = urlPath === '/sharemeview-database.html' ? '/view-database.html' : '/view-registrations.html';
    res.writeHead(302, { Location: target }).end();
    return;
  }

  const fileUrlPath = req.url === '/' ? '/sharemelandingpage.html' : urlPath.replace(/^(\.\.(\/|\\)+)+/, '');
  const relativePath = fileUrlPath.startsWith('/') ? fileUrlPath.slice(1) : fileUrlPath;
  const filePath = path.join(root, relativePath);

  if (!path.resolve(filePath).startsWith(path.resolve(root))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Forbidden');
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      const status = err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(status, { 'Content-Type': 'text/plain' }).end(status === 404 ? 'Not found' : 'Server error');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType }).end(data);
  });
}

module.exports = { match, handle };
