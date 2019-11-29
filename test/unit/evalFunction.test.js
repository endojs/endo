import test from 'tape';
import sinon from 'sinon';
import { createEvalFunction } from '../../src/evalFunction';

test('createEvalFunction', t => {
  t.plan(28);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = Object.create(
    {},
    {
      foo: { value: 1 },
      bar: { value: 2, writable: true },
    },
  );
  const safeEval = createEvalFunction(realmRec, globalObject);

  t.equal(safeEval('foo'), 1);
  t.equal(safeEval('bar'), 2);
  t.throws(() => safeEval('none'), ReferenceError);
  t.equal(safeEval('this.foo'), 1);
  t.equal(safeEval('this.bar'), 2);
  t.equal(safeEval('this.none'), undefined);

  t.throws(() => {
    globalObject.foo = 3;
  }, TypeError);
  t.doesNotThrow(() => {
    globalObject.bar = 4;
  });

  unsafeGlobal.none = 5;

  t.equal(safeEval('foo'), 1);
  t.equal(safeEval('bar'), 4);
  t.equal(safeEval('none'), undefined);
  t.equal(safeEval('this.foo'), 1);
  t.equal(safeEval('this.bar'), 4);
  t.equal(safeEval('this.none'), undefined);

  t.throws(() => safeEval('foo = 6'), TypeError);
  safeEval('bar = 7');
  safeEval('none = 8');

  t.equal(safeEval('foo'), 1);
  t.equal(safeEval('bar'), 7);
  t.equal(safeEval('none'), 8);
  t.equal(safeEval('this.foo'), 1);
  t.equal(safeEval('this.bar'), 7);
  t.equal(safeEval('this.none'), 8);

  t.throws(() => safeEval('foo = 9'), TypeError);
  safeEval('this.bar = 10');
  safeEval('this.none = 11');

  t.equal(safeEval('foo'), 1);
  t.equal(safeEval('bar'), 10);
  t.equal(safeEval('none'), 11);
  t.equal(safeEval('this.foo'), 1);
  t.equal(safeEval('this.bar'), 10);
  t.equal(safeEval('this.none'), 11);

  // cleanup
  delete unsafeGlobal.none;
  sinon.restore();
});
