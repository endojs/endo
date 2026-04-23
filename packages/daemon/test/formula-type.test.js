import test from '@endo/ses-ava/prepare-endo.js';

import {
  assertValidFormulaType,
  isValidFormulaType,
} from '../src/formula-type.js';

test('isValidFormulaType', t => {
  /** @type {Array<[any, boolean]>} */
  const cases = [
    ['eval', true],
    ['make-unconfined', true],
    ['worker', true],
    ['xsnap-worker', true],
    ['', false],
    [null, false],
    [undefined, false],
    [{}, false],
  ];
  for (const [value, expected] of cases) {
    t.is(isValidFormulaType(value), expected);
  }
});

test('assertValidFormulaType - valid', t => {
  t.notThrows(() => assertValidFormulaType('eval'));
});

test('assertValidFormulaType - invalid', t => {
  t.throws(() => assertValidFormulaType('foobar'));
});
