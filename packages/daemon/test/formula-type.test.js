import test from '@endo/ses-ava/prepare-endo.js';

import {
  assertValidFormulaType,
  isValidFormulaType,
} from '../src/formula-type.js';

/**
 * Complete list of registered formula types (alphabetically sorted).
 * Update this list when adding new formula types.
 */
const ALL_FORMULA_TYPES = [
  'channel',
  'directory',
  'endo',
  'eval',
  'guest',
  'handle',
  'host',
  'invitation',
  'known-peers-store',
  'least-authority',
  'lookup',
  'loopback-network',
  'mail-hub',
  'mailbox-store',
  'make-archive',
  'make-from-tree',
  'make-unconfined',
  'marshal',
  'message',
  'mount',
  'peer',
  'pet-inspector',
  'pet-store',
  'promise',
  'readable-blob',
  'readable-tree',
  'resolver',
  'scratch-mount',
  'timer',
  'worker',
];

test('isValidFormulaType accepts all registered types', t => {
  for (const type of ALL_FORMULA_TYPES) {
    t.true(
      isValidFormulaType(type),
      `Expected "${type}" to be a valid formula type`,
    );
  }
});

test('isValidFormulaType rejects invalid inputs', t => {
  t.false(isValidFormulaType(''));
  t.false(isValidFormulaType('nonexistent'));
  t.false(isValidFormulaType('MOUNT'));
  t.false(isValidFormulaType('http_client'));
  // @ts-expect-error testing non-string inputs
  t.false(isValidFormulaType(null));
  // @ts-expect-error testing non-string inputs
  t.false(isValidFormulaType(undefined));
  // @ts-expect-error testing non-string inputs
  t.false(isValidFormulaType({}));
});

test('assertValidFormulaType does not throw for valid types', t => {
  t.notThrows(() => assertValidFormulaType('eval'));
  t.notThrows(() => assertValidFormulaType('host'));
  t.notThrows(() => assertValidFormulaType('guest'));
  t.notThrows(() => assertValidFormulaType('mount'));
  t.notThrows(() => assertValidFormulaType('directory'));
  t.notThrows(() => assertValidFormulaType('worker'));
  t.notThrows(() => assertValidFormulaType('timer'));
  t.notThrows(() => assertValidFormulaType('peer'));
});

test('assertValidFormulaType throws for invalid types', t => {
  t.throws(() => assertValidFormulaType('foobar'), {
    message: /Unrecognized formula type/,
  });
});

test('formula types list is sorted alphabetically', t => {
  const sorted = [...ALL_FORMULA_TYPES].sort();
  t.deepEqual(
    ALL_FORMULA_TYPES,
    sorted,
    'ALL_FORMULA_TYPES should be alphabetically sorted',
  );
});
