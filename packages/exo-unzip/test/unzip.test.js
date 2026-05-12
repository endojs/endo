// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'node:fs';
import url from 'node:url';
import { ZipWriter } from '@endo/zip/writer.js';
import { ZipReader } from '@endo/zip/reader.js';
import { decodeBase64, encodeBase64 } from '@endo/base64';

import { unzip } from '../index.js';

const textEncoder = new TextEncoder();

/**
 * Build a zip from a flat map of `{ path: bytes }` and return its
 * snapshot.
 *
 * @param {Record<string, Uint8Array>} entries
 * @returns {Uint8Array}
 */
const zipOf = entries => {
  const writer = new ZipWriter();
  for (const [name, content] of Object.entries(entries)) {
    writer.write(name, content, { date: new Date(2026, 0, 1) });
  }
  return writer.snapshot();
};

/**
 * Drain a chunked base64 stream into the underlying bytes.
 *
 * The blob producer guarantees that every chunk except possibly the
 * last has a length divisible by 4 (i.e. encodes a raw-byte slice
 * whose length is a multiple of 3), so the concatenation of the
 * yielded strings is itself a valid base64 string and decodes in a
 * single pass. A naive per-chunk decode would also work for that
 * particular chunking, but accumulating the encoded strings first
 * exercises the contract documented for `ReadableBlobInterface`
 * consumers and matches `@endo/exo-zip`'s `drainBase64`.
 *
 * @param {any} readerRef
 * @returns {Promise<Uint8Array>}
 */
const drainBase64 = async readerRef => {
  /** @type {string[]} */
  const encodedChunks = [];
  let result = await readerRef.next();
  while (!result.done) {
    encodedChunks.push(result.value);
    // eslint-disable-next-line no-await-in-loop
    result = await readerRef.next();
  }
  return decodeBase64(encodedChunks.join(''));
};

test('round-trip: list and lookup match the input shape', async t => {
  const bytes = zipOf({
    'README.md': textEncoder.encode('# Hello\n'),
    'src/index.js': textEncoder.encode('export {};\n'),
    'src/util/math.js': textEncoder.encode('export const one = 1;\n'),
    'docs/intro.md': textEncoder.encode('intro\n'),
  });

  const tree = unzip(bytes, { name: 'fixture.zip' });

  const rootList = await tree.list();
  t.deepEqual(rootList, ['README.md', 'docs', 'src']);

  const src = await tree.lookup('src');
  const srcList = await /** @type {any} */ (src).list();
  t.deepEqual(srcList, ['index.js', 'util']);

  const util = await /** @type {any} */ (src).lookup('util');
  const utilList = await /** @type {any} */ (util).list();
  t.deepEqual(utilList, ['math.js']);
});

test('lookup resolves a deep path in a single call', async t => {
  const bytes = zipOf({
    'a/b/c.txt': textEncoder.encode('deep'),
  });
  const tree = unzip(bytes);
  const blob = await tree.lookup(['a', 'b', 'c.txt']);
  t.is(await /** @type {any} */ (blob).text(), 'deep');
});

test('streamBase64 decodes to original bytes', async t => {
  const original = new Uint8Array([0, 1, 2, 3, 0xff, 0xfe, 0xfd]);
  const bytes = zipOf({ 'binary.dat': original });
  const tree = unzip(bytes);
  const blob = await tree.lookup('binary.dat');
  const stream = /** @type {any} */ (blob).streamBase64();
  const round = await drainBase64(stream);
  t.deepEqual([...round], [...original]);
});

test('streamBase64 chunks at 3-byte raw boundaries (no mid-stream padding)', async t => {
  // The producer chunks at 48 KiB raw -> 64 KiB encoded boundaries.
  // Construct a payload that crosses two such boundaries and is itself
  // not a multiple of 3 bytes, so the natural concern (mid-stream `=`
  // padding ruining the concatenation) is exercised end-to-end.
  // 48 KiB = 49152 bytes. Use 100_000 so we get [49152, 49152, 1696].
  const total = 100_000;
  const original = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    // Non-trivial pattern so a per-byte misalignment is detectable.
    original[i] = (i * 31 + 7) % 256;
  }
  const bytes = zipOf({ 'big.bin': original });
  const tree = unzip(bytes);
  const blob = await tree.lookup('big.bin');

  // Drain the stream, capturing the chunk shape so the test fails loudly
  // if the producer ever yields a non-3-byte-aligned non-final chunk.
  const stream = /** @type {any} */ (blob).streamBase64();
  /** @type {string[]} */
  const seen = [];
  let result = await stream.next();
  while (!result.done) {
    seen.push(result.value);
    // eslint-disable-next-line no-await-in-loop
    result = await stream.next();
  }
  t.true(
    seen.length >= 2,
    `expected multi-chunk stream for ${total}-byte payload, got ${seen.length}`,
  );
  for (let i = 0; i < seen.length - 1; i += 1) {
    t.is(
      seen[i].length % 4,
      0,
      `non-final chunk ${i} length ${seen[i].length} not divisible by 4`,
    );
    t.false(seen[i].includes('='), `non-final chunk ${i} contains '=' padding`);
  }

  // Concatenate-then-decode (the documented contract) round-trips.
  const round = decodeBase64(seen.join(''));
  t.deepEqual([...round], [...original]);
});

test('drainBase64 handles a synthetic multi-chunk stream split mid-payload', async t => {
  // Synthesize a producer that splits a 7-byte payload as [3, 4],
  // i.e. encoded as ["AAEC", "AwQFBg=="]. The first chunk is 4 chars
  // with no padding (3 bytes is a complete base64 group); the second
  // chunk is 4 bytes (1 complete group + 1 trailing byte, encoded as
  // 4 + 4 chars with `==` padding on the trailing partial group). The
  // accumulate-then-decode strategy decodes the concatenation
  // "AAECAwQFBg==" (12 chars) in a single call and recovers all 7
  // original bytes.
  //
  // A naive per-chunk decode would also handle this particular shape
  // because each chunk happens to be a self-contained valid base64
  // string. The point of this test is to pin the contract documented
  // for `ReadableBlobInterface` consumers: the producer guarantees
  // every non-final chunk is unpadded, and the consumer joins encoded
  // strings before decoding. If the producer ever yielded a non-aligned
  // first chunk (e.g. encoded a 4-byte slice as `AwQFBg==`), the same
  // accumulate-then-decode call would surface the violation immediately
  // by failing to round-trip.
  const original = new Uint8Array([0, 1, 2, 3, 4, 5, 6]);
  const encodedChunks = [
    encodeBase64(original.subarray(0, 3)),
    encodeBase64(original.subarray(3, 7)),
  ];
  t.is(encodedChunks[0], 'AAEC');
  t.is(encodedChunks[1], 'AwQFBg==');
  // The intermediate chunk has no padding; only the final chunk does.
  t.is(encodedChunks[0].length % 4, 0);
  t.false(encodedChunks[0].includes('='));

  let i = 0;
  const fakeReader = {
    next: async () => {
      if (i >= encodedChunks.length) {
        return harden({ done: true, value: undefined });
      }
      const value = encodedChunks[i];
      i += 1;
      return harden({ done: false, value });
    },
  };
  const round = await drainBase64(fakeReader);
  t.deepEqual([...round], [...original]);
});

test('drainBase64 fails loudly on an unaligned multi-chunk stream', async t => {
  // Companion to the previous test: a producer that violates the
  // alignment contract by yielding a non-final chunk that ENDS with `=`
  // padding produces a composite base64 string with padding in the
  // middle, which `decodeBase64` rejects (or in some implementations
  // silently misaligns the trailing bytes). Either way the caller sees
  // a failure rather than silently corrupted bytes.
  //
  // Encode a 7-byte payload as [4, 3]: the first 4-byte slice picks up
  // `==` padding, the second 3-byte slice has none. Concatenating the
  // two ("AwQFBg==" + "AAEC") gives "AwQFBg==AAEC", which `atob`
  // rejects because of the embedded `=`.
  //
  // This test pins the desired failure mode: a misbehaving producer
  // must not be able to silently corrupt the decoded bytes.
  const original = new Uint8Array([3, 4, 5, 6, 0, 1, 2]);
  const misalignedChunks = [
    encodeBase64(original.subarray(0, 4)),
    encodeBase64(original.subarray(4, 7)),
  ];
  t.is(misalignedChunks[0], 'AwQFBg==');
  t.is(misalignedChunks[1], 'AAEC');
  t.true(misalignedChunks[0].includes('='));

  let i = 0;
  const fakeReader = {
    next: async () => {
      if (i >= misalignedChunks.length) {
        return harden({ done: true, value: undefined });
      }
      const value = misalignedChunks[i];
      i += 1;
      return harden({ done: false, value });
    },
  };
  await t.throwsAsync(() => drainBase64(fakeReader));
});

test('text() decodes UTF-8 content', async t => {
  const bytes = zipOf({
    'greet.txt': textEncoder.encode('héllo, wörld\n'),
  });
  const tree = unzip(bytes);
  const blob = await tree.lookup('greet.txt');
  t.is(await /** @type {any} */ (blob).text(), 'héllo, wörld\n');
});

test('json() parses a JSON entry', async t => {
  const bytes = zipOf({
    'data/config.json': textEncoder.encode('{"port":8920,"host":"::1"}'),
  });
  const tree = unzip(bytes);
  const blob = await tree.lookup(['data', 'config.json']);
  t.deepEqual(await /** @type {any} */ (blob).json(), {
    port: 8920,
    host: '::1',
  });
});

test('has() returns true for present paths and false for missing', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  const hasRoot = await tree.has();
  t.true(hasRoot);
  const hasA = await tree.has('a');
  t.true(hasA);
  const hasAb = await tree.has('a', 'b.txt');
  t.true(hasAb);
  const hasAMissing = await tree.has('a', 'missing');
  t.false(hasAMissing);
  const hasMissing = await tree.has('missing');
  t.false(hasMissing);
  // Descending into a blob is not possible.
  const hasAbFurther = await tree.has('a', 'b.txt', 'further');
  t.false(hasAbFurther);
});

test('hostile input: zip-slip via .. is rejected at construction', t => {
  const bytes = zipOf({
    '../escape.txt': textEncoder.encode('pwned'),
  });
  t.throws(() => unzip(bytes, { name: 'evil.zip' }), {
    message: /forbidden path segment/,
  });
});

test('hostile input: . segment is rejected', t => {
  const bytes = zipOf({
    'a/./b.txt': textEncoder.encode('x'),
  });
  t.throws(() => unzip(bytes), {
    message: /forbidden path segment/,
  });
});

test('hostile input: empty path segment is rejected', t => {
  const bytes = zipOf({
    'a//b.txt': textEncoder.encode('x'),
  });
  t.throws(() => unzip(bytes), {
    message: /empty path segment/,
  });
});

test('hostile input: leading-slash path segment is rejected', t => {
  const bytes = zipOf({
    '/abs.txt': textEncoder.encode('x'),
  });
  t.throws(() => unzip(bytes), {
    message: /empty path segment/,
  });
});

test('hostile input: NUL byte in path segment is rejected', t => {
  const bytes = zipOf({
    'a\0b.txt': textEncoder.encode('x'),
  });
  // NUL falls under the broader control-character (\x00-\x1f) rejection.
  t.throws(() => unzip(bytes), {
    message: /control character/,
  });
});

test('hostile input: file/directory name collision is rejected', t => {
  // `a` exists both as a leaf file and as a directory prefix.
  const bytes = zipOf({
    a: textEncoder.encode('leaf'),
    'a/inside.txt': textEncoder.encode('child'),
  });
  t.throws(() => unzip(bytes), {
    message: /collide/,
  });
});

test('hostile input: directory/file name collision in reverse order is rejected', t => {
  const bytes = zipOf({
    'a/inside.txt': textEncoder.encode('child'),
    a: textEncoder.encode('leaf'),
  });
  t.throws(() => unzip(bytes), {
    message: /collide/,
  });
});

test('explicit directory entries are tolerated', async t => {
  // ZipWriter does not write directory entries by default, so build
  // one manually to ensure we still accept them.
  const writer = new ZipWriter();
  writer.write('docs/', new Uint8Array(0), { mode: 0o755 });
  writer.write('docs/intro.md', textEncoder.encode('intro'));
  const bytes = writer.snapshot();
  const tree = unzip(bytes);
  const rootList = await tree.list();
  t.deepEqual(rootList, ['docs']);
  const docs = await tree.lookup('docs');
  const docsList = await /** @type {any} */ (docs).list();
  t.deepEqual(docsList, ['intro.md']);
});

test('list at a sub-path enumerates that sub-tree', async t => {
  const bytes = zipOf({
    'pkg/a.js': textEncoder.encode('a'),
    'pkg/sub/b.js': textEncoder.encode('b'),
    'pkg/sub/c.js': textEncoder.encode('c'),
  });
  const tree = unzip(bytes);
  const pkgList = await tree.list('pkg');
  t.deepEqual(pkgList, ['a.js', 'sub']);
  const subList = await tree.list('pkg', 'sub');
  t.deepEqual(subList, ['b.js', 'c.js']);
});

test('lookup of a missing entry rejects', async t => {
  const bytes = zipOf({
    'present.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.lookup('absent.txt'), {
    message: /No such entry/,
  });
});

test('exo conforms to __getMethodNames__ for CapTP discovery', async t => {
  const bytes = zipOf({
    'leaf.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  // eslint-disable-next-line no-underscore-dangle
  const treeMethods = /** @type {any} */ (tree).__getMethodNames__();
  t.true(treeMethods.includes('list'));
  t.true(treeMethods.includes('lookup'));
  t.true(treeMethods.includes('has'));

  const blob = await tree.lookup('leaf.txt');
  // eslint-disable-next-line no-underscore-dangle
  const blobMethods = /** @type {any} */ (blob).__getMethodNames__();
  t.true(blobMethods.includes('streamBase64'));
  t.true(blobMethods.includes('text'));
  t.true(blobMethods.includes('json'));
  // The blob does not have `list`, so the discrimination logic in
  // `platformCheckinTree` will classify it correctly.
  t.false(blobMethods.includes('list'));
});

test('hostile input: control character (\\x01) in path segment is rejected', t => {
  const bytes = zipOf({
    'a\x01b.txt': textEncoder.encode('x'),
  });
  t.throws(() => unzip(bytes), {
    message: /control character/,
  });
});

test('hostile input: control character (\\x1f) in path segment is rejected', t => {
  const bytes = zipOf({
    'a\x1fb.txt': textEncoder.encode('x'),
  });
  t.throws(() => unzip(bytes), {
    message: /control character/,
  });
});

test('lookup rejects an empty segment in the path argument', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.lookup(['a', '', 'b.txt']), {
    message: /empty path segment/,
  });
});

test('lookup rejects a "." segment in the path argument', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.lookup(['a', '.', 'b.txt']), {
    message: /forbidden path segment/,
  });
});

test('lookup rejects a ".." segment in the path argument', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.lookup(['a', '..', 'b.txt']), {
    message: /forbidden path segment/,
  });
});

test('lookup rejects a control character in the path argument', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.lookup(['a', 'b\x01.txt']), {
    message: /control character/,
  });
});

test('list rejects an empty segment in its arguments', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.list('a', ''), {
    message: /empty path segment/,
  });
});

test('has rejects a ".." segment in its arguments', async t => {
  const bytes = zipOf({
    'a/b.txt': textEncoder.encode('x'),
  });
  const tree = unzip(bytes);
  await t.throwsAsync(() => tree.has('a', '..'), {
    message: /forbidden path segment/,
  });
});

test('unicode lookalike fullwidth dots are accepted (different codepoints)', async t => {
  // U+FF0E FULLWIDTH FULL STOP renders like "." but is a different
  // codepoint, so the validator does not reject it. Document the
  // choice with a test: the path-segment validator's job is to
  // protect against ASCII traversal/ambiguity attacks; Unicode
  // lookalike defence is a host-filesystem concern, not ours.
  const bytes = zipOf({
    '．．/x.txt': textEncoder.encode('payload'),
  });
  const tree = unzip(bytes);
  const rootList = await tree.list();
  t.deepEqual(rootList, ['．．']);
  const blob = await tree.lookup(['．．', 'x.txt']);
  t.is(await /** @type {any} */ (blob).text(), 'payload');
});

test('unzip is stable: two calls on the same bytes produce isomorphic trees', async t => {
  const bytes = zipOf({
    'README.md': textEncoder.encode('# Hi\n'),
    'src/index.js': textEncoder.encode('export {};\n'),
    'src/util/math.js': textEncoder.encode('export const one = 1;\n'),
  });
  const treeA = unzip(bytes);
  const treeB = unzip(bytes);

  /**
   * @param {any} node
   * @returns {Promise<unknown>}
   */
  const snapshot = async node => {
    // First-await-not-nested: `@jessie.js/safe-await-separator`.
    await null;
    // eslint-disable-next-line no-underscore-dangle
    const methods = node.__getMethodNames__();
    if (methods.includes('list')) {
      const names = await node.list();
      const out = {};
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        const child = await node.lookup(name);
        // eslint-disable-next-line no-await-in-loop
        out[name] = await snapshot(child);
      }
      return out;
    }
    return node.text();
  };

  const snapA = await snapshot(treeA);
  const snapB = await snapshot(treeB);
  t.deepEqual(snapA, snapB);
});

// Construct a probe so the gate exercises `'deflate-raw'` support;
// Node 18 ships `DecompressionStream` but rejects `'deflate-raw'`.
let canInflate = false;
try {
  // eslint-disable-next-line no-new
  new DecompressionStream('deflate-raw');
  canInflate = true;
  // eslint-disable-next-line no-empty
} catch {}

(canInflate ? test : test.skip)(
  'DEFLATE-compressed input round-trips via injected inflate',
  async t => {
    // `@endo/exo-unzip` injects `@endo/zip`'s `inflate` (a thin
    // wrapper around `DecompressionStream('deflate-raw')`) into every
    // `ZipReader` so that real-world archives produced by other tools
    // decompress transparently. The fixture below was produced by
    // `python -m zipfile` and contains two DEFLATE entries.
    const fixturePath = url.fileURLToPath(
      new URL('./_fixtures/deflate-sample.zip', import.meta.url),
    );
    const bytes = new Uint8Array(fs.readFileSync(fixturePath));
    const tree = unzip(bytes, { name: 'deflate-sample.zip' });
    // First-await-not-nested: `@jessie.js/safe-await-separator`.
    const names = await tree.list();
    t.deepEqual(names, ['a.txt', 'b.txt']);
    const a = await tree.lookup('a.txt');
    t.is(await /** @type {any} */ (a).text(), 'hello world from deflate\n');
    const b = await tree.lookup('b.txt');
    t.is(await /** @type {any} */ (b).text(), 'another file with content\n');
  },
);

test('round-trip via ZipWriter walker recovers the original entries', async t => {
  const original = {
    'README.md': textEncoder.encode('# Hi\n'),
    'src/index.js': textEncoder.encode('export {};\n'),
    'src/util/math.js': textEncoder.encode('export const one = 1;\n'),
  };
  const bytes = zipOf(original);
  const tree = unzip(bytes);

  // Walk the tree and accumulate into a new ZipWriter (the same
  // shape `checkout.js` uses inline).
  const writer = new ZipWriter();
  /**
   * @param {any} node
   * @param {string[]} path
   */
  const walk = async (node, path) => {
    // First-await-not-nested: `@jessie.js/safe-await-separator`.
    await null;
    // eslint-disable-next-line no-underscore-dangle
    const methods = node.__getMethodNames__();
    const isTree = methods.includes('list');
    if (isTree) {
      const names = await node.list();
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        const child = await node.lookup(name);
        // eslint-disable-next-line no-await-in-loop
        await walk(child, [...path, name]);
      }
    } else {
      const stream = node.streamBase64();
      const blobBytes = await drainBase64(stream);
      writer.write(path.join('/'), blobBytes);
    }
  };
  await walk(tree, []);

  const round = new ZipReader(writer.snapshot());
  for (const [name, expected] of Object.entries(original)) {
    t.deepEqual([...round.read(name)], [...expected]);
  }
  t.deepEqual([...round.files.keys()].sort(), Object.keys(original).sort());
});
