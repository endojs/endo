// TODO The following two lines came from agoric-sdk with already supports ava.
// Potentially re-enable once SES-shim does too.
// import '@agoric/install-ses';
// import test from 'ava';

// The following lines mentioning tap are what we do for now instead.
import tap from 'tap';
import { assert, details, q } from '@agoric/assert';
import { assertLogs, throwsAndLogs } from './throws-and-logs.js';

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
      ['log', 'Caught', TypeError],
    ],
  );
  throwsAndLogs(
    t,
    () => {
      console.error('what', obj);
      throw new TypeError('foo');
    },
    /foo/,
    [
      ['error', 'what', obj],
      ['log', 'Caught', '(TypeError#1)'],
      ['info', 'TypeError#1: foo'],
      ['info', 'stack of TypeError'],
    ],
    { wrapWithCausal: true },
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
      ['warn', 'what', EvalError],
      ['log', 'Caught', URIError],
    ],
  );
  t.end();
});

test('assert', t => {
  assert(2 + 3 === 5);

  throwsAndLogs(t, () => assert(false), /Check failed/, [
    [RangeError, 'ERROR_MESSAGE:', 'Check failed'],
    ['log', 'Caught', RangeError],
  ]);
  throwsAndLogs(
    t,
    () => assert(false),
    /Check failed/,
    [
      ['log', 'Caught', '(RangeError#1)'],
      ['info', 'RangeError#1:', 'Check failed'],
      ['info', 'stack of RangeError'],
    ],
    { wrapWithCausal: true },
  );

  throwsAndLogs(t, () => assert(false, 'foo'), /foo/, [
    [RangeError, 'ERROR_MESSAGE:', 'foo'],
    ['log', 'Caught', RangeError],
  ]);
  throwsAndLogs(t, () => assert.fail(), /Assert failed/, [
    [RangeError, 'ERROR_MESSAGE:', 'Assert failed'],
    ['log', 'Caught', RangeError],
  ]);
  throwsAndLogs(t, () => assert.fail('foo'), /foo/, [
    [RangeError, 'ERROR_MESSAGE:', 'foo'],
    ['log', 'Caught', RangeError],
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
      [RangeError, 'ERROR_MESSAGE:', 'synful', SyntaxError],
      [RangeError, 'ERROR_MESSAGE:', 'because', RangeError],
      ['log', 'Caught', RangeError],
    ],
  );
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
      ['log', 'Caught', '(RangeError#1)'],
      ['info', 'RangeError#1:', 'because', '(RangeError#2)'],
      ['info', 'stack of RangeError'],
      ['info', 'RangeError#2:', 'synful', '(SyntaxError#3)'],
      ['info', 'stack of RangeError'],
      ['info', 'SyntaxError#3: foo'],
      ['info', 'stack of SyntaxError'],
    ],
    { wrapWithCausal: true },
  );
  t.end();
});

test('a causal tree falls silently', t => {
  assertLogs(
    t,
    () => {
      try {
        assert(false);
      } catch (err) {
        t.assert(err instanceof RangeError);
      }
    },
    [[RangeError, 'ERROR_MESSAGE:', 'Check failed']],
  );
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
    { wrapWithCausal: true },
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
    [
      [RangeError, 'ERROR_MESSAGE:', 'synful', SyntaxError],
      [RangeError, 'ERROR_MESSAGE:', 'because', RangeError],
    ],
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
    { wrapWithCausal: true },
  );
  t.end();
});

test('assert equals', t => {
  assert.equal(2 + 3, 5);
  throwsAndLogs(t, () => assert.equal(5, 6, 'foo'), /foo/, [
    [RangeError, 'ERROR_MESSAGE:', 'foo'],
    ['log', 'Caught', RangeError],
  ]);
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, details`${5} !== ${6}`),
    /\(a number\) !== \(a number\)/,
    [
      [RangeError, 'ERROR_MESSAGE:', 5, '!==', 6],
      ['log', 'Caught', RangeError],
    ],
  );
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, details`${5} !== ${q(6)}`),
    /\(a number\) !== 6/,
    [
      [RangeError, 'ERROR_MESSAGE:', 5, '!==', 6],
      ['log', 'Caught', RangeError],
    ],
  );
  assert.equal(NaN, NaN);
  throwsAndLogs(
    t,
    () => assert.equal(-0, 0),
    /Expected \(a number\) is same as \(a number\)/,
    [
      [RangeError, 'ERROR_MESSAGE:', 'Expected', -0, 'is same as', 0],
      ['log', 'Caught', RangeError],
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
      [RangeError, 'ERROR_MESSAGE:', 2, 'must be a string'],
      ['log', 'Caught', RangeError],
    ],
  );
  throwsAndLogs(t, () => assert.typeof(2, 'string', 'foo'), /foo/, [
    [RangeError, 'ERROR_MESSAGE:', 'foo'],
    ['log', 'Caught', RangeError],
  ]);
  t.end();
});

test('assert q', t => {
  throwsAndLogs(
    t,
    () => assert.fail(details`<${'bar'},${q('baz')}>`),
    /<\(a string\),"baz">/,
    [
      [RangeError, 'ERROR_MESSAGE:', '<', 'bar', ',', 'baz', '>'],
      ['log', 'Caught', RangeError],
    ],
  );
  const list = ['a', 'b', 'c'];
  throwsAndLogs(t, () => assert.fail(details`${q(list)}`), /\["a","b","c"\]/, [
    [RangeError, 'ERROR_MESSAGE:', list],
    ['log', 'Caught', RangeError],
  ]);
  const repeat = { x: list, y: list };
  throwsAndLogs(
    t,
    () => assert.fail(details`${q(repeat)}`),
    /{"x":\["a","b","c"\],"y":"<\*\*seen\*\*>"}/,
    [
      [RangeError, 'ERROR_MESSAGE:', repeat],
      ['log', 'Caught', RangeError],
    ],
  );
  // Make it into a cycle
  list[1] = list;
  throwsAndLogs(
    t,
    () => assert.fail(details`${q(list)}`),
    /\["a","<\*\*seen\*\*>","c"\]/,
    [
      [RangeError, 'ERROR_MESSAGE:', list],
      ['log', 'Caught', RangeError],
    ],
  );
  throwsAndLogs(
    t,
    () => assert.fail(details`${q(repeat)}`),
    /{"x":\["a","<\*\*seen\*\*>","c"\],"y":"<\*\*seen\*\*>"}/,
    [
      [RangeError, 'ERROR_MESSAGE:', repeat],
      ['log', 'Caught', RangeError],
    ],
  );
  t.end();
});
