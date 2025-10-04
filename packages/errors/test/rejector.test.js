import test from '@endo/ses-ava/test.js';
import { Fail, q, hideAndHardenFunction } from '../index.js';

/**
 * @import {Rejector} from '../rejector.js';
 */

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 * @returns {candidate is string}
 */
const confirmString = (candidate, reject) =>
  typeof candidate === 'string' ||
  (reject && reject`${q(candidate)} should be a string`);

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 * @returns {candidate is 'foo'}
 */
const confirmFoo = (candidate, reject) =>
  (confirmString(candidate, reject) && candidate === 'foo') ||
  (reject && reject`${q(candidate)} should be "foo"`);

/**
 * @param {unknown} candidate
 * @returns {candidate is 'foo'}
 */
const isFoo = candidate => confirmFoo(candidate, false);
hideAndHardenFunction(isFoo);

/**
 * @param {unknown} candidate
 * @returns {asserts candidate is 'foo'}
 */
const assertFoo = candidate => {
  confirmFoo(candidate, Fail);
};
hideAndHardenFunction(assertFoo);

test('test rejector conjunction patterns', t => {
  t.true(isFoo('foo'));
  t.false(isFoo('zip'));
  t.false(isFoo(88));
  t.notThrows(() => assertFoo('foo'));
  t.throws(() => assertFoo('zip'), {
    message: '"zip" should be "foo"',
  });
  t.throws(() => assertFoo(88), {
    message: '88 should be a string',
  });
});

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 * @returns {candidate is ('foo'|'bar')}
 */
const confirmFooOrBar = (candidate, reject) =>
  isFoo(candidate) ||
  candidate === 'bar' ||
  (reject && reject`${q(candidate)} should be "foo" or "bar"`);

/**
 * @param {unknown} candidate
 * @returns {candidate is ('foo'|'bar')}
 */
const isFooOrBar = candidate => confirmFooOrBar(candidate, false);
hideAndHardenFunction(isFooOrBar);

/**
 * @param {unknown} candidate
 * @returns {asserts candidate is ('foo'|'bar')}
 */
const assertFooOrBar = candidate => {
  confirmFooOrBar(candidate, Fail);
};
hideAndHardenFunction(assertFooOrBar);

test('test rejector disjunction patterns', t => {
  t.true(isFooOrBar('foo'));
  t.false(isFooOrBar('zip'));
  t.false(isFooOrBar(88));
  t.notThrows(() => assertFooOrBar('foo'));
  t.throws(() => assertFooOrBar('zip'), {
    message: '"zip" should be "foo" or "bar"',
  });
  t.throws(() => assertFooOrBar(88), {
    // This case just demonstrates an odd consequence of the least resistance
    // disjunction pattern, where turning the early disjuncts into predicates
    // leaves all the failure reporting only to the last disjunct. As long as
    // that error is correct, as here, that should usually be good enough.
    message: '88 should be "foo" or "bar"',
  });
});
