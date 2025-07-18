import { makeTagged, passableSymbolForName } from '@endo/pass-style';
import {
  exampleAlice,
  exampleBob,
  exampleCarol,
} from '@endo/pass-style/tools.js';

/** @import { Passable } from '@endo/pass-style' */

/**
 * Essentially a ponyfill for Array.prototype.toSorted, for use before
 * we can always rely on the platform to provide it.
 *
 * @template [T=unknown]
 * @param {T[]} elements
 * @param {(left: T, right: T) => import('../src/types.js').RankComparison} comp
 * @returns {T[]}
 */
export const sorted = (elements, comp) => [...elements].sort(comp);
harden(sorted);

/**
 * @param {string} left
 * @param {string} right
 * @returns {import('../src/types.js').RankComparison}
 */
export const compareByUtf16CodeUnit = (left, right) =>
  // eslint-disable-next-line no-nested-ternary
  left < right ? -1 : left > right ? 1 : 0;
harden(compareByUtf16CodeUnit);

export const multiplanarStrings = harden({
  bmpLow: 'X',

  // Test case from
  // https://icu-project.org/docs/papers/utf16_code_point_order.html
  bmpHigh: '\u{ff61}', // U+FF61 HALFWIDTH IDEOGRAPHIC FULL STOP
  surrogatePair: '\u{d800}\u{dc02}', // U+010002 LINEAR B SYLLABLE B028 I

  // These examples become invalid once we prohibit ill-formed strings.
  // See https://github.com/endojs/endo/pull/2002
  loneSurrogate: '\u{d800}',
  loneSurrogate$bmpLow: '\u{d800}X',
  loneSurrogate$bmpHigh: '\u{d800}\u{ff61}',
});

export const {
  bmpLow,
  loneSurrogate,
  loneSurrogate$bmpLow,
  loneSurrogate$bmpHigh,
  bmpHigh,
  surrogatePair,
} = multiplanarStrings;

export const stringsByUtf16CodeUnit = harden(
  sorted(Object.values(multiplanarStrings), compareByUtf16CodeUnit),
);
const expectNativeSorted = [
  bmpLow,
  loneSurrogate,
  loneSurrogate$bmpLow,
  surrogatePair,
  loneSurrogate$bmpHigh,
  bmpHigh,
];
if (stringsByUtf16CodeUnit.join(' ') !== expectNativeSorted.join(' ')) {
  throw Error(
    `internal: unexpected native string sorting ${JSON.stringify(stringsByUtf16CodeUnit)}`,
  );
}

/**
 * A list of `[passable, capdataBodyEncoding]` pairs, where marshalling
 * `passable` with the legacy "capdata" body format produces an encoding whose
 * body is the JSON serialization of `encoding`, and unmarshalling an encoding
 * whose body is that JSON text produces a value deepEqual to `passable`.
 *
 * @type {Array<[passable: Passable, capdataBodyEncoding: unknown]>}
 */
export const roundTripPairs = harden([
  // Simple JSON data encodes as itself
  [
    [1, 2],
    [1, 2],
  ],
  [{ foo: 1 }, { foo: 1 }],
  [{}, {}],
  [
    { a: 1, b: 2 },
    { a: 1, b: 2 },
  ],
  [
    { a: 1, b: { c: 3 } },
    { a: 1, b: { c: 3 } },
  ],
  [true, true],
  [1, 1],
  ['abc', 'abc'],
  [null, null],

  // proto problems
  // The one case where JSON is not a semantic subset of JS
  // Fails before https://github.com/endojs/endo/issues/1303 fix
  [{ ['__proto__']: {} }, { ['__proto__']: {} }],
  // Conflicts with non-overwrite-enable inherited frozen data property
  // Fails before https://github.com/endojs/endo/issues/1303 fix
  [{ isPrototypeOf: {} }, { isPrototypeOf: {} }],

  // Scalars not represented in JSON
  [undefined, { '@qclass': 'undefined' }],
  [NaN, { '@qclass': 'NaN' }],
  [Infinity, { '@qclass': 'Infinity' }],
  [-Infinity, { '@qclass': '-Infinity' }],
  [4n, { '@qclass': 'bigint', digits: '4' }],
  // Does not fit into a number
  [9007199254740993n, { '@qclass': 'bigint', digits: '9007199254740993' }],

  // Well known symbols
  [Symbol.asyncIterator, { '@qclass': 'symbol', name: '@@asyncIterator' }],
  [Symbol.match, { '@qclass': 'symbol', name: '@@match' }],
  // Registered symbols
  [passableSymbolForName('foo'), { '@qclass': 'symbol', name: 'foo' }],
  // Registered symbol hilbert hotel
  [passableSymbolForName('@@@@foo'), { '@qclass': 'symbol', name: '@@@@foo' }],

  // Normal json reviver cannot make properties with undefined values
  [[undefined], [{ '@qclass': 'undefined' }]],
  [{ foo: undefined }, { foo: { '@qclass': 'undefined' } }],

  // tagged
  [
    makeTagged('x', 8),
    {
      '@qclass': 'tagged',
      tag: 'x',
      payload: 8,
    },
  ],
  [
    makeTagged('x', undefined),
    {
      '@qclass': 'tagged',
      tag: 'x',
      payload: { '@qclass': 'undefined' },
    },
  ],

  // errors
  [
    Error(''),
    {
      '@qclass': 'error',
      message: '',
      name: 'Error',
    },
  ],
  [
    ReferenceError('msg'),
    {
      '@qclass': 'error',
      message: 'msg',
      name: 'ReferenceError',
    },
  ],
  [
    ReferenceError('#msg'),
    {
      '@qclass': 'error',
      message: '#msg',
      name: 'ReferenceError',
    },
  ],

  // Hilbert hotel
  [
    { '@qclass': 8 },
    {
      '@qclass': 'hilbert',
      original: 8,
    },
  ],
  [
    { '@qclass': '@qclass' },
    {
      '@qclass': 'hilbert',
      original: '@qclass',
    },
  ],
  [
    { '@qclass': { '@qclass': 8 } },
    {
      '@qclass': 'hilbert',
      original: {
        '@qclass': 'hilbert',
        original: 8,
      },
    },
  ],
  [
    {
      '@qclass': {
        '@qclass': 8,
        foo: 'foo1',
      },
      bar: { '@qclass': undefined },
    },
    {
      '@qclass': 'hilbert',
      original: {
        '@qclass': 'hilbert',
        original: 8,
        rest: { foo: 'foo1' },
      },
      rest: {
        bar: {
          '@qclass': 'hilbert',
          original: { '@qclass': 'undefined' },
        },
      },
    },
  ],
]);

/**
 * A list of `[capdataBody, justin, slots?]` tuples, where `capdataBody` is the
 * JSON serialization of a value that can be paired with `slots` to produce
 * Justin expression `justin`, and Justin evaluation of that expression produces
 * a Passable which marshals with the legacy "capdata" body format into an
 * encoding whose body is `capdataBody`.
 *
 * @type {Array<[capdataBody: string, justin: string, slots?: unknown[]]>}
 */
export const jsonJustinPairs = harden([
  // Justin is the same as the JSON encoding but without unnecessary quoting
  ['[1,2]', '[1,2]'],
  ['{"foo":1}', '{foo:1}'],
  ['{"a":1,"b":2}', '{a:1,b:2}'],
  ['{"a":1,"b":{"c":3}}', '{a:1,b:{c:3}}'],
  ['true', 'true'],
  ['1', '1'],
  ['"abc"', '"abc"'],
  ['null', 'null'],

  // Primitives not representable in JSON
  ['{"@qclass":"undefined"}', 'undefined'],
  ['{"@qclass":"NaN"}', 'NaN'],
  ['{"@qclass":"Infinity"}', 'Infinity'],
  ['{"@qclass":"-Infinity"}', '-Infinity'],
  ['{"@qclass":"bigint","digits":"4"}', '4n'],
  ['{"@qclass":"bigint","digits":"9007199254740993"}', '9007199254740993n'],
  [
    '{"@qclass":"symbol","name":"@@asyncIterator"}',
    'passableSymbolForName("@@asyncIterator")',
  ],
  ['{"@qclass":"symbol","name":"@@match"}', 'passableSymbolForName("@@match")'],
  ['{"@qclass":"symbol","name":"foo"}', 'passableSymbolForName("foo")'],
  ['{"@qclass":"symbol","name":"@@@@foo"}', 'passableSymbolForName("@@@@foo")'],

  // Arrays and objects
  ['[{"@qclass":"undefined"}]', '[undefined]'],
  ['{"foo":{"@qclass":"undefined"}}', '{foo:undefined}'],
  ['{"@qclass":"error","message":"","name":"Error"}', 'Error("")'],
  [
    '{"@qclass":"error","message":"msg","name":"ReferenceError"}',
    'ReferenceError("msg")',
  ],

  // The one case where JSON is not a semantic subset of JS
  ['{"__proto__":8}', '{["__proto__"]:8}'],

  // The Hilbert Hotel is always tricky
  ['{"@qclass":"hilbert","original":8}', '{"@qclass":8}'],
  ['{"@qclass":"hilbert","original":"@qclass"}', '{"@qclass":"@qclass"}'],
  [
    '{"@qclass":"hilbert","original":{"@qclass":"hilbert","original":8}}',
    '{"@qclass":{"@qclass":8}}',
  ],
  [
    '{"@qclass":"hilbert","original":{"@qclass":"hilbert","original":8,"rest":{"foo":"foo1"}},"rest":{"bar":{"@qclass":"hilbert","original":{"@qclass":"undefined"}}}}',
    '{"@qclass":{"@qclass":8,foo:"foo1"},bar:{"@qclass":undefined}}',
  ],

  // tagged
  ['{"@qclass":"tagged","tag":"x","payload":8}', 'makeTagged("x",8)'],
  [
    '{"@qclass":"tagged","tag":"x","payload":{"@qclass":"undefined"}}',
    'makeTagged("x",undefined)',
  ],

  // Slots
  [
    '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0}]',
    '[slot(0,"Alleged: for testing Justin")]',
  ],
  // More Slots
  [
    '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0},{"@qclass":"slot","iface":"Remotable","index":1}]',
    '[slotToVal("hello","Alleged: for testing Justin"),slotToVal(null,"Remotable")]',
    ['hello', null],
  ],
  // Tests https://github.com/endojs/endo/issues/1185 fix
  [
    '[{"@qclass":"slot","iface":"Alleged: for testing Justin","index":0},{"@qclass":"slot","index":0}]',
    '[slot(0,"Alleged: for testing Justin"),slot(0)]',
  ],
]);

/**
 * An unordered copyArray of some passables
 */
export const unsortedSample = harden([
  makeTagged('copySet', [
    ['b', 3],
    ['a', 4],
  ]),
  'foo',
  3n,
  'barr',
  undefined,
  [5, { foo: 4 }],
  2,
  null,
  [5, { foo: 4, bar: null }],
  exampleBob,
  0,
  makeTagged('copySet', [
    ['a', 4],
    ['b', 3],
  ]),
  NaN,
  true,
  undefined,
  -Infinity,
  [5],
  exampleAlice,
  [],
  passableSymbolForName('foo'),
  Error('not erroneous'),
  passableSymbolForName('@@@@foo'),
  [5, { bar: 5 }],
  passableSymbolForName(''),
  false,
  exampleCarol,
  [exampleCarol, 'm'],
  [exampleAlice, 'a'],
  [exampleBob, 'z'],
  -0,
  {},
  [5, undefined],
  -3,
  makeTagged('copyMap', [
    ['a', 4],
    ['b', 3],
  ]),
  true,
  'bar',
  [5, null],
  new Promise(() => {}), // forever unresolved
  makeTagged('nonsense', [
    ['a', 4],
    ['b', 3],
  ]),
  Infinity,
  Symbol.isConcatSpreadable,
  [5, { foo: 4, bar: undefined }],
  Promise.resolve('fulfillment'),
  [5, { foo: 4 }],
  // The promises should be of the same rank, in which case
  // the singleton array should be earlier. But if the encoded
  // gives the earlier promise an earlier encoding (as it used to),
  // then the encoded forms will not be order preserving.
  [Promise.resolve(null), 'x'],
  [Promise.resolve(null)],
]);

const rejectedP = Promise.reject(Error('broken'));
rejectedP.catch(() => {}); // Suppress unhandled rejection warning/error

/**
 * The correctly stable rank sorting of `sample`
 */
export const sortedSample = harden([
  // All errors are tied.
  Error('different'),

  {},

  // Lexicographic tagged: tag then payload
  makeTagged('copyMap', [
    ['a', 4],
    ['b', 3],
  ]),
  makeTagged('copySet', [
    ['a', 4],
    ['b', 3],
  ]),
  // Doesn't care if a valid copySet
  makeTagged('copySet', [
    ['b', 3],
    ['a', 4],
  ]),
  // Doesn't care if a recognized tagged tag
  makeTagged('nonsense', [
    ['a', 4],
    ['b', 3],
  ]),

  // All promises are tied.
  rejectedP,
  rejectedP,

  // Lexicographic arrays. Shorter beats longer.
  // Lexicographic records by reverse sorted property name, then by values
  // in that order.
  [],
  [Promise.resolve(null)],
  [Promise.resolve(null), 'x'],
  [5],
  [5, { bar: 5 }],
  [5, { foo: 4 }],
  [5, { foo: 4 }],
  [5, { foo: 4, bar: null }],
  [5, { foo: 4, bar: undefined }],
  [5, null],
  [5, undefined],
  [exampleAlice, 'a'],
  [exampleCarol, 'm'],
  [exampleBob, 'z'],

  false,
  true,
  true,

  // -0 is equivalent enough to 0. NaN after all numbers.
  -Infinity,
  -3,
  -0,
  0,
  2,
  Infinity,
  NaN,

  3n,

  // All remotables are tied for the same rank and the sort is stable,
  // so their relative order is preserved
  exampleBob,
  exampleAlice,
  exampleCarol,

  // Lexicographic strings. Shorter beats longer.
  // TODO Probe UTF-16 vs Unicode vs UTF-8 (Moddable) ordering.
  'bar',
  'barr',
  'foo',

  null,
  passableSymbolForName(''),
  passableSymbolForName('@@@@foo'),
  Symbol.isConcatSpreadable,
  passableSymbolForName('foo'),

  undefined,
  undefined,
]);
