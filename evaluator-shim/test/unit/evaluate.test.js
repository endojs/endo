import test from 'tape';
import sinon from 'sinon';
import { performEval } from '../../src/evaluate';

test('performEval - sloppyGlobalsMode', t => {
  t.plan(7);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = {};
  const endowments = { abc: 123 };
  const options = { sloppyGlobalsMode: true };

  t.equal(
    performEval(realmRec, 'typeof def', globalObject, {}, options),
    'undefined',
    'typeof non declared global',
  );
  t.equal(
    performEval(realmRec, 'def', globalObject, {}, options),
    undefined,
    'non declared global do not cause a reference error',
  );

  t.equal(
    performEval(realmRec, 'abc', globalObject, endowments, options),
    123,
    'endowments can be referenced',
  );
  t.equal(
    performEval(realmRec, 'abc', globalObject, {}, options),
    undefined,
    'endowments do not persit',
  );
  t.equal(
    performEval(realmRec, 'def = abc + 333', globalObject, endowments, options),
    456,
    'define global',
  );
  t.equal(
    performEval(realmRec, 'def', globalObject, {}, options),
    456,
    'defined global persists',
  );
  t.equal(globalObject.def, 456, 'assigned global uses the global object');

  sinon.restore();
});

test('performEval - transforms - rewrite source', t => {
  t.plan(4);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = {};
  const endowments = { abc: 123, def: 456 };

  const globalTransforms = [
    {
      rewrite(rs) {
        if (rs.src === 'ABC') {
          rs.src = 'abc';
        }
        return rs;
      },
    },
  ];

  const localTransforms = [
    {
      rewrite(rs) {
        if (rs.src === 'ABC') {
          rs.src = 'def';
        }
        return rs;
      },
    },
  ];

  t.equal(
    performEval(realmRec, 'abc', globalObject, endowments),
    123,
    'no rewrite',
  );

  t.equal(
    performEval(realmRec, 'ABC', globalObject, endowments, {
      globalTransforms,
    }),
    123,
    'globalTransforms rewrite source',
  );
  t.equal(
    performEval(realmRec, 'ABC', globalObject, endowments, { localTransforms }),
    456,
    'localTransforms rewrite source',
  );
  t.equal(
    performEval(realmRec, 'ABC', globalObject, endowments, {
      localTransforms,
      globalTransforms,
    }),
    456,
    'localTransforms rewrite source first',
  );

  sinon.restore();
});

test('performEval - transforms - modify endowments', t => {
  t.plan(5);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = { intrinsics: { eval: unsafeGlobal.eval, Function } }; // bypass esm
  const globalObject = {};

  const globalTransforms = [
    {
      rewrite(rs) {
        if (!rs.endowments.abc) {
          rs.endowments.abc = 123;
        }
        rs.endowments.ABC = 123;
        return rs;
      },
    },
  ];

  const localTransforms = [
    {
      rewrite(rs) {
        if (!rs.endowments.abc) {
          rs.endowments.abc = 456;
        }
        rs.endowments.ABC = 456;
        return rs;
      },
    },
  ];

  t.equal(
    performEval(realmRec, 'abc', globalObject, { abc: 999 }),
    999,
    'no override',
  );

  t.equal(
    performEval(
      realmRec,
      'abc',
      globalObject,
      {},
      {
        globalTransforms,
      },
    ),
    123,
    'globalTransforms override endowments',
  );
  t.equal(
    performEval(realmRec, 'abc', globalObject, {}, { localTransforms }),
    456,
    'localTransforms override endowments',
  );
  t.equal(
    performEval(
      realmRec,
      'abc',
      globalObject,
      {},
      {
        localTransforms,
        globalTransforms,
      },
    ),
    456,
    'localTransforms override endowments first',
  );

  t.equal(
    performEval(
      realmRec,
      'ABC',
      globalObject,
      {},
      {
        localTransforms,
        globalTransforms,
      },
    ),
    123,
    'globalTransforms override endowments last',
  );
  sinon.restore();
});
