import tap from 'tap';
import sinon from 'sinon';
import { performEval } from '../src/evaluate.js';
import stubFunctionConstructors from './stub-function-constructors.js';

const { test } = tap;

test('performEval - sloppyGlobalsMode', t => {
  t.plan(7);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const globalObject = {};
  const endowments = { abc: 123 };
  const options = { sloppyGlobalsMode: true };

  t.equal(
    performEval('typeof def', globalObject, {}, options),
    'undefined',
    'typeof non declared global',
  );
  t.equal(
    performEval('def', globalObject, {}, options),
    undefined,
    'non declared global do not cause a reference error',
  );

  t.equal(
    performEval('abc', globalObject, endowments, options),
    123,
    'endowments can be referenced',
  );
  t.equal(
    performEval('abc', globalObject, {}, options),
    undefined,
    'endowments do not persit',
  );
  t.equal(
    performEval('def = abc + 333', globalObject, endowments, options),
    456,
    'define global',
  );
  t.equal(
    performEval('def', globalObject, {}, options),
    456,
    'defined global persists',
  );
  t.equal(globalObject.def, 456, 'assigned global uses the global object');

  sinon.restore();
});

test('performEval - transforms - rewrite source', t => {
  t.plan(4);

  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const globalObject = {};
  const endowments = { abc: 123, def: 456 };

  const globalTransforms = [
    source => {
      if (source === 'ABC') {
        source = 'abc';
      }
      return source;
    },
  ];

  const localTransforms = [
    source => {
      if (source === 'ABC') {
        return 'def';
      }
      return source;
    },
  ];

  t.equal(performEval('abc', globalObject, endowments), 123, 'no rewrite');

  t.equal(
    performEval('ABC', globalObject, endowments, {
      globalTransforms,
    }),
    123,
    'globalTransforms rewrite source',
  );
  t.equal(
    performEval('ABC', globalObject, endowments, {
      localTransforms,
    }),
    456,
    'localTransforms rewrite source',
  );
  t.equal(
    performEval('ABC', globalObject, endowments, {
      localTransforms,
      globalTransforms,
    }),
    456,
    'localTransforms rewrite source first',
  );

  sinon.restore();
});
