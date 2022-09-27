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

  // Known compromise in fidelity of the emulated script environment:
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

  // Known compromise in fidelity of the emulated script environment:
  t.deepEqual(evaluate('arguments'), ['arguments']);

  delete globalThis.bar;
});

test('scope behavior - this-value', t => {
  t.plan(17);

  let globalObjectProtoSetterValue;
  let globalObjectSetterValue;
  let globalLexicalsProtoSetterValue;
  let globalLexicalsSetterValue;

  const globalObjectProto = Object.create(null, {
    globalObjectProtoGetter: {
      get() {
        return this;
      },
    },
    globalObjectProtoSetter: {
      set(_value) {
        globalObjectProtoSetterValue = this;
      },
    },
    globalObjectProtoFn: {
      value() {
        return this;
      },
      configurable: true,
      writable: true,
    },
    globalObjectProtoFnOptimizable: {
      value() {
        return this;
      },
      configurable: false,
      writable: false,
    },
  });
  const globalObject = Object.create(globalObjectProto, {
    globalObjectGetter: {
      get() {
        return this;
      },
    },
    globalObjectSetter: {
      set(_value) {
        globalObjectSetterValue = this;
      },
    },
    globalObjectFn: {
      value() {
        return this;
      },
      configurable: true,
      writable: true,
    },
    globalObjectFnOptimizable: {
      value() {
        return this;
      },
      configurable: false,
      writable: false,
    },
  });
  const globalLexicalsProto = Object.create(null, {
    globalLexicalsProtoGetter: {
      get() {
        return this;
      },
    },
    globalLexicalsProtoSetter: {
      set(_value) {
        globalLexicalsProtoSetterValue = this;
      },
    },
    globalLexicalsProtoFn: {
      value() {
        return this;
      },
      configurable: true,
      writable: true,
    },
    globalLexicalsProtoFnOptimizable: {
      value() {
        return this;
      },
      configurable: false,
      writable: false,
    },
  });
  const globalLexicals = Object.create(globalLexicalsProto, {
    globalLexicalsGetter: {
      get() {
        return this;
      },
    },
    globalLexicalsSetter: {
      set(_value) {
        globalLexicalsSetterValue = this;
      },
    },
    globalLexicalsFn: {
      value() {
        return this;
      },
      configurable: true,
      writable: true,
    },
    globalLexicalsFnOptimizable: {
      value() {
        return this;
      },
      configurable: false,
      writable: false,
    },
  });

  const knownScopeProxies = new WeakSet();
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    globalLexicals,
    knownScopeProxies,
  });

  // Known compromise in fidelity of the emulated script environment (all tests):

  t.is(evaluate('globalObjectProtoGetter'), globalObject);
  t.is(evaluate('globalObjectGetter'), globalObject);
  t.is(evaluate('globalLexicalsProtoGetter'), globalObject);
  t.is(evaluate('globalLexicalsGetter'), globalObject);

  evaluate('globalObjectProtoSetter = 123');
  t.is(globalObjectProtoSetterValue, globalObject);
  evaluate('globalObjectSetter = 123');
  t.is(globalObjectSetterValue, globalObject);
  // bug: properties in prototype of globalLexicals error on set
  t.throws(() => evaluate('globalLexicalsProtoSetter = 123'), {
    instanceOf: Error,
  });
  t.is(globalLexicalsProtoSetterValue, undefined);
  evaluate('globalLexicalsSetter = 123');
  t.is(globalLexicalsSetterValue, globalObject);

  t.true(knownScopeProxies.has(evaluate('globalObjectProtoFn()')));
  t.true(knownScopeProxies.has(evaluate('globalObjectFn()')));
  t.true(knownScopeProxies.has(evaluate('globalObjectProtoFnOptimizable()')));
  t.is(evaluate('globalObjectFnOptimizable()'), undefined);
  t.true(knownScopeProxies.has(evaluate('globalLexicalsProtoFn()')));
  t.true(knownScopeProxies.has(evaluate('globalLexicalsFn()')));
  t.true(knownScopeProxies.has(evaluate('globalLexicalsProtoFnOptimizable()')));
  t.is(evaluate('globalLexicalsFnOptimizable()'), undefined);
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

  // Known compromise in fidelity of the emulated script environment:
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
  // Known compromise in fidelity of the emulated script environment:
  t.is(evaluate('bar'), undefined);

  delete globalThis.bar;
});
