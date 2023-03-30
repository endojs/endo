import '../index.js';
import test from 'ava';
import { overrideTester } from './override-tester.js';

lockdown({
  errorTaming: 'unsafe',
  overrideTaming: 'min',
  __hardenTaming__: 'safe',
});

test('property overrides min with unsafe errorTaming', t => {
  overrideTester(t, 'Error', new Error(), ['name', 'stack']);
  overrideTester(t, 'TypeError', new TypeError(), ['stack']);
});
