// @ts-check
/* global document */

// Must be imported first to initialize SES and make `harden` available globally
import '@endo/init';

import { connectToGateway } from './connection.js';
import { make } from './chat.js';

// Get configuration from Vite plugin injection
const endoPort = import.meta.env.ENDO_PORT;
const endoId = import.meta.env.ENDO_ID;

console.log('[Chat] Starting application...');
console.log(`[Chat] ENDO_PORT: ${endoPort}`);
console.log(
  `[Chat] ENDO_ID: ${endoId ? `${String(endoId).slice(0, 16)}...` : '(not set)'}`,
);

if (!endoPort) {
  document.body.innerHTML = `
    <h1>❌ ENDO_PORT not configured</h1>
    <p>The Vite Endo plugin should inject this automatically.</p>
    <p>Make sure you're running with <code>yarn dev</code>.</p>
  `;
  throw new Error('ENDO_PORT not configured - is the Vite Endo plugin loaded?');
}

if (!endoId) {
  document.body.innerHTML = `
    <h1>❌ ENDO_ID not configured</h1>
    <p>The Vite Endo plugin should inject this automatically.</p>
    <p>Make sure you're running with <code>yarn dev</code>.</p>
  `;
  throw new Error('ENDO_ID not configured - is the Vite Endo plugin loaded?');
}

const main = async () => {
  document.body.innerHTML = `
    <h1>🔌 Connecting to Endo Gateway...</h1>
    <p>Port: <code>${endoPort}</code></p>
    <p><em>Check browser console for detailed connection logs</em></p>
  `;

  const connection = connectToGateway({
    endoPort: Number(endoPort),
    endoId: String(endoId),
  });

  try {
    const powers = await connection.powers;
    console.log('[Chat] Host powers received, initializing UI...');
    document.body.innerHTML = '<h1>✅ Connected! Loading chat...</h1>';
    await make(powers);
    console.log('[Chat] UI initialized successfully');
  } catch (error) {
    console.error('[Chat] Failed to connect:', error);
    document.body.innerHTML = `
      <h1>❌ Connection Failed</h1>
      <p><strong>Error:</strong> ${error.message}</p>
      <p><strong>Gateway:</strong> <code>ws://127.0.0.1:${endoPort}/</code></p>
      <h3>Troubleshooting:</h3>
      <ul>
        <li>Is the Vite Endo plugin running? Check the terminal for startup logs.</li>
        <li>Try restarting the dev server with <code>yarn dev</code></li>
        <li>Check the browser console for detailed logs</li>
      </ul>
      <pre>${error.stack || error.message}</pre>
    `;
  }

  // Handle connection close
  connection.closed.then(
    () => {
      console.log('[Chat] Connection closed');
    },
    error => {
      console.error('[Chat] Connection error:', error);
    },
  );
};

main().catch(error => {
  console.error('Application error:', error);
  document.body.innerHTML = `<h1>❌ Application Error</h1><pre>${error.message}</pre>`;
});
