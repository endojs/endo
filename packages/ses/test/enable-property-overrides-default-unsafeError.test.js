import '../index.js';
import test from 'ava';
import { overrideTester } from './_override-tester.js';

lockdown({
  errorTaming: 'unsafe',
  overrideTaming: 'moderate',
  __hardenTaming__: 'safe',
});

test('property overrides default with unsafe errorTaming', t => {
  overrideTester(t, 'Error', Error(), [
    'constructor',
    'message',
    'name',
    'toString',
    'stack',
  ]);
  overrideTester(t, 'TypeError', TypeError(), [
    'constructor',
    'message',
    'name',
  ]);
});
