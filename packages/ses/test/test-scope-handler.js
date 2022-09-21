/* global globalThis */

import test from 'ava';
import sinon from 'sinon';
import { makeSafeEvaluator } from '../src/make-safe-evaluator.js';

// The original unsafe untamed eval function, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
// eslint-disable-next-line no-eval
const FERAL_EVAL = eval;

// this is used to simulate scope lookups
const makeScopeSimulator = ({ scopeProxy, evalScope }) => {
  return key => {
    if (Reflect.has(evalScope, key)) {
      return Reflect.get(evalScope, key, null);
    }
    if (Reflect.has(scopeProxy, key)) {
      return Reflect.get(scopeProxy, key, null);
    }
    return undefined;
  };
};

test('scopeHandler - has trap', t => {
  t.plan(7);

  globalThis.bar = {};

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const { scopeHandler: handler } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });

  t.is(handler.has(null, Symbol.unscopables), false);
  t.is(handler.has(null, 'arguments'), false);

  t.is(handler.has(null, 'eval'), true);
  t.is(handler.has(null, 'foo'), true);
  t.is(handler.has(null, 'bar'), true);
  t.is(handler.has(null, 'foobar'), true);
  t.is(handler.has(null, 'dummy'), false);

  delete globalThis.bar;
});

test('scopeHandler - has trap in sloppyGlobalsMode', t => {
  t.plan(7);

  const globalObject = {};
  const endowments = {};
  const { scopeHandler: handler } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
    sloppyGlobalsMode: true,
  });

  globalThis.bar = {};

  t.is(handler.has(null, Symbol.unscopables), true);
  t.is(handler.has(null, 'arguments'), true);

  t.is(handler.has(null, 'eval'), true);
  t.is(handler.has(null, 'foo'), true);
  t.is(handler.has(null, 'bar'), true);
  t.is(handler.has(null, 'foobar'), true);
  t.is(handler.has(null, 'dummy'), true);

  delete globalThis.bar;
});

test('scopeHandler - has trap guards eval with its life', t => {
  t.plan(5);
  let guardDown = false;
  let lookedUpGlobal = false;

  // eslint-disable-next-line no-eval
  const originalEval = globalThis.eval;
  delete globalThis.eval; // eslint-disable-line no-eval

  const globalObject = {
    __proto__: new Proxy(
      {},
      {
        has(...args) {
          if (args[1] === 'eval') {
            if (guardDown) {
              t.fail('Scope Handler let globalObject catch eval');
            } else {
              lookedUpGlobal = true;
            }
          }
          return Reflect.has(...args);
        },
      },
    ),
  };

  const {
    evalScope,
    scopeProxy,
    resetOneUnsafeEvalNext,
    admitOneUnsafeEvalNext,
  } = makeSafeEvaluator({ globalObject });

  const scopeGet = makeScopeSimulator({ scopeProxy, evalScope });

  admitOneUnsafeEvalNext();
  guardDown = true;
  t.is(Reflect.has(evalScope, 'eval'), true);
  t.is(scopeGet('eval'), FERAL_EVAL);

  resetOneUnsafeEvalNext();
  guardDown = false;
  t.is(
    Reflect.has(evalScope, 'eval'),
    false,
    `global object doesn't have eval`,
  );
  t.is(scopeGet('eval'), undefined);
  t.true(lookedUpGlobal, 'Looked up `eval` on global object');

  globalThis.eval = originalEval; // eslint-disable-line no-eval
});

test('scopeHandler - get trap', t => {
  t.plan(7);

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const { scopeHandler: handler } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });

  globalThis.bar = {};

  t.is(handler.get(null, Symbol.unscopables), undefined);
  t.is(handler.get(null, 'arguments'), undefined);

  t.is(handler.get(null, 'eval'), undefined);
  t.is(handler.get(null, 'foo'), globalObject.foo);
  t.is(handler.get(null, 'bar'), undefined);
  t.is(handler.get(null, 'foobar'), endowments.foobar);
  t.is(handler.get(null, 'dummy'), undefined);

  delete globalThis.bar;
});

test('scopeHandler - get trap - accessors on endowments', t => {
  t.plan(2);

  const globalObject = { foo: {} };
  const endowments = {};
  const { scopeHandler: handler } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });

  Object.defineProperties(endowments, {
    foo: {
      get() {
        return this;
      },
    },
  });

  t.not(handler.get(null, 'foo'), endowments);
  t.is(handler.get(null, 'foo'), globalObject);
});

test('scopeHandler - set trap', t => {
  t.plan(13);

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const { scopeHandler: handler } = makeSafeEvaluator({
    globalObject,
    globalLexicals: endowments,
  });

  globalThis.bar = {};

  const evil = {};
  // eslint-disable-next-line no-eval
  const originalEval = globalThis.eval;
  handler.set(null, 'eval', evil);
  t.is(globalObject.eval, evil);
  // eslint-disable-next-line no-eval
  t.is(globalThis.eval, originalEval);

  const bar = {};
  const originalBar = globalThis.bar;
  handler.set(null, 'bar', bar);
  t.is(globalObject.bar, bar);
  t.is(globalThis.bar, originalBar);

  const foo = {};
  const originalFoo = globalObject.for;
  handler.set(null, 'foo', foo);
  t.is(globalObject.foo, foo);
  t.not(globalObject.foo, originalFoo);
  t.is(globalThis.foo, undefined);

  const foobar = {};
  const originalFoobar = endowments.foobar;
  handler.set(null, 'foobar', foobar);
  t.is(endowments.foobar, foobar);
  t.not(globalObject.foo, originalFoobar);
  t.is(globalObject.foobar, undefined);
  t.is(globalThis.foobar, undefined);

  t.is(Object.keys(globalObject).length, 3);
  t.is(Object.keys(endowments).length, 1);

  delete globalThis.bar;
});

test('scopeHandler - get trap - reset allow next unsafe eval', t => {
  t.plan(7);

  const globalObject = { eval: {} };
  const {
    scopeProxy,
    evalScope,
    resetOneUnsafeEvalNext,
    admitOneUnsafeEvalNext,
  } = makeSafeEvaluator({ globalObject });

  const scopeGet = makeScopeSimulator({ scopeProxy, evalScope });

  t.is(resetOneUnsafeEvalNext(), false);
  t.is(scopeGet('eval'), globalObject.eval);
  t.is(scopeGet('eval'), globalObject.eval); // repeat

  admitOneUnsafeEvalNext();
  t.is(scopeGet('eval'), FERAL_EVAL);
  t.is(resetOneUnsafeEvalNext(), false);
  t.is(scopeGet('eval'), globalObject.eval);
  t.is(scopeGet('eval'), globalObject.eval); // repeat
});

test('scopeHandler - throw only for unsupported traps', t => {
  t.plan(13);

  sinon.stub(console, 'error').callsFake();

  const globalObject = {};
  const { scopeHandler: handler } = makeSafeEvaluator({ globalObject });

  ['has', 'get', 'set', 'getPrototypeOf'].forEach(trap =>
    t.notThrows(() => handler[trap]),
  );

  [
    'apply',
    'construct',
    'defineProperty',
    'delteProperty',
    'getOwnProperty',
    'isExtensible',
    'ownKeys',
    'preventExtensions',
    'setPrototypeOf',
  ].forEach(trap =>
    t.throws(() => handler[trap], {
      message: /Please report unexpected scope handler trap:/,
    }),
  );

  sinon.restore();
});
