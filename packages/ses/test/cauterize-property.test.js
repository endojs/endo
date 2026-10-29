import test from 'ava';
import { cauterizeProperty } from '../src/cauterize-property.js';

const makeReporter = () => {
  const warnings = [];
  const errors = [];
  return {
    warnings,
    errors,
    reporter: {
      warn: (...args) => warnings.push(args),
      error: (...args) => errors.push(args),
    },
  };
};

test('deletes an ordinary property, warning only when unexpected', t => {
  {
    const { warnings, errors, reporter } = makeReporter();
    const obj = { extra: 1 };
    cauterizeProperty(obj, 'extra', false, 'intrinsics.obj.extra', reporter);
    t.false('extra' in obj);
    t.deepEqual(warnings, [['Removing intrinsics.obj.extra']]);
    t.deepEqual(errors, []);
  }
  {
    const { warnings, errors, reporter } = makeReporter();
    const obj = { extra: 1 };
    cauterizeProperty(obj, 'extra', true, 'intrinsics.obj.extra', reporter);
    t.false('extra' in obj);
    t.deepEqual(warnings, [], 'a known (`false`-permit) exclusion is silent');
    t.deepEqual(errors, []);
  }
});

test('tolerates an undeletable function `.prototype` by reassigning to undefined', t => {
  {
    // Unexpected: warns about tolerating the undeletable slot.
    const { warnings, errors, reporter } = makeReporter();
    // eslint-disable-next-line func-names
    const fn = function () {};
    Object.defineProperty(fn, 'prototype', {
      value: {},
      writable: true,
      enumerable: false,
      configurable: false,
    });
    cauterizeProperty(
      fn,
      'prototype',
      false,
      'intrinsics.fn.prototype',
      reporter,
    );
    t.is(fn.prototype, undefined);
    t.deepEqual(warnings, [
      ['Removing intrinsics.fn.prototype'],
      ['Tolerating undeletable intrinsics.fn.prototype === undefined'],
    ]);
    t.deepEqual(errors, []);
  }
  {
    // Expressly known (`false`-permit): the same reassignment happens, silently.
    const { warnings, errors, reporter } = makeReporter();
    // eslint-disable-next-line func-names
    const fn = function () {};
    Object.defineProperty(fn, 'prototype', {
      value: {},
      writable: true,
      enumerable: false,
      configurable: false,
    });
    cauterizeProperty(
      fn,
      'prototype',
      true,
      'intrinsics.fn.prototype',
      reporter,
    );
    t.is(fn.prototype, undefined);
    t.deepEqual(warnings, [], 'a known exclusion tolerates the slot silently');
    t.deepEqual(errors, []);
  }
});

test('a known exclusion still throws hard when the reassignment cannot land', t => {
  // The `known` gate suppresses only the warnings, never the failure path
  // reached when the undeletable `.prototype` also cannot be reassigned to
  // `undefined` (here the slot is non-writable, so `obj.prototype = undefined`
  // throws in strict mode). An audited/known exclusion must NOT silently
  // swallow a genuinely-failed cauterization — the throw still propagates.
  const { warnings, reporter } = makeReporter();
  // eslint-disable-next-line func-names
  const fn = function () {};
  // A function's own `.prototype` starts non-configurable; narrow it to
  // non-writable too (permitted on a non-configurable data property), so both
  // the `delete` and the `= undefined` reassignment fail.
  Object.defineProperty(fn, 'prototype', { writable: false });
  t.throws(() =>
    cauterizeProperty(
      fn,
      'prototype',
      true,
      'intrinsics.fn.prototype',
      reporter,
    ),
  );
  t.deepEqual(
    warnings,
    [],
    'known: no tolerate/removing warning even on failure',
  );
});
