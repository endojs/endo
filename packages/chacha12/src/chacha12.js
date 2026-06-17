// @ts-check
/* eslint no-bitwise: ["off"] */

// Pure-JavaScript ChaCha12 keystream generator.
//
// ChaCha12 is the 12-round variant of Daniel J. Bernstein's ChaCha
// stream cipher.  The block function is otherwise identical to
// ChaCha20 (same quarter round, same state layout, same "expand
// 32-byte k" constants, same little-endian conventions, same final
// state add).  The only difference is the loop count: 6
// double-rounds in ChaCha12 (= 12 rounds), 10 in ChaCha20.
//
// `makeChaCha12(key)` returns a `ChaCha12Generator` record with
// `next`, `getState`, `clone`, and `fillRandomBytes` methods.  The
// shape was chosen to align with `pure-rand@8`'s `RandomGenerator`
// interface (the contract `fast-check@4` uses to drive property-based
// tests):
//
//   interface RandomGenerator {
//     next(): number;                  // signed int32
//     clone(): RandomGenerator;        // independent copy
//     getState(): readonly number[];   // serializable snapshot
//   }
//
// `fillRandomBytes(out)` is the pre-existing byte-keystream entry
// point preserved for `@endo/random` and other consumers that want a
// `(out: Uint8Array) => void` `RandomSource`.
//
// `makeChaCha12FromState(state)` reconstructs a generator at the
// position recorded by a previous `getState()`, completing the
// pure-rand convention of paired `xxxFromState(state)` factories.
//
// `chacha12Block(state, out)` and `chacha12State(key, nonce?,
// counter?)` are exported for known-answer testing against
// block-function test vectors that supply a non-zero nonce and
// counter.

import harden from '@endo/harden';

const ROUNDS = 12;

/**
 * The size in bytes of one ChaCha12 keystream block.  Exported for
 * callers that want to align allocation with block boundaries.
 */
export const BLOCK_SIZE = 64;

// "expand 32-byte k", little-endian u32 of "expa", "nd 3", "2-by",
// "te k".  Same constants as ChaCha20.
const C0 = 0x6170_7865;
const C1 = 0x3320_646e;
const C2 = 0x7962_2d32;
const C3 = 0x6b20_6574;

// `getState()` shape: [16 base words, counter, offset, 16 block words].
// Total length is 34 numbers.  Both the counter and the offset are
// always present so the array shape is uniform regardless of whether
// the generator is mid-block or block-aligned.  When `offset` is at
// `BLOCK_SIZE` the trailing 16 block words are zero (the next call
// will refill).
const STATE_LENGTH = 34;

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

const quarterRound = (state, a, b, c, d) => {
  let xa = state[a];
  let xb = state[b];
  let xc = state[c];
  let xd = state[d];
  xa = (xa + xb) >>> 0;
  xd = rotl(xd ^ xa, 16);
  xc = (xc + xd) >>> 0;
  xb = rotl(xb ^ xc, 12);
  xa = (xa + xb) >>> 0;
  xd = rotl(xd ^ xa, 8);
  xc = (xc + xd) >>> 0;
  xb = rotl(xb ^ xc, 7);
  state[a] = xa;
  state[b] = xb;
  state[c] = xc;
  state[d] = xd;
};

// Module-scope working buffer for `chacha12Block`.  Reused across
// every block invocation; cleared in place rather than reallocated.
const WORKING = new Uint32Array(16);

/**
 * Computes one ChaCha12 keystream block.  `state` is a 16-word
 * Uint32Array organized like ChaCha20 (4 constants, 8 key words, 1
 * counter, 3 nonce).  `out` receives 64 bytes of little-endian
 * keystream.  Caller is responsible for incrementing the counter
 * between calls.
 *
 * Exported for known-answer testing against ChaCha12 vectors.
 *
 * @param {Uint32Array} state
 * @param {Uint8Array} out
 */
export const chacha12Block = (state, out) => {
  if (state.length !== 16) {
    throw TypeError('chacha12 state must be 16 u32 words');
  }
  if (out.length !== BLOCK_SIZE) {
    throw TypeError(`chacha12 output must be ${BLOCK_SIZE} bytes`);
  }
  const working = WORKING;
  for (let i = 0; i < 16; i += 1) working[i] = state[i];
  // 6 column-round + diagonal-round pairs = 12 rounds total.
  for (let i = 0; i < ROUNDS; i += 2) {
    // Column round.
    quarterRound(working, 0, 4, 8, 12);
    quarterRound(working, 1, 5, 9, 13);
    quarterRound(working, 2, 6, 10, 14);
    quarterRound(working, 3, 7, 11, 15);
    // Diagonal round.
    quarterRound(working, 0, 5, 10, 15);
    quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8, 13);
    quarterRound(working, 3, 4, 9, 14);
  }
  // Manual little-endian u32 writes.  A `DataView` is a clearer
  // expression of "endian-correct u32 store", but constructing one
  // per block-function call costs more than the writes save: a
  // microbenchmark on Node 22 / x64 found `new DataView` + 16
  // `setUint32` to be ~12% slower than scalar byte writes here.
  for (let i = 0; i < 16; i += 1) {
    const v = (working[i] + state[i]) >>> 0;
    const off = i * 4;
    out[off] = v & 0xff;
    out[off + 1] = (v >>> 8) & 0xff;
    out[off + 2] = (v >>> 16) & 0xff;
    out[off + 3] = (v >>> 24) & 0xff;
  }
  // Clear working state so no keystream-derived bits linger between
  // calls.
  for (let i = 0; i < 16; i += 1) working[i] = 0;
};
harden(chacha12Block);

/**
 * Builds a 16-word ChaCha12 state from a 32-byte key, optional
 * 12-byte nonce, and optional 32-bit counter.  Exported for ChaCha12
 * test vectors and reused by `makeChaCha12` below.
 *
 * @param {Uint8Array} key 32 bytes
 * @param {Uint8Array} [nonce] 12 bytes
 * @param {number} [counter] unsigned 32-bit
 * @returns {Uint32Array}
 */
export const chacha12State = (key, nonce = undefined, counter = 0) => {
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw TypeError('chacha12 key must be a 32-byte Uint8Array');
  }
  if (nonce && (!(nonce instanceof Uint8Array) || nonce.length !== 12)) {
    throw TypeError('chacha12 nonce must be 12 bytes');
  }
  const state = new Uint32Array(16);
  state[0] = C0;
  state[1] = C1;
  state[2] = C2;
  state[3] = C3;
  // Manual little-endian u32 reads.  As with `chacha12Block` above,
  // constructing a `DataView` per call costs more than the reads
  // save: the bench measured `chacha12State(key, nonce)` ~3.4x
  // slower with DataView than with scalar byte loads on Node 22.
  for (let i = 0; i < 8; i += 1) {
    const off = i * 4;
    state[4 + i] =
      (key[off] |
        (key[off + 1] << 8) |
        (key[off + 2] << 16) |
        (key[off + 3] << 24)) >>>
      0;
  }
  state[12] = counter >>> 0;
  if (nonce) {
    state[13] =
      (nonce[0] | (nonce[1] << 8) | (nonce[2] << 16) | (nonce[3] << 24)) >>> 0;
    state[14] =
      (nonce[4] | (nonce[5] << 8) | (nonce[6] << 16) | (nonce[7] << 24)) >>> 0;
    state[15] =
      (nonce[8] | (nonce[9] << 8) | (nonce[10] << 16) | (nonce[11] << 24)) >>>
      0;
  }
  return state;
};
harden(chacha12State);

/**
 * @typedef {object} ChaCha12Generator
 * @property {() => number} next Returns a signed 32-bit integer in
 *   `[-0x80000000, 0x7fffffff]` drawn from the next 4 keystream
 *   bytes (little-endian), advancing the keystream by 4 bytes.  This
 *   matches the `pure-rand` v8 `RandomGenerator.next` contract.
 * @property {() => readonly number[]} getState Returns a serializable
 *   snapshot of the generator's full state: `[base0..base15, counter,
 *   offset, block0..block15]`, 34 numbers in total.  Pass to
 *   `makeChaCha12FromState` to reconstruct an independent generator
 *   that produces the same subsequent keystream.
 * @property {() => ChaCha12Generator} clone Returns a fully
 *   independent generator at the same keystream position.  Calling
 *   `next` / `fillRandomBytes` on the clone does not affect this
 *   generator and vice versa.
 * @property {(out: Uint8Array) => void} fillRandomBytes Fills `out`
 *   with successive bytes of the keystream.  Conforms to
 *   `@endo/random`'s `RandomSource` and to `crypto.getRandomValues`
 *   (minus the return value), so this method is interchangeable with
 *   either as a byte source.
 */

// Internal builder shared by `makeChaCha12` and
// `makeChaCha12FromState`.  Takes the three pieces of mutable state
// (base, counter, offset) plus the current block buffer (which may
// be empty when offset === BLOCK_SIZE) and returns the public
// generator.
/**
 * @param {Uint32Array} baseState 16 u32 words, ownership transferred
 *   to the generator (must not be retained by the caller).
 * @param {number} initialCounter
 * @param {number} initialOffset
 * @param {Uint8Array} initialBlock 64 bytes, ownership transferred
 *   (must not be retained by the caller).
 * @returns {ChaCha12Generator}
 */
const makeGenerator = (
  baseState,
  initialCounter,
  initialOffset,
  initialBlock,
) => {
  let counter = initialCounter;
  let offset = initialOffset;
  const block = initialBlock;

  const refill = () => {
    // Correctness guard at 256 GiB of keystream; not test-reachable.
    /* c8 ignore start */
    if (counter >= 0x1_0000_0000) {
      throw RangeError('chacha12 counter overflow (2^32 blocks exhausted)');
    }
    /* c8 ignore stop */
    baseState[12] = counter >>> 0;
    chacha12Block(baseState, block);
    counter += 1;
    offset = 0;
  };

  /** @param {Uint8Array} out */
  const fillRandomBytes = out => {
    let i = 0;
    const end = out.length;
    while (i < end) {
      if (offset >= BLOCK_SIZE) refill();
      const available = BLOCK_SIZE - offset;
      const want = end - i;
      const n = available < want ? available : want;
      for (let k = 0; k < n; k += 1) {
        out[i + k] = block[offset + k];
      }
      offset += n;
      i += n;
    }
  };

  // 32-bit signed integer reader.  Pulls 4 little-endian bytes from
  // the keystream and reinterprets them as int32 with `| 0`.  This is
  // the `pure-rand` v8 `next()` contract: values in
  // `[-0x80000000, 0x7fffffff]`, mutating the generator state.
  const next = () => {
    if (offset + 4 <= BLOCK_SIZE) {
      // Hot path: 4 bytes available in the current block.
      const b0 = block[offset];
      const b1 = block[offset + 1];
      const b2 = block[offset + 2];
      const b3 = block[offset + 3];
      offset += 4;
      return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24) | 0;
    }
    // Slow path: spans a block boundary (or starts at the boundary).
    // Defer to `fillRandomBytes` so the cross-block plumbing lives in
    // exactly one place.
    const buf = new Uint8Array(4);
    fillRandomBytes(buf);
    return buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24) | 0;
  };

  const getState = () => {
    const snapshot = new Array(STATE_LENGTH);
    for (let i = 0; i < 16; i += 1) snapshot[i] = baseState[i];
    snapshot[16] = counter;
    snapshot[17] = offset;
    // Block buffer encoded as 16 little-endian u32 words.  When
    // `offset === BLOCK_SIZE` the block bytes are unused but we copy
    // them anyway to keep the array shape uniform; the
    // reconstruction path will then refill on first use.
    for (let i = 0; i < 16; i += 1) {
      const off = i * 4;
      snapshot[18 + i] =
        (block[off] |
          (block[off + 1] << 8) |
          (block[off + 2] << 16) |
          (block[off + 3] << 24)) >>>
        0;
    }
    return harden(snapshot);
  };

  const clone = () => {
    const baseCopy = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) baseCopy[i] = baseState[i];
    const blockCopy = new Uint8Array(BLOCK_SIZE);
    for (let i = 0; i < BLOCK_SIZE; i += 1) blockCopy[i] = block[i];
    return makeGenerator(baseCopy, counter, offset, blockCopy);
  };

  return harden({ next, getState, clone, fillRandomBytes });
};

/**
 * Creates a ChaCha12-backed `RandomGenerator` keyed by `key`, with
 * counter starting at 0 and an all-zero nonce.
 *
 * The returned `ChaCha12Generator` exposes both the `pure-rand` v8
 * `RandomGenerator` interface (`next` / `clone` / `getState`) and the
 * pre-existing byte-fill `fillRandomBytes` method that conforms to
 * `@endo/random`'s `RandomSource` and `crypto.getRandomValues`-style
 * ergonomics.  Callers can pick whichever entry point matches the
 * downstream consumer.
 *
 * After `2 ** 32` blocks (256 GiB of keystream) the counter would
 * wrap; the generator throws `RangeError` instead.
 *
 * `makeChaCha12` reads the key bytes once, into a private state
 * vector, and does not retain the supplied `Uint8Array` reference.
 * Callers do not need to defensively copy the key; passing a frozen
 * or shared key array is safe.
 *
 * @param {Uint8Array} key 32-byte key.
 * @returns {ChaCha12Generator}
 */
export const makeChaCha12 = key => {
  const baseState = chacha12State(key);
  const block = new Uint8Array(BLOCK_SIZE);
  // First call refills.  Empty mid-block buffer is represented by
  // offset === BLOCK_SIZE.
  return makeGenerator(baseState, 0, BLOCK_SIZE, block);
};
harden(makeChaCha12);

/**
 * Reconstructs a `ChaCha12Generator` from a state snapshot returned
 * by a previous `getState()` call.  The reconstructed generator
 * produces exactly the same subsequent keystream as the generator
 * whose state was captured, and is fully independent of any other
 * generator (including the original).
 *
 * The state shape is `[base0..base15, counter, offset,
 * block0..block15]`, 34 numbers total: 16 u32 base-state words, the
 * next-block counter, the byte offset within the current block
 * (0..64), and 16 u32 words encoding the 64-byte current block
 * (little-endian).  When `offset === BLOCK_SIZE` the block words are
 * unused (the next read refills); they are included for shape
 * uniformity.
 *
 * Throws `TypeError` for malformed state.
 *
 * @param {readonly number[]} state
 * @returns {ChaCha12Generator}
 */
export const makeChaCha12FromState = state => {
  if (!Array.isArray(state) || state.length !== STATE_LENGTH) {
    throw TypeError(
      `chacha12 state must be a ${STATE_LENGTH}-element number array`,
    );
  }
  const offset = Number(state[17]);
  if (!Number.isInteger(offset) || offset < 0 || offset > BLOCK_SIZE) {
    throw TypeError(
      `chacha12 state offset must be an integer in [0, ${BLOCK_SIZE}]`,
    );
  }
  const counter = Number(state[16]);
  if (!Number.isInteger(counter) || counter < 0 || counter > 0xffff_ffff) {
    throw TypeError('chacha12 state counter must be a u32 integer');
  }
  const baseState = new Uint32Array(16);
  for (let i = 0; i < 16; i += 1) baseState[i] = state[i] >>> 0;
  const block = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < 16; i += 1) {
    const w = state[18 + i] >>> 0;
    const off = i * 4;
    block[off] = w & 0xff;
    block[off + 1] = (w >>> 8) & 0xff;
    block[off + 2] = (w >>> 16) & 0xff;
    block[off + 3] = (w >>> 24) & 0xff;
  }
  return makeGenerator(baseState, counter, offset, block);
};
harden(makeChaCha12FromState);
