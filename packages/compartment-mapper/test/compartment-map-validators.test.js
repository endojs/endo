// Tests covering edge cases in `compartment-map.js` validators surfaced by
// the saboteur review of the `assert` -> `Fail` refactor.
//
// These tests exercise the validators indirectly via the package's exported
// `assertFileCompartmentMap`, which internally drives the file-internal
// helpers (`assertConditions`, `assertString`, and the inlined empty-object
// checks).

import 'ses';
import test from 'ava';

import {
  assertFileCompartmentMap,
  stringCompare,
} from '../src/compartment-map.js';

const wrap = (extras = {}) => ({
  tags: [],
  entry: { compartment: 'app-v1.0.0', module: './main.js' },
  compartments: {
    'app-v1.0.0': {
      name: 'app',
      label: 'app',
      location: 'file:///app/',
      modules: {
        './main.js': { compartment: 'app-v1.0.0', module: './main.js' },
      },
    },
  },
  ...extras,
});

test('assertConditions reports Symbol input via bestEffortStringify', t => {
  const symbol = Symbol('forbidden');
  const error = t.throws(() =>
    assertFileCompartmentMap(
      { ...wrap(), tags: symbol },
      'file:///compartment-map.json',
    ),
  );
  // The intended assertion failure must surface; the prior `String(conditions)`
  // shape would have thrown a V8 TypeError before `Fail` ever ran.
  t.regex(error.message, /conditions must be an array/);
  t.notRegex(error.message, /Cannot convert a Symbol value to a string/);
  t.true(error.message.includes('Symbol(forbidden)'));
});

test('assertString reports a value with a throwing toString cleanly', t => {
  const evil = {
    toString() {
      throw new Error('boom');
    },
  };
  const error = t.throws(() =>
    assertFileCompartmentMap(
      { ...wrap(), entry: { compartment: evil, module: './main.js' } },
      'file:///compartment-map.json',
    ),
  );
  // bestEffortStringify must not propagate the inner toString throw; the
  // assertion message is well-formed and names the failed field.
  t.regex(error.message, /must be a string/);
  t.notRegex(error.message, /^Error: boom$/);
});

test('stringCompare orders strings and resists b shadowing', t => {
  // Guards against accidentally re-introducing the `(a, b)` parameter
  // names that shadowed the imported `b` from `@endo/errors`.
  t.is(stringCompare('a', 'b'), -1);
  t.is(stringCompare('b', 'a'), 1);
  t.is(stringCompare('x', 'x'), 0);
});

test('extra-property validation redacts the offending value', t => {
  // Inlining the per-call-site `keys(extra).length === 0 || Fail`...``
  // pattern keeps the keypath in `b()` and the offending key list in `q()`,
  // so a sensitive *value* hung off an extra property never reaches the
  // error message text.
  const error = t.throws(() =>
    assertFileCompartmentMap(
      {
        ...wrap(),
        potentiallySemanticButUnrecognized:
          'behave-differently-when-recognized',
      },
      'file:///compartment-map.json',
    ),
  );
  t.regex(error.message, /must not have extra properties/);
  t.true(error.message.includes('potentiallySemanticButUnrecognized'));
  t.false(error.message.includes('behave-differently-when-recognized'));
});
