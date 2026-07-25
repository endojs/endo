// @ts-nocheck
/* global globalThis */

// Exercises the degradation path: when the host does not provide `URL` and
// `URLSearchParams`, `lockdown()` must proceed without them and post-lockdown
// compartments must observe their absence. This mirrors the behavior on XS,
// where neither is part of the host realm.

import '../index.js';
import test from 'ava';

const savedURL = globalThis.URL;
const savedURLSearchParams = globalThis.URLSearchParams;

// Delete before lockdown so the intrinsics-collection pass (and the hidden
// iterator-prototype sampler) sees a host without them.
delete globalThis.URL;
delete globalThis.URLSearchParams;

lockdown();

test('lockdown succeeds on a host without URL/URLSearchParams', t => {
  t.is(globalThis.URL, undefined);
  t.is(globalThis.URLSearchParams, undefined);
});

test('compartments observe the absence after lockdown', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof URL'), 'undefined');
  t.is(c.evaluate('typeof URLSearchParams'), 'undefined');
});

test.after.always(() => {
  // Restore for any subsequent in-process work (defensive; AVA runs each
  // test file in its own worker so this is belt-and-suspenders).
  if (savedURL) {
    Object.defineProperty(globalThis, 'URL', {
      value: savedURL,
      writable: true,
      configurable: true,
    });
  }
  if (savedURLSearchParams) {
    Object.defineProperty(globalThis, 'URLSearchParams', {
      value: savedURLSearchParams,
      writable: true,
      configurable: true,
    });
  }
});
