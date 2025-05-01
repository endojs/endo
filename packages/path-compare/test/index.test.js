import test from 'ava';

import { pathCompare, stringCompare } from '../src/index.js';

test('stringCompare - returns 0 for equal strings', t => {
  t.is(stringCompare('abc', 'abc'), 0);
});

test('stringCompare - returns negative for a < b', t => {
  t.true(stringCompare('abc', 'def') < 0);
});

test('stringCompare - returns positive for a > b', t => {
  t.true(stringCompare('def', 'abc') > 0);
});

test('pathCompare - returns 0 for equal arrays', t => {
  t.is(pathCompare(['a', 'b'], ['a', 'b']), 0);
});

test('pathCompare - returns negative for shorter array', t => {
  t.true(pathCompare(['a'], ['a', 'b']) < 0);
});

test('pathCompare - returns positive for longer array', t => {
  t.true(pathCompare(['a', 'b'], ['a']) > 0);
});

test('pathCompare - returns negative for smaller cumulative length', t => {
  t.true(pathCompare(['a', 'b'], ['aa', 'bb']) < 0);
});

test('pathCompare - returns positive for larger cumulative length', t => {
  t.true(pathCompare(['aa', 'bb'], ['a', 'b']) > 0);
});

test('pathCompare - returns negative for lexically smaller array', t => {
  t.true(pathCompare(['a', 'b'], ['a', 'c']) < 0);
});

test('pathCompare - returns positive for lexically larger array', t => {
  t.true(pathCompare(['a', 'c'], ['a', 'b']) > 0);
});

test('pathCompare - returns 0 for both arrays undefined', t => {
  t.is(pathCompare(undefined, undefined), 0);
});

test('pathCompare - returns 1 if first array is undefined', t => {
  t.is(pathCompare(undefined, ['a']), 1);
});

test('pathCompare - returns -1 if second array is undefined', t => {
  t.is(pathCompare(['a'], undefined), -1);
});

test('pathCompare - returns 0 for empty arrays', t => {
  t.is(pathCompare([], []), 0);
});

test('pathCompare - returns negative for smaller cumulative length despite lexically larger elements', t => {
  t.true(pathCompare(['bb', 'aa'], ['a', 'bbbb']) < 0);
});

test('pathCompare - returns positive for larger cumulative length despite lexically smaller elements', t => {
  t.true(pathCompare(['a', 'bbbb'], ['bb', 'aa']) > 0);
});
