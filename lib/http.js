/** Max request body size (bytes) to prevent DoS via large payloads. 256KB. */
const MAX_BODY_SIZE = 256 * 1024;

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache'
  });
  res.end(JSON.stringify(data));
}

/**
 * Parse JSON body from request. Rejects if body exceeds MAX_BODY_SIZE.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object>}
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { sendJson, parseBody, MAX_BODY_SIZE };
