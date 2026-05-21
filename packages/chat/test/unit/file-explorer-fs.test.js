// @ts-check
/* eslint-disable no-await-in-loop */

// Smoke-coverage for the endo-fs ↔ explorer-UI bridge. The bridge
// is correctness-sensitive (directory listing ordering, chunked
// reads with preview truncation, chunked writes, watch
// subscriptions), and was previously unconvered; these tests pin
// the behaviour against the canonical in-memory backend.

import '@endo/init/debug.js';

import test from 'ava';
import { E, Far } from '@endo/far';

import {
  classifyCapability,
  createFile,
  decodeText,
  listDirectory,
  makeFilesystemLayer,
  makeMemoryFilesystem,
  makeReadOnlyView,
  readFile,
  subscribeChanges,
  writeFileText,
} from '../../file-explorer-fs.js';

const utf8 = (/** @type {string} */ s) => new TextEncoder().encode(s);

const decode = (/** @type {Uint8Array} */ b) =>
  new TextDecoder('utf-8').decode(b);

/**
 * Wait for a predicate to become true, with a hard deadline.
 *
 * @param {() => boolean} predicate
 * @param {number} [timeoutMs]
 */
const waitFor = async (predicate, timeoutMs = 2000) => {
  await null;
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

// ============ classifyCapability ============

test('classifyCapability identifies an in-memory Filesystem', async t => {
  const fs = makeMemoryFilesystem();
  const kind = await classifyCapability(fs);
  t.is(kind, 'filesystem');
});

test('classifyCapability returns "unknown" for an unrelated remotable', async t => {
  // A Far with no Filesystem/Mount methods — neither the
  // `root`+`statfs` Filesystem signature nor the `lookup`+mutator
  // Mount signature should match.
  const unrelated = Far('Unrelated', {
    /** @returns {string} */
    greet() {
      return 'hi';
    },
  });
  const kind = await classifyCapability(unrelated);
  t.is(kind, 'unknown');
});

// ============ listDirectory ============

test('listDirectory sorts directories first, then files; each group alphabetized', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  await E(root).mkdir('zzz-dir', {});
  await E(root).mkdir('aaa-dir', {});
  await createFile(root, 'zzz.txt');
  await createFile(root, 'aaa.txt');

  const entries = await listDirectory(root);
  t.deepEqual(entries, [
    { name: 'aaa-dir', type: 'directory' },
    { name: 'zzz-dir', type: 'directory' },
    { name: 'aaa.txt', type: 'file' },
    { name: 'zzz.txt', type: 'file' },
  ]);
});

test('listDirectory on an empty directory returns []', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  t.deepEqual(await listDirectory(root), []);
});

// ============ readFile / writeFileText round-trip ============

test('writeFileText then readFile round-trips bytes for a small file', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  await createFile(root, 'hello.txt');
  const file = await E(root).lookup('hello.txt');
  await writeFileText(file, 'hello, world\n');

  const { bytes, size, truncated } = await readFile(file);
  t.is(decode(bytes), 'hello, world\n');
  t.is(size, 13);
  t.false(truncated);
});

test('readFile truncates when size exceeds the preview cap', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  // 2 MiB cap + 1 byte to guarantee truncation, without minting a
  // huge string. Repeat a 1 KiB block so the in-memory FS isn't
  // dominated by encode time.
  const block = 'x'.repeat(1024);
  const blocks = 2 * 1024 + 1; // 2 MiB + 1 KiB → over the 2 MiB cap
  const payload = block.repeat(blocks);
  await createFile(root, 'big.bin');
  const file = await E(root).lookup('big.bin');
  await writeFileText(file, payload);

  const { bytes, size, truncated } = await readFile(file);
  t.is(size, payload.length);
  t.true(truncated);
  // Cap is 2 MiB; the preview must not exceed it.
  t.true(bytes.length <= 2 * 1024 * 1024);
  // What we did read is a prefix of the real bytes.
  t.is(decode(bytes), payload.slice(0, bytes.length));
});

// ============ subscribeChanges ============

test('subscribeChanges fires a change event when a file is created', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();

  /** @type {unknown[]} */
  const events = [];
  const unsubscribe = subscribeChanges(root, event => {
    events.push(event);
  });
  t.teardown(unsubscribe);

  // The watcher is established asynchronously; give it a beat
  // before mutating so the event isn't dropped.
  await new Promise(resolve => setTimeout(resolve, 50));
  await createFile(root, 'new.txt');
  await waitFor(() => events.length >= 1);
  t.true(events.length >= 1);
});

test('subscribeChanges unsubscribe stops further events', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();

  /** @type {unknown[]} */
  const events = [];
  const unsubscribe = subscribeChanges(root, event => {
    events.push(event);
  });
  await new Promise(resolve => setTimeout(resolve, 50));
  unsubscribe();
  // After unsubscribe, post a mutation; the events list should
  // remain (eventually) empty of NEW entries.
  const before = events.length;
  await createFile(root, 'after-unsub.txt');
  await new Promise(resolve => setTimeout(resolve, 100));
  t.is(events.length, before);
});

// ============ makeReadOnlyView / makeFilesystemLayer ============

test('makeReadOnlyView exposes reads but blocks writes', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  await createFile(root, 'readme.txt');
  await writeFileText(await E(root).lookup('readme.txt'), 'visible');

  const ro = makeReadOnlyView(fs);
  const roRoot = await E(ro).root();
  t.deepEqual(await listDirectory(roRoot), [
    { name: 'readme.txt', type: 'file' },
  ]);
  const { bytes } = await readFile(await E(roRoot).lookup('readme.txt'));
  t.is(decode(bytes), 'visible');

  // Mutation should be rejected by the read-only attenuator.
  await t.throwsAsync(() => E(roRoot).mkdir('writes-not-allowed', {}));
});

test('makeFilesystemLayer captures writes in the layer, leaving the backing untouched', async t => {
  const backing = makeMemoryFilesystem();
  const backingRoot = await E(backing).root();
  await createFile(backingRoot, 'base.txt');
  await writeFileText(await E(backingRoot).lookup('base.txt'), 'backing');

  const { layer, layerFilesystem } = makeFilesystemLayer(backing);
  const layerFs = await E(layer).asFilesystem();
  const layerRoot = await E(layerFs).root();

  // Layer reads see the backing.
  const { bytes: baseBytes } = await readFile(
    await E(layerRoot).lookup('base.txt'),
  );
  t.is(decode(baseBytes), 'backing');

  // Writes to the layer create a separate entry visible only in
  // the layer's own filesystem, not the backing.
  await createFile(layerRoot, 'overlay.txt');
  await writeFileText(await E(layerRoot).lookup('overlay.txt'), 'overlaid');

  const layerOwnRoot = await E(layerFilesystem).root();
  t.deepEqual(await listDirectory(layerOwnRoot), [
    { name: 'overlay.txt', type: 'file' },
  ]);
  // Backing must still be a one-file FS — the overlay didn't leak.
  t.deepEqual(await listDirectory(backingRoot), [
    { name: 'base.txt', type: 'file' },
  ]);
});

// ============ decodeText ============

test('decodeText decodes UTF-8 text', t => {
  const result = decodeText(utf8('hello'));
  t.is(result.text, 'hello');
  t.false(result.binary);
});

test('decodeText flags bytes containing a NUL as binary', t => {
  const bytes = new Uint8Array([0x48, 0x00, 0x65]);
  const result = decodeText(bytes);
  t.true(result.binary);
  t.is(result.text, '');
});
