// @ts-check

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { E } from '@endo/far';
import { decodeBase64 } from '@endo/base64';
import { checkinTree } from '@endo/platform/fs/lite';

import { makeFilePowers } from '../src/daemon-node-powers.js';
import { makeMount } from '../src/mount.js';
import { makeMemoryStore } from './_mount-test-helpers.js';

/**
 * Behavior-level snapshot and entry tests for `makeMount`:
 *
 *  - Snapshot round-trips a binary (non-UTF8) file via `streamBase64`.
 *  - Snapshot of a mount with an internal symlink follows the link
 *    into confinement; an escaping symlink is hidden rather than
 *    leaking the outside target's bytes.
 *  - An entry minted by a read-only mount cannot regain write
 *    authority on a sibling writable mount (descriptor provenance).
 *
 * All three exercise `makeMount` directly so they do not pay the
 * daemon-fork cost.
 */

const filePowers = makeFilePowers({ fs, path });

/**
 * @param {import('ava').ExecutionContext} t
 */
const makeTempRoot = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-snap-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/**
 * @param {import('ava').ExecutionContext} t
 */
const makeConfiguredMount = t => {
  const rootPath = makeTempRoot(t);
  const store = makeMemoryStore();
  const snapshotTree = async tree => {
    const { sha256 } = await checkinTree(tree, store);
    return store.loadTree(sha256);
  };
  const snapshotFile = async filePath => {
    const sha256 = await store.store(filePowers.makeFileReader(filePath));
    return store.loadBlob(sha256);
  };
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    snapshotTree,
    snapshotFile,
  });
  return { mount, rootPath };
};

// --- Snapshot round-tripping: binary file streaming ---

test('snapshot round-trips a binary (non-UTF8) file via streamBase64', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);

  // A payload that is not valid UTF-8: PNG signature bytes plus high
  // bytes that any naive readText() pipeline would mangle.
  const payload = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG magic
    0x00,
    0xff,
    0xfe,
    0xfd,
    0xfc,
    0xfb,
    0xfa,
    0xf9,
    0x80,
    0x81,
    0x82,
    0x83,
    0x84,
    0x85,
    0x86,
    0x87,
  ]);
  fs.writeFileSync(path.join(rootPath, 'binary.dat'), payload);

  const snapshot = await E(mount).snapshot();
  const snapshotBlob = await E(snapshot).lookup('binary.dat');

  // Drive the base64 stream and reassemble the bytes.
  const iter = await E(snapshotBlob).streamBase64();
  const chunks = [];
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await E(iter).next();
    if (done) break;
    chunks.push(decodeBase64(value));
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const reassembled = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    reassembled.set(c, offset);
    offset += c.byteLength;
  }
  t.deepEqual(
    Array.from(reassembled),
    Array.from(payload),
    'binary bytes must round-trip through snapshot streamBase64()',
  );
});

// --- Snapshot round-tripping: symlink confinement behavior ---

test('snapshot of a mount with an internal symlink follows the link into confinement', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);

  // Lay out:
  //   rootPath/
  //     real/
  //       leaf.txt          (content "real")
  //     via-link            -> real           (internal relative symlink)
  fs.mkdirSync(path.join(rootPath, 'real'));
  fs.writeFileSync(path.join(rootPath, 'real', 'leaf.txt'), 'real');
  fs.symlinkSync('real', path.join(rootPath, 'via-link'));

  const snapshot = await E(mount).snapshot();
  const names = await E(snapshot).list();
  t.true(names.includes('via-link'), 'internal symlink visible in snapshot');
  t.true(names.includes('real'), 'real directory visible in snapshot');

  // Through the symlink-named entry in the snapshot, the leaf is
  // reachable with the linked-through content (no host-path leak).
  const linked = await E(snapshot).lookup('via-link');
  const leaf = await E(linked).lookup('leaf.txt');
  t.is(await E(leaf).text(), 'real');
});

test('snapshot of a mount with an escaping symlink hides the link rather than leaking the target', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);

  // An escaping symlink target outside the mount root.  Snapshotting
  // the mount must not leak the host path or the outside file's
  // bytes through the symlink-named entry.
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-outside-'));
  t.teardown(() => fs.rmSync(outsideRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outsideRoot, 'secret.txt'), 'should-not-leak');

  fs.writeFileSync(path.join(rootPath, 'visible.txt'), 'fine');
  fs.symlinkSync(outsideRoot, path.join(rootPath, 'escape-abs'));

  const snapshot = await E(mount).snapshot();
  const names = await E(snapshot).list();

  // The visible content is captured.
  t.true(names.includes('visible.txt'));
  // The escaping link is filtered out of the snapshot's surface; the
  // mount's `list` already excludes it, and checkin follows the
  // mount's list.  Either way, no entry in the snapshot reads as
  // "secret.txt" or yields the outside content.
  t.false(
    names.includes('escape-abs'),
    'escaping symlink must not appear in the snapshot listing',
  );
  // Defensive double-check: no snapshot entry exposes the outside
  // string anywhere we can reach by walking the snapshot.
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    const child = await E(snapshot).lookup(name);
    const childMethods =
      // eslint-disable-next-line no-await-in-loop, no-underscore-dangle
      await E(child).__getMethodNames__();
    if (childMethods.includes('text')) {
      // eslint-disable-next-line no-await-in-loop
      const text = await E(child).text();
      t.notRegex(
        text,
        /should-not-leak/,
        `no captured blob leaks the outside file: ${name}`,
      );
    }
  }
});

// --- Descriptor provenance: read-only entry cannot regain write authority ---

test('an entry minted by a read-only mount cannot regain write authority on a sibling writable mount', async t => {
  // Two mounts share the same backing directory.  One is read-only.
  // An entry minted by the read-only mount must not be usable to
  // write through the writable sibling.
  const rootPath = makeTempRoot(t);

  const writableMount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
  });
  const readOnlySiblingMount = makeMount({
    rootPath,
    readOnly: true,
    filePowers,
  });

  // The read-only mount mints an entry.  Entries are values rooted
  // in their mount's lineage; passing one to a different mount must
  // be rejected on identity, even if the path target is identical.
  const readOnlyEntry = await E(readOnlySiblingMount).entry(['leaked.txt']);

  // Attempting to write through the writable sibling using the
  // foreign entry must throw on provenance — not silently write.
  await t.throwsAsync(
    () => E(writableMount).writeText(readOnlyEntry, 'should not land'),
    {
      message: /different mount root/,
    },
    'writable sibling must reject a foreign read-only entry by provenance',
  );

  // The file was never created on disk.
  t.false(fs.existsSync(path.join(rootPath, 'leaked.txt')));
});

test('an entry minted on a readOnly() attenuated mount cannot regain write authority via the parent mount', async t => {
  // The structural-narrowing form of readOnly() does not expose
  // entry() (entry is removed from the read-only view).  This test
  // documents the property: the only way to mint an entry against an
  // already-attenuated mount is to go through a separately-issued
  // read-only mount (covered above) or to lose the writable
  // capability entirely.  Here we verify the read-only view's method
  // surface — there is no `entry` to call.
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['file.txt'], 'data');
  const view = await E(mount).readOnly();
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(view).__getMethodNames__();
  t.false(
    methods.includes('entry'),
    'read-only ReadableTree view must not expose entry()',
  );
  t.false(
    methods.includes('writeText'),
    'read-only ReadableTree view must not expose writeText()',
  );
  t.false(
    methods.includes('makeFile'),
    'read-only ReadableTree view must not expose makeFile()',
  );
});
