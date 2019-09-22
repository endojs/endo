import test from 'tape';
import sinon from 'sinon';

import { createSafeEvaluatorFactory } from '../../src/safeEvaluator';
import { createSafeFunction } from '../../src/safeFunction';
import { createUnsafeRec } from '../../src/unsafeRec';

test('safeFunction', t => {
  t.plan(6);

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
  const safeFunction = createSafeFunction(unsafeRec, safeEvaluator);

  t.equal(safeFunction('return foo')(), 1);
  t.equal(safeFunction('return bar')(), 2);
  //  t.equal(safeFunction('return this.foo')(), undefined);
  //  t.equal(safeFunction('return this.bar')(), undefined);

  t.throws(() => safeFunction('foo = 3')(), TypeError);
  safeFunction('bar = 4')();

  t.equal(safeFunction('return foo')(), 1);
  t.equal(safeFunction('return bar')(), 4);
  //  t.equal(safeFunction('return this.foo')(), undefined);
  //  t.equal(safeFunction('return this.bar')(), undefined);

  //  safeFunction('this.foo = 5', {})();
  //  safeFunction('this.bar = 6', {})();

  t.equal(safeFunction('return foo')(), 1);
  //  t.equal(safeFunction('return bar')(), 6);
  //  t.equal(safeFunction('return this.foo')(), undefined);
  //  t.equal(safeFunction('return this.bar')(), undefined);

  // const fn = safeFunction(
  //   'flag',
  //   'value',
  //   `
  //     switch(flag) {
  //       case 1:
  //       this.foo = value;
  //       break;

  //       case 2:
  //       this.bar = value;
  //       break;

  //       case 3:
  //       return this.foo;

  //       case 4:
  //       return this.bar;
  //     }
  //   `
  // );

  // t.equal(fn(3), undefined);
  // t.equal(fn(4), undefined);

  // fn(1, 1);
  // fn(2, 2);

  // t.equal(fn(3), 1);
  // t.equal(fn(4), 2);

  // t.equal(fn.foo, 1);
  // t.equal(fn.bar, 2);

  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});
