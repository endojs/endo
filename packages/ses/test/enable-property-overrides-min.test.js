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
});
