// @ts-nocheck
/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { fc } from '@fast-check/ava';
import { Remotable } from '@endo/pass-style';
import { arbPassable } from '@endo/pass-style/tools.js';
import { Fail, q } from '@endo/errors';

// eslint-disable-next-line import/no-extraneous-dependencies

import {
  makeEncodePassable,
  makeDecodePassable,
} from '../src/encodePassable.js';
import { compareRank, makeComparatorKit } from '../src/rankOrder.js';
import { sample } from './test-rankOrder.js';

const buffers = {
  __proto__: null,
  r: [],
  '?': [],
  '!': [],
};
const resetBuffers = () => {
  buffers.r = [];
  buffers['?'] = [];
  buffers['!'] = [];
};
const cursors = {
  __proto__: null,
  r: 0,
  '?': 0,
  '!': 0,
};
const resetCursors = () => {
  cursors.r = 0;
  cursors['?'] = 0;
  cursors['!'] = 0;
};

const encodeThing = (prefix, r) => {
  buffers[prefix].push(r);
  // With this encoding, all things with the same prefix have the same rank
  return prefix;
};

const decodeThing = (prefix, e) => {
  prefix === e ||
    Fail`expected encoding ${q(e)} to simply be the prefix ${q(prefix)}`;
  (cursors[prefix] >= 0 && cursors[prefix] < buffers[prefix].length) ||
    Fail`while decoding ${q(e)}, expected cursors[${q(prefix)}], i.e., ${q(
      cursors[prefix],
    )} <= ${q(buffers[prefix].length)}`;
  const thing = buffers[prefix][cursors[prefix]];
  cursors[prefix] += 1;
  return thing;
};

const compareRemotables = (x, y) =>
  compareRank(encodeThing('r', x), encodeThing('r', y));

const encodePassableInternal = makeEncodePassable({
  encodeRemotable: r => encodeThing('r', r),
  encodePromise: p => encodeThing('?', p),
  encodeError: er => encodeThing('!', er),
});
const encodePassableInternal2 = makeEncodePassable({
  encodeRemotable: r => encodeThing('r', r),
  encodePromise: p => encodeThing('?', p),
  encodeError: er => encodeThing('!', er),
  format: 'compactOrdered',
});

const encodePassable = passable => {
  resetBuffers();
  return encodePassableInternal(passable);
};
const encodePassable2 = passable => {
  resetBuffers();
  return encodePassableInternal2(passable);
};

const decodePassableInternal = makeDecodePassable({
  decodeRemotable: e => decodeThing('r', e),
  decodePromise: e => decodeThing('?', e),
  decodeError: e => decodeThing('!', e),
});

const decodePassable = encoded => {
  resetCursors();
  return decodePassableInternal(encoded);
};

test('makeEncodePassable argument validation', t => {
  t.notThrows(() => makeEncodePassable(), 'must accept zero arguments');
  t.notThrows(() => makeEncodePassable({}), 'must accept empty options');
  t.notThrows(
    () => makeEncodePassable({ format: 'legacyOrdered' }),
    'must accept format: "legacyOrdered"',
  );
  t.notThrows(
    () => makeEncodePassable({ format: 'compactOrdered' }),
    'must accept format: "compactOrdered"',
  );
  t.throws(
    () => makeEncodePassable({ format: 'newHotness' }),
    { message: /^Unrecognized format\b/ },
    'must reject unknown format',
  );
});

const { comparator: compareFull } = makeComparatorKit(compareRemotables);

const asNumber = new Float64Array(1);
const asBits = new BigUint64Array(asNumber.buffer);
const getNaN = (hexEncoding = '0008000000000000') => {
  let bits = BigInt(`0x${hexEncoding}`);
  bits |= 0x7ff0000000000000n;
  if (!(bits & 0x0001111111111111n)) {
    bits |= 0x0008000000000000n;
  }
  asBits[0] = bits;
  return asNumber[0];
};

const NegativeNaN = getNaN('ffffffffffffffff');

/** @type {[Key, string][]} */
const goldenPairs = harden([
  [1, 'fbff0000000000000'],
  [-1, 'f400fffffffffffff'],
  [NaN, 'ffff8000000000000'],
  [NegativeNaN, 'ffff8000000000000'],
  [0, 'f8000000000000000'],
  [Infinity, 'ffff0000000000000'],
  [-Infinity, 'f000fffffffffffff'],
  [-1234567890n, 'n#90:8765432110'],
  [-123456789n, 'n1:876543211'],
  [-1000n, 'n6:9000'],
  [-999n, 'n7:001'],
  [-1n, 'n9:9'],
  [-0n, 'p1:0'],
  [37n, 'p2:37'],
  [123456789n, 'p9:123456789'],
  [1234567890n, 'p~10:1234567890'],
  [934857932847598725662n, 'p~21:934857932847598725662'],
]);

test('golden round trips', t => {
  for (const [k, e] of goldenPairs) {
    t.is(encodePassable(k), e, 'does k encode as expected');
    t.is(encodePassable2(k), `~${e}`, 'does k small-encode as expected');
    t.is(decodePassable(e), k, 'does the key round trip through the encoding');
    t.is(
      decodePassable(`~${e}`),
      k,
      'does the small-encoded key round trip through the encoding',
    );
  }
  // Not round trips
  t.is(encodePassable(-0), 'f8000000000000000');
  t.is(decodePassable('f0000000000000000'), NaN);
});

test('capability encoding', t => {
  const allAscii = Array(128)
    .fill()
    .map((_, i) => String.fromCharCode(i))
    .join('');
  const encoders = {
    encodeRemotable: _r => `r${allAscii}`,
    encodePromise: _p => `?${allAscii}`,
    encodeError: _err => `!${allAscii}`,
  };

  const data = harden([Remotable(), new Promise(() => {}), Error('Foo')]);
  const decoders = Object.fromEntries(
    Object.entries(encoders).map(([encoderName, encoder], i) => {
      const decoderName = encoderName.replace('encode', 'decode');
      const decoder = encoded => {
        t.is(
          encoded,
          encoder(undefined),
          `encoding-level escaping must be invisible in ${decoderName}`,
        );
        return data[i];
      };
      return [decoderName, decoder];
    }),
  );
  const decodeAsciiPassable = makeDecodePassable(decoders);

  const encodePassableLegacy = makeEncodePassable(encoders);
  const dataLegacy = encodePassableLegacy(data);
  t.is(
    dataLegacy,
    `[${['r', '?', '!']
      .map(
        prefix =>
          // eslint-disable-next-line no-control-regex
          `${prefix}${allAscii.replace(/[\x00\x01]/g, '\u0001$&')}\u0000`,
      )
      .join('')}`,
    'legacyOrdered format must escape U+0000 and U+0001 in deep remotable/promise/error encodings',
  );
  t.is(encodePassableLegacy(decodeAsciiPassable(dataLegacy)), dataLegacy);

  const encodePassableCompact = makeEncodePassable({
    format: 'compactOrdered',
    ...encoders,
  });
  const dataCompact = encodePassableCompact(data);
  // eslint-disable-next-line no-control-regex
  const allAsciiCompact = allAscii.replace(/[\0-\x1F !^_]/g, ch => {
    if (ch === ' ') return '!_';
    if (ch === '!') return '!|';
    if (ch === '^') return '_@';
    if (ch === '_') return '__';
    return `!${String.fromCharCode(ch.charCodeAt(0) + 0x21)}`;
  });
  t.is(
    dataCompact,
    `~^${['r', '?', '!']
      .map(prefix => `${prefix}${allAsciiCompact} `)
      .join('')}`,
    'compactOrdered format must escape U+0000 through U+001F, space, exclamation, caret, and underscore in remotable/promise/error encodings',
  );
  t.is(encodePassableCompact(decodeAsciiPassable(dataCompact)), dataCompact);
});

const orderInvariants = (x, y) => {
  const rankComp = compareRank(x, y);
  const fullComp = compareFull(x, y);
  if (rankComp !== 0) {
    Object.is(rankComp, fullComp) ||
      Fail`with rankComp ${rankComp}, expected matching fullComp: ${fullComp} for ${x} ${y}`;
  }
  if (fullComp === 0) {
    Object.is(rankComp, 0) ||
      Fail`with fullComp 0, expected matching rankComp: ${rankComp} for ${x} ${y}`;
  } else {
    rankComp === 0 ||
      rankComp === fullComp ||
      Fail`with fullComp ${fullComp}, expected 0 or matching rankComp: ${rankComp} for ${x} ${y}`;
  }
  const ex = encodePassable(x);
  const ey = encodePassable(y);
  const encComp = compareRank(ex, ey);
  if (fullComp !== 0) {
    Object.is(encComp, fullComp) ||
      Fail`with fullComp ${fullComp}, expected matching encComp: ${encComp} for ${ex} ${ey}`;
  }
};

const testRoundTrip = test.macro(async (t, encode) => {
  await fc.assert(
    fc.property(arbPassable, n => {
      const en = encode(n);
      const rt = decodePassable(en);
      const er = encode(rt);
      t.is(en, er);
      t.is(compareFull(n, rt), 0);
    }),
  );
});
test('original encoding round-trips', testRoundTrip, encodePassable);
test('small encoding round-trips', testRoundTrip, encodePassable2);

test('BigInt encoding comparison corresponds with numeric comparison', async t => {
  await fc.assert(
    fc.property(fc.bigInt(), fc.bigInt(), (a, b) => {
      const ea = encodePassable(a);
      const eb = encodePassable(b);
      t.is(a < b, ea < eb);
      t.is(a > b, ea > eb);
    }),
  );
});

test('Passable encoding corresponds to rankOrder', async t => {
  await fc.assert(
    fc.property(arbPassable, arbPassable, (a, b) => {
      return orderInvariants(a, b);
    }),
  );
  // Ensure at least one ava assertion.
  t.pass();
});

// The following is logically like the test above, but rather than relying on
// the heuristic generation of fuzzing test cases, it always checks everything
// in `sample`.
test('Also test against all enumerated in sample', t => {
  for (let i = 0; i < sample.length; i += 1) {
    for (let j = i; j < sample.length; j += 1) {
      orderInvariants(sample[i], sample[j]);
    }
  }
  // Ensure at least one ava assertion.
  t.pass();
});
