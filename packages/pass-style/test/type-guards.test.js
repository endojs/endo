import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { Far } from '../src/make-far.js';
import {
  isCopyArray,
  isRecord,
  isRemotable,
  assertCopyArray,
  assertRecord,
  assertRemotable,
} from '../src/typeGuards.js';

test('isCopyArray', t => {
  t.true(isCopyArray(harden([1, 2, 3])));
  t.false(isCopyArray(harden({ a: 1 })));
  t.false(isCopyArray('not an array'));
});

test('assertCopyArray succeeds for copy array', t => {
  t.notThrows(() => assertCopyArray(harden([1, 2])));
});

test('assertCopyArray fails for non-array', t => {
  t.throws(() => assertCopyArray(harden({ a: 1 })), {
    message: /must be a pass-by-copy array/,
  });
});

test('assertCopyArray includes custom name in error', t => {
  t.throws(() => assertCopyArray(harden({ a: 1 }), 'myParam'), {
    message: /myParam/,
  });
});

test('isRecord', t => {
  t.true(isRecord(harden({ a: 1 })));
  t.false(isRecord(harden([1, 2])));
  t.false(isRecord('not a record'));
});

test('assertRecord succeeds for copy record', t => {
  t.notThrows(() => assertRecord(harden({ a: 1 })));
});

test('assertRecord fails for non-record', t => {
  t.throws(() => assertRecord(harden([1, 2])), {
    message: /must be a pass-by-copy record/,
  });
});

test('isRemotable', t => {
  const alice = Far('Alice', {});
  t.true(isRemotable(alice));
  t.false(isRemotable(harden({ a: 1 })));
  t.false(isRemotable('not remotable'));
});

test('assertRemotable succeeds for remotable', t => {
  const alice = Far('Alice', {});
  t.notThrows(() => assertRemotable(alice));
});

test('assertRemotable fails for non-remotable', t => {
  t.throws(() => assertRemotable(harden({ a: 1 })), {
    message: /must be a remotable/,
  });
});
