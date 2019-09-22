import test from 'tape';
import sinon from 'sinon';

import { createSafeEval } from '../../src/safeEval';
import { createSafeEvaluatorFactory } from '../../src/safeEvaluator';
import { createUnsafeRec } from '../../src/unsafeRec';

test('createSafeEval', t => {
  t.plan(27);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const safeGlobal = Object.create(null, {
    foo: { value: 1 },
    bar: { value: 2, writable: true }
  });
  const unsafeRec = createUnsafeRec();
  const safeEvaluatorFactory = createSafeEvaluatorFactory(
    unsafeRec,
    safeGlobal
  );
  const safeEvaluator = safeEvaluatorFactory();
  const safeEval = createSafeEval(unsafeRec, safeEvaluator);

  t.equal(safeEval('foo'), 1);
  t.equal(safeEval('bar'), 2);
  t.throws(() => safeEval('none'), ReferenceError);
  t.equal(safeEval('this.foo'), 1);
  t.equal(safeEval('this.bar'), 2);
  t.equal(safeEval('this.none'), undefined);

  t.throws(() => {
    safeGlobal.foo = 3;
  }, TypeError);
  safeGlobal.bar = 4;
  unsafeRec.unsafeGlobal.none = 5;

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
  delete unsafeRec.unsafeGlobal.none;

  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});
