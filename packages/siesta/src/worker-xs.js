// @ts-check
/* global globalThis */

/**
 * XS bootstrap entry for a siesta worker: the module bundled by
 * `scripts/bundle-xs-worker.mjs` and evaluated inside the XS machine by
 * the `siesta-xs-worker` binary (rust/siesta-xs-worker), after SES boot.
 *
 * Wires the deterministic worker shell to the two host functions the
 * binary registers:
 * - `siestaSend(json)` — emit one outbound CapTP message toward the host.
 * - `globalThis.siestaDispatch(json)` — installed here; the binary calls
 *   it with each inbound CapTP message.
 *
 * Everything reachable from here — the shell, its CapTP tables, the
 * guest compartment — lives in the XS heap and is captured by the
 * engine snapshot; this module runs only on first boot, never on
 * restore.
 */
import { makeWorkerShell } from './worker-shell.js';

const send = /** @type {(json: string) => void} */ (
  /** @type {any} */ (globalThis).siestaSend
);
if (typeof send !== 'function') {
  throw Error('siesta-xs-worker must register siestaSend before bootstrap');
}

const shell = makeWorkerShell({
  send: message => send(JSON.stringify(message)),
  name: 'siesta-worker:xs',
});

/** @type {any} */ (globalThis).siestaDispatch = json => {
  shell.dispatch(JSON.parse(json));
};
