// This is just a token standalone test of the `assert` module. The real test
// is in assert-log.test.js which also uses the logging console.

// TODO The following line came from agoric-sdk which already supports ava.
// Potentially re-enable once SES-shim does too.
// import test from 'ava';

// The following lines mentioning tap are what we do for now instead.
import test from 'ava';
import { an } from '../../src/error/stringify-utils.js';

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
});
