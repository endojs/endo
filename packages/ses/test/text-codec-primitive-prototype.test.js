// @ts-nocheck
/* global globalThis */

// A host codec global whose `prototype` is primitive is left for the permits
// pass rather than encapsulated, while a plausible codec in the same lockdown
// is still encapsulated. Both carry an own `arguments` property, so both reach
// the guard. Without the primitive-prototype guard, lockdown throws; without
// codec taming, `TextEncoder` keeps its host identity.
// AVA runs this file in its own worker.

import '../index.js';
import test from 'ava';

const HostTextEncoder = globalThis.TextEncoder;
const ImplausibleTextDecoder = function TextDecoder() {};
ImplausibleTextDecoder.prototype = undefined;
globalThis.TextDecoder = ImplausibleTextDecoder;

const restricted = {
  value: null,
  writable: false,
  enumerable: false,
  configurable: false,
};
Object.defineProperty(HostTextEncoder, 'caller', restricted);
Object.defineProperty(HostTextEncoder, 'arguments', restricted);
// Configurable, so the permits pass can remove it.
Object.defineProperty(ImplausibleTextDecoder, 'arguments', {
  ...restricted,
  configurable: true,
});

lockdown();

test('lockdown leaves a codec with a primitive prototype unencapsulated', t => {
  t.is(globalThis.TextDecoder, ImplausibleTextDecoder);
  t.is(ImplausibleTextDecoder.prototype, undefined);
});

test('lockdown still encapsulates the plausible codec beside it', t => {
  t.is(typeof HostTextEncoder, 'function');
  t.not(globalThis.TextEncoder, HostTextEncoder);
  t.is(globalThis.TextEncoder.prototype, HostTextEncoder.prototype);
  t.is(HostTextEncoder.prototype.constructor, globalThis.TextEncoder);
});
