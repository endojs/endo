// @ts-check
/* global WebSocket */

import { makeCapTP } from '@endo/captp';
import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * @typedef {object} ConnectionOptions
 * @property {string} gateway - Gateway address (host:port)
 * @property {string} agent - AGENT formula identifier
 */

/**
 * @typedef {object} Connection
 * @property {Promise<unknown>} powers - The host (AGENT) powers object
 * @property {() => void} close - Close the connection
 * @property {Promise<void>} closed - Promise that resolves when closed
 */

const ClientBootstrapInterface = M.interface('ClientBootstrap', {
  ping: M.call().returns(),
  reject: M.call(M.string()).returns(),
});

/**
 * Connect to the Endo daemon gateway via WebSocket and establish CapTP.
 * The connection fetches the ENDO capability using the nonce, then
 * retrieves the host (AGENT) powers from ENDO.
 *
 * @param {ConnectionOptions} options
 * @returns {Connection}
 */
export const connectToGateway = ({ gateway, agent }) => {
  const gatewayUrl = `ws://${gateway}/`;
  console.log(`[Gateway] Connecting to ${gatewayUrl}...`);

  const powersKit = makePromiseKit();
  const closedKit = makePromiseKit();

  let ws;
  try {
    ws = new WebSocket(gatewayUrl);
    ws.binaryType = 'arraybuffer';
    console.log('[Gateway] WebSocket created, waiting for connection...');
  } catch (error) {
    console.error('[Gateway] Failed to create WebSocket:', error);
    powersKit.reject(error);
    closedKit.reject(error);
    return {
      powers: powersKit.promise,
      close: () => {},
      closed: closedKit.promise,
    };
  }

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  /** @type {((message: unknown) => void) | undefined} */
  let dispatch;
  /** @type {(() => void) | undefined} */
  let abort;

  // Create client bootstrap that the gateway can call
  const clientBootstrap = makeExo('ClientBootstrap', ClientBootstrapInterface, {
    ping() {
      console.log('[Gateway] Received ping from server');
    },
    reject(message) {
      console.error('[Gateway] Server rejected:', message);
      powersKit.reject(new Error(message));
    },
  });

  ws.onopen = () => {
    console.log('[Gateway] WebSocket connected, establishing CapTP...');

    /** @param {unknown} message */
    const send = message => {
      const text = JSON.stringify(message);
      console.log('[Gateway] Sending:', text.slice(0, 200));
      const bytes = textEncoder.encode(text);
      ws.send(bytes);
    };

    const captp = makeCapTP('Chat', send, clientBootstrap);
    dispatch = captp.dispatch;
    abort = captp.abort;

    console.log('[Gateway] CapTP established, fetching AGENT capability...');

    // Get the gateway bootstrap and fetch the AGENT capability directly
    const gatewayBootstrap = captp.getBootstrap();
    E(gatewayBootstrap)
      .fetch(agent)
      .then(
        host => {
          console.log('[Gateway] AGENT (host) powers received successfully');
          powersKit.resolve(host);
        },
        error => {
          console.error('[Gateway] Failed to fetch AGENT:', error);
          powersKit.reject(error);
        },
      );
  };

  ws.onmessage = event => {
    if (dispatch) {
      const bytes = new Uint8Array(event.data);
      const text = textDecoder.decode(bytes);
      console.log('[Gateway] Received:', text.slice(0, 200));
      try {
        const message = JSON.parse(text);
        dispatch(message);
      } catch (error) {
        console.error('[Gateway] Failed to parse message:', error, text);
      }
    } else {
      console.warn('[Gateway] Received message before CapTP initialized');
    }
  };

  ws.onerror = event => {
    console.error('[Gateway] WebSocket error:', event);
    const error = new Error(
      `WebSocket error connecting to ${gatewayUrl}. Is Endo running?`,
    );
    powersKit.reject(error);
    closedKit.reject(error);
  };

  ws.onclose = event => {
    console.log(
      `[Gateway] WebSocket closed: code=${event.code}, reason=${event.reason || '(none)'}, wasClean=${event.wasClean}`,
    );
    if (abort) {
      abort();
    }
    // If powers haven't been resolved yet, reject them
    powersKit.reject(
      new Error(
        `WebSocket closed before powers received (code: ${event.code})`,
      ),
    );
    closedKit.resolve(undefined);
  };

  const close = () => {
    console.log('[Gateway] Closing connection...');
    ws.close();
  };

  return {
    powers: powersKit.promise,
    close,
    closed: closedKit.promise,
  };
};

// Legacy export for backwards compatibility
export const connectToHubCap = connectToGateway;
