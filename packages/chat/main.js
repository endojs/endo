// @ts-check
/* global document, window, setTimeout */

// Initialize SES and make `harden` available globally
// Using debug.js for better stack traces during development
// Note: Monaco is loaded in an iframe to avoid SES conflicts
import '@endo/init/debug.js';

import { connectToGateway } from './connection.js';
import { make } from './chat.js';

const RECONNECT_INTERVAL_MS = 5000;

// Runtime config: prefer URL fragment params (Electron/Familiar passes config
// as a fragment so the agent ID is never sent on the wire in an HTTP request),
// fall back to Vite env.
const urlParams = new URLSearchParams(window.location.hash.slice(1));
// @ts-expect-error Vite injects env at build time
const gateway = urlParams.get('gateway') || import.meta.env.ENDO_GATEWAY;
// @ts-expect-error Vite injects env at build time
const agent = urlParams.get('agent') || import.meta.env.ENDO_AGENT;

console.log('[Chat] Starting application...');
console.log(`[Chat] Gateway: ${gateway}`);
console.log(
  `[Chat] Agent: ${agent ? `${String(agent).slice(0, 16)}...` : '(not set)'}`,
);

if (!gateway) {
  document.body.innerHTML = `
    <h1>❌ Gateway not configured</h1>
    <p>Configuration should be injected by the Vite Endo plugin or the Familiar.</p>
    <p>Make sure you're running with <code>yarn dev</code> or via the Familiar.</p>
  `;
  throw new Error('Gateway not configured - running via Vite or Familiar?');
}

if (!agent) {
  document.body.innerHTML = `
    <h1>❌ Agent not configured</h1>
    <p>Configuration should be injected by the Vite Endo plugin or the Familiar.</p>
    <p>Make sure you're running with <code>yarn dev</code> or via the Familiar.</p>
  `;
  throw new Error('Agent not configured - running via Vite or Familiar?');
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
    <p>Gateway: <code>${gateway}</code></p>
    <p><em>Check browser console for detailed connection logs</em></p>
  `;

  // Retry loop for initial connection
  let connection;
  let powers;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    connection = connectToGateway({
      gateway: String(gateway),
      agent: String(agent),
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
