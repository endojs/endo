// @ts-nocheck
// prefer-endo-primitives-exempt: direct text codec regression fixture

// Plants the two asymmetric legacy-property shapes before `lockdown()`:
// a non-configurable own `caller` alone must trigger encapsulation, and a
// configurable own `arguments` alone must not, because the permits pass can
// delete it.

import '../index.js';
import test from 'ava';

const NativeTextEncoder = globalThis.TextEncoder;
const NativeTextDecoder = globalThis.TextDecoder;

Object.defineProperty(NativeTextEncoder, 'caller', {
  value: null,
  writable: false,
  enumerable: false,
  configurable: false,
});
Object.defineProperty(NativeTextDecoder, 'arguments', {
  value: null,
  writable: false,
  enumerable: false,
  configurable: true,
});

lockdown();

test('a non-configurable own caller alone triggers encapsulation', t => {
  t.is(typeof TextEncoder, 'function');
  t.not(TextEncoder, NativeTextEncoder);
  t.false(Object.hasOwn(TextEncoder, 'caller'));
  t.true(new TextEncoder() instanceof NativeTextEncoder);
});

test('a configurable own arguments alone keeps the host constructor', t => {
  t.is(TextDecoder, NativeTextDecoder);
  t.false(Object.hasOwn(TextDecoder, 'arguments'));
  t.true(Object.isFrozen(TextDecoder));
});
