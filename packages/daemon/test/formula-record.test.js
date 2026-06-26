// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { makeFormulaRecord } from '../src/formula-record.js';

/** @import { Formula, FormulaNumber } from '../src/types.js' */

// A representative formula number for tests. The numeric content does
// not matter for this suite; we are exercising the `makeFormulaRecord`
// per-type branches, not the identity layer.
const aNumber = /** @type {FormulaNumber} */ (
  '0000000000000000000000000000000000000000000000000000000000000000' +
    '0000000000000000000000000000000000000000000000000000000000000000'
);

test('makeFormulaRecord default fallthrough returns empty-properties record', t => {
  // Per `formula-record.js` switch's default arm: an unknown formula
  // type surfaces as a bare type-named record with no properties,
  // rather than throwing. The inspector renderer is responsible for
  // displaying the empty state. This test pins that forward-compatibility
  // contract; adding a new formula type to `formula-type.js` without a
  // matching branch in `formula-record.js` should continue to render
  // (it will simply have no properties surfaced) until the new branch
  // is added.

  const fakeFormula = /** @type {Formula} */ (
    /** @type {unknown} */ ({
      type: 'not-a-real-formula-type',
      // Carry an extra field to assert it does NOT leak into the
      // record: the default arm surfaces an empty `properties` map,
      // not a spread of the formula.
      number: aNumber,
      extra: 'should-not-appear',
    })
  );

  const record = makeFormulaRecord(fakeFormula, aNumber);

  t.is(record.type, 'not-a-real-formula-type');
  t.is(record.number, aNumber);
  t.deepEqual(record.properties, {});
});

test('makeFormulaRecord surfaces a mount formula path and readOnly', t => {
  const formula = /** @type {Formula} */ (
    /** @type {unknown} */ ({
      type: 'mount',
      path: '/home/alice/project',
      readOnly: false,
    })
  );

  const record = makeFormulaRecord(formula, aNumber);

  t.is(record.type, 'mount');
  t.deepEqual(record.properties, {
    path: { kind: 'literal', value: '/home/alice/project' },
    readOnly: { kind: 'literal', value: false },
  });
});

test('makeFormulaRecord surfaces a scratch-mount path from mountHostPath', t => {
  const formula = /** @type {Formula} */ (
    /** @type {unknown} */ ({
      type: 'scratch-mount',
      readOnly: true,
    })
  );

  // A scratch-mount carries no path on disk; the host resolves it and
  // passes it in. See `getMountHostPath` in `daemon.js`.
  const record = makeFormulaRecord(formula, aNumber, {
    mountHostPath: '/state/mounts/abc123',
  });

  t.is(record.type, 'scratch-mount');
  t.deepEqual(record.properties, {
    path: { kind: 'literal', value: '/state/mounts/abc123' },
    readOnly: { kind: 'literal', value: true },
  });
});

test('makeFormulaRecord omits a scratch-mount path when unresolved', t => {
  // When the host cannot resolve the path (e.g. the formula was
  // collected since resolution), the property is omitted rather than
  // surfaced as undefined, and the inspector renders its absent state.
  const formula = /** @type {Formula} */ (
    /** @type {unknown} */ ({
      type: 'scratch-mount',
      readOnly: false,
    })
  );

  const record = makeFormulaRecord(formula, aNumber);

  t.is(record.type, 'scratch-mount');
  t.deepEqual(record.properties, {
    readOnly: { kind: 'literal', value: false },
  });
});
