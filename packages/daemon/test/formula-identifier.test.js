import test from '@endo/ses-ava/prepare-endo.js';

import {
  assertValidId,
  assertValidNumber,
  formatId,
  parseId,
} from '../src/formula-identifier.js';

const validNumber = 'a'.repeat(64);
const validNode = 'b'.repeat(64);
const validId = `${validNumber}:${validNode}`;

test('parseId extracts number and node', t => {
  const { number, node } = parseId(validId);
  t.is(number, validNumber);
  t.is(node, validNode);
});

test('formatId produces number:node', t => {
  const id = formatId({ number: validNumber, node: validNode });
  t.is(id, validId);
});

test('parseId and formatId round-trip', t => {
  const parsed = parseId(validId);
  const formatted = formatId(parsed);
  t.is(formatted, validId);
});

test('assertValidId accepts valid identifier', t => {
  t.notThrows(() => assertValidId(validId));
});

test('assertValidId rejects bare number (no colon)', t => {
  t.throws(() => assertValidId(validNumber));
});

test('assertValidId rejects empty string', t => {
  t.throws(() => assertValidId(''));
});

test('assertValidId rejects old 128-char format', t => {
  t.throws(() => assertValidId(`${'a'.repeat(128)}:${'b'.repeat(128)}`));
});

test('assertValidNumber accepts 64-char hex', t => {
  t.notThrows(() => assertValidNumber(validNumber));
});

test('assertValidNumber rejects 128-char hex', t => {
  t.throws(() => assertValidNumber('a'.repeat(128)));
});

test('assertValidNumber rejects non-hex', t => {
  t.throws(() => assertValidNumber('g'.repeat(64)));
});

test('parseId rejects bare number', t => {
  t.throws(() => parseId(validNumber));
});
