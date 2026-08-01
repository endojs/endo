// @ts-check
/// <reference path="./bus-xs-host-globals.d.ts" />
/* global hostGetDaemonHandle */

/**
 * XS worker bootstrap.
 *
 * The Rust supervisor spawns an XS machine, evaluates the bundled
 * version of this module after SES boot and host-power
 * registration, then drives the conversation by calling
 * `globalThis.handleCommand(bytes)` (installed by `makeXsNode`)
 * for each inbound envelope on fd 4.
 *
 * The worker exposes one CapTP session keyed on the daemon's handle:
 * JSON-encoded messages wrapped in `deliver` envelopes, dispatched
 * via `makeCapTP`.  `node.sendEnvelope` is the byte transport in
 * both directions.
 *
 * Bundled into `rust/endo/xsnap/src/worker_bootstrap.js` via
 * `packages/daemon/scripts/bundle-bus-worker-xs.mjs`, which is the
 * file `rust/endo/xsnap/src/lib.rs` `include_str!`s as
 * `WORKER_BOOTSTRAP`.  That artifact is generated, not committed
 * (`.gitignore`), so it can go stale against this module or be
 * copied in from another worktree; `test/xs-worker-bundles.test.js`
 * regenerates it and asserts byte identity.
 *
 * Note that the XS realm this runs in is *not* locked down: nothing
 * in the Rust boot path calls `lockdown()` (see
 * `./bus-worker-xs-ses-boot.js` and `designs/worker-rust-xs.md`
 * § Known Gaps).  The compartments `evaluate` creates therefore
 * confine module scope but do not rest on repaired intrinsics.
 */

import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';
import { makeCapTP } from '@endo/captp';

import {
  makeXsNode,
  markShouldTerminate,
  silentReject,
} from './bus-xs-core.js';
import { makeXsWorkerFacet } from './bus-worker-xs-facet.js';

const node = makeXsNode();

const daemonHandle = hostGetDaemonHandle();

// The facet itself lives in `./bus-worker-xs-facet.js` so it can be
// unit-tested without the Rust host functions this module needs.
const workerFacet = makeXsWorkerFacet({ markShouldTerminate });

// CapTP transport: JSON messages wrapped in `deliver` envelopes.
/** @param {Record<string, unknown>} message */
const send = message => {
  const json = JSON.stringify(message);
  node.sendEnvelope(daemonHandle, 'deliver', bytesFromText(json));
};

const { dispatch } = makeCapTP('Endo', send, workerFacet, {
  onReject: silentReject,
});

// Both failures below are dropped frames: the CapTP question they
// answered will never be settled, so the daemon-side call hangs.
// `bus-xs-core.js` exists to make exactly that class of silence
// traceable, and its console routes to the Rust `trace` host
// function, so report before returning rather than swallowing.
node.registerSession(daemonHandle, payload => {
  const json = bytesToText(payload);
  let message;
  try {
    message = JSON.parse(json);
  } catch (e) {
    console.error(
      `bus-worker-xs: dropping unparseable inbound frame (${payload.length} bytes): ${
        /** @type {Error} */ (e).message
      }`,
    );
    return;
  }
  try {
    dispatch(message);
  } catch (e) {
    // CapTP's own unhandled-rejection path is wired to silentReject
    // via the onReject option above; this catch covers only the
    // synchronous throw out of `dispatch`.
    console.error(
      `bus-worker-xs: CapTP dispatch failed for type=${message && message.type}: ${
        /** @type {Error} */ (e).message
      }`,
    );
  }
});
