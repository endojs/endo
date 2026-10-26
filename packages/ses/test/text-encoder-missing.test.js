// @ts-nocheck
/* global globalThis */

// Exercises a host that provides TextDecoder but not TextEncoder before
// lockdown samples the host intrinsics. AVA runs this file in its own worker.

import '../index.js';
import test from 'ava';

const savedTextEncoder = globalThis.TextEncoder;
const NativeTextDecoder = globalThis.TextDecoder;

delete globalThis.TextEncoder;

lockdown();

test('lockdown preserves a lone TextDecoder', t => {
  t.is(globalThis.TextEncoder, undefined);
  t.not(TextDecoder, NativeTextDecoder);
  t.is(TextDecoder.prototype, NativeTextDecoder.prototype);
  t.is(NativeTextDecoder.prototype.constructor, TextDecoder);

  const compartment = new Compartment();
  t.is(compartment.evaluate('typeof TextEncoder'), 'undefined');
  t.is(compartment.evaluate('TextDecoder'), TextDecoder);
});

test.after.always(() => {
  if (savedTextEncoder) {
    Object.defineProperty(globalThis, 'TextEncoder', {
      value: savedTextEncoder,
      writable: true,
      configurable: true,
    });
  }
});
