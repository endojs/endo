// @ts-check
/* global document, setTimeout */

// Initialize SES and make `harden` available globally
// Using debug.js for better stack traces during development
// Note: Monaco is loaded in an iframe to avoid SES conflicts
import '@endo/init/debug.js';

import { connectToGateway } from './connection.js';
import { make } from './chat.js';

const RECONNECT_INTERVAL_MS = 5000;

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

/**
 * Show reconnecting UI overlay.
 * @param {string} message
 */
const showReconnecting = message => {
  // Create or update reconnecting overlay
  let overlay = document.getElementById('reconnect-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'reconnect-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <h1 style="margin: 0 0 16px; font-size: 24px;">🔄 Reconnecting...</h1>
    <p style="margin: 0 0 8px; opacity: 0.8;">${message}</p>
    <p style="margin: 0; font-size: 14px; opacity: 0.6;">Retrying every ${RECONNECT_INTERVAL_MS / 1000} seconds</p>
  `;
  overlay.style.display = 'flex';
};

/**
 * Hide reconnecting UI overlay.
 */
const hideReconnecting = () => {
  const overlay = document.getElementById('reconnect-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
};

/**
 * Schedule a reconnection attempt.
 */
/**
 * Schedule a reconnection attempt.
 * @param {() => Promise<void>} reconnect
 */
function scheduleReconnect(reconnect) {
  setTimeout(() => {
    reconnect().catch(error => {
      console.error('[Chat] Reconnection failed:', error);
      showReconnecting(/** @type {Error} */ (error).message);
      scheduleReconnect(reconnect);
    });
  }, RECONNECT_INTERVAL_MS);
}

/**
 * Connect to the gateway and initialize the chat UI.
 * Handles reconnection on disconnect.
 */
async function connectAndRun() {
  document.body.innerHTML = `
    <h1>🔌 Connecting to Endo Gateway...</h1>
    <p>Port: <code>${endoPort}</code></p>
    <p><em>Check browser console for detailed connection logs</em></p>
  `;

  // Retry loop for initial connection
  let connection;
  let powers;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    connection = connectToGateway({
      endoPort: Number(endoPort),
      endoId: String(endoId),
    });

    try {
      // eslint-disable-next-line no-await-in-loop
      powers = await connection.powers;
      console.log('[Chat] Host powers received, initializing UI...');
      hideReconnecting();
      break;
    } catch (error) {
      console.error('[Chat] Failed to connect:', error);
      showReconnecting(/** @type {Error} */ (error).message);
      // Wait before retrying
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL_MS));
    }
  }

  // Initialize the chat UI
  document.body.innerHTML = '';
  await make(powers);
  console.log('[Chat] UI initialized successfully');

  // Watch for disconnection and reconnect
  connection.closed.then(
    () => {
      console.log('[Chat] Connection closed, will reconnect...');
      showReconnecting('Connection lost');
      scheduleReconnect(connectAndRun);
    },
    error => {
      console.error('[Chat] Connection error:', error);
      showReconnecting(error.message);
      scheduleReconnect(connectAndRun);
    },
  );
}

connectAndRun().catch(error => {
  console.error('Application error:', error);
  document.body.innerHTML = `<h1>❌ Application Error</h1><pre>${/** @type {Error} */ (error).message}</pre>`;
});
