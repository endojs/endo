import '../index.js';
import './lockdown-safe.js';
import test from 'ava';
import { performEval } from '../src/evaluate.js';

test('performEval - default (non-sloppy, no localObject)', t => {
  t.plan(6);

  const globalObject = { abc: 123 };
  const evaluate = source => performEval(source, globalObject);

  t.is(evaluate('typeof def'), 'undefined', 'typeof non declared global');

  t.throws(
    () => evaluate('def'),
    { instanceOf: ReferenceError },
    'non declared global cause a reference error',
  );

  t.is(evaluate('abc'), 123, 'globals can be referenced');
  t.is(
    evaluate('this.def = abc + 333'),
    456,
    'globals can be defined through `this`',
  );
  t.is(evaluate('def'), 456, 'defined global persists');
  t.is(globalObject.def, 456, 'assigned global uses the global object');
});

test('performEval - sloppyGlobalsMode', t => {
  t.plan(5);

  const globalObject = {};
  const evaluate = source =>
    performEval(source, globalObject, {}, { sloppyGlobalsMode: true });

  t.is(evaluate('typeof def'), 'undefined', 'typeof non declared global');
  t.is(
    evaluate('def'),
    undefined,
    'non declared global do not cause a reference error',
  );

  t.is(evaluate('def = 456'), 456, 'define global through sloppy assignment');
  t.is(evaluate('def'), 456, 'defined global persists');
  t.is(globalObject.def, 456, 'assigned global uses the global object');
});

test('performEval - endowments', t => {
  t.plan(3);

  const globalObject = {};
  const endowments = { abc: 123 };
  const endowedEvaluate = source =>
    performEval(source, globalObject, endowments);
  const evaluate = source => performEval(source, globalObject);

  t.is(endowedEvaluate('abc'), 123, 'endowments can be referenced');
  t.is(endowedEvaluate('abc += 333'), 456, 'endowments can be mutated');
  t.throws(
    () => evaluate('abc'),
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

  const evaluate = (source, options = {}) =>
    performEval(source, globalObject, endowments, {
      ...options,
      globalTransforms,
    });

  t.is(evaluate('ABC'), 123, 'globalTransforms rewrite source');
  t.is(
    evaluate('ABC', {
      localTransforms,
    }),
    456,
    'localTransforms rewrite source first',
  );
});
