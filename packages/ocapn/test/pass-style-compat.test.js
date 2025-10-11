// @ts-check

import test from '@endo/ses-ava/test.js';

import { makeTagged, passStyleOf, Far, ToFarFunction } from '@endo/pass-style';
import { makeSelector } from '../src/pass-style-helpers.js';

/**
 * This is a table of OCapN Passable types and their expected pass-style and
 * pass-style support status.
 *
 * The `supported` status is not our desired support status, but the expectation
 * of the current passStyleOf implementation.
 */

const table = [
  // Supported:
  {
    type: 'Undefined',
    value: undefined,
    expected: 'undefined',
    supported: true,
  },
  { type: 'Null', value: null, expected: 'null', supported: true },
  { type: 'Boolean', value: true, expected: 'boolean', supported: true },
  { type: 'Integer', value: 1n, expected: 'bigint', supported: true },
  { type: 'Float64', value: 1.0, expected: 'number', supported: true },
  { type: 'String', value: 'hello', expected: 'string', supported: true },
  { type: 'List', value: [1, 2, 3], expected: 'copyArray', supported: true },
  {
    type: 'Struct',
    value: { foo: 'bar' },
    expected: 'copyRecord',
    supported: true,
  },
  {
    type: 'Tagged',
    value: makeTagged('foo', 'bar'),
    expected: 'tagged',
    supported: true,
  },
  {
    type: 'Target:Object',
    value: Far('foo', { foo: () => {} }),
    expected: 'remotable',
    supported: true,
  },
  {
    type: 'Target:Function',
    value: ToFarFunction('foo', () => {}),
    expected: 'remotable',
    supported: true,
  },
  {
    type: 'Promise',
    value: new Promise(() => {}),
    expected: 'promise',
    supported: true,
  },
  {
    type: 'Error',
    value: new Error('foo'),
    expected: 'error',
    supported: true,
  },

  // Not supported:
  {
    type: 'ByteArray',
    value: new Uint8Array([1, 2, 3]),
    expected: undefined,
    supported: false,
  },

  // There is some discussion about how selectors should be reified.
  // https://github.com/endojs/endo/pull/2777
  {
    type: 'Selector:MakeSelector',
    value: makeSelector('foo'),
    expected: 'symbol',
    supported: false,
  },
  {
    type: 'Selector:Registered',
    value: Symbol.for('foo'),
    expected: 'symbol',
    supported: true,
  },
  {
    type: 'Selector:Unregistered',
    value: Symbol('foo'),
    expected: 'symbol',
    supported: false,
  },
];

test('passStyleOf supported OCapN types', t => {
  for (const { type, value, expected, supported } of table) {
    harden(value);
    let result;
    let error;
    try {
      result = passStyleOf(value);
    } catch (e) {
      error = e;
    }
    const testLabel = `OCapN type ${type} expected to ${supported ? '' : 'NOT '}be supported by passStyleOf`;
    if (supported) {
      t.is(error, undefined, testLabel);
      t.is(result, expected, testLabel);
    } else {
      t.truthy(error instanceof Error, testLabel);
    }
  }
});
