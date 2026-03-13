#!/usr/bin/env node
// @ts-check
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { makeRelay } from './relay.js';

const parseArgs = argv => {
  const args = { port: 8943, domain: 'localhost' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = parseInt(argv[i + 1], 10);
      i += 1;
    } else if (argv[i] === '--domain' && argv[i + 1]) {
      args.domain = argv[i + 1];
      i += 1;
    }
  }
  return args;
};

/** @param {string} domain */
const makeInfoPage = domain => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Endo Relay — ${domain}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    p { margin: 0.5rem 0; color: #444; line-height: 1.6; }
    code { background: #f3f3f3; padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.9em; }
    a { color: #0070f3; }
  </style>
</head>
<body>
  <h1>Endo Relay</h1>
  <p>This is a WebSocket relay server for <a href="https://github.com/endojs/endo">Endo</a> peer-to-peer connections.</p>
  <p>Domain: <code>${domain}</code></p>
  <p>Peers connect over WebSocket using an ed25519 challenge-response handshake. The relay bridges encrypted channels between authenticated peers without reading application data.</p>
  <p><a href="/health">Health status</a></p>
</body>
</html>`;

const main = () => {
  const args = parseArgs(process.argv);
  const relay = makeRelay(args.domain);
  const infoPage = makeInfoPage(args.domain);

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          peers: relay.getPeerCount(),
          connections: relay.getConnectionCount(),
        }),
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(infoPage);
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', relay.handleConnection);

  server.listen(args.port, () => {
    console.log(
      `Endo relay server listening on port ${args.port}, domain=${args.domain}`,
    );
  });

  const shutdown = () => {
    console.log('Shutting down relay server...');
    wss.close();
    server.close();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main();
