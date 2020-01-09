/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('Evaluator global is not frozen', t => {
  const s = new Evaluator();
  t.doesNotThrow(() => s.evaluate('this.a = 10;'));
  t.equal(s.evaluate('this.a'), 10);
  t.end();
});

test('Evaluator named intrinsics are frozen', t => {
  const s = new Evaluator();
  t.throws(() => s.evaluate('Object.a = 10;'), TypeError);
  t.throws(() => s.evaluate('Number.a = 10;'), TypeError);
  t.throws(() => s.evaluate('Date.a = 10;'), TypeError);
  t.throws(() => s.evaluate('Array.a = 10;'), TypeError);
  t.throws(() => s.evaluate('Array.push = 10;'), TypeError);
  t.throws(() => s.evaluate('WeakSet.a = 10;'), TypeError);
  t.end();
});

test('Evaluator anonymous intrinsics are frozen', t => {
  const s = new Evaluator();

  t.throws(
    () => s.evaluate('(async function() {}).constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => s.evaluate('(async function*() {}).constructor.a = 10;'),
    TypeError,
  );
  t.throws(() => s.evaluate('(function*() {}).constructor.a = 10;'), TypeError);
  t.throws(
    () => s.evaluate('[][Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => s.evaluate('new Map()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => s.evaluate('new Set()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => s.evaluate('new WeakMap()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.throws(
    () => s.evaluate('new WeakSet()[Symbol.iterator]().constructor.a = 10;'),
    TypeError,
  );
  t.end();
});
