import test from 'tape';
import sinon from 'sinon';
import { createScopeHandler } from '../../src/scopeHandler';

test('scopeHandler - throw only for unsupported traps', t => {
  t.plan(13);

  sinon.stub(console, 'error').callsFake();

  const handler = createScopeHandler({});

  ['has', 'get', 'set', 'getPrototypeOf'].forEach(trap =>
    t.doesNotThrow(() => handler[trap])
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
    'setPrototypeOf'
  ].forEach(
    trap => t.throws(() => handler[trap]),
    /unexpected scope handler trap called/
  );

  // eslint-disable-next-line no-console
  console.error.restore();
});

test('scopeHandler - has trap', t => {
  t.plan(10);

  const unsafeEval = {};
  const unsafeGlobal = { foo: {}, eval: unsafeEval };
  const safeGlobal = { bar: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(
    { unsafeGlobal, unsafeEval },
    safeGlobal,
    endowments
  );

  t.equal(handler.has(null, 'eval'), true);
  handler.useUnsafeEvaluator = true;
  t.equal(handler.has(null, 'eval'), true);
  handler.get(null, 'eval'); // trigger the revoke
  t.equal(handler.has(null, 'eval'), true);
  t.equal(handler.has(null, 'eval'), true); // repeat

  t.equal(handler.has(null, Symbol.unscopables), false);

  t.equal(handler.has(null, 'arguments'), false);
  t.equal(handler.has(null, 'foo'), true);
  t.equal(handler.has(null, 'bar'), true);
  t.equal(handler.has(null, 'foobar'), true);
  t.equal(handler.has(null, 'dummy'), false);
});

test('scopeHandler - has trap in sloppyGlobalsMode', t => {
  t.plan(10);

  const handler = createScopeHandler({}, {}, {}, { sloppyGlobalsMode: true });

  t.equal(handler.has(null, 'eval'), true);
  handler.useUnsafeEvaluator = true;
  t.equal(handler.has(null, 'eval'), true);
  handler.get(null, 'eval'); // trigger the revoke
  t.equal(handler.has(null, 'eval'), true);
  t.equal(handler.has(null, 'eval'), true); // repeat

  t.equal(handler.has(null, Symbol.unscopables), true);

  t.equal(handler.has(null, 'arguments'), true);
  t.equal(handler.has(null, 'foo'), true);
  t.equal(handler.has(null, 'bar'), true);
  t.equal(handler.has(null, 'foobar'), true);
  t.equal(handler.has(null, 'dummy'), true);
});

test('scopeHandler - get trap', t => {
  t.plan(14);

  const unsafeEval = {};
  const unsafeGlobal = { foo: {}, eval: unsafeEval };
  const safeGlobal = { bar: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(
    { unsafeGlobal, unsafeEval },
    safeGlobal,
    endowments
  );

  t.equal(handler.useUnsafeEvaluator === true, false); // initial
  t.equal(handler.get(null, 'eval'), safeGlobal.eval);

  handler.useUnsafeEvaluator = true;
  t.equal(handler.useUnsafeEvaluator === true, true);
  t.equal(handler.get(null, 'eval'), unsafeEval);
  t.equal(handler.useUnsafeEvaluator === true, false);
  t.equal(handler.get(null, 'eval'), safeGlobal.eval);
  t.equal(handler.useUnsafeEvaluator === true, false);
  t.equal(handler.get(null, 'eval'), safeGlobal.eval); // repeat

  t.equal(handler.get(null, Symbol.unscopables), undefined);

  t.equal(handler.get(null, 'arguments'), undefined);
  t.equal(handler.get(null, 'foo'), undefined);
  t.equal(handler.get(null, 'bar'), safeGlobal.bar);
  t.equal(handler.get(null, 'foobar'), endowments.foobar);
  t.equal(handler.get(null, 'dummy'), undefined);
});

test('scopeHandler - get trap - accessors on endowments', t => {
  t.plan(2);

  const unsafeEval = {};
  const unsafeGlobal = {};
  const safeGlobal = {};
  const endowments = Object.create(null, {
    foo: {
      get() {
        return this;
      }
    }
  });
  const handler = createScopeHandler(
    { unsafeGlobal, unsafeEval },
    safeGlobal,
    endowments
  );

  t.notEqual(handler.get(null, 'foo'), endowments);
  t.equal(handler.get(null, 'foo'), safeGlobal);
});

test('scopeHandler - set trap', t => {
  t.plan(8);

  const unsafeEval = {};
  const unsafeGlobal = { foo: {}, eval: unsafeEval };
  const safeGlobal = { bar: {} };
  const endowments = { foobar: {} };
  const handler = createScopeHandler(
    { unsafeGlobal, unsafeEval },
    safeGlobal,
    endowments
  );

  const evil = {};
  handler.set(null, 'eval', evil);
  t.equal(safeGlobal.eval, evil);
  t.equal(unsafeGlobal.eval, unsafeEval);

  const bar = {};
  handler.set(null, 'bar', bar);
  t.equal(safeGlobal.bar, bar);

  const foo = {};
  handler.set(null, 'foo', foo);
  t.equal(safeGlobal.foo, foo);

  const foobar = {};
  handler.set(null, 'foobar', foobar);
  t.equal(endowments.foobar, foobar);

  t.equal(Object.keys(unsafeGlobal).length, 2);
  t.equal(Object.keys(safeGlobal).length, 3);
  t.equal(Object.keys(endowments).length, 1);
});
