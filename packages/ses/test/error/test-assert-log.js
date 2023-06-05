import test from 'ava';
import { assertLogs, throwsAndLogs } from './throws-and-logs.js';
import { assert } from '../../src/error/assert.js';

const { details: d, quote: q, bare: b } = assert;

// Self-test of the example from the throwsAndLogs comment.
test('throwsAndLogs with data', t => {
  const obj = {};
  throwsAndLogs(
    t,
    () => {
      console.error('what', obj);
      throw TypeError('foo');
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
      throw TypeError('foo');
    },
    /foo/,
    [
      ['error', 'what', obj],
      ['log', 'Caught', '(TypeError#1)'],
      ['log', 'TypeError#1:', 'foo'],
      ['log', 'stack of TypeError\n'],
    ],
    { wrapWithCausal: true },
  );
});

test('throwsAndLogs with error', t => {
  const err = EvalError('bar');
  throwsAndLogs(
    t,
    () => {
      console.warn('what', err);
      throw URIError('foo');
    },
    /foo/,
    [
      ['warn', 'what', EvalError],
      ['log', 'Caught', URIError],
    ],
  );
});

test('assert', t => {
  assert(2 + 3 === 5);

  throwsAndLogs(t, () => assert(false), /Check failed/, [
    ['log', 'Caught', Error],
  ]);
  throwsAndLogs(
    t,
    () => assert(false),
    /Check failed/,
    [
      ['log', 'Caught', '(Error#1)'],
      ['log', 'Error#1:', 'Check failed'],
      ['log', 'stack of Error\n'],
    ],
    { wrapWithCausal: true },
  );

  throwsAndLogs(t, () => assert(false, 'foo'), /foo/, [
    ['log', 'Caught', Error],
  ]);
  throwsAndLogs(t, () => assert.fail(), /Check failed/, [
    ['log', 'Caught', Error],
  ]);
  throwsAndLogs(t, () => assert.fail('foo'), /foo/, [['log', 'Caught', Error]]);
});

test('causal tree', t => {
  throwsAndLogs(
    t,
    () => {
      const fooErr = SyntaxError('foo');
      let err1;
      try {
        assert.fail(d`synful ${fooErr}`);
      } catch (e1) {
        err1 = e1;
      }
      assert.fail(d`because ${err1}`);
    },
    /because/,
    [['log', 'Caught', Error]],
  );
  throwsAndLogs(
    t,
    () => {
      const fooErr = SyntaxError('foo');
      let err1;
      try {
        assert.fail(d`synful ${fooErr}`);
      } catch (e1) {
        err1 = e1;
      }
      assert.fail(d`because ${err1}`);
    },
    /because/,
    [
      ['log', 'Caught', '(Error#1)'],
      ['log', 'Error#1:', 'because', '(Error#2)'],
      ['log', 'stack of Error\n'],
      ['group', 'Nested error under Error#1'],
      ['log', 'Error#2:', 'synful', '(SyntaxError#3)'],
      ['log', 'stack of Error\n'],
      ['group', 'Nested error under Error#2'],
      ['log', 'SyntaxError#3:', 'foo'],
      ['log', 'stack of SyntaxError\n'],
      ['groupEnd'],
      ['groupEnd'],
    ],
    { wrapWithCausal: true },
  );
});

test('a causal tree falls silently', t => {
  assertLogs(
    t,
    () => {
      try {
        assert(false);
      } catch (err) {
        t.assert(err instanceof Error);
      }
    },
    [],
  );
  assertLogs(
    t,
    () => {
      try {
        assert(false);
      } catch (err) {
        t.assert(err instanceof Error);
      }
    },
    [],
    { wrapWithCausal: true },
  );
  assertLogs(
    t,
    () => {
      const fooErr = SyntaxError('foo');
      let err1;
      try {
        assert.fail(d`synful ${fooErr}`);
      } catch (e1) {
        err1 = e1;
      }
      try {
        assert.fail(d`because ${err1}`);
      } catch (e2) {
        t.assert(e2 instanceof Error);
      }
    },
    [],
  );
  assertLogs(
    t,
    () => {
      const fooErr = SyntaxError('foo');
      let err1;
      try {
        assert.fail(d`synful ${fooErr}`);
      } catch (e1) {
        err1 = e1;
      }
      try {
        assert.fail(d`because ${err1}`);
      } catch (e2) {
        t.assert(e2 instanceof Error);
      }
    },
    [],
    { wrapWithCausal: true },
  );
});

test('assert.equal', t => {
  assert.equal(2 + 3, 5);
  throwsAndLogs(
    t,
    () => assert.equal(5, 6),
    /Expected \(a number\) is same as \(a number\)/,
    [['log', 'Caught', Error]],
  );
  throwsAndLogs(
    t,
    () => assert.equal(5, 6),
    /Expected \(a number\) is same as \(a number\)/,
    [
      ['log', 'Caught', '(RangeError#1)'],
      ['log', 'RangeError#1:', 'Expected', 5, 'is same as', 6],
      ['log', 'stack of RangeError\n'],
    ],
    { wrapWithCausal: true },
  );
  throwsAndLogs(t, () => assert.equal(5, 6, 'foo'), /foo/, [
    ['log', 'Caught', Error],
  ]);
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, 'foo'),
    /foo/,
    [
      ['log', 'Caught', '(RangeError#1)'],
      ['log', 'RangeError#1:', 'foo'],
      ['log', 'stack of RangeError\n'],
    ],
    { wrapWithCausal: true },
  );
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, d`${5} !== ${6}`),
    /\(a number\) !== \(a number\)/,
    [['log', 'Caught', Error]],
  );
  throwsAndLogs(
    t,
    () => assert.equal(5, 6, d`${5} !== ${q(6)}`),
    /\(a number\) !== 6/,
    [['log', 'Caught', Error]],
  );
  assert.equal(NaN, NaN);
  throwsAndLogs(
    t,
    () => assert.equal(-0, 0),
    /Expected \(a number\) is same as \(a number\)/,
    [
      ['log', 'Caught', '(RangeError#1)'],
      ['log', 'RangeError#1:', 'Expected', -0, 'is same as', 0],
      ['log', 'stack of RangeError\n'],
    ],
    { wrapWithCausal: true },
  );
});

test('assert.typeof', t => {
  assert.typeof(2, 'number');
  throwsAndLogs(
    t,
    () => assert.typeof(2, 'string'),
    /\(a number\) must be a string/,
    [['log', 'Caught', TypeError]],
  );
  throwsAndLogs(t, () => assert.typeof(2, 'string', 'foo'), /foo/, [
    ['log', 'Caught', TypeError],
  ]);
});

test('assert.error default type', t => {
  const err = assert.error(d`<${'bar'},${q('baz')}>`);
  t.is(err.message, '<(a string),"baz">');
  t.is(err.name, 'Error');
  throwsAndLogs(
    t,
    () => {
      throw err;
    },
    /<\(a string\),"baz">/,
    [['log', 'Caught', Error]],
  );
  throwsAndLogs(
    t,
    () => {
      throw err;
    },
    /<\(a string\),"baz">/,
    [
      ['log', 'Caught', '(Error#1)'],
      ['log', 'Error#1:', '<', 'bar', ',', 'baz', '>'],
      ['log', 'stack of Error\n'],
    ],
    { wrapWithCausal: true },
  );
});

test('assert.error explicit type', t => {
  const err = assert.error(d`<${'bar'},${q('baz')}>`, URIError);
  t.is(err.message, '<(a string),"baz">');
  t.is(err.name, 'URIError');
  throwsAndLogs(
    t,
    () => {
      throw err;
    },
    /<\(a string\),"baz">/,
    [['log', 'Caught', URIError]],
  );
  throwsAndLogs(
    t,
    () => {
      throw err;
    },
    /<\(a string\),"baz">/,
    [
      ['log', 'Caught', '(URIError#1)'],
      ['log', 'URIError#1:', '<', 'bar', ',', 'baz', '>'],
      ['log', 'stack of URIError\n'],
    ],
    { wrapWithCausal: true },
  );
});

test('assert.error named', t => {
  const err = assert.error(d`<${'bar'},${q('baz')}>`, URIError, {
    errorName: 'Foo-Err',
  });
  t.is(err.message, '<(a string),"baz">');
  t.is(err.name, 'URIError');
  throwsAndLogs(
    t,
    () => {
      throw err;
    },
    /<\(a string\),"baz">/,
    [['log', 'Caught', URIError]],
  );
  throwsAndLogs(
    t,
    () => {
      throw err;
    },
    /<\(a string\),"baz">/,
    [
      ['log', 'Caught', '(Foo-Err#2)'],
      ['log', 'Foo-Err#2:', '<', 'bar', ',', 'baz', '>'],
      ['log', 'stack of URIError\n'],
    ],
    { wrapWithCausal: true },
  );
});

test('assert.quote', t => {
  throwsAndLogs(
    t,
    () => assert.fail(d`<${'bar'},${q('baz')}>`),
    /<\(a string\),"baz">/,
    [['log', 'Caught', Error]],
  );
  throwsAndLogs(
    t,
    () => assert.fail(d`<${'bar'},${q('baz')}>`),
    /<\(a string\),"baz">/,
    [
      ['log', 'Caught', '(Error#1)'],
      ['log', 'Error#1:', '<', 'bar', ',', 'baz', '>'],
      ['log', 'stack of Error\n'],
    ],
    { wrapWithCausal: true },
  );
  const list = ['a', 'b', 'c'];
  throwsAndLogs(t, () => assert.fail(d`${q(list)}`), /\["a","b","c"\]/, [
    ['log', 'Caught', Error],
  ]);
  const repeat = { x: list, y: list };
  throwsAndLogs(
    t,
    () => assert.fail(d`${q(repeat)}`),
    /{"x":\["a","b","c"\],"y":"\[Seen\]"}/,
    [['log', 'Caught', Error]],
  );
  // Make it into a cycle
  list[1] = list;
  throwsAndLogs(t, () => assert.fail(d`${q(list)}`), /\["a","\[Seen\]","c"\]/, [
    ['log', 'Caught', Error],
  ]);
  throwsAndLogs(
    t,
    () => assert.fail(d`${q(repeat)}`),
    /{"x":\["a","\[Seen\]","c"\],"y":"\[Seen\]"}/,
    [['log', 'Caught', Error]],
  );
});

test('assert.bare', t => {
  throwsAndLogs(t, () => assert.fail(d`${b('foo')}`), 'foo', [
    ['log', 'Caught', Error],
  ]);
  // Spaces are allowed in bare values.
  throwsAndLogs(t, () => assert.fail(d`${b('foo bar')}`), 'foo bar', [
    ['log', 'Caught', Error],
  ]);
  // Multiple consecutive spaces are disallowed and fall back to quote.
  throwsAndLogs(t, () => assert.fail(d`${b('foo  bar')}`), '"foo  bar"', [
    ['log', 'Caught', Error],
  ]);
  // Strings with non-word punctuation also fall back.
  throwsAndLogs(t, () => assert.fail(d`${b('foo%bar')}`), '"foo%bar"', [
    ['log', 'Caught', Error],
  ]);
  // Non-strings also fall back.
  throwsAndLogs(t, () => assert.fail(d`${b(undefined)}`), '"[undefined]"', [
    ['log', 'Caught', Error],
  ]);
});

test('assert.quote as best efforts stringify', t => {
  t.is(`${q('baz')}`, '"baz"');
  const list = ['a', 'b', 'c'];
  t.is(`${q(list)}`, '["a","b","c"]');
  const repeat = { x: list, y: list };
  t.is(`${q(repeat)}`, '{"x":["a","b","c"],"y":"[Seen]"}');
  list[1] = list;
  t.is(`${q(list)}`, '["a","[Seen]","c"]');
  t.is(`${q(repeat)}`, '{"x":["a","[Seen]","c"],"y":"[Seen]"}');
  t.is(
    `${q(repeat, ' ')}`,
    `\
{
 "x": [
  "a",
  "[Seen]",
  "c"
 ],
 "y": "[Seen]"
}`,
  );

  const superTagged = { [Symbol.toStringTag]: 'Tagged' };
  const subTagged = { __proto__: superTagged };
  const subTaggedNonEmpty = { __proto__: superTagged, foo: 'x' };

  const challenges = [
    Promise.resolve('x'),
    function foo() {},
    '[hilbert]',
    undefined,
    'undefined',
    URIError('wut?'),
    [33n, Symbol('foo'), Symbol.for('bar'), Symbol.asyncIterator],
    {
      NaN,
      Infinity,
      neg: -Infinity,
    },
    2 ** 54,
    { superTagged, subTagged, subTaggedNonEmpty },
    { __proto__: null },
  ];
  t.is(
    `${q(challenges)}`,
    '["[Promise]","[Function foo]","[[hilbert]]","[undefined]","undefined","[URIError: wut?]",["[33n]","[Symbol(foo)]","[Symbol(bar)]","[Symbol(Symbol.asyncIterator)]"],{"NaN":"[NaN]","Infinity":"[Infinity]","neg":"[-Infinity]"},18014398509481984,{"superTagged":"[Tagged]","subTagged":"[Tagged]","subTaggedNonEmpty":"[Tagged]"},{}]',
  );
  t.is(
    `${q(challenges, '  ')}`,
    `\
[
  "[Promise]",
  "[Function foo]",
  "[[hilbert]]",
  "[undefined]",
  "undefined",
  "[URIError: wut?]",
  [
    "[33n]",
    "[Symbol(foo)]",
    "[Symbol(bar)]",
    "[Symbol(Symbol.asyncIterator)]"
  ],
  {
    "NaN": "[NaN]",
    "Infinity": "[Infinity]",
    "neg": "[-Infinity]"
  },
  18014398509481984,
  {
    "superTagged": "[Tagged]",
    "subTagged": "[Tagged]",
    "subTaggedNonEmpty": "[Tagged]"
  },
  {}
]`,
  );
});

// See https://github.com/endojs/endo/issues/729
test('printing detailsToken', t => {
  t.throws(() => assert.error({ __proto__: null }), {
    message: 'unrecognized details {}',
  });
});

test('assert.quote tolerates always throwing exotic', t => {
  /**
   * alwaysThrowHandler
   * This is an object that throws if any propery is read. It's used as
   * a proxy handler which throws on any trap called.
   * It's made from a proxy with a get trap that throws.
   */
  const alwaysThrowHandler = new Proxy(
    { __proto__: null },
    {
      get(_shadow, _prop) {
        throw Error('Always throw');
      },
    },
  );

  /**
   * A proxy that throws on any trap, i.e., the proxy throws whenever in can
   * throw. Potentially useful in many other tests. TODO put somewhere reusable
   * by other tests.
   */
  const alwaysThrowProxy = new Proxy({ __proto__: null }, alwaysThrowHandler);

  t.is(`${q(alwaysThrowProxy)}`, '[Something that failed to stringify]');
});
