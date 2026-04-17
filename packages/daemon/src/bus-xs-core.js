// @ts-check
/* global globalThis, sendRawFrame, trace */

/**
 * XS "node" primitive: the plumbing shared by both the worker and
 * daemon XS bootstraps.
 *
 * The Endo process model inside XS is uniform: every XS process (be
 * it a worker with a single peer or a daemon with many) is a node in
 * the CapTP fabric that exchanges CBOR-encoded envelopes with a Rust
 * supervisor over fd 3/4.  This module owns that conversation:
 *
 *   - Installs `globalThis.handleCommand`, which the Rust main loop
 *     calls once per inbound envelope.  The command decodes the
 *     envelope, routes `deliver` verbs to a session table keyed on
 *     the envelope's handle, and forwards everything else to an
 *     optional `onControl` hook supplied by the caller.
 *
 *   - Exposes `sendEnvelope(handle, verb, payload, nonce)` which
 *     encodes and writes an envelope via `sendRawFrame`.
 *
 *   - Exposes `registerSession(handle, onPayload)` / `closeSession`,
 *     which manage the per-peer dispatch table.  A worker registers
 *     exactly one session (its parent daemon).  A daemon registers
 *     one session per spawned worker and one per accepted client.
 *
 *   - Exposes `installShouldTerminate` (re-exported from
 *     bus-xs-common.js) and `markShouldTerminate` so bootstraps can
 *     ask the Rust loop to exit.
 *
 * Bootstraps built on top of this module provide only the
 * CapTP-session glue (their facet, their bootstrap object) and any
 * protocol-specific hooks they need.
 */

import { encodeEnvelope, decodeEnvelope } from './envelope.js';
import {
  installShouldTerminate,
  markShouldTerminate,
  silentReject,
  textDecoder,
  textEncoder,
} from './bus-xs-common.js';

export { installShouldTerminate, markShouldTerminate, silentReject, textDecoder, textEncoder };

// Console polyfill for XS bootstraps that share this module.
//
// `@endo/marshal`'s default `marshalSaveError` calls
// `console.log('Temporary logging of sent error', err)` while
// serializing rejected errors. In an XS realm where `globalThis.console`
// is undefined, that lookup throws "get console: undefined variable"
// inside `captp`'s `processResult`, the rejection is silently swallowed,
// and the eval question never receives a `CTP_RETURN`. The result is a
// hang any time a cross-CapTP-session call rejects.
//
// `bus-daemon-rust-xs.js` already installs its own polyfill; this one
// covers the worker bootstrap (and any other future consumer of
// `bus-xs-core`).
if (typeof globalThis.console === 'undefined') {
  const formatArg = a => {
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object' && typeof a.message === 'string') {
      return `${a.name || 'Error'}: ${a.message}`;
    }
    try { return JSON.stringify(a); } catch { return String(a); }
  };
  const makeLogFn = prefix => (...args) => {
    try {
      // eslint-disable-next-line no-undef
      trace(`${prefix}${args.map(formatArg).join(' ')}`);
    } catch (_e) {}
  };
  globalThis.console = harden({
    log: makeLogFn(''),
    warn: makeLogFn('[warn] '),
    error: makeLogFn('[error] '),
    info: makeLogFn('[info] '),
    debug: makeLogFn('[debug] '),
    trace: makeLogFn('[trace] '),
  });
}

const EMPTY_PAYLOAD = new Uint8Array(0);

/**
 * @typedef {import('./envelope.js').Envelope} Envelope
 */

/**
 * @typedef {(payload: Uint8Array) => void} PayloadHandler
 */

/**
 * @typedef {object} XsNode
 * @property {(handle: number, verb: string, payload?: Uint8Array, nonce?: number) => void} sendEnvelope
 * @property {(handle: number, onPayload: PayloadHandler) => void} registerSession
 * @property {(handle: number) => void} closeSession
 * @property {(handle: number) => boolean} hasSession
 */

/**
 * Create the shared XS node plumbing and install
 * `globalThis.handleCommand`.
 *
 * @param {object} [options]
 * @param {(env: Envelope) => void} [options.onControl]
 *   Called for any envelope whose verb is not `deliver`, and for
 *   `deliver` envelopes whose handle has no registered session.
 * @returns {XsNode}
 */
export const makeXsNode = ({ onControl } = {}) => {
  installShouldTerminate();

  /** @type {Map<number, PayloadHandler>} */
  const sessions = new Map();

  /**
   * @param {number} handle
   * @param {string} verb
   * @param {Uint8Array} [payload]
   * @param {number} [nonce]
   */
  const sendEnvelope = (handle, verb, payload, nonce) => {
    const data = encodeEnvelope({
      handle,
      verb,
      payload: payload || EMPTY_PAYLOAD,
      nonce: nonce || 0,
    });
    sendRawFrame(data);
  };

  /**
   * @param {number} handle
   * @param {PayloadHandler} onPayload
   */
  const registerSession = (handle, onPayload) => {
    sessions.set(handle, onPayload);
  };

  /** @param {number} handle */
  const closeSession = handle => {
    sessions.delete(handle);
  };

  /** @param {number} handle */
  const hasSession = handle => sessions.has(handle);

  /**
   * Called by the Rust main loop for every inbound envelope.
   *
   * @param {Uint8Array} bytes - raw CBOR envelope bytes
   */
  globalThis.handleCommand = harden(bytes => {
    if (bytes.length > 10000) {
      trace(`xs-core: handleCommand large envelope len=${bytes.length}`);
    }
    let env;
    try {
      env = decodeEnvelope(bytes);
    } catch (e) {
      trace(
        `xs-core: failed to decode envelope: ${/** @type {Error} */ (e).message}`,
      );
      return;
    }
    if (bytes.length > 10000) {
      trace(`xs-core: decoded envelope handle=${env.handle} verb=${env.verb} payload_len=${env.payload.length}`);
    }

    if (env.verb === 'deliver') {
      const onPayload = sessions.get(env.handle);
      if (onPayload) {
        try {
          if (bytes.length > 10000) {
            trace(`xs-core: dispatching to session ${env.handle}`);
          }
          onPayload(env.payload);
          if (bytes.length > 10000) {
            trace(`xs-core: session dispatch returned`);
          }
        } catch (e) {
          trace(
            `xs-core: session ${env.handle} dispatch error: ${/** @type {Error} */ (e).message}`,
          );
        }
        return;
      }
    }

    if (onControl) {
      try {
        onControl(env);
      } catch (e) {
        trace(
          `xs-core: onControl error for verb ${env.verb}: ${/** @type {Error} */ (e).message}`,
        );
      }
      return;
    }

    if (env.verb !== 'deliver') {
      trace(`xs-core: unhandled verb=${env.verb} handle=${env.handle}`);
    } else {
      trace(`xs-core: deliver for unknown handle=${env.handle}`);
    }
  });

  return harden({
    sendEnvelope,
    registerSession,
    closeSession,
    hasSession,
  });
};
harden(makeXsNode);
