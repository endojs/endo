import tap from 'tap';
import sinon from 'sinon';
import { createScopeHandler } from '../src/scope-handler.js';

const { test } = tap;

// The original unsafe untamed eval function, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
// eslint-disable-next-line no-eval
const FERAL_EVAL = eval;

test('scopeHandler - has trap', t => {
  t.plan(7);

  globalThis.bar = {};

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(globalObject, endowments);

  t.equal(handler.has(null, Symbol.unscopables), false);
  t.equal(handler.has(null, 'arguments'), false);

  t.equal(handler.has(null, 'eval'), true);
  t.equal(handler.has(null, 'foo'), true);
  t.equal(handler.has(null, 'bar'), true);
  t.equal(handler.has(null, 'foobar'), true);
  t.equal(handler.has(null, 'dummy'), false);

  delete globalThis.bar;
});

test('scopeHandler - has trap in sloppyGlobalsMode', t => {
  t.plan(7);

  const globalObject = {};
  const endowments = {};
  const options = { sloppyGlobalsMode: true };
  const handler = createScopeHandler(globalObject, endowments, options);

  globalThis.bar = {};

  t.equal(handler.has(null, Symbol.unscopables), true);
  t.equal(handler.has(null, 'arguments'), true);

  t.equal(handler.has(null, 'eval'), true);
  t.equal(handler.has(null, 'foo'), true);
  t.equal(handler.has(null, 'bar'), true);
  t.equal(handler.has(null, 'foobar'), true);
  t.equal(handler.has(null, 'dummy'), true);

  delete globalThis.bar;
});

test('scopeHandler - get trap', t => {
  t.plan(7);

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(globalObject, endowments);

  globalThis.bar = {};

  t.equal(handler.get(null, Symbol.unscopables), undefined);
  t.equal(handler.get(null, 'arguments'), undefined);

  t.equal(handler.get(null, 'eval'), undefined);
  t.equal(handler.get(null, 'foo'), globalObject.foo);
  t.equal(handler.get(null, 'bar'), undefined);
  t.equal(handler.get(null, 'foobar'), endowments.foobar);
  t.equal(handler.get(null, 'dummy'), undefined);

  delete globalThis.bar;
});

test('scopeHandler - get trap - accessors on endowments', t => {
  t.plan(2);

  const globalObject = { foo: {} };
  const endowments = {};
  const handler = createScopeHandler(globalObject, endowments);

  Object.defineProperties(endowments, {
    foo: {
      get() {
        return this;
      },
    },
  });

  t.notEqual(handler.get(null, 'foo'), endowments);
  t.equal(handler.get(null, 'foo'), globalObject);
});

test('scopeHandler - set trap', t => {
  t.plan(13);

  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(globalObject, endowments);

  globalThis.bar = {};

  const evil = {};
  const originalEval = globalThis.eval;
  handler.set(null, 'eval', evil);
  t.equal(globalObject.eval, evil);
  t.equal(globalThis.eval, originalEval);

  const bar = {};
  const originalBar = globalThis.bar;
  handler.set(null, 'bar', bar);
  t.equal(globalObject.bar, bar);
  t.equal(globalThis.bar, originalBar);

  const foo = {};
  const originalFoo = globalObject.for;
  handler.set(null, 'foo', foo);
  t.equal(globalObject.foo, foo);
  t.notEqual(globalObject.foo, originalFoo);
  t.equal(globalThis.foo, undefined);

  const foobar = {};
  const originalFoobar = endowments.foobar;
  handler.set(null, 'foobar', foobar);
  t.equal(endowments.foobar, foobar);
  t.notEqual(globalObject.foo, originalFoobar);
  t.equal(globalObject.foobar, undefined);
  t.equal(globalThis.foobar, undefined);

  t.equal(Object.keys(globalObject).length, 3);
  t.equal(Object.keys(endowments).length, 1);

  delete globalThis.bar;
});

test('scopeHandler - get trap - useUnsafeEvaluator', t => {
  t.plan(7);

  const globalObject = { eval: {} };
  const handler = createScopeHandler(globalObject);

  t.equal(handler.useUnsafeEvaluator, false);
  t.equal(handler.get(null, 'eval'), globalObject.eval);
  t.equal(handler.get(null, 'eval'), globalObject.eval); // repeat

  handler.useUnsafeEvaluator = true;
  t.equal(handler.get(null, 'eval'), FERAL_EVAL);
  t.equal(handler.useUnsafeEvaluator, false);
  t.equal(handler.get(null, 'eval'), globalObject.eval);
  t.equal(handler.get(null, 'eval'), globalObject.eval); // repeat
});

test('scopeHandler - throw only for unsupported traps', t => {
  t.plan(13);

  sinon.stub(console, 'error').callsFake();

  const globalObject = {};
  const handler = createScopeHandler(globalObject);

  ['has', 'get', 'set', 'getPrototypeOf'].forEach(trap =>
    t.doesNotThrow(() => handler[trap]),
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
    t.throws(
      () => handler[trap],
      /Please report unexpected scope handler trap:/,
    ),
  );

  sinon.restore();
});
