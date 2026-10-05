// @ts-nocheck
import test from 'ava';
import 'ses';

test('TextEncoder arguments and caller properties as seen in chrome 126 are permitted', t => {
  // Reproduce the broken behavior in Chrome 126
  const descr = {
    value: null,
    writable: false,
    enumerable: false,
    configurable: false,
  };
  Object.defineProperty(globalThis.TextEncoder, 'caller', descr);
  Object.defineProperty(globalThis.TextEncoder, 'arguments', descr);
  Object.defineProperty(globalThis.TextDecoder, 'caller', descr);
  Object.defineProperty(globalThis.TextDecoder, 'arguments', descr);

  t.notThrows(() => {
    lockdown();
  });
});
