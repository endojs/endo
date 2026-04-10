import '../index.js';
import test from 'ava';
import { overrideTester } from './_override-tester.js';

lockdown({
  errorTaming: 'safe',
  overrideTaming: 'min',
  __hardenTaming__: 'safe',
});

test('enablePropertyOverrides - on', t => {
  overrideTester(t, 'Object', {}, ['toString']);
  overrideTester(t, 'Function', () => {}, ['toString']);
  overrideTester(t, 'Error', Error(), ['name', 'stack']);
  if (typeof Iterator !== 'undefined') {
    overrideTester(t, 'Iterator', Object.create(Iterator.prototype), [
      'toString',
      'constructor',
      Symbol.toStringTag,
    ]);
  }

  // We allow 'length' *not* because it is in enablements; it is not;
  // but because each array instance has its own.
  overrideTester(t, 'Array', [], ['length']);
});
