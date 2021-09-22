import '../index.js';
import './lockdown-safe.js';
import test from 'ava';
import { performEval } from '../src/evaluate.js';

test('performEval - default (non-sloppy, no localObject)', t => {
  t.plan(6);

  const globalObject = { abc: 123 };

  t.is(
    performEval('typeof def', globalObject),
    'undefined',
    'typeof non declared global',
  );

  t.throws(
    () => performEval('def', globalObject),
    { instanceOf: ReferenceError },
    'non declared global cause a reference error',
  );

  t.is(performEval('abc', globalObject), 123, 'globals can be referenced');
  t.is(
    performEval('this.def = abc + 333', globalObject),
    456,
    'globals can be defined through `this`',
  );
  t.is(performEval('def', globalObject), 456, 'defined global persists');
  t.is(globalObject.def, 456, 'assigned global uses the global object');
});

test('performEval - sloppyGlobalsMode', t => {
  t.plan(5);

  const globalObject = {};
  const options = { sloppyGlobalsMode: true };

  t.is(
    performEval('typeof def', globalObject, {}, options),
    'undefined',
    'typeof non declared global',
  );
  t.is(
    performEval('def', globalObject, {}, options),
    undefined,
    'non declared global do not cause a reference error',
  );

  t.is(
    performEval('def = 456', globalObject, {}, options),
    456,
    'define global through sloppy assignment',
  );
  t.is(
    performEval('def', globalObject, {}, options),
    456,
    'defined global persists',
  );
  t.is(globalObject.def, 456, 'assigned global uses the global object');
});

test('performEval - endowments', t => {
  t.plan(3);

  const globalObject = {};
  const endowments = { abc: 123 };

  t.is(
    performEval('abc', globalObject, endowments),
    123,
    'endowments can be referenced',
  );
  t.is(
    performEval('abc += 333', globalObject, endowments),
    456,
    'endowments can be mutated',
  );
  t.throws(
    () => performEval('abc', globalObject),
    { instanceOf: ReferenceError },
    'endowments do not affect other evaluate scopes with same globalObject (do not persist)',
  );
});

test('performEval - transforms - rewrite source', t => {
  t.plan(2);

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

  t.is(
    performEval('ABC', globalObject, endowments, {
      globalTransforms,
    }),
    123,
    'globalTransforms rewrite source',
  );
  t.is(
    performEval('ABC', globalObject, endowments, {
      localTransforms,
      globalTransforms,
    }),
    456,
    'localTransforms rewrite source first',
  );
});
