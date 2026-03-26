// @ts-check
/* global document, window, setTimeout, clearTimeout */

// Import SES to make `harden` available globally.
// We use `ses` directly (not `@endo/init`) so that intrinsics are NOT frozen,
// allowing Monaco editor to run inline without iframe isolation.
import 'ses';
// CapTP and E() require HandledPromise to be installed as a global.
import '@endo/eventual-send/shim.js';

import { connectToGateway } from './connection.js';
import { make } from './chat.js';

const RECONNECT_INTERVAL_MS = 5000;

// Runtime config from the URL fragment.  Both the Vite dev plugin
// (/dev redirect) and the Familiar (Electron) place the gateway address
// and agent ID in the fragment so the bearer-token-like agent ID is
// never sent over HTTP.
const urlParams = new URLSearchParams(window.location.hash.slice(1));
const gateway = urlParams.get('gateway');
const agent = urlParams.get('agent');

// If the fragment doesn't contain config, try the Vite /dev endpoint
// which will redirect back with the config in the fragment.
// Guard against infinite loops: only attempt the redirect once per page load.
if (!gateway || !agent) {
  if (!sessionStorage.getItem('endo-dev-attempted')) {
    sessionStorage.setItem('endo-dev-attempted', '1');
    console.log('[Chat] No config in fragment, trying /dev...');
    window.location.href = '/dev';
    throw new Error('Redirecting to /dev');
  }
  sessionStorage.removeItem('endo-dev-attempted');
  document.body.innerHTML = `
    <h1>Gateway not configured</h1>
    <p>Run via <code>yarn dev</code> (Vite) or the Familiar app.</p>
  `;
  throw new Error('Gateway not configured');
}
sessionStorage.removeItem('endo-dev-attempted');

console.log('[Chat] Starting application...');
console.log(`[Chat] Gateway: ${gateway}`);
console.log(`[Chat] Agent: ${agent.slice(0, 16)}...`);

/** @type {ReturnType<typeof setTimeout> | undefined} */
let countdownTimer;

/**
 * Show reconnecting UI overlay.
 * @param {string} message
 */
const showReconnecting = message => {
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
    <h1 style="margin: 0 0 16px; font-size: 24px;">🔄 Reconnecting…</h1>
    <p style="margin: 0 0 8px; opacity: 0.8;">${message}</p>
    <p id="reconnect-status" style="margin: 0; font-size: 14px; opacity: 0.6;"></p>
  `;
  overlay.style.display = 'flex';
};

/**
 * Update the status line on the reconnecting overlay.
 * @param {string} text
 */
const setReconnectStatus = text => {
  const el = document.getElementById('reconnect-status');
  if (el) {
    el.textContent = text;
  }
};

/**
 * Hide reconnecting UI overlay.
 */
const hideReconnecting = () => {
  const overlay = document.getElementById('reconnect-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  if (countdownTimer !== undefined) {
    clearTimeout(countdownTimer);
    countdownTimer = undefined;
  }
};

/**
 * Poll /health until the Vite dev server is reachable, then navigate
 * to /dev to pick up fresh credentials for the (possibly restarted) daemon.
 *
 * Counts down to each attempt, shows "Reconnecting…" during the fetch,
 * and restarts the countdown if the attempt fails.
 */
function pollHealthThenReconnect() {
  const totalSeconds = RECONNECT_INTERVAL_MS / 1000;

  const poll = () => {
    setReconnectStatus('Reconnecting…');
    fetch('/health')
      .then(res => {
        if (res.ok) {
          console.log('[Chat] Server healthy, reconnecting via /dev...');
          window.location.href = '/dev';
        } else {
          countdown();
        }
      })
      .catch(() => {
        countdown();
      });
  };

  const countdown = () => {
    let remaining = totalSeconds;
    const tick = () => {
      if (remaining <= 0) {
        poll();
        return;
      }
      setReconnectStatus(`Retrying in ${remaining}s`);
      remaining -= 1;
      countdownTimer = setTimeout(tick, 1000);
    };
    tick();
  };

  countdown();
}

/**
 * Connect to the gateway and initialize the chat UI.
 * Handles reconnection on disconnect.
 */
async function connectAndRun() {
  document.body.innerHTML = `
    <h1>Connecting to Endo Gateway…</h1>
    <p>Gateway: <code>${gateway}</code></p>
  `;

  const connection = connectToGateway({
    gateway: String(gateway),
    agent: String(agent),
  });

  let powers;
  try {
    powers = await connection.powers;
    console.log('[Chat] Host powers received, initializing UI...');
  } catch (error) {
    console.error('[Chat] Failed to connect:', error);
    showReconnecting(/** @type {Error} */ (error).message);
    pollHealthThenReconnect();
    return;
  }

  // Initialize the chat UI
  document.body.innerHTML = '';
  await make(powers);
  console.log('[Chat] UI initialized successfully');

  // On disconnect, poll /health until the server is back, then navigate
  // to /dev to pick up fresh credentials for the (possibly restarted) daemon.
  connection.closed.then(
    () => {
      console.log('[Chat] Connection closed, waiting for server...');
      showReconnecting('Connection lost');
      pollHealthThenReconnect();
    },
    error => {
      console.error('[Chat] Connection error:', error);
      showReconnecting(/** @type {Error} */ (error).message);
      pollHealthThenReconnect();
    },
  );
}

connectAndRun().catch(error => {
  console.error('Application error:', error);
  document.body.innerHTML = `<h1>❌ Application Error</h1><pre>${/** @type {Error} */ (error).message}</pre>`;
});
