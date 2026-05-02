// @ts-check
/* eslint-disable no-underscore-dangle -- __shouldTerminate is
   deliberately scoped to globalThis with a dunder name to avoid
   collision with app-level exports. */
/* global globalThis */

/**
 * Shared primitives used by both XS bus bootstraps
 * (bus-worker-xs.js and bus-daemon-rust-xs.js).
 *
 * Intentionally tiny: only the bits that were duplicated verbatim in
 * both bootstraps.  The actual wire plumbing lives in bus-xs-core.js.
 */

export const textEncoder = new TextEncoder();
harden(textEncoder);

export const textDecoder = new TextDecoder();
harden(textDecoder);

/**
 * No-op rejection handler.  XS console.error may crash when formatting
 * certain error objects, so we swallow CapTP-internal rejections
 * silently.
 *
 * @param {unknown} _err
 */
export const silentReject = _err => {};
harden(silentReject);

/**
 * Shared termination state for the XS main loop.  The Rust main loop
 * polls `globalThis.__shouldTerminate()` after each command; when it
 * returns true, Rust breaks out of its loop and the process exits.
 */
const terminationState = { shouldTerminate: false };

export const markShouldTerminate = () => {
  terminationState.shouldTerminate = true;
};
harden(markShouldTerminate);

/**
 * Install `globalThis.__shouldTerminate` so the Rust main loop can
 * poll it.  Safe to call more than once; subsequent calls are no-ops.
 */
export const installShouldTerminate = () => {
  if (globalThis.__shouldTerminate === undefined) {
    globalThis.__shouldTerminate = harden(
      () => terminationState.shouldTerminate,
    );
  }
};
harden(installShouldTerminate);
