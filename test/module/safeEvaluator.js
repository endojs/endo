import test from 'tape';
import sinon from 'sinon';

import { createSafeEvaluatorFactory } from '../../src/safeEvaluator';

const unsafeRec = {
  unsafeGlobal: {},
  unsafeEval: eval,
  unsafeFunction: Function
};

test('safeEvaluator - no endowments, no options', t => {
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
  const safeEvaluatorFactory = createSafeEvaluatorFactory(
    unsafeRec,
    safeGlobal
  );
  const safeEvaluator = safeEvaluatorFactory();

  t.equal(safeEvaluator('foo'), 1);
  t.equal(safeEvaluator('bar'), 2);
  t.throws(() => safeEvaluator('none'), ReferenceError);
  t.equal(safeEvaluator('this.foo'), 1);
  t.equal(safeEvaluator('this.bar'), 2);
  t.equal(safeEvaluator('this.none'), undefined);

  t.throws(() => {
    safeGlobal.foo = 3;
  }, TypeError);
  safeGlobal.bar = 4;
  unsafeRec.unsafeGlobal.none = 5;

  t.equal(safeEvaluator('foo'), 1);
  t.equal(safeEvaluator('bar'), 4);
  t.equal(safeEvaluator('none'), undefined);
  t.equal(safeEvaluator('this.foo'), 1);
  t.equal(safeEvaluator('this.bar'), 4);
  t.equal(safeEvaluator('this.none'), undefined);

  t.throws(() => safeEvaluator('foo = 6'), TypeError);
  safeEvaluator('bar = 7');
  safeEvaluator('none = 8');

  t.equal(safeEvaluator('foo'), 1);
  t.equal(safeEvaluator('bar'), 7);
  t.equal(safeEvaluator('none'), 8);
  t.equal(safeEvaluator('this.foo'), 1);
  t.equal(safeEvaluator('this.bar'), 7);
  t.equal(safeEvaluator('this.none'), 8);

  t.throws(() => safeEvaluator('foo = 9'), TypeError);
  safeEvaluator('this.bar = 10');
  safeEvaluator('this.none = 11');

  t.equal(safeEvaluator('foo'), 1);
  t.equal(safeEvaluator('bar'), 10);
  t.equal(safeEvaluator('none'), 11);
  t.equal(safeEvaluator('this.foo'), 1);
  t.equal(safeEvaluator('this.bar'), 10);
  t.equal(safeEvaluator('this.none'), 11);

  // Cleanup
  delete unsafeRec.unsafeGlobal.none;

  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});

test('safeEvaluator - options.sloppyGlobalsMode', t => {
  let err;
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
    const sloppyGlobalsMode = true;

    const safeEvaluatorFactory = createSafeEvaluatorFactory(
      unsafeRec,
      safeGlobal,
      {
        sloppyGlobalsMode
      }
    );
    const safeEvaluator = (x, endowments, options) =>
      safeEvaluatorFactory(endowments, options)(x);

    // Evaluate normally.
    t.equal(safeEvaluator('abc', { abc: 123 }), 123, 'endowment eval');
    t.equal(
      safeEvaluator('typeof def', { abc: 123 }),
      'undefined',
      'typeof works'
    );

    // FIXME: We can't have both typeof work and a reference error if no such global.
    t.equal(safeEvaluator('def', { abc: 123 }), undefined, 'no such global');

    t.assert(!('def' in safeGlobal), 'global does not yet exist');
    t.equal(
      safeEvaluator('def = abc + 333', { abc: 123 }),
      456,
      'sloppy global assignment works'
    );

    t.equal(
      safeEvaluator('def', { abc: 123 }),
      456,
      'assigned global persists'
    );
    t.equal(safeGlobal.def, 456, 'assigned global uses our safeGlobal');
  } catch (e) {
    err = e;
  } finally {
    t.error(err);
    // eslint-disable-next-line no-proto
    Function.__proto__.constructor.restore();
    t.end();
  }
});

test('safeEvaluator - global and local options.transforms', t => {
  let err;
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

    const globalTransform = {
      rewrite(rs) {
        if (!rs.endowments.abc) {
          rs.endowments.abc = 123;
        }
        if (rs.src === 'ABC') {
          rs.src = 'abc';
        }
        return rs;
      }
    };

    const safeEvaluatorFactory = createSafeEvaluatorFactory(
      unsafeRec,
      safeGlobal,
      {
        transforms: [globalTransform]
      }
    );
    const safeEvaluator = (x, endowments, options) =>
      safeEvaluatorFactory(endowments, options)(x);

    const localTransform = {
      rewrite(rs) {
        if (rs.src === 'ABC') {
          rs.src = 'def';
        }
        return rs;
      }
    };

    t.equal(safeEvaluator('abc', {}), 123, 'no rewrite');
    t.equal(
      safeEvaluator('ABC', { ABC: 234 }),
      123,
      'globalTransforms rewrite ABC'
    );
    t.equal(
      safeEvaluator('ABC', { ABC: 234, abc: false }),
      123,
      'falsey abc is overridden'
    );
    t.equal(
      safeEvaluator('ABC', { def: 789 }, { transforms: [localTransform] }),
      789,
      `options.transform rewrite ABC first`
    );

    const createTransform = function(val) {
      return {
        rewrite(rs) {
          rs.endowments.abc = val;
          return rs;
        }
      };
    };

    // The endowed abc is overridden by realmTransforms, then optionsEndow.
    t.equal(
      safeEvaluator(
        'abc',
        { ABC: 234, abc: 'notused' },
        { transforms: [createTransform(321)] }
      ),
      321,
      `optionsEndow replace endowment`
    );

    t.equal(
      safeEvaluator(
        'ABC',
        { ABC: 234, abc: 'notused' },
        { transforms: [createTransform(231)] }
      ),
      231,
      `optionsEndow replace rewritten endowment`
    );

    // todo: test chain transforms order preserved
  } catch (e) {
    err = e;
  } finally {
    t.error(err);
    // eslint-disable-next-line no-proto
    Function.__proto__.constructor.restore();
    t.end();
  }
});

test('safeEvaluator - endowments', t => {
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
  const safeEvaluatorFactory = createSafeEvaluatorFactory(
    unsafeRec,
    safeGlobal
  );
  const endowments = { foo: 3, bar: 4 };

  t.equal(safeEvaluatorFactory({})('foo'), 1);
  t.equal(safeEvaluatorFactory({})('bar'), 2);

  t.equal(safeEvaluatorFactory(endowments)('foo'), 3);
  t.equal(safeEvaluatorFactory(endowments)('bar'), 4);

  t.throws(() => safeEvaluatorFactory({})('foo = 5'), TypeError);
  safeEvaluatorFactory({})('bar = 6');

  t.equal(safeEvaluatorFactory({})('foo'), 1);
  t.equal(safeEvaluatorFactory({})('bar'), 6);

  t.equal(safeEvaluatorFactory(endowments)('foo = 7; foo'), 7);
  t.equal(safeEvaluatorFactory(endowments)('bar = 8; bar'), 8);

  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});

test('safeEvaluator - broken unsafeFunction', t => {
  t.plan(1);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });
  // Prevent output
  sinon.stub(console, 'error').callsFake();
  // A function that returns a function that always throw.
  function unsafeFunction() {
    return function() {
      return function() {
        throw new Error();
      };
    };
  }
  unsafeFunction.prototype = Function.prototype;

  const unsafeRecBroken = { ...unsafeRec, unsafeFunction };
  const safeGlobal = {};

  t.throws(() => {
    // Internally, createSafeEvaluator might use safeEval, so we wrap everything.
    const safeEvaluatorFactory = createSafeEvaluatorFactory(
      unsafeRecBroken,
      safeGlobal
    );
    safeEvaluatorFactory()('true');
  }, /handler did not revoke useUnsafeEvaluator/);

  // eslint-disable-next-line no-console
  console.error.restore();
  // eslint-disable-next-line no-proto
  Function.__proto__.constructor.restore();
});
