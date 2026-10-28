// @ts-nocheck

// Exercises a host that provides TextEncoder but not TextDecoder before
// lockdown samples the host intrinsics. The remaining TextEncoder has the
// affected shape from endojs/endo#3369, so lockdown encapsulates it.

import '../index.js';
import test from 'ava';

const NativeTextEncoder = globalThis.TextEncoder;
const savedTextDecoder = globalThis.TextDecoder;

delete globalThis.TextDecoder;

const restricted = {
  value: null,
  writable: false,
  enumerable: false,
  configurable: false,
};
Object.defineProperty(NativeTextEncoder, 'caller', restricted);
Object.defineProperty(NativeTextEncoder, 'arguments', restricted);

lockdown();

test('lockdown preserves a lone TextEncoder', t => {
  t.is(globalThis.TextDecoder, undefined);
  t.not(TextEncoder, NativeTextEncoder);
  t.is(TextEncoder.prototype, NativeTextEncoder.prototype);
  t.is(NativeTextEncoder.prototype.constructor, TextEncoder);

  const compartment = new Compartment();
  t.is(compartment.evaluate('TextEncoder'), TextEncoder);
  t.is(compartment.evaluate('typeof TextDecoder'), 'undefined');
});

test.after.always(() => {
  if (savedTextDecoder) {
    Object.defineProperty(globalThis, 'TextDecoder', {
      value: savedTextDecoder,
      writable: true,
      configurable: true,
    });
  }
});
