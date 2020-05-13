/* global Compartment, lockdown */
import test from 'tape';
import '../src/main.js';

lockdown();

test('Compartment global is not frozen', t => {
  const c = new Compartment();
  t.doesNotThrow(() => c.evaluate('this.a = 10;'));
  t.equal(c.evaluate('this.a'), 10);
  t.end();
});

test('Compartment named intrinsics are frozen', t => {
  const c = new Compartment();
  t.throws(() => c.evaluate('Object.a = 10;'), TypeError);
  t.throws(() => c.evaluate('Number.a = 10;'), TypeError);
  t.throws(() => c.evaluate('Date.a = 10;'), TypeError);
  t.throws(() => c.evaluate('Array.a = 10;'), TypeError);
  t.throws(() => c.evaluate('Array.push = 10;'), TypeError);
  t.throws(() => c.evaluate('WeakSet.a = 10;'), TypeError);
  t.end();
});

test('Compartment anonymous intrinsics are frozen', t => {
  const c = new Compartment();

  t.throws(
    () => c.evaluate('(async function() {}).constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => c.evaluate('(async function*() {}).constructor.a = 10;'),
    TypeError,
  );
  t.throws(() => c.evaluate('(function*() {}).constructor.a = 10;'), TypeError);
  t.throws(
    () => c.evaluate('[][Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => c.evaluate('new Map()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => c.evaluate('new Set()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => c.evaluate('new WeakMap()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => c.evaluate('new WeakSet()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.end();
});
