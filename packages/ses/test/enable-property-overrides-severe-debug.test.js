import '../index.js';
import test from 'ava';
import { overrideTester } from './override-tester.js';

lockdown({
  overrideTaming: 'severe',
  overrideDebug: ['constructor', 'push', 'unrecognized'],
  __hardenTaming__: 'safe',
});

const { getPrototypeOf } = Object;
const { ownKeys } = Reflect;

test('enablePropertyOverrides - on, with debug', t => {
  overrideTester(t, 'Object', {}, ownKeys(Object.prototype));

  // We allow 'length' *not* because it is in enablements; it is not;
  // but because each array instance has its own.
  overrideTester(t, 'Array', [], ['toString', 'length', 'push', 'concat']);

  const TypedArray = getPrototypeOf(Uint8Array);
  overrideTester(
    t,
    'TypedArray',
    new Uint8Array(),
    // because Uint8Array.prototype already overrides `constructor`
    ownKeys(TypedArray.prototype).filter(name => name !== 'constructor'),
  );
});
