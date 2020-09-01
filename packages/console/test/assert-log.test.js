// TODO The following two lines came from agoric-sdk with already supports ava.
// Potentially re-enable once SES-shim does too.
// import '@agoric/install-ses';
// import test from 'ava';

// The following lines mentioning tap are what we do for now instead.
import tap from 'tap';
import { assert, details, q } from '@agoric/assert';
import { assertLogs, throwsAndLogs } from './throwsAndLogs.js';

const { test } = tap;

// Self-test of the example from the throwsAndLogs comment.
test('throwsAndLogs with data', t => {
  const obj = {};
  throwsAndLogs(
    t,
    () => {
      console.error('what', obj);
      throw new TypeError('foo');
    },
    /foo/,
    [
      ['error', 'what', obj],
      ['log', 'Caught', '(TypeError#1: foo)'],
      ['log', '(TypeError#1) ERR:', TypeError],
    ],
  );
  t.end();
});

test('throwsAndLogs with error', t => {
  const err = new EvalError('bar');
  throwsAndLogs(
    t,
    () => {
      console.warn('what', err);
      throw new URIError('foo');
    },
    /foo/,
    [
      ['warn', 'what', '(EvalError#1: bar)'],
      ['warn', '(EvalError#1) ERR:', EvalError],
      ['log', 'Caught', '(URIError#2: foo)'],
      ['log', '(URIError#2) ERR:', URIError],
    ],
  );
  t.end();
});

test('assert', t => {
  assert(2 + 3 === 5);

  throwsAndLogs(t, () => assert(false), /Check failed/, [
    ['log', 'Caught', '(RangeError#1: Check failed)'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', 'Check failed'],
  ]);

  throwsAndLogs(t, () => assert(false, 'foo'), /foo/, [
    ['log', 'Caught', '(RangeError#1: foo)'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', 'foo'],
  ]);
  throwsAndLogs(t, () => assert.fail(), /Assert failed/, [
    ['log', 'Caught', '(RangeError#1: Assert failed)'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', 'Assert failed'],
  ]);
  throwsAndLogs(t, () => assert.fail('foo'), /foo/, [
    ['log', 'Caught', '(RangeError#1: foo)'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', 'foo'],
  ]);

  t.end();
});

test('causal tree', t => {
  throwsAndLogs(
    t,
    () => {
      const fooErr = new SyntaxError('foo');
      let err1;
      try {
        assert.fail(details`synful ${fooErr}`);
      } catch (e1) {
        err1 = e1;
      }
      assert.fail(details`because ${err1}`);
    },
    /because/,
    [
      ['log', 'Caught', '(RangeError#1: because (a RangeError))'],
      ['log', '(RangeError#1) ERR:', RangeError],
      [
        'log',
        '(RangeError#1) CAUSE:',
        'because',
        '(RangeError#2: synful (a SyntaxError))',
      ],
      ['log', '(RangeError#2) ERR:', RangeError],
      ['log', '(RangeError#2) CAUSE:', 'synful', '(SyntaxError#3: foo)'],
      ['log', '(SyntaxError#3) ERR:', SyntaxError],
    ],
  );
  t.end();
});

test('if a causal tree falls silently', t => {
  assertLogs(
    t,
    () => {
      try {
        assert(false);
      } catch (err) {
        t.assert(err instanceof RangeError);
      }
    },
    [],
  );
  assertLogs(
    t,
    () => {
      const fooErr = new SyntaxError('foo');
      let err1;
      try {
        assert.fail(details`synful ${fooErr}`);
      } catch (e1) {
        err1 = e1;
      }
      try {
        assert.fail(details`because ${err1}`);
      } catch (e2) {
        t.assert(e2 instanceof RangeError);
      }
    },
    [],
  );
  t.end();
});

test('assert equals', t => {
  assert.equal(2 + 3, 5);
  throwsAndLogs(t, () => assert.equal(5, 6, 'foo'), /foo/, [
    ['log', 'Caught', '(RangeError#1: foo)'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', 'foo'],
  ]);
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, details`${5} !== ${6}`),
    /\(a number\) !== \(a number\)/,
    [
      ['log', 'Caught', '(RangeError#1: (a number) !== (a number))'],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', 5, '!==', 6],
    ],
  );
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, details`${5} !== ${q(6)}`),
    /\(a number\) !== 6/,
    [
      ['log', 'Caught', '(RangeError#1: (a number) !== 6)'],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', 5, '!==', 6],
    ],
  );
  assert.equal(NaN, NaN);
  throwsAndLogs(
    t,
    () => assert.equal(-0, 0),
    /Expected \(a number\) is same as \(a number\)/,
    [
      [
        'log',
        'Caught',
        '(RangeError#1: Expected (a number) is same as (a number))',
      ],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', 'Expected', -0, 'is same as', 0],
    ],
  );
  t.end();
});

test('assert typeof', t => {
  assert.typeof(2, 'number');
  throwsAndLogs(
    t,
    () => assert.typeof(2, 'string'),
    /\(a number\) must be a string/,
    [
      ['log', 'Caught', '(RangeError#1: (a number) must be a string)'],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', 2, 'must be a string'],
    ],
  );
  throwsAndLogs(t, () => assert.typeof(2, 'string', 'foo'), /foo/, [
    ['log', 'Caught', '(RangeError#1: foo)'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', 'foo'],
  ]);
  t.end();
});

test('assert q', t => {
  throwsAndLogs(
    t,
    () => assert.fail(details`<${'bar'},${q('baz')}>`),
    /<\(a string\),"baz">/,
    [
      ['log', 'Caught', '(RangeError#1: <(a string),"baz">)'],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', '<', 'bar', ',', 'baz', '>'],
    ],
  );
  const list = ['a', 'b', 'c'];
  throwsAndLogs(t, () => assert.fail(details`${q(list)}`), /\["a","b","c"\]/, [
    ['log', 'Caught', '(RangeError#1: ["a","b","c"])'],
    ['log', '(RangeError#1) ERR:', RangeError],
    ['log', '(RangeError#1) CAUSE:', list],
  ]);
  const repeat = { x: list, y: list };
  throwsAndLogs(
    t,
    () => assert.fail(details`${q(repeat)}`),
    /{"x":\["a","b","c"\],"y":"<\*\*seen\*\*>"}/,
    [
      ['log', 'Caught', '(RangeError#1: {"x":["a","b","c"],"y":"<**seen**>"})'],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', repeat],
    ],
  );
  // Make it into a cycle
  list[1] = list;
  throwsAndLogs(
    t,
    () => assert.fail(details`${q(list)}`),
    /\["a","<\*\*seen\*\*>","c"\]/,
    [
      ['log', 'Caught', '(RangeError#1: ["a","<**seen**>","c"])'],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', list],
    ],
  );
  throwsAndLogs(
    t,
    () => assert.fail(details`${q(repeat)}`),
    /{"x":\["a","<\*\*seen\*\*>","c"\],"y":"<\*\*seen\*\*>"}/,
    [
      [
        'log',
        'Caught',
        '(RangeError#1: {"x":["a","<**seen**>","c"],"y":"<**seen**>"})',
      ],
      ['log', '(RangeError#1) ERR:', RangeError],
      ['log', '(RangeError#1) CAUSE:', repeat],
    ],
  );
  t.end();
});
