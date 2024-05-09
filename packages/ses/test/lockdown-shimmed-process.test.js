/* global globalThis */

import test from 'ava';
import '../index.js';

test('shimmed globalThis.process', t => {
  const process = {};
  Object.defineProperty(globalThis, 'process', {
    value: process,
    configurable: false,
    writable: false,
  });
  t.is(globalThis.process, process);
  t.is(globalThis.process.on, undefined);
  lockdown({
    consoleTaming: 'safe',
    errorTrapping: 'platform',
    unhandledRejectionTrapping: 'report',
  });
  t.is(globalThis.process, process);
  t.is(globalThis.process.on, undefined);
});
