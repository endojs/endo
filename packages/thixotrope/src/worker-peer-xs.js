// @ts-check

/**
 * XS bootstrap entry for an OCapN-native thixotrope worker (protocol
 * unification phase 2): the module bundled by
 * `scripts/bundle-xs-worker.mjs` into `dist-xs/worker-peer.js` and
 * evaluated inside the XS machine by the `thixotrope-xs-worker` binary,
 * after the lockdown boot script.
 *
 * The duct to the host carries ASCII JSON envelopes over the binary's
 * existing deliver/outbound protocol:
 * - `{ t: 'init', workerId, debugLabel? }` — first message; boots the
 *   worker peer (the OCapN client cannot exist before the worker id is
 *   known, since pipe identity derives from it).
 * - `{ t: 'f', b64 }` — one binary OCapN frame, base64-encoded (the
 *   duct is ASCII-only so CESU-8/UTF-8/C strings coincide).
 *
 * Outbound frames use the same `{ t: 'f', b64 }` envelope through
 * `thixotropeSend`. Everything reachable from here lives in the XS heap
 * and is captured by the engine snapshot; this module runs only on
 * first boot, never on restore.
 */
import '@endo/eventual-send/shim.js';
import { decodeBase64, encodeBase64 } from '@endo/base64';

import { makeWorkerPeer } from './worker-peer.js';

const send = /** @type {(json: string) => void} */ (
  /** @type {any} */ (globalThis).thixotropeSend
);
if (typeof send !== 'function') {
  throw Error(
    'thixotrope-xs-worker must register thixotropeSend before bootstrap',
  );
}

const trace = /** @type {(text: string) => void} */ (
  /** @type {any} */ (globalThis).thixotropeTrace
);
if (typeof trace === 'function' && typeof globalThis.console === 'undefined') {
  const traceAll =
    tag =>
    (...args) =>
      trace(`${tag}: ${args.map(String).join(' ')}`);
  /** @type {any} */ (globalThis).console = {
    log: traceAll('log'),
    info: traceAll('info'),
    warn: traceAll('warn'),
    error: traceAll('error'),
    debug: traceAll('debug'),
  };
}

/** @type {{ deliver: (bytes: Uint8Array) => void } | undefined} */
let peer;
/** @type {Array<Uint8Array>} */
const pendingFrames = [];

/** @param {string} json */
const dispatch = json => {
  const message = JSON.parse(json);
  if (message.t === 'init') {
    if (peer !== undefined) {
      throw Error('thixotrope worker peer: duplicate init');
    }
    makeWorkerPeer({
      workerId: message.workerId,
      debugLabel: message.debugLabel,
      send: frame => send(JSON.stringify({ t: 'f', b64: encodeBase64(frame) })),
    }).then(readyPeer => {
      peer = readyPeer;
      for (const frame of pendingFrames) {
        peer.deliver(frame);
      }
      pendingFrames.length = 0;
    });
    return;
  }
  if (message.t === 'f') {
    const frame = decodeBase64(message.b64);
    if (peer === undefined) {
      // Frames can land while the async peer boot settles; they drain
      // in order the moment it does.
      pendingFrames.push(frame);
    } else {
      peer.deliver(frame);
    }
    return;
  }
  throw Error(`thixotrope worker peer: unknown duct message ${message.t}`);
};

/** @type {any} */ (globalThis).thixotropeDispatch = dispatch;
