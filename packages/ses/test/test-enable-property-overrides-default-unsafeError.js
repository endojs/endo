import '../index.js';
import test from 'ava';
import { overrideTester } from './override-tester.js';

lockdown({ errorTaming: 'unsafe', __hardenTaming__: 'safe' });

test('property overrides default with unsafe errorTaming', t => {
  overrideTester(t, 'Error', new Error(), [
    'constructor',
    'message',
    'name',
    'toString',
    'stack',
  ]);
  overrideTester(t, 'TypeError', new TypeError(), [
    'constructor',
    'message',
    'name',
  ]);
});
