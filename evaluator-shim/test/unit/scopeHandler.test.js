import test from 'tape';
import sinon from 'sinon';
import { createScopeHandler } from '../../src/scopeHandler';

test('scopeHandler - has trap', t => {
  t.plan(7);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  unsafeGlobal.bar = {};

  const realmRec = { intrinsics: { Function } };
  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(realmRec, globalObject, endowments);

  t.equal(handler.has(null, Symbol.unscopables), false);
  t.equal(handler.has(null, 'arguments'), false);

  t.equal(handler.has(null, 'eval'), true);
  t.equal(handler.has(null, 'foo'), true);
  t.equal(handler.has(null, 'bar'), true);
  t.equal(handler.has(null, 'foobar'), true);
  t.equal(handler.has(null, 'dummy'), false);

  delete unsafeGlobal.bar;
});

test('scopeHandler - has trap in sloppyGlobalsMode', t => {
  t.plan(7);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();

  const realmRec = { intrinsics: { Function } };
  const globalObject = {};
  const endowments = {};
  const options = { sloppyGlobalsMode: true };
  const handler = createScopeHandler(
    realmRec,
    globalObject,
    endowments,
    options,
  );

  unsafeGlobal.bar = {};

  t.equal(handler.has(null, Symbol.unscopables), true);
  t.equal(handler.has(null, 'arguments'), true);

  t.equal(handler.has(null, 'eval'), true);
  t.equal(handler.has(null, 'foo'), true);
  t.equal(handler.has(null, 'bar'), true);
  t.equal(handler.has(null, 'foobar'), true);
  t.equal(handler.has(null, 'dummy'), true);

  delete unsafeGlobal.bar;
});

test('scopeHandler - get trap', t => {
  t.plan(7);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(realmRec, globalObject, endowments);

  unsafeGlobal.bar = {};

  t.equal(handler.get(null, Symbol.unscopables), undefined);
  t.equal(handler.get(null, 'arguments'), undefined);

  t.equal(handler.get(null, 'eval'), undefined);
  t.equal(handler.get(null, 'foo'), globalObject.foo);
  t.equal(handler.get(null, 'bar'), undefined);
  t.equal(handler.get(null, 'foobar'), endowments.foobar);
  t.equal(handler.get(null, 'dummy'), undefined);

  delete unsafeGlobal.bar;
});

test('scopeHandler - get trap - accessors on endowments', t => {
  t.plan(2);

  const realmRec = { intrinsics: { Function } };
  const globalObject = { foo: {} };
  const endowments = {};
  const handler = createScopeHandler(realmRec, globalObject, endowments);

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

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();

  const realmRec = { intrinsics: { Function } };
  const globalObject = { foo: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(realmRec, globalObject, endowments);

  unsafeGlobal.bar = {};

  const evil = {};
  const originalEval = unsafeGlobal.eval;
  handler.set(null, 'eval', evil);
  t.equal(globalObject.eval, evil);
  t.equal(unsafeGlobal.eval, originalEval);

  const bar = {};
  const originalBar = unsafeGlobal.bar;
  handler.set(null, 'bar', bar);
  t.equal(globalObject.bar, bar);
  t.equal(unsafeGlobal.bar, originalBar);

  const foo = {};
  const originalFoo = globalObject.for;
  handler.set(null, 'foo', foo);
  t.equal(globalObject.foo, foo);
  t.notEqual(globalObject.foo, originalFoo);
  t.equal(unsafeGlobal.foo, undefined);

  const foobar = {};
  const originalFoobar = endowments.foobar;
  handler.set(null, 'foobar', foobar);
  t.equal(endowments.foobar, foobar);
  t.notEqual(globalObject.foo, originalFoobar);
  t.equal(globalObject.foobar, undefined);
  t.equal(unsafeGlobal.foobar, undefined);

  t.equal(Object.keys(globalObject).length, 3);
  t.equal(Object.keys(endowments).length, 1);

  delete unsafeGlobal.bar;
});

test('scopeHandler - get trap - useUnsafeEvaluator', t => {
  t.plan(7);

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = { eval: {} };
  const handler = createScopeHandler(realmRec, globalObject);

  t.equal(handler.useUnsafeEvaluator, false);
  t.equal(handler.get(null, 'eval'), globalObject.eval);
  t.equal(handler.get(null, 'eval'), globalObject.eval); // repeat

  handler.useUnsafeEvaluator = true;
  t.equal(handler.get(null, 'eval'), realmRec.intrinsics.eval);
  t.equal(handler.useUnsafeEvaluator, false);
  t.equal(handler.get(null, 'eval'), globalObject.eval);
  t.equal(handler.get(null, 'eval'), globalObject.eval); // repeat
});

test('scopeHandler - throw only for unsupported traps', t => {
  t.plan(13);

  sinon.stub(console, 'error').callsFake();

  const realmRec = { intrinsics: { Function } };
  const globalObject = {};
  const handler = createScopeHandler(realmRec, globalObject);

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
  ].forEach(
    trap => t.throws(() => handler[trap]),
    /unexpected scope handler trap called/,
  );

  sinon.restore();
});
