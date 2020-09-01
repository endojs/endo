// This is just a token test of the `assert` module. The real test is in
// console/test/assert-log.test.js, so these tests can build on the logging
// console.

// TODO The following line came from agoric-sdk which already supports ava.
// Potentially re-enable once SES-shim does too.
// import test from 'ava';

// The following lines mentioning tap are what we do for now instead.
import tap from 'tap';
import { an } from '../../src/error/stringify-utils.js';

const { test } = tap;

test('an', t => {
  t.is(an('object'), 'an object');
  t.is(an('function'), 'a function');
  // does not treat an initial 'y' as a vowel
  t.is(an('yaml file'), 'a yaml file');
  // recognize upper case vowels
  t.is(an('Object'), 'an Object');
  // coerce non-objects to strings.
  // non-letters are treated as non-vowels
  t.is(an({}), 'a [object Object]');
  t.end();
});
