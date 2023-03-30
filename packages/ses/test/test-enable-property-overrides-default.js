import '../index.js';
import test from 'ava';
import { overrideTester } from './override-tester.js';

lockdown({ errorTaming: 'safe', __hardenTaming__: 'safe' });

test('enablePropertyOverrides - on', t => {
  overrideTester(t, 'Object', {}, ['toString', 'valueOf']);
  // We allow 'length' *not* because it is in enablements; it is not;
  // but because each array instance has its own.
  overrideTester(t, 'Array', [], ['toString', 'length', 'push']);
  // eslint-disable-next-line func-names, prefer-arrow-callback
  overrideTester(t, 'Function', function () {}, [
    'constructor',
    'bind',
    'toString',
  ]);
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
  // eslint-disable-next-line func-names, prefer-arrow-callback
  overrideTester(t, 'Promise', new Promise(function () {}), ['constructor']);
  overrideTester(t, 'JSON', JSON);
});
