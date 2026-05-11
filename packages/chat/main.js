// @ts-check

// Import SES to make `harden` available globally.
// We use `ses` directly (not `@endo/init`) so that intrinsics are NOT frozen,
// allowing Monaco editor to run inline without iframe isolation.
import 'ses';
// CapTP and E() require HandledPromise to be installed as a global.
import '@endo/eventual-send/shim.js';

import { connectToGateway } from './connection.js';
import { make } from './chat.js';

const RECONNECT_INTERVAL_MS = 5000;

// Detect whether we are running inside the Familiar Electron shell.
// In Electron, preload exposes `window.familiar`; the protocol is file://.
const isElectronMode =
  window.location.protocol === 'file:' ||
  /** @type {any} */ (window).familiar !== undefined;

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
// In Electron mode, /dev is not available — show an error instead.
if (!gateway || !agent) {
  if (!isElectronMode && !sessionStorage.getItem('endo-dev-attempted')) {
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
 * Hide the reconnecting overlay.
 */
const hideReconnecting = () => {
  const overlay = document.getElementById('reconnect-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
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
 * Poll /health until the Vite dev server is reachable, then navigate
 * to /dev to pick up fresh credentials for the (possibly restarted) daemon.
 *
 * Counts down to each attempt, shows "Reconnecting…" during the fetch,
 * and restarts the countdown if the attempt fails.
 *
 * Only used in Vite dev-server mode.
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
      setTimeout(tick, 1000);
    };
    tick();
  };

  countdown();
}

/**
 * Reconnect by re-establishing the WebSocket directly (Electron mode).
 *
 * On repeated failure, ask the Familiar to restart the daemon via the
 * preload bridge, then retry.
 */
function reconnectInElectronMode() {
  const totalSeconds = RECONNECT_INTERVAL_MS / 1000;
  let attempts = 0;
  const MAX_ATTEMPTS_BEFORE_RESTART = 3;

  const tryConnect = async () => {
    attempts += 1;
    setReconnectStatus('Reconnecting…');

    // After several failed attempts, ask Familiar to restart the daemon.
    if (
      attempts > MAX_ATTEMPTS_BEFORE_RESTART &&
      /** @type {any} */ (window).familiar &&
      typeof (/** @type {any} */ (window).familiar.restartDaemon) === 'function'
    ) {
      setReconnectStatus('Restarting daemon…');
      try {
        await /** @type {any} */ (window).familiar.restartDaemon();
      } catch {
        // Restart may fail; continue trying to connect anyway.
      }
      attempts = 0;
    }

    try {
      // Re-run the full connect-and-run flow.
      await connectAndRun(); // eslint-disable-line no-use-before-define
    } catch {
      countdown(); // eslint-disable-line no-use-before-define
    }
  };

  const countdown = () => {
    let remaining = totalSeconds;
    const tick = () => {
      if (remaining <= 0) {
        tryConnect();
        return;
      }
      setReconnectStatus(`Retrying in ${remaining}s`);
      remaining -= 1;
      setTimeout(tick, 1000);
    };
    tick();
  };

  countdown();
}

/**
 * Start the appropriate reconnection strategy based on mode.
 */
const startReconnection = () => {
  if (isElectronMode) {
    reconnectInElectronMode();
  } else {
    pollHealthThenReconnect();
  }
};

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
    startReconnection();
    return;
  }

  // Hide any leftover reconnection overlay from a previous attempt.
  hideReconnecting();

  // Initialize the chat UI
  document.body.innerHTML = '';
  await make(powers);
  console.log('[Chat] UI initialized successfully');

  // On disconnect, reconnect using the appropriate strategy.
  connection.closed.then(
    () => {
      console.log('[Chat] Connection closed, waiting for server...');
      showReconnecting('Connection lost');
      startReconnection();
    },
    error => {
      console.error('[Chat] Connection error:', error);
      showReconnecting(/** @type {Error} */ (error).message);
      startReconnection();
    },
  );
}

connectAndRun().catch(error => {
  console.error('Application error:', error);
  document.body.innerHTML = `<h1>❌ Application Error</h1><pre>${/** @type {Error} */ (error).message}</pre>`;
});
