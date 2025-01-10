// @ts-check
const path = require('path');
const http = require('http');
const fs = require('fs');

const testPayloadSource = fs.readFileSync(
  path.join(__dirname, 'inpage.js'),
  'utf-8',
);
const SESSource = fs.readFileSync(
  path.join(__dirname, '..', 'packages', 'ses', 'dist', 'ses.umd.js'),
  'utf-8',
);

const pageSource =
  '<!doctype html><body><script src="ses.umd.js"></script><script src="test.js"></script></body>';

const server = http.createServer((req, res) => {
  console.log(req.url);

  if (req.url === '/csp') {
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': "script-src 'self'",
    });
    return res.end(pageSource);
  }
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(pageSource);
  }
  if (req.url === '/test.js') {
    res.writeHead(200, {
      'Content-Type': 'text/javascript',
    });
    return res.end(testPayloadSource);
  }
  if (req.url === '/ses.umd.js') {
    res.writeHead(200, {
      // MUST HAVE for SES to work: charset=utf-8
      'Content-Type': 'text/javascript; charset=utf-8',
    });
    return res.end(SESSource);
  }
  console.warn('404', req.url);
  res.writeHead(404);
  res.end();
});

server.listen({ host: '127.0.0.1', port: 3000 });
