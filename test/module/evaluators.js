import test from 'tape';
import sinon from 'sinon';
import {
  createSafeEvaluatorFactory,
  createSafeEvaluator,
  createSafeEvaluatorWhichTakesEndowments,
  createFunctionEvaluator
} from '../../src/evaluators';

const unsafeRecord = {
  unsafeGlobal: {},
  unsafeEval: eval,
  unsafeFunction: Function
};

test('createSafeEvaluator', t => {
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
  const safeEval = createSafeEvaluator(
    createSafeEvaluatorFactory(unsafeRecord, safeGlobal)
  );

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
  unsafeRecord.unsafeGlobal.none = 5;

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

  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});

test('createSafeEvaluatorWhichTakesEndowments - options.sloppyGlobals', t => {
  try {
    // Mimic repairFunctions.
    // eslint-disable-next-line no-proto
    sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
      throw new TypeError();
    });

    const safeGlobal = Object.create(null, {
      foo: { value: 1 },
      bar: { value: 2, writable: true }
    });

    const realmTransforms = [];
    const sloppyGlobals = true;

    const safeEval = createSafeEvaluatorWhichTakesEndowments(
      createSafeEvaluatorFactory(
        unsafeRecord,
        safeGlobal,
        realmTransforms,
        sloppyGlobals
      )
    );

    // Evaluate normally.
    t.equal(safeEval('abc', { abc: 123 }), 123, 'endowment eval');
    t.equal(safeEval('typeof def', { abc: 123 }), 'undefined', 'typeof works');

    // FIXME: We can't have both typeof work and a reference error if no such global.
    t.equal(safeEval('def', { abc: 123 }), undefined, 'no such global');

    t.assert(!('def' in safeGlobal), 'global does not yet exist');
    t.equal(
      safeEval('def = abc + 333', { abc: 123 }),
      456,
      'sloppy global assignment works'
    );

    t.equal(safeEval('def', { abc: 123 }), 456, 'assigned global persists');
    t.equal(safeGlobal.def, 456, 'assigned global uses our safeGlobal');
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    // eslint-disable-next-line no-proto
    Function.__proto__.constructor.restore();
    t.end();
  }
});

test('createSafeEvaluatorWhichTakesEndowments - options.transforms', t => {
  try {
    // Mimic repairFunctions.
    // eslint-disable-next-line no-proto
    sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
      throw new TypeError();
    });

    const safeGlobal = Object.create(null, {
      foo: { value: 1 },
      bar: { value: 2, writable: true }
    });

    const realmTransforms = [
      {
        rewrite(ss) {
          if (!ss.endowments.abc) {
            ss.endowments.abc = 123;
          }
          return { ...ss, src: ss.src === 'ABC' ? 'abc' : ss.src };
        }
      }
    ];

    const safeEval = createSafeEvaluatorWhichTakesEndowments(
      createSafeEvaluatorFactory(unsafeRecord, safeGlobal, realmTransforms)
    );
    const options = {
      transforms: [
        {
          rewrite(ss) {
            return { ...ss, src: ss.src === 'ABC' ? 'def' : ss.src };
          }
        }
      ]
    };

    t.equal(safeEval('abc', {}), 123, 'no rewrite');
    t.equal(safeEval('ABC', { ABC: 234 }), 123, 'realmTransforms rewrite ABC');
    t.equal(
      safeEval('ABC', { ABC: 234, abc: false }),
      123,
      'falsey abc is overridden'
    );
    t.equal(
      safeEval('ABC', { def: 789 }, options),
      789,
      `options.transform rewrite ABC first`
    );

    const optionsEndow = abcVal => ({
      transforms: [
        {
          rewrite(ss) {
            ss.endowments.abc = abcVal;
            return ss;
          }
        }
      ]
    });

    // The endowed abc is overridden by realmTransforms, then optionsEndow.
    t.equal(
      safeEval('abc', { ABC: 234, abc: 'notused' }, optionsEndow(321)),
      321,
      `optionsEndow replace endowment`
    );

    t.equal(
      safeEval('ABC', { ABC: 234, abc: 'notused' }, optionsEndow(231)),
      231,
      `optionsEndow replace rewritten endowment`
    );

    // eslint-disable-next-line no-proto
    Function.__proto__.constructor.restore();
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('createSafeEvaluatorWhichTakesEndowments', t => {
  t.plan(9);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  const safeGlobal = Object.create(null, {
    foo: { value: 1 },
    bar: { value: 2, writable: true }
  });
  const safeEval = createSafeEvaluatorWhichTakesEndowments(
    createSafeEvaluatorFactory(unsafeRecord, safeGlobal)
  );
  const endowments = { foo: 3, bar: 4 };

  t.equal(safeEval('foo', {}), 1);
  t.equal(safeEval('bar', {}), 2);

  t.equal(safeEval('foo', endowments), 1);
  t.equal(safeEval('bar', endowments), 4);

  t.throws(() => safeEval('foo = 5', {}), TypeError);
  safeEval('bar = 6', {});

  t.equal(safeEval('foo', {}), 1);
  t.equal(safeEval('bar', {}), 6);

  t.throws(() => safeEval('foo = 7', endowments), TypeError);
  t.throws(() => safeEval('bar = 8', endowments), TypeError);

  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});

test('createFunctionEvaluator', t => {
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
  const safeEval = createSafeEvaluator(
    createSafeEvaluatorFactory(unsafeRecord, safeGlobal)
  );
  const safeFunction = createFunctionEvaluator(unsafeRecord, safeEval);

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

test('createSafeEvaluator - broken', t => {
  t.plan(1);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });
  // Prevent outpur
  sinon.stub(console, 'error').callsFake();

  // A function that returns a function that always throw;
  function unsafeFunction() {
    return function() {
      return function() {
        throw new Error();
      };
    };
  }
  unsafeFunction.prototype = Function.prototype;

  const unsafeRecord = { unsafeFunction, unsafeEval: eval };
  const safeGlobal = {};

  t.throws(() => {
    // Internally, createSafeEvaluator might use safeEval, so we wrap everything.
    const safeEval = createSafeEvaluator(
      createSafeEvaluatorFactory(unsafeRecord, safeGlobal)
    );
    safeEval('true');
  }, /handler did not revoke useUnsafeEvaluator/);

  // eslint-disable-next-line no-console
  console.error.restore();
  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});
