import test from '@endo/ses-ava/test.js';

import { q } from '@endo/errors';
import { qp } from '@endo/marshal';
import { M } from '../src/patterns/patternMatchers.js';

// This is a continuation of a test case in marshal-justin.test.js,
// but is placed here because it uses patterns which don't exist at
// the `@endo/marshal` layer.
//
// `patt1` is extracted from `patt2` as a simpler example we reproduce in
// in the `qp` doc-comment. Please co-maintain this test case and
// the `qp` doc-comment.
//
// `patt2` was the original example in a slack thread looking for a more
// legible way to render patterns. Patterns are Passables, and all
// Passables can kinda be rendered in Justin. Though Remotables and
// promises will be rendered only in terms of slot numbers.
test('qp on a pattern', t => {
  const patt1 = M.and(M.gte(-100), M.lte(100));
  t.is(`${q(patt1)}`, '"[match:and]"');
  t.is(
    `${qp(patt1)}`,
    `\
\`makeTagged("match:and", [
  makeTagged("match:gte", -100),
  makeTagged("match:lte", 100),
])\``,
  );

  const patt2 = M.splitRecord(
    harden({
      assetKind: M.or('nat', 'set', 'copySet', 'copyBag'),
      decimalPlaces: M.and(M.gte(-100), M.lte(100)),
    }),
  );
  t.is(`${q(patt2)}`, '"[match:splitRecord]"');
  t.is(
    `${qp(patt2)}`,
    `\`makeTagged("match:splitRecord", [
  {
    assetKind: makeTagged("match:or", [
      "nat",
      "set",
      "copySet",
      "copyBag",
    ]),
    decimalPlaces: makeTagged("match:and", [
      makeTagged("match:gte", -100),
      makeTagged("match:lte", 100),
    ]),
  },
])\``,
  );
});
