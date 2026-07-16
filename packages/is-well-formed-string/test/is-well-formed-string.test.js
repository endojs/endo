import 'ses';
import test from 'ava';
import { isWellFormedString } from '../index.js';

test('accepts well-formed strings', t => {
  t.true(isWellFormedString(''));
  t.true(isWellFormedString('hello'));
  t.true(isWellFormedString('résumé'));
  // A correctly paired surrogate (U+1F600) is well-formed.
  t.true(isWellFormedString('😀'));
});

test('rejects unpaired surrogates', t => {
  t.false(isWellFormedString('\ud800')); // lone high surrogate
  t.false(isWellFormedString('\udc00')); // lone low surrogate
  t.false(isWellFormedString('a\ud800b')); // high surrogate not followed by low
  t.false(isWellFormedString('\udc00\ud800')); // reversed pair
});

test('rejects non-strings even when they coerce to well-formed strings', t => {
  // Unlike the native String.prototype.isWellFormed, this predicate does not
  // ToString its input.
  t.false(isWellFormedString(42));
  t.false(isWellFormedString(undefined));
  t.false(isWellFormedString(null));
  t.false(isWellFormedString({ toString: () => 'ok' }));
  t.false(isWellFormedString(['ok']));
});
