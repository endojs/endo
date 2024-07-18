// @ts-check
const path = require('path');
const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
  console.log(req.url);

  if (req.url === '/') {
    res.writeHead(200, { 
      'Content-Type': 'text/html', 
      // ensure SES works when eval is firbidden by CSP (no `unsafe-eval` in script-src)
      'content-security-policy': "default-src 'self'; script-src 'self';" 
    });
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
  console.warn('404', req.url);
  res.writeHead(404);
  res.end();
});

server.listen({ host: '127.0.0.1', port: 3000 });
