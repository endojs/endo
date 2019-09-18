import test from 'tape';
import sinon from 'sinon';
import { createScopeHandler } from '../../src/scopeHandlerFacade';

test('scope handler traps', t => {
  t.plan(13);

  sinon.stub(console, 'error').callsFake();

  const unsafeEval = eval;
  const handler = createScopeHandler({ unsafeEval });

  ['has', 'get', 'set'].forEach(trap => t.doesNotThrow(() => handler[trap]));

  [
    'apply',
    'construct',
    'defineProperty',
    'delteProperty',
    'getOwnProperty',
    'getPrototypeOf',
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

test('scope handler has', t => {
  t.plan(9);

  const unsafeGlobal = { foo: {} };
  const unsafeEval = eval;
  const safeGlobal = { bar: {} };
  const handler = createScopeHandler({ unsafeGlobal, unsafeEval }, safeGlobal);
  const target = null;

  t.equal(handler.has(target, 'eval'), true);
  handler.allowUnsafeEvaluatorOnce();
  t.equal(handler.has(target, 'eval'), true);
  handler.get(target, 'eval'); // trigger the revoke
  t.equal(handler.has(target, 'eval'), true);
  t.equal(handler.has(target, 'eval'), true); // repeat

  t.equal(handler.has(target, Symbol.unscopables), false);

  t.equal(handler.has(target, 'arguments'), false);
  t.equal(handler.has(target, 'foo'), true);
  t.equal(handler.has(target, 'bar'), true);
  t.equal(handler.has(target, 'dummy'), false);
});

test('scope handler get', t => {
  t.plan(13);

  const unsafeGlobal = { foo: {} };
  const unsafeEval = eval;
  const safeGlobal = { eval: {}, bar: {} };
  const handler = createScopeHandler({ unsafeGlobal, unsafeEval }, safeGlobal);
  const target = null;

  t.equal(handler.unsafeEvaluatorAllowed(), false); // initial
  t.equal(handler.get(target, 'eval'), safeGlobal.eval);

  handler.allowUnsafeEvaluatorOnce();
  t.equal(handler.unsafeEvaluatorAllowed(), true);
  t.equal(handler.get(target, 'eval'), unsafeEval);
  t.equal(handler.unsafeEvaluatorAllowed(), false);
  t.equal(handler.get(target, 'eval'), safeGlobal.eval);
  t.equal(handler.unsafeEvaluatorAllowed(), false);
  t.equal(handler.get(target, 'eval'), safeGlobal.eval); // repeat

  t.equal(handler.get(target, Symbol.unscopables), undefined);

  t.equal(handler.get(target, 'arguments'), undefined);
  t.equal(handler.get(target, 'foo'), undefined);
  t.equal(handler.get(target, 'bar'), safeGlobal.bar);
  t.equal(handler.get(target, 'dummy'), undefined);
});

test('scope handler set', t => {
  t.plan(4);

  const unsafeGlobal = {};
  const unsafeEval = eval;
  const safeGlobal = { bar: {} };
  const endowments = { foo: {} };
  const handler = createScopeHandler(
    { unsafeGlobal, unsafeEval },
    safeGlobal,
    endowments
  );
  const target = null;

  const evil = {};
  handler.set(target, 'eval', evil);
  t.equal(safeGlobal.eval, evil);

  const bar = {};
  handler.set(target, 'bar', bar);
  t.equal(safeGlobal.bar, bar);

  const foo = {};
  t.throws(
    () => handler.set(target, 'foo', foo),
    /do not modify endowments like foo/
  );

  t.equal(Object.keys(unsafeGlobal).length, 0);
});
