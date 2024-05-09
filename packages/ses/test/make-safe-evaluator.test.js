import '../index.js';
import './lockdown-safe.js';
import test from 'ava';
import { makeSafeEvaluator } from '../src/make-safe-evaluator.js';

test('safeEvaluate - default (non-sloppy, no moduleLexicals)', t => {
  t.plan(6);

  const globalObject = { abc: 123 };
  const { safeEvaluate: evaluate } = makeSafeEvaluator({ globalObject });

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

test('safeEvaluate - sloppyGlobalsMode', t => {
  t.plan(5);

  const globalObject = {};
  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    sloppyGlobalsMode: true,
  });

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

test('safeEvaluate - module lexicals', t => {
  t.plan(3);

  const globalObject = {};
  const moduleLexicals = { abc: 123 };
  const { safeEvaluate: endowedEvaluate } = makeSafeEvaluator({
    globalObject,
    moduleLexicals,
  });
  const { safeEvaluate: evaluate } = makeSafeEvaluator({ globalObject });

  t.is(endowedEvaluate('abc'), 123, 'module lexicals can be referenced');
  t.is(endowedEvaluate('abc += 333'), 456, 'module lexicals can be mutated');
  t.throws(
    () => evaluate('abc'),
    { instanceOf: ReferenceError },
    'module lexicals do not affect other evaluate scopes with same globalObject (do not persist)',
  );
});

test('safeEvaluate - transforms - rewrite source', t => {
  t.plan(2);

  const globalObject = {};
  const moduleLexicals = { abc: 123, def: 456 };

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

  const { safeEvaluate: evaluate } = makeSafeEvaluator({
    globalObject,
    moduleLexicals,
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
