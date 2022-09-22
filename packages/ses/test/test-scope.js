/* global globalThis */

import test from 'ava';
import { makeSafeEvaluator } from '../src/make-safe-evaluator.js';

test('scope handling - has trap', t => {
  t.plan(7);

  globalThis.bar = {};

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };

  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });
  const scopeGet = prop => {
    return evaluate(prop);
  };
  const scopeHas = prop => {
    let value;
    try {
      value = scopeGet(prop);
    } catch (e) {
      if (e instanceof ReferenceError) {
        return false;
      }
      throw e;
    }
    return value !== undefined;
  };

  t.is(scopeHas('globalThis'), false);
  t.is(scopeHas('arguments'), true);
  t.is(scopeHas('eval'), false);
  t.is(scopeHas('foo'), true);
  t.is(scopeHas('bar'), false);
  t.is(scopeHas('foobar'), true);
  t.is(scopeHas('dummy'), false);

  delete globalThis.bar;
});

test('scope handling - has trap in sloppyGlobalsMode', t => {
  t.plan(7);

  const globalObject = {};
  const endowments = {};
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
    sloppyGlobalsMode: true,
  });
  const scopeGet = prop => {
    return evaluate(prop);
  };
  const scopeHas = prop => {
    const value = scopeGet(prop);
    return value !== undefined;
  };

  globalThis.bar = {};

  t.is(scopeHas('globalThis'), false);
  t.is(scopeHas('arguments'), true);
  t.is(scopeHas('eval'), false);
  t.is(scopeHas('foo'), false);
  t.is(scopeHas('bar'), false);
  t.is(scopeHas('foobar'), false);
  t.is(scopeHas('dummy'), false);

  delete globalThis.bar;
});

test('scope handling - get trap', t => {
  t.plan(6);

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });
  const scopeGet = prop => {
    return evaluate(prop);
  };

  globalThis.bar = {};

  t.deepEqual(scopeGet('arguments'), ['arguments']);

  t.is(scopeGet('eval'), undefined);

  t.is(scopeGet('foo'), globalObject.foo);
  t.is(scopeGet('bar'), undefined);
  t.is(scopeGet('foobar'), endowments.foobar);
  t.throws(() => scopeGet('dummy'), { instanceOf: ReferenceError });

  delete globalThis.bar;
});

test('scope handling - get trap - accessors on endowments', t => {
  t.plan(2);

  const globalObject = { foo: {} };
  const endowments = {};
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });
  const scopeGet = prop => {
    return evaluate(prop);
  };

  Object.defineProperties(endowments, {
    foo: {
      get() {
        return this;
      },
    },
  });

  t.not(scopeGet('foo'), globalObject);
  t.is(scopeGet('foo'), endowments);
});

test('scope handling - set trap', t => {
  t.plan(13);

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });
  const scopeSet = (leftHandRef, value) => {
    evaluate(`(value) => { ${leftHandRef} = value }`)(value);
  };

  globalThis.bar = {};

  const evil = {};
  // eslint-disable-next-line no-eval
  const originalEval = globalThis.eval;
  scopeSet('this.eval', evil);
  t.is(globalObject.eval, evil);
  // eslint-disable-next-line no-eval
  t.is(globalThis.eval, originalEval);

  const bar = {};
  const originalBar = globalThis.bar;
  scopeSet('this.bar', bar);
  t.is(globalObject.bar, bar);
  t.is(globalThis.bar, originalBar);

  const foo = {};
  const originalFoo = globalObject.for;
  scopeSet('foo', foo);
  t.is(globalObject.foo, foo);
  t.not(globalObject.foo, originalFoo);
  t.is(globalThis.foo, undefined);

  const foobar = {};
  const originalFoobar = endowments.foobar;
  scopeSet('foobar', foobar);
  t.is(endowments.foobar, foobar);
  t.not(globalObject.foo, originalFoobar);
  t.is(globalObject.foobar, undefined);
  t.is(globalThis.foobar, undefined);

  t.is(Object.keys(globalObject).length, 3);
  t.is(Object.keys(endowments).length, 1);

  delete globalThis.bar;
});
