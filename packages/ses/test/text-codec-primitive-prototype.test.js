// @ts-nocheck
/* global globalThis */

// A host codec global whose `prototype` is primitive is left for the permits
// pass rather than encapsulated. AVA runs this file in its own worker.

import '../index.js';
import test from 'ava';

const ImplausibleTextDecoder = function TextDecoder() {};
ImplausibleTextDecoder.prototype = undefined;
globalThis.TextDecoder = ImplausibleTextDecoder;

lockdown();

test('lockdown leaves a codec with a primitive prototype unencapsulated', t => {
  t.is(globalThis.TextDecoder, ImplausibleTextDecoder);
  t.is(ImplausibleTextDecoder.prototype, undefined);
});
