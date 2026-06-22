// @ts-check
/* eslint no-bitwise: ["off"] */

// Cross-implementation oracle keystream tests.  The fixture
// `_oracle-vectors.json` was produced by surveying multiple
// independent ChaCha12 implementations (Rust RustCrypto, c2-chacha,
// rand_chacha, @noble/ciphers, a pure-Python RFC 7539 transcription,
// the Bernstein eSTREAM C reference with rounds=12, and an
// independent BigInt-based JS RFC 7539 transcription) over the spec
// in `_oracle-spec.json`.  Each fixture entry carries the consensus
// keystream and the list of implementations that produced it.  This
// test asserts that `@endo/chacha12` reproduces the consensus
// keystream byte-for-byte on every fixture entry; any disagreement is
// a real divergence that needs investigating, not a snapshot to mask.
//
// See `_oracle-spec.json` for the (key, nonce, counter, length) tuple
// list and the rationale behind each entry.

import test from '@endo/ses-ava/test.js';
import fs from 'fs';
import path from 'path';

import { BLOCK_SIZE, chacha12Block, chacha12State } from '../src/chacha12.js';

// Inline hex helpers, same convention as `chacha12.test.js`.

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

// Resolve the fixture path relative to this test file so AVA's cwd
// does not affect the lookup.  `import` attributes for JSON would
// be cleaner, but the SES-AVA harness in this workspace does not
// yet support them uniformly.
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '_oracle-vectors.json'), 'utf8'),
);

/**
 * Drives the package's own `chacha12Block` + `chacha12State` to
 * produce `length` bytes of keystream starting at `(key, nonce,
 * counter)`.  Mirrors what `makeChaCha12` does internally but lets
 * us start at an arbitrary u32 counter without going through the
 * convenience wrapper (which always starts at counter 0).
 *
 * @param {Uint8Array} key
 * @param {Uint8Array} nonce
 * @param {number} counter
 * @param {number} length
 * @returns {Uint8Array}
 */
const ourKeystream = (key, nonce, counter, length) => {
  const state = chacha12State(key, nonce, counter);
  const out = new Uint8Array(length);
  const block = new Uint8Array(BLOCK_SIZE);
  let off = 0;
  let ctr = counter >>> 0;
  while (off < length) {
    state[12] = ctr;
    chacha12Block(state, block);
    const remaining = length - off;
    const n = remaining < BLOCK_SIZE ? remaining : BLOCK_SIZE;
    for (let i = 0; i < n; i += 1) out[off + i] = block[i];
    off += n;
    ctr = (ctr + 1) >>> 0;
  }
  return out;
};

for (const v of fixture.vectors) {
  const sources = v.sources.join(', ');
  test(`oracle ${v.id} (consensus of ${v.sources.length}: ${sources})`, t => {
    const key = fromHex(v.key_hex);
    const nonce = fromHex(v.nonce_hex);
    const ks = ourKeystream(key, nonce, v.counter, v.length);
    t.is(encodeHex(ks), v.keystream);
  });
}
