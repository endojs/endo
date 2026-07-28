/**
 * The predicate's behavioral table, shared by the two test files so that the
 * engine-native arm and the manual-surrogate-scan fallback are held to exactly
 * the same contract. The fallback is the reason this package exists — it is
 * what makes the check correct on engines (XS among them) that do not carry the
 * built-in — but on any engine that HAS the built-in, only the native arm runs.
 * Keeping the table here is what lets `fallback.test.js` drive the other arm
 * without the two tables drifting apart.
 *
 * @type {Array<[string, unknown, boolean]>} label, input, expected
 */
export const cases = [
  ['the empty string', '', true],
  ['ascii', 'hello', true],
  ['non-ascii with combining marks', 'résumé', true],
  // A correctly paired surrogate (U+1F600) is well-formed.
  ['a correctly paired surrogate', '😀', true],
  ['a lone high surrogate', '\ud800', false],
  ['a lone low surrogate', '\udc00', false],
  ['a high surrogate not followed by a low', 'a\ud800b', false],
  ['a reversed surrogate pair', '\udc00\ud800', false],
  // The boundaries of the surrogate range, which the manual scan compares
  // against directly and so is the arm most likely to get them wrong.
  ['the first surrogate code unit', '\ud800', false],
  ['the last surrogate code unit', '\udfff', false],
  ['the code point just below the surrogate range', '퟿', true],
  ['the code point just above the surrogate range', '', true],
  // Unlike the native String.prototype.isWellFormed, this predicate does not
  // ToString its input, so non-strings are rejected rather than coerced.
  ['a number', 42, false],
  ['undefined', undefined, false],
  ['null', null, false],
  [
    'an object that coerces to a well-formed string',
    { toString: () => 'ok' },
    false,
  ],
  ['an array that coerces to a well-formed string', ['ok'], false],
];
