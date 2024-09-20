/* global globalThis */

import '../index.js';
import './_lockdown-safe.js';
import test from 'ava';
import { makeEvalFunction } from '../src/make-eval-function.js';
import { makeSafeEvaluator } from '../src/make-safe-evaluator.js';

test('makeEvalFunction - leak', t => {
  t.plan(8);

  const globalObject = {};
  const { safeEvaluate } = makeSafeEvaluator({ globalObject });
  const safeEval = makeEvalFunction(safeEvaluate);

  t.throws(() => safeEval('none'), { instanceOf: ReferenceError });
  t.is(safeEval('this.none'), undefined);

  globalThis.none = 5;

  t.is(safeEval('none'), undefined);
  t.is(safeEval('this.none'), undefined);

  safeEval('this.none = 8');

  t.is(safeEval('none'), 8);
  t.is(safeEval('this.none'), 8);

  safeEval('this.none = 11');

  t.is(safeEval('none'), 11);
  t.is(safeEval('this.none'), 11);
});

test('makeEvalFunction - globals', t => {
  t.plan(20);

  const globalObject = Object.create(
    {},
    {
      foo: { value: 1 },
      bar: { value: 2, writable: true },
    },
  );
  const { safeEvaluate } = makeSafeEvaluator({ globalObject });
  const safeEval = makeEvalFunction(safeEvaluate);

  t.is(safeEval('foo'), 1);
  t.is(safeEval('bar'), 2);
  t.is(safeEval('this.foo'), 1);
  t.is(safeEval('this.bar'), 2);

  t.throws(
    () => {
      globalObject.foo = 3;
    },
    { instanceOf: TypeError },
  );
  t.notThrows(() => {
    globalObject.bar = 4;
  });

  t.is(safeEval('foo'), 1);
  t.is(safeEval('bar'), 4);
  t.is(safeEval('this.foo'), 1);
  t.is(safeEval('this.bar'), 4);

  t.throws(() => safeEval('foo = 6'), { instanceOf: TypeError });
  safeEval('bar = 7');

  t.is(safeEval('foo'), 1);
  t.is(safeEval('bar'), 7);
  t.is(safeEval('this.foo'), 1);
  t.is(safeEval('this.bar'), 7);

  t.throws(() => safeEval('foo = 9'), { instanceOf: TypeError });
  safeEval('this.bar = 10');

  t.is(safeEval('foo'), 1);
  t.is(safeEval('bar'), 10);
  t.is(safeEval('this.foo'), 1);
  t.is(safeEval('this.bar'), 10);
});
