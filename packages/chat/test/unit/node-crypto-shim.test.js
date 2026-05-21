// @ts-check

// The shim is consumed at runtime by `@endo/endo-fs` via the Vite
// `node:crypto` alias (see `vite.config.js`). These tests pin the
// digest output against canonical SHA-256 vectors and assert the
// shape `node:crypto` callers depend on: indexable bytes plus a
// Buffer-like `toString(encoding)` (`base64` / `hex`).

import '@endo/init/debug.js';

import test from 'ava';
import { createHash } from '../../node-crypto-shim.js';

// SHA-256 vectors from NIST FIPS 180-2 ("abc" / two-block) and the
// well-known empty-input vector.
const VECTORS = [
  {
    label: 'empty input',
    input: '',
    hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    base64: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
  },
  {
    label: 'FIPS 180-2 one-block: "abc"',
    input: 'abc',
    hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    base64: 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
  },
  {
    label: 'FIPS 180-2 two-block (56 bytes)',
    input:
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    hex: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    base64: 'JI1qYdIGOLjlwCaTDD5gOaM85Flk/yFn9uzt1BnbBsE=',
  },
];

for (const { label, input, hex, base64 } of VECTORS) {
  test(`SHA-256 (${label}) — digest('hex')`, t => {
    t.is(createHash('sha256').update(input).digest('hex'), hex);
  });

  test(`SHA-256 (${label}) — digest('base64')`, t => {
    t.is(createHash('sha256').update(input).digest('base64'), base64);
  });

  test(`SHA-256 (${label}) — digest() returns Buffer-like bytes`, t => {
    const bytes = /** @type {Uint8Array & { toString: (enc?: string) => string }} */ (
      createHash('sha256').update(input).digest()
    );
    // Indexable, like a Node Buffer / Uint8Array
    t.true(bytes instanceof Uint8Array);
    t.is(bytes.length, 32);
    // Indexed access matches the hex vector
    const expectedFirstByte = parseInt(hex.slice(0, 2), 16);
    t.is(bytes[0], expectedFirstByte);
    // Node's Buffer-style `toString(encoding)`
    t.is(bytes.toString('base64'), base64);
    t.is(bytes.toString('hex'), hex);
  });
}

test('createHash().update is chainable', t => {
  const a = createHash('sha256').update('a').update('b').update('c').digest('hex');
  const b = createHash('sha256').update('abc').digest('hex');
  t.is(a, b);
});

test('createHash().update accepts Uint8Array chunks', t => {
  const bytes = new TextEncoder().encode('abc');
  t.is(
    createHash('sha256').update(bytes).digest('base64'),
    'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
  );
});

test('digest() with unsupported encoding throws', t => {
  // Only base64 / hex are wired up — anything else should error
  // rather than silently fall through to a wrong encoding.
  t.throws(() => createHash('sha256').update('').digest('utf8'));
});
