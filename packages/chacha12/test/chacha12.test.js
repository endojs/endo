// @ts-check
/* eslint no-bitwise: ["off"] */

import test from '@endo/ses-ava/test.js';

import {
  BLOCK_SIZE,
  chacha12Block,
  chacha12State,
  makeChaCha12,
  makeChaCha12FromState,
} from '../src/chacha12.js';

// Inline hex helpers: `@endo/hex` already depends on `@endo/chacha12`
// in this workspace, so chacha12 cannot devDep on hex without a
// cycle.

/** @param {string} hex */
const fromHex = hex => {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0) throw Error('odd hex');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/** @param {Uint8Array} bytes */
const encodeHex = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    s += b < 16 ? `0${b.toString(16)}` : b.toString(16);
  }
  return s;
};

// `draft-strombergson-chacha-test-vectors-01` (an Internet-Draft
// covering ChaCha8/12/20 with 128-bit and 256-bit keys) provides
// reference test vectors for the bare ChaCha block function.  Those
// vectors use the original Bernstein "DJB" IV layout: state[12..13]
// is a 64-bit counter and state[14..15] is a 64-bit nonce.  This
// implementation uses the IETF (RFC 7539 / 8439) layout: state[12]
// is a 32-bit counter and state[13..15] is a 96-bit nonce.
//
// At counter = 0 the two layouts coincide for a vector whose DJB
// IV is treated as the trailing 8 bytes of an IETF 12-byte nonce
// with the leading 4 bytes set to zero, which is what we do below.
// The published keystream bytes match block-for-block.

// TC1: all-zero 256-bit key, all-zero IV.
test('Strombergson ChaCha12 TC1 (all zero key, all zero IV)', t => {
  const key = new Uint8Array(32);
  const nonce = new Uint8Array(12);
  const expected0 = fromHex(
    '9bf49a6a 0755f953 811fce12 5f2683d5' +
      ' 0429c3bb 49e07414 7e0089a5 2eae155f' +
      ' 0564f879 d27ae3c0 2ce82834 acfa8c79' +
      ' 3a629f2c a0de6919 610be82f 411326be',
  );
  const expected1 = fromHex(
    '0bd58841 203e74fe 86fc7133 8ce0173d' +
      ' c628ebb7 19bdcbcc 15158521 4cc089b4' +
      ' 42258dcd a14cf111 c602b897 1b8cc843' +
      ' e91e46ca 905151c0 2744a6b0 17e69316',
  );
  const out = new Uint8Array(64);

  chacha12Block(chacha12State(key, nonce, 0), out);
  t.is(encodeHex(out), encodeHex(expected0), 'block 0');

  chacha12Block(chacha12State(key, nonce, 1), out);
  t.is(encodeHex(out), encodeHex(expected1), 'block 1');
});

// TC4: all-ones 256-bit key, all-ones 64-bit IV.
test('Strombergson ChaCha12 TC4 (all-ones key, all-ones IV)', t => {
  const key = new Uint8Array(32).fill(0xff);
  const nonce = new Uint8Array(12);
  // Map DJB 8-byte IV to the trailing 8 bytes of the IETF nonce.
  for (let i = 4; i < 12; i += 1) nonce[i] = 0xff;
  const expected0 = fromHex(
    '04bf88da e8e47a22 8fa47b7e 6379434b' +
      ' a664a7d2 8f4dab84 e5f8b464 add20c3a' +
      ' caa69c5a b221a23a 57eb5f34 5c96f4d1' +
      ' 322d0a2f f7a9cd43 401cd536 639a615a',
  );
  const expected1 = fromHex(
    '5c9429b5 5ca3c1b5 53545596 69a154ac' +
      ' a46cd761 c41ab8ac e385363b 95675f06' +
      ' 8e18db5a 673c1129 1bd41878 92a9a3a3' +
      ' 3514f371 2b26c130 26103298 ed76bc9a',
  );
  const out = new Uint8Array(64);

  chacha12Block(chacha12State(key, nonce, 0), out);
  t.is(encodeHex(out), encodeHex(expected0), 'block 0');

  chacha12Block(chacha12State(key, nonce, 1), out);
  t.is(encodeHex(out), encodeHex(expected1), 'block 1');
});

// TC8: random 256-bit key, random 64-bit IV.
test('Strombergson ChaCha12 TC8 (random key, random IV)', t => {
  const key = fromHex(
    'c46ec1b1 8ce8a878 725a37e7 80dfb735' +
      ' 1f68ed2e 194c79fb c6aebee1 a667975d',
  );
  const ivDjb = fromHex('1ada31d5 cf688221');
  const nonce = new Uint8Array(12);
  nonce.set(ivDjb, 4);
  const expected0 = fromHex(
    '14820727 84bc6d06 b4e73bdc 118bc010' +
      ' 3c797678 6ca918e0 6986aa25 1f7e9cc1' +
      ' b2749a0a 16ee83b4 242d2e99 b08d7c20' +
      ' 092b80bc 466c8728 3b61b1b3 9d0ffbab',
  );
  const expected1 = fromHex(
    'd94b116b c1ebdb32 9b9e4f62 0db69554' +
      ' 4a8e3d9b 68473d0c 975a46ad 966ed631' +
      ' e42aff53 0ad5eac7 d8047adf a1e5113c' +
      ' 91f3e3b8 83f1d189 ac1c8fe0 7ba5a42b',
  );
  const out = new Uint8Array(64);

  chacha12Block(chacha12State(key, nonce, 0), out);
  t.is(encodeHex(out), encodeHex(expected0), 'block 0');

  chacha12Block(chacha12State(key, nonce, 1), out);
  t.is(encodeHex(out), encodeHex(expected1), 'block 1');
});

test('makeChaCha12 rejects bad keys', t => {
  t.throws(() => makeChaCha12(/** @type {any} */ (null)), {
    instanceOf: TypeError,
  });
  t.throws(() => makeChaCha12(new Uint8Array(31)), {
    instanceOf: TypeError,
  });
  t.throws(() => makeChaCha12(new Uint8Array(33)), {
    instanceOf: TypeError,
  });
});

test('makeChaCha12 first 64 bytes match Strombergson TC1 block 0', t => {
  const gen = makeChaCha12(new Uint8Array(32));
  const out = new Uint8Array(64);
  gen.fillRandomBytes(out);
  const expected = fromHex(
    '9bf49a6a 0755f953 811fce12 5f2683d5' +
      ' 0429c3bb 49e07414 7e0089a5 2eae155f' +
      ' 0564f879 d27ae3c0 2ce82834 acfa8c79' +
      ' 3a629f2c a0de6919 610be82f 411326be',
  );
  t.is(encodeHex(out), encodeHex(expected));
});

test('makeChaCha12 advances across blocks monotonically', t => {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = i;
  const gen = makeChaCha12(key);
  const a = new Uint8Array(64);
  const b = new Uint8Array(64);
  gen.fillRandomBytes(a);
  gen.fillRandomBytes(b);
  t.not(encodeHex(a), encodeHex(b));
});

test('makeChaCha12 fills any length, crossing block boundaries', t => {
  // 192 bytes (3 blocks) pulled in one call should equal the same
  // number drawn piecewise across irregular chunks from a fresh
  // twin.
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = i;
  const single = new Uint8Array(192);
  makeChaCha12(key).fillRandomBytes(single);
  const twin = makeChaCha12(key);
  const piecewise = new Uint8Array(192);
  let off = 0;
  for (const n of [7, 57, 64, 32, 32]) {
    const chunk = piecewise.subarray(off, off + n);
    twin.fillRandomBytes(chunk);
    off += n;
  }
  t.is(off, 192);
  t.deepEqual([...single], [...piecewise]);
});

test('chacha12Block validates state and out lengths', t => {
  t.throws(() => chacha12Block(new Uint32Array(15), new Uint8Array(64)), {
    instanceOf: TypeError,
  });
  t.throws(() => chacha12Block(new Uint32Array(16), new Uint8Array(63)), {
    instanceOf: TypeError,
  });
});

test('chacha12State validates key and nonce', t => {
  t.throws(
    () =>
      chacha12State(/** @type {any} */ ('not bytes'), new Uint8Array(12), 0),
    { instanceOf: TypeError },
  );
  t.throws(() => chacha12State(new Uint8Array(31), new Uint8Array(12), 0), {
    instanceOf: TypeError,
  });
  t.throws(() => chacha12State(new Uint8Array(32), new Uint8Array(11), 0), {
    instanceOf: TypeError,
  });
});

test('makeChaCha12 fillRandomBytes matches @endo/random RandomSource shape', t => {
  // Compile-time check that the `fillRandomBytes` method on the
  // generator matches `@endo/random`'s `RandomSource` shape (a
  // function `(out: Uint8Array) => void`).  We restate the type
  // locally because chacha12 cannot devDepend on @endo/random
  // without a cycle (random already devDeps on chacha12).  tsc
  // rejects this assignment if the shape ever drifts.
  /** @type {(out: Uint8Array) => void} */
  const fillRandomBytes = makeChaCha12(new Uint8Array(32)).fillRandomBytes;
  const out = new Uint8Array(8);
  fillRandomBytes(out);
  t.is(out.length, 8);
});

// `getState` / `clone` / `makeChaCha12FromState` together implement
// the keystream-introspection surface required by `pure-rand` v8's
// `RandomGenerator` contract (and adjacent fast-check use).  The
// tests below validate the round-trip and clone-independence
// properties that contract requires.

test('next returns a signed int32 in [-0x80000000, 0x7fffffff]', t => {
  const gen = makeChaCha12(new Uint8Array(32));
  for (let i = 0; i < 100; i += 1) {
    const v = gen.next();
    t.is(typeof v, 'number');
    t.is(v | 0, v, 'next() result is int32');
    t.true(v >= -0x8000_0000);
    t.true(v <= 0x7fff_ffff);
  }
});

test('next reads the same little-endian u32 sequence as fillRandomBytes', t => {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = i + 1;
  const a = makeChaCha12(key);
  const b = makeChaCha12(key);
  const buf = new Uint8Array(4);
  for (let i = 0; i < 50; i += 1) {
    b.fillRandomBytes(buf);
    const expected =
      buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24) | 0;
    t.is(a.next(), expected, `index ${i}`);
  }
});

test('next correctly crosses a block boundary', t => {
  // Drain to within 2 bytes of a block boundary, then call `next()`
  // (which needs 4) and confirm the result matches the
  // byte-equivalent draw from a parallel fresh generator.
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = (i * 7) & 0xff;
  const a = makeChaCha12(key);
  const b = makeChaCha12(key);
  // Drain 62 bytes from `a`; the next `next()` call spans bytes
  // [62, 63, 64, 65] which crosses into block 1.
  const drain = new Uint8Array(62);
  a.fillRandomBytes(drain);
  // Drain the same 62 bytes from `b`, then read a 4-byte int the
  // long way and compare.
  b.fillRandomBytes(drain);
  const four = new Uint8Array(4);
  b.fillRandomBytes(four);
  const expected =
    four[0] | (four[1] << 8) | (four[2] << 16) | (four[3] << 24) | 0;
  t.is(a.next(), expected);
});

test('getState / makeChaCha12FromState round-trip reproduces the keystream', t => {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = i;
  const original = makeChaCha12(key);
  // Advance by an irregular amount: 70 bytes (mid-block 2), then
  // capture state.
  const skip = new Uint8Array(70);
  original.fillRandomBytes(skip);
  const snapshot = original.getState();
  // Snapshot is a plain serializable readonly array.
  t.true(Array.isArray(snapshot));
  t.is(snapshot.length, 34);
  for (const v of snapshot) {
    t.is(typeof v, 'number');
  }
  // JSON round-trip survives.
  const json = JSON.stringify(snapshot);
  const restored = makeChaCha12FromState(JSON.parse(json));
  // Subsequent draws agree byte-for-byte.
  const a = new Uint8Array(200);
  const b = new Uint8Array(200);
  original.fillRandomBytes(a);
  restored.fillRandomBytes(b);
  t.deepEqual([...a], [...b]);
});

test('getState round-trip works at every offset across a block boundary', t => {
  // For every offset 0..64, snapshot-and-restore must yield the
  // same subsequent stream as the unsnapshot original.  This guards
  // against off-by-one errors at the block boundary in the snapshot
  // shape (offset === BLOCK_SIZE is the "empty / next call refills"
  // sentinel and must round-trip correctly too).
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = (0xff - i) & 0xff;
  for (let pre = 0; pre <= BLOCK_SIZE; pre += 1) {
    const a = makeChaCha12(key);
    const b = makeChaCha12(key);
    if (pre > 0) {
      const skip = new Uint8Array(pre);
      a.fillRandomBytes(skip);
      b.fillRandomBytes(skip);
    }
    const restored = makeChaCha12FromState(a.getState());
    const x = new Uint8Array(150);
    const y = new Uint8Array(150);
    b.fillRandomBytes(x);
    restored.fillRandomBytes(y);
    t.deepEqual([...x], [...y], `pre=${pre}`);
  }
});

test('clone produces an independent generator', t => {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = i * 3;
  const a = makeChaCha12(key);
  // Advance original by a non-block-aligned amount.
  const skip = new Uint8Array(13);
  a.fillRandomBytes(skip);
  const b = a.clone();
  // Both generators yield the same bytes from this point.
  const x = new Uint8Array(100);
  const y = new Uint8Array(100);
  a.fillRandomBytes(x);
  b.fillRandomBytes(y);
  t.deepEqual([...x], [...y]);
  // Subsequent draws on `a` do not affect `b`.
  const xMore = new Uint8Array(50);
  const yMore = new Uint8Array(50);
  a.fillRandomBytes(xMore);
  // `b` should still be at position +100 from its clone time, same
  // as `a` was before the latest draw.
  b.fillRandomBytes(yMore);
  t.deepEqual([...xMore], [...yMore]);
});

test('clone interleaves: alternating next() on parent and clone yields a paired run', t => {
  // A typical fast-check shrinking-style use: snapshot a generator,
  // explore one branch, then resume the other branch from the
  // clone.  The two branches must each produce the same prefix that
  // a single uninterrupted run would have produced.
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) key[i] = (i ^ 0x5a) & 0xff;
  const a = makeChaCha12(key);
  const reference = makeChaCha12(key);
  const b = a.clone();
  const refSeq = [];
  for (let i = 0; i < 16; i += 1) refSeq.push(reference.next());
  const aSeq = [];
  for (let i = 0; i < 16; i += 1) aSeq.push(a.next());
  const bSeq = [];
  for (let i = 0; i < 16; i += 1) bSeq.push(b.next());
  t.deepEqual(aSeq, refSeq);
  t.deepEqual(bSeq, refSeq);
});

test('makeChaCha12FromState rejects malformed states', t => {
  t.throws(() => makeChaCha12FromState(/** @type {any} */ (null)), {
    instanceOf: TypeError,
  });
  t.throws(() => makeChaCha12FromState(/** @type {any} */ ('not an array')), {
    instanceOf: TypeError,
  });
  t.throws(() => makeChaCha12FromState([]), { instanceOf: TypeError });
  t.throws(() => makeChaCha12FromState(new Array(33).fill(0)), {
    instanceOf: TypeError,
  });
  // Bad offset (out of range).
  const bad = new Array(34).fill(0);
  bad[17] = 65;
  t.throws(() => makeChaCha12FromState(bad), { instanceOf: TypeError });
  // Bad counter (negative).
  bad[17] = 0;
  bad[16] = -1;
  t.throws(() => makeChaCha12FromState(bad), { instanceOf: TypeError });
});
