// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import {
  toolResultToSmallcaps,
  smallcapsMarshal,
} from '../src/adapters/smallcaps.js';

test('toolResultToSmallcaps passes plain strings through unwrapped', t => {
  t.is(toolResultToSmallcaps('plain text'), 'plain text');
  // A string that happens to begin with a SmallCaps special character is still
  // returned verbatim — string results carry no non-JSON values.
  t.is(toolResultToSmallcaps('#undefined'), '#undefined');
});

test('toolResultToSmallcaps SmallCaps-encodes non-string values losslessly', t => {
  // BigInts round-trip as signed-magnitude strings.
  t.is(toolResultToSmallcaps(7n), '"+7"');
  t.is(toolResultToSmallcaps(42), '42');
  // undefined survives as the SmallCaps sentinel.
  t.is(toolResultToSmallcaps(undefined), '"#undefined"');
  // Nested structures keep their SmallCaps encoding per-field.
  t.is(toolResultToSmallcaps({ a: 1, b: 2n }), '{"a":1,"b":"+2"}');
});

test('smallcapsMarshal is the shared codec backing toolResultToSmallcaps', t => {
  const { body } = smallcapsMarshal.toCapData(harden({ n: 9n }));
  // The leading '#' sentinel is what toolResultToSmallcaps slices off.
  t.is(body[0], '#');
  t.is(body.slice(1), '{"n":"+9"}');
});
