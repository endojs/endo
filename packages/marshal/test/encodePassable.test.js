// @ts-nocheck
/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
import test from '@endo/ses-ava/prepare-endo.js';

import { fc } from '@fast-check/ava';
import { Remotable } from '@endo/pass-style';
import { arbPassable } from '@endo/pass-style/tools.js';
import { assert, Fail, q, b } from '@endo/errors';

import {
  makePassableKit,
  makeEncodePassable,
  makeDecodePassable,
} from '../src/encodePassable.js';
import { compareRank, makeFullOrderComparatorKit } from '../src/rankOrder.js';
import { unsortedSample } from './_marshal-test-data.js';

const statelessEncodePassableLegacy = makeEncodePassable();

const makeSimplePassableKit = ({ statelessSuffix } = {}) => {
  let count = 0n;
  const encodingFromVal = new Map();
  const valFromEncoding = new Map();

  const encodeSpecial = (prefix, val) => {
    const foundEncoding = encodingFromVal.get(val);
    if (foundEncoding) return foundEncoding;
    count += 1n;
    const template = statelessEncodePassableLegacy(count);
    const encoding = prefix + template.substring(1);
    encodingFromVal.set(val, encoding);
    valFromEncoding.set(encoding, val);
    return encoding;
  };
  const decodeSpecial = (prefix, e) => {
    e.startsWith(prefix) ||
      Fail`expected encoding ${q(e)} to start with ${b(prefix)}`;
    const val =
      valFromEncoding.get(e) || Fail`no object found while decoding ${q(e)}`;
    return val;
  };

  const encoders =
    statelessSuffix !== undefined
      ? {
          encodeRemotable: r => `r${statelessSuffix}`,
          encodePromise: p => `?${statelessSuffix}`,
          encodeError: err => `!${statelessSuffix}`,
        }
      : {
          encodeRemotable: r => encodeSpecial('r', r),
          encodePromise: p => encodeSpecial('?', p),
          encodeError: err => encodeSpecial('!', err),
        };
  const encodePassableLegacy = makeEncodePassable({ ...encoders });
  const encodePassableCompact = makeEncodePassable({
    ...encoders,
    format: 'compactOrdered',
  });
  const decodePassable = makeDecodePassable({
    decodeRemotable: e => decodeSpecial('r', e),
    decodePromise: e => decodeSpecial('?', e),
    decodeError: e => decodeSpecial('!', e),
  });

  return { encodePassableLegacy, encodePassableCompact, decodePassable };
};
const pickLegacy = kit => kit.encodePassableLegacy;
const pickCompact = kit => kit.encodePassableCompact;

test('makePassableKit output shape', t => {
  const kit = makePassableKit();
  t.deepEqual(Reflect.ownKeys(kit).sort(), [
    'decodePassable',
    'encodePassable',
  ]);
  t.deepEqual(
    Object.fromEntries(
      Object.entries(kit).map(([key, value]) => [key, typeof value]),
    ),
    { encodePassable: 'function', decodePassable: 'function' },
  );
});

const verifyEncodeOptions = test.macro({
  title: label => `${label} encode options validation`,
  // eslint-disable-next-line no-shadow
  exec: (t, makeEncodePassable) => {
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
  },
});
test('makeEncodePassable', verifyEncodeOptions, makeEncodePassable);
test(
  'makePassableKit',
  verifyEncodeOptions,
  (...args) => makePassableKit(...args).encodePassable,
);

const { comparator: compareFull } = makeFullOrderComparatorKit();

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
  const {
    encodePassableLegacy: encodePassable,
    encodePassableCompact: encodePassable2,
    decodePassable,
  } = makeSimplePassableKit({ stateless: true });
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
  const forceSigil = (str, newSigil) => newSigil + str.slice(1);
  const encoders = {
    encodeRemotable: (_r, encodeRecur) =>
      forceSigil(encodeRecur(allAscii), 'r'),
    encodePromise: (_p, encodeRecur) => forceSigil(encodeRecur(allAscii), '?'),
    encodeError: (_err, encodeRecur) => forceSigil(encodeRecur(allAscii), '!'),
  };

  const data = harden([Remotable(), new Promise(() => {}), Error('Foo')]);
  const decoders = Object.fromEntries(
    Object.keys(encoders).map((encoderName, i) => {
      const decoderName = encoderName.replace('encode', 'decode');
      const decoder = (encoded, decodeRecur) => {
        const decodedString = decodeRecur(forceSigil(encoded, 's'));
        t.is(
          decodedString,
          allAscii,
          `encoding must be reversible in ${decoderName}`,
        );
        return data[i];
      };
      return [decoderName, decoder];
    }),
  );

  const {
    encodePassable: encodePassableLegacy,
    decodePassable: decodeAsciiPassable,
  } = makePassableKit({ ...encoders, ...decoders });
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

test('compact string validity', t => {
  const { decodePassable } = makeSimplePassableKit({ stateless: true });
  t.notThrows(() => decodePassable('~sa"z'));
  t.notThrows(() => decodePassable('~sa!!z'));
  const specialEscapes = ['!_', '!|', '_@', '__'];
  for (const prefix of ['!', '_']) {
    for (let cp = 0; cp <= 0x7f; cp += 1) {
      const esc = `${prefix}${String.fromCodePoint(cp)}`;
      const tryDecode = () => decodePassable(`~sa${esc}z`);
      if (esc.match(/![!-@]/) || specialEscapes.includes(esc)) {
        t.notThrows(tryDecode, `valid string escape: ${JSON.stringify(esc)}`);
      } else {
        t.throws(
          tryDecode,
          { message: /invalid string escape/ },
          `invalid string escape: ${JSON.stringify(esc)}`,
        );
      }
    }
    t.throws(
      () => decodePassable(`~sa${prefix}`),
      { message: /invalid string escape/ },
      `unterminated ${JSON.stringify(prefix)} escape`,
    );
  }
  for (let cp = 0; cp < 0x20; cp += 1) {
    const ch = String.fromCodePoint(cp);
    const uCode = cp.toString(16).padStart(4, '0').toUpperCase();
    t.throws(
      () => decodePassable(`~sa${ch}z`),
      { message: /invalid string escape/ },
      `disallowed string control character: U+${uCode} ${JSON.stringify(ch)}`,
    );
  }
});

test('compact custom encoding validity constraints', t => {
  const { encodePassableCompact } = makeSimplePassableKit();
  const encodings = new Map();
  const dynamicEncoder = obj => encodings.get(obj);
  const dynamicEncodePassable = makeEncodePassable({
    format: 'compactOrdered',
    encodeRemotable: dynamicEncoder,
    encodePromise: dynamicEncoder,
    encodeError: dynamicEncoder,
  });
  const makers = {
    r: Remotable,
    '?': Promise.resolve.bind(Promise),
    '!': Error,
  };

  for (const [sigil, makeInstance] of Object.entries(makers)) {
    const instance = harden(makeInstance());
    const makeTryEncode = encoding => {
      encodings.set(instance, encoding);
      const tryEncode = () => dynamicEncodePassable(instance);
      return tryEncode;
    };

    const rMustStartWith = RegExp(`must start with "[${sigil}]"`);
    t.throws(makeTryEncode(undefined), { message: rMustStartWith });
    for (const otherSigil of Object.keys(makers).filter(s => s !== sigil)) {
      t.throws(makeTryEncode(otherSigil), { message: rMustStartWith });
    }

    t.throws(makeTryEncode(`${sigil} `), {
      message: /unexpected array element terminator/,
    });
    t.throws(makeTryEncode(`${sigil} s`), { message: /must be embeddable/ });
    t.throws(makeTryEncode(`${sigil}^^`), { message: /unterminated array/ });
    t.notThrows(makeTryEncode(sigil), 'empty custom encoding is acceptable');
    t.notThrows(
      makeTryEncode(`${sigil}!`),
      'custom encoding containing an invalid string escape is acceptable',
    );
    t.notThrows(
      makeTryEncode(`${sigil}${encodePassableCompact(harden([]))}`),
      'custom encoding containing an empty array is acceptable',
    );
    t.notThrows(
      makeTryEncode(`${sigil}${encodePassableCompact(harden(['foo', []]))}`),
      'custom encoding containing a non-empty array is acceptable',
    );

    for (let cp = 0; cp < 0x20; cp += 1) {
      const ch = String.fromCodePoint(cp);
      const encoding = `${sigil}${ch}`;
      const uCode = cp.toString(16).padStart(4, '0').toUpperCase();
      t.throws(
        makeTryEncode(encoding),
        { message: /must not contain a C0/ },
        `disallowed encode output: U+${uCode} ${JSON.stringify(encoding)}`,
      );
    }
  }
});

// TODO: Make a common utility for finding the first difference between iterables.
// import { firstDiff } from '...';
// const firstStringDiff = (a, b) => firstDiff(a, b, { getIncrement: ch => ch.length });
// const commonStringPrefix = (a, b) => a.substring(0, firstStringDiff(a, b).index);
const commonStringPrefix = (str1, str2) => {
  // Co-iterate over *code points*.
  const iter1 = str1[Symbol.iterator]();
  const iter2 = str2[Symbol.iterator]();
  // ...but track a *code unit* index for extracting a substring at the end.
  let i = 0;
  for (;;) {
    const { value: char1 } = iter1.next();
    const { value: char2 } = iter2.next();
    if (char1 !== char2 || char1 === undefined) {
      return str1.substring(0, i);
    }
    // ...because some code points consist of a two-code-unit surrogate pair.
    i += char1.length;
  }
};

const orderInvariants = (x, y, statelessEncode1, statelessEncode2) => {
  const rankComp = compareRank(x, y);
  const fullComp = compareFull(x, y);
  if (rankComp !== 0) {
    Object.is(rankComp, fullComp) ||
      Fail`with rankComp ${rankComp}, expected matching fullComp: ${fullComp} for ${x} vs. ${y}`;
  }
  if (fullComp === 0) {
    Object.is(rankComp, 0) ||
      Fail`with fullComp 0, expected matching rankComp: ${rankComp} for ${x} vs. ${y}`;
  } else {
    assert(fullComp !== 0);
    rankComp === 0 ||
      rankComp === fullComp ||
      Fail`with fullComp ${fullComp}, expected rankComp 0 or matching: ${rankComp} for ${x} vs. ${y}`;
  }
  const ex = statelessEncode1(x);
  const ey = statelessEncode1(y);
  if (fullComp !== 0) {
    // Comparability of encodings stops at the first incomparable special rank
    // (remotable/promise/error).
    const exPrefix = commonStringPrefix(ex, statelessEncode2(x));
    const eyPrefix = commonStringPrefix(ey, statelessEncode2(y));
    const encComp = compareRank(exPrefix, eyPrefix);
    encComp === 0 ||
      encComp === fullComp ||
      Fail`with fullComp ${fullComp}, expected matching stateless encComp: ${encComp} for ${x} as ${ex} vs. ${y} as ${ey}`;
  }
};

const testRoundTrip = test.macro(async (t, pickEncode) => {
  const kit = makeSimplePassableKit();
  const encode = pickEncode(kit);
  const { decodePassable } = kit;
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
test('original encoding round-trips', testRoundTrip, pickLegacy);
test('small encoding round-trips', testRoundTrip, pickCompact);

const testBigInt = test.macro(async (t, pickEncode) => {
  const kit = makeSimplePassableKit({ statelessSuffix: '' });
  const encodePassable = pickEncode(kit);
  await fc.assert(
    fc.property(fc.bigInt(), fc.bigInt(), (x, y) => {
      const ex = encodePassable(x);
      const ey = encodePassable(y);
      t.is(x < y, ex < ey);
      t.is(x > y, ex > ey);
    }),
  );
});
test(
  'original BigInt encoding comparison corresponds with numeric comparison',
  testBigInt,
  pickLegacy,
);
test(
  'small BigInt encoding comparison corresponds with numeric comparison',
  testBigInt,
  pickCompact,
);

const testOrderInvariants = test.macro(async (t, pickEncode) => {
  const kit1 = makeSimplePassableKit({ statelessSuffix: '' });
  const statelessEncode1 = pickEncode(kit1);
  const kit2 = makeSimplePassableKit({ statelessSuffix: '.' });
  const statelessEncode2 = pickEncode(kit2);

  for (const x of unsortedSample) {
    for (const y of unsortedSample) {
      orderInvariants(x, y, statelessEncode1, statelessEncode2);
    }
  }

  await fc.assert(
    fc.property(arbPassable, arbPassable, (x, y) => {
      return orderInvariants(x, y, statelessEncode1, statelessEncode2);
    }),
  );

  // Ensure at least one ava assertion.
  t.pass();
});
test(
  'original passable encoding corresponds to rankOrder',
  testOrderInvariants,
  pickLegacy,
);
test(
  'small passable encoding corresponds to rankOrder',
  testOrderInvariants,
  pickCompact,
);
