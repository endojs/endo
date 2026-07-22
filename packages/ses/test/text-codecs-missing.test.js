// @ts-nocheck

// Exercises the degradation path: when the host does not provide
// `TextEncoder` and `TextDecoder`, `lockdown()` must proceed without them
// and post-lockdown compartments must observe their absence. This mirrors
// the behavior on XS, where the codecs are not part of the host realm.

import '../index.js';
import test from 'ava';

const savedEncoder = globalThis.TextEncoder;
const savedDecoder = globalThis.TextDecoder;

// Delete before lockdown so the intrinsics-collection pass sees a host
// without the codecs.
delete globalThis.TextEncoder;
delete globalThis.TextDecoder;

lockdown();

test('lockdown succeeds on a host without TextEncoder/TextDecoder', t => {
  t.is(globalThis.TextEncoder, undefined);
  t.is(globalThis.TextDecoder, undefined);
});

test('compartments observe the absence after lockdown', t => {
  const c = new Compartment();
  t.is(c.evaluate('typeof TextEncoder'), 'undefined');
  t.is(c.evaluate('typeof TextDecoder'), 'undefined');
});

test.after.always(() => {
  // Restore for any subsequent in-process work (defensive; AVA runs each
  // test file in its own worker so this is belt-and-suspenders).
  if (savedEncoder) {
    Object.defineProperty(globalThis, 'TextEncoder', {
      value: savedEncoder,
      writable: true,
      configurable: true,
    });
  }
  if (savedDecoder) {
    Object.defineProperty(globalThis, 'TextDecoder', {
      value: savedDecoder,
      writable: true,
      configurable: true,
    });
  }
});
