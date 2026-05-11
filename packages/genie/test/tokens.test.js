// @ts-check

/**
 * Tests for the token estimation utility.
 */

import '@endo/init/debug.js';

import test from 'ava';
import { estimateTokens } from '../src/utils/tokens.js';

test('empty string returns 0', t => {
  t.is(estimateTokens(''), 0);
});

test('single character returns 1', t => {
  t.is(estimateTokens('a'), 1);
});

test('four characters returns 1', t => {
  t.is(estimateTokens('abcd'), 1);
});

test('five characters returns 2 (rounds up)', t => {
  t.is(estimateTokens('abcde'), 2);
});

test('typical sentence gives reasonable estimate', t => {
  const sentence = 'The quick brown fox jumps over the lazy dog.';
  const tokens = estimateTokens(sentence);
  // 44 chars / 4 = 11
  t.is(tokens, 11);
});

test('longer text scales linearly', t => {
  // Use a 4-char string so ceil(4/4)=1, avoiding ceil rounding drift.
  const short = 'abcd';
  const long = 'abcd'.repeat(100);
  t.is(estimateTokens(long), estimateTokens(short) * 100);
});

test('returns a number', t => {
  t.is(typeof estimateTokens('test'), 'number');
});
