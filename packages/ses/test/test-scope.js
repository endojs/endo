/* global globalThis */

import test from 'ava';
import { makeSafeEvaluator } from '../src/make-safe-evaluator.js';

test('scope behavior - lookup behavior', t => {
  t.plan(7);

  const globalObject = { foo: {} };
  const globalLexicals = { foobar: {} };

  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals,
  });

  globalThis.bar = {};

  t.is(evaluate('globalThis'), undefined);
  t.is(evaluate('eval'), undefined);
  t.is(evaluate('bar'), undefined);
  t.throws(() => evaluate('dummy'), { instanceOf: ReferenceError });

  t.is(evaluate('foo'), globalObject.foo);
  t.is(evaluate('foobar'), globalLexicals.foobar);
  t.deepEqual(evaluate('arguments'), ['arguments']);

  delete globalThis.bar;
});

test('scope behavior - lookup in sloppyGlobalsMode', t => {
  t.plan(7);

  const globalObject = {};
  const globalLexicals = {};
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals,
    sloppyGlobalsMode: true,
  });

  globalThis.bar = {};

  t.is(evaluate('globalThis'), undefined);
  t.is(evaluate('eval'), undefined);
  t.is(evaluate('foo'), undefined);
  t.is(evaluate('bar'), undefined);
  t.is(evaluate('foobar'), undefined);
  t.is(evaluate('dummy'), undefined);

  t.deepEqual(evaluate('arguments'), ['arguments']);

  delete globalThis.bar;
});

test('scope behavior - this-value', t => {
  t.plan(6);

  let hogeValue;
  let fugaValue;

  const globalObject = {
    get foo() {
      return this;
    },
    set hoge(_value) {
      hogeValue = this;
    },
    quux() {
      return this;
    },
  };
  const globalLexicals = {
    get bar() {
      return this;
    },
    set fuga(_value) {
      fugaValue = this;
    },
    garply() {
      return this;
    },
  };
  const knownScopeProxies = new WeakSet();
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals,
    knownScopeProxies,
  });

  t.is(evaluate('foo'), globalObject);
  t.is(evaluate('bar'), globalObject);

  evaluate('hoge = 123');
  evaluate('fuga = 456');
  t.is(hogeValue, globalObject);
  t.is(fugaValue, globalObject);

  t.is(knownScopeProxies.has(evaluate('quux()')), true);
  t.is(knownScopeProxies.has(evaluate('garply()')), true);
});

test('scope behavior - assignment', t => {
  t.plan(13);

  const globalObject = { foo: {} };
  const globalLexicals = { foobar: {} };
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals,
  });
  const doAssignment = (leftHandRef, value) => {
    evaluate(`(value) => { ${leftHandRef} = value }`)(value);
  };

  globalThis.bar = {};

  const evil = {};
  // eslint-disable-next-line no-eval
  const originalEval = globalThis.eval;
  doAssignment('this.eval', evil);
  t.is(globalObject.eval, evil);
  // eslint-disable-next-line no-eval
  t.is(globalThis.eval, originalEval);

  const bar = {};
  const originalBar = globalThis.bar;
  doAssignment('this.bar', bar);
  t.is(globalObject.bar, bar);
  t.is(globalThis.bar, originalBar);

  const foo = {};
  const originalFoo = globalObject.for;
  doAssignment('foo', foo);
  t.is(globalObject.foo, foo);
  t.not(globalObject.foo, originalFoo);
  t.is(globalThis.foo, undefined);

  const foobar = {};
  const originalFoobar = globalLexicals.foobar;
  doAssignment('foobar', foobar);
  t.is(globalLexicals.foobar, foobar);
  t.not(globalObject.foo, originalFoobar);
  t.is(globalObject.foobar, undefined);
  t.is(globalThis.foobar, undefined);

  t.is(Object.keys(globalObject).length, 3);
  t.is(Object.keys(globalLexicals).length, 1);

  delete globalThis.bar;
});

test('scope behavior - strict vs sloppy locally non-existing global set', t => {
  t.plan(4);

  const globalObject = {};
  const { safeEvaluate: evaluateStrict } = makeSafeEvaluator({
    globalObject,
    sloppyGlobalsMode: false,
  });
  const { safeEvaluate: evaluateSloppy } = makeSafeEvaluator({
    globalObject,
    sloppyGlobalsMode: true,
  });

  globalThis.bar = {};

  t.notThrows(() => evaluateStrict('bar = 123'));
  t.throws(() => evaluateStrict('abc = 123'), {
    instanceOf: ReferenceError,
  });
  t.notThrows(() => evaluateSloppy('bar = 456'));
  t.notThrows(() => evaluateSloppy('xyz = 456'));

  delete globalThis.bar;
});

test('scope behavior - realm globalThis property info leak', t => {
  t.plan(8);

  const globalObject = {};
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
  });

  t.is(evaluate('typeof foo'), 'undefined');
  t.is(evaluate('typeof bar'), 'undefined');
  t.throws(() => evaluate('foo'), { instanceOf: ReferenceError });
  t.throws(() => evaluate('bar'), { instanceOf: ReferenceError });

  globalThis.bar = {};

  t.is(evaluate('typeof foo'), 'undefined');
  t.is(evaluate('typeof bar'), 'undefined');
  t.throws(() => evaluate('foo'), { instanceOf: ReferenceError });
  t.is(evaluate('bar'), undefined);

  delete globalThis.bar;
});
