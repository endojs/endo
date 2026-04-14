import test from '@endo/ses-ava/prepare-endo.js';

import {
  assertValidFormulaType,
  isValidFormulaType,
} from '../src/formula-type.js';

test('isValidFormulaType', t => {
  /** @type {Array<[unknown, boolean]>} */ ([
    ['eval', true],
    ['make-unconfined', true],
    ['', false],
    [null, false],
    [undefined, false],
    [{}, false],
  ]).forEach(([value, expected]) => {
    t.is(isValidFormulaType(/** @type {any} */ (value)), expected);
  });
});

test('assertValidFormulaType - valid', t => {
  t.notThrows(() => assertValidFormulaType('eval'));
});

test('assertValidFormulaType - invalid', t => {
  t.throws(() => assertValidFormulaType('foobar'));
});
