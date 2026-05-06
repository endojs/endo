// @ts-check
const path = require('path');
const http = require('http');
const fs = require('fs');

const CHAT_DIST = path.join(__dirname, '..', 'packages', 'chat', 'dist');

/**
 * Map a file extension to a Content-Type header value suitable
 * for browsers loading SES, ES module, and Vite-emitted assets.
 *
 * @param {string} ext
 * @returns {string}
 */
const contentTypeFor = ext => {
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      // MUST HAVE for SES to work: charset=utf-8.
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    default:
      return 'application/octet-stream';
  }
};

/**
 * Serve a file from `packages/chat/dist/` under the `/chat/` URL
 * prefix.  Returns true if the request was handled (whether 200 or
 * 404), false if it falls outside the `/chat/` prefix.
 *
 * Uses a containment check on the resolved path to refuse
 * `/chat/../...` traversal attempts.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {boolean}
 */
const serveChat = (req, res) => {
  const url = req.url || '';
  if (url !== '/chat' && !url.startsWith('/chat/')) {
    return false;
  }
  let rel = url.slice('/chat'.length);
  if (rel === '' || rel === '/') {
    rel = '/index.html';
  }
  const filePath = path.join(CHAT_DIST, rel);
  if (
    filePath !== CHAT_DIST &&
    !filePath.startsWith(`${CHAT_DIST}${path.sep}`)
  ) {
    res.writeHead(403);
    res.end();
    return true;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    console.warn('404', url);
    res.writeHead(404);
    res.end();
    return true;
  }
  res.writeHead(200, {
    'Content-Type': contentTypeFor(path.extname(filePath)),
  });
  res.end(fs.readFileSync(filePath));
  return true;
};

const server = http.createServer((req, res) => {
  console.log(req.url);

  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><script src="ses.umd.js"></script>');
  }
  if (req.url === '/ses.umd.js') {
    res.writeHead(200, {
      // MUST HAVE for SES to work: charset=utf-8
      'Content-Type': 'text/javascript; charset=utf-8',
    });
    return res.end(
      fs.readFileSync(
        path.join(__dirname, '..', 'packages', 'ses', 'dist', 'ses.umd.js'),
        'utf-8',
      ),
    );
  }
  if (serveChat(req, res)) {
    return undefined;
  }
  console.warn('404', req.url);
  res.writeHead(404);
  res.end();

  return undefined;
});

server.listen({ host: '127.0.0.1', port: 3000 });
