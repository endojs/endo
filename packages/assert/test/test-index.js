// Sets up a SES environment with 'assert' global
import { test } from './prepare-test-env-ava.js';

import { assert, Fail } from '../index.js';

test('Fail', t => {
  t.notThrows(() => true || Fail`Should not be thrown`);
  t.throws(() => false || Fail`Should be thrown`, {
    message: 'Should be thrown',
  });
});

test('assert()', t => {
  t.notThrows(() => assert(true));
  t.throws(() => assert(false));
});

test('assert.equal()', t => {
  t.notThrows(() => assert.equal(123n, 123n));
  t.throws(() => assert.equal(123, 123n));
});

test('assert.string()', t => {
  t.notThrows(() => assert.string('123'));
  t.throws(() => assert.string(123));
});

test('assert.typeof()', t => {
  t.notThrows(() => assert.typeof(123n, 'bigint'));
  t.throws(() => assert.typeof(123, 'bigint'));
});

test('omitted from global', t => {
  t.false('bare' in assert);
  t.false('error' in assert);
  t.false('makeAssert' in assert);
  t.false('note' in assert);
  t.false('quote' in assert);
});
