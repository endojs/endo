import { test } from './prepare-test-env-ava.js';

import {
  assertSimpleString,
  parseCapData,
  stringifyCapData,
} from '../src/stringify-capdata.js';

test('test assertSimpleString', t => {
  t.notThrows(() => assertSimpleString('x'));
  t.throws(() => assertSimpleString('x"'), {
    message: 'Expected to stringify to "\\"x\\"\\"", not "\\"x\\\\\\"\\""}',
  });
  t.throws(() => assertSimpleString('[x]'), {
    message: 'Check failed',
  });
});

const roundTrips = (t, capData, str) => {
  t.is(stringifyCapData(capData), str);
  t.deepEqual(parseCapData(str), capData);
};

test('test capData roundTrips', t => {
  roundTrips(t, { body: '#[]', slots: ['a'] }, '{"slots":["a"],"#body":[]}');
});
