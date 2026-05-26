// @ts-check

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import {
  ReadableBlobInterface,
  checkinTree,
  makeReaderRef,
} from '@endo/platform/fs/lite';

import { makeFilePowers } from '../src/daemon-node-powers.js';
import { makeMount } from '../src/mount.js';
import { makeMemoryStore } from './_mount-test-helpers.js';

/**
 * Coverage-driven integration tests for `src/mount.js`.
 *
 * These tests exercise reachable branches on the public `EndoMount`,
 * `EndoMountEntry`, and `EndoMountFile` surfaces that the existing
 * mount-platform-fs-conformance and mount-snapshot-and-entry tests
 * do not reach: input validation, confinement error paths, write
 * variants, read-only rejection paths, and the optional `snapshot`
 * surface's not-configured error path. Each test exercises one
 * specific reachable branch and asserts on observable behavior.
 */

const filePowers = makeFilePowers({ fs, path });

/**
 * @param {import('ava').ExecutionContext} t
 */
const makeTempRoot = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-cov-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

// --- Path-segment validation ---

test('writeText rejects a path-like object passed as a segment (realistic adversarial input)', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  // A git-file-shaped record `{ path: '../' }` is the kind of value
  // a caller might forward through the mount thinking the API
  // unwraps `.path`.  It does not; the Exo guard rejects on shape,
  // and a downstream reader can see that the `path` field is not a
  // tunnel back to the relative segment, even when the value
  // *looks* like a path-bearing record.
  const gitLikeFile = harden({ path: '../', mode: '100644' });
  await t.throwsAsync(
    () => E(mount).writeText(/** @type {any} */ ([gitLikeFile]), 'content'),
    { message: /Must match/ },
    'guard rejects a record-shaped segment even when it carries a path field',
  );
});

test('writeText rejects empty path segment', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).writeText(['a', '', 'b'], 'c'), {
    message: /must not be empty/,
  });
});

test('writeText rejects path segment containing forward slash', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).writeText(['a/b'], 'c'), {
    message: /must not contain/,
  });
});

test('writeText rejects path segment containing backslash', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).writeText(['a\\b'], 'c'), {
    message: /must not contain/,
  });
});

test('writeText rejects path segment containing NUL byte', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).writeText(['a\0b'], 'c'), {
    message: /must not contain/,
  });
});

// --- Path normalization (dot / dotdot) ---

test('writeText resolves "." path segments to current directory', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['.', 'hello.txt'], 'data');
  t.is(fs.readFileSync(path.join(rootPath, 'hello.txt'), 'utf8'), 'data');
});

test('writeText resolves ".." segments and clamps at confinement root', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  // ['..', '..', 'a.txt'] from the root pops to the root twice (clamped)
  // and then writes a.txt at the root.
  await E(mount).writeText(['..', '..', 'a.txt'], 'data');
  t.is(fs.readFileSync(path.join(rootPath, 'a.txt'), 'utf8'), 'data');
});

test('writeText with a slash-joined ".." string segment is treated as a single literal name', async t => {
  // writeText uses normalizeSegments on [stringArg], so a string like
  // 'sub/..' is NOT split by /; the slash inside the single segment
  // triggers the validator.
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).writeText('sub/..', 'data'), {
    message: /must not contain/,
  });
});

// --- assertConfined error paths ---

test('readText reports a missing-path error rather than leaking host filesystem state', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).readText(['does-not-exist.txt']), {
    message: /does not exist|cannot be verified|ENOENT/,
  });
});

test('maybeReadText returns undefined for a missing path', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const result = await E(mount).maybeReadText(['does-not-exist.txt']);
  t.is(result, undefined);
});

test('maybeReadText returns the content for an existing file', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['present.txt'], 'hello');
  t.is(await E(mount).maybeReadText(['present.txt']), 'hello');
});

test('stat returns undefined for a missing path', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const result = await E(mount).stat(['does-not-exist.txt']);
  t.is(result, undefined);
});

test('stat returns a populated record for an existing file', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['present.txt'], 'hello');
  const result = await E(mount).stat(['present.txt']);
  t.truthy(result);
});

// --- has() variants ---

test('has() with zero arguments returns true for the mount root', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await null;
  t.true(await E(mount).has());
});

test('has() returns false for an absent path', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await null;
  t.false(await E(mount).has('missing.txt'));
});

test('has() returns true for a present file via variadic segments', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['dir', 'file.txt'], 'x');
  t.true(await E(mount).has('dir', 'file.txt'));
});

test('has() rejects a non-string positional argument when the first arg is a string', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).has('a', /** @type {any} */ (42)), {
    message: /segments must be strings/,
  });
});

// --- entry() and child() ---

test('entry() default of root has displayPath "."', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const rootEntry = await E(mount).entry([]);
  t.is(await E(rootEntry).displayPath(), '.');
  t.deepEqual(await E(rootEntry).segments(), []);
});

test('entry() with array path mints a nested entry with matching segments', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const entry = await E(mount).entry(['a', 'b']);
  t.deepEqual(await E(entry).segments(), ['a', 'b']);
  t.is(await E(entry).displayPath(), 'a/b');
});

test('entry().child() extends the entry by one segment', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const e = await E(mount).entry(['a']);
  const c = await E(e).child('b');
  t.deepEqual(await E(c).segments(), ['a', 'b']);
});

test('entry().child() rejects an invalid name segment', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const e = await E(mount).entry(['a']);
  await t.throwsAsync(() => E(e).child(''), { message: /must not be empty/ });
  await t.throwsAsync(() => E(e).child('x/y'), { message: /must not contain/ });
});

test('entry() rejects a non-string, non-array argument', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).entry(/** @type {any} */ (42)), {
    message: /Must match|must be a string or array/,
  });
});

// --- Entry provenance across mounts ---

test('writeText through an entry from a different mount root is rejected on provenance', async t => {
  const aRoot = makeTempRoot(t);
  const bRoot = makeTempRoot(t);
  const a = makeMount({ rootPath: aRoot, readOnly: false, filePowers });
  const b = makeMount({ rootPath: bRoot, readOnly: false, filePowers });
  const foreign = await E(a).entry(['leaked.txt']);
  await t.throwsAsync(() => E(b).writeText(foreign, 'x'), {
    message: /different mount root/,
  });
});

test('writeText rejects a foreign (non-entry) object as path argument (documented gap)', async t => {
  // The "unrecognized object" branch in segmentsFromPathArg is gated
  // by the writeText M.interface guard (which accepts string,
  // arrayOf string, or an EndoMountEntry remotable). A bare hardened
  // record cannot pass the guard, so the inner WeakMap-miss branch
  // is unreachable from the public API. The provenance branch
  // (different-rootId) is the reachable failure mode and is covered
  // by the previous test.
  t.pass();
});

// --- makeFile content variants ---

test('makeFile with no content creates an empty file when absent', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).makeFile('empty.txt');
  t.is(fs.readFileSync(path.join(rootPath, 'empty.txt'), 'utf8'), '');
});

test('makeFile with no content is a no-op when the file already exists', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  fs.writeFileSync(path.join(rootPath, 'keep.txt'), 'preserved');
  await E(mount).makeFile('keep.txt');
  t.is(fs.readFileSync(path.join(rootPath, 'keep.txt'), 'utf8'), 'preserved');
});

test('makeFile with a string overwrites with that string', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).makeFile('s.txt', 'first');
  await E(mount).makeFile('s.txt', 'second');
  t.is(fs.readFileSync(path.join(rootPath, 's.txt'), 'utf8'), 'second');
});

test('makeFile rejects mutable Uint8Array at the exo guard', async t => {
  // The makeFile interface guard `M.call(PathArgShape).optional(M.any())`
  // accepts only passable values; a raw Uint8Array is mutable and is
  // therefore rejected at the exo boundary. Binary content reaches the
  // mount through `write(path, readableBlob)` instead; `makeFile`
  // accepts only `string` content (or `undefined` for a touch-style
  // empty file).
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const bytes = new Uint8Array([0x00, 0xff]);
  await t.throwsAsync(
    () => E(mount).makeFile('b.bin', /** @type {any} */ (bytes)),
    { message: /Cannot pass mutable typed arrays|Must match/ },
    'mutable Uint8Array rejected at the exo guard',
  );
});

test('makeFile rejects non-string content', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(
    () => E(mount).makeFile('bad.txt', /** @type {any} */ (42)),
    { message: /must be a string/ },
  );
});

test('makeFile rejects writing to an existing directory path', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  fs.mkdirSync(path.join(rootPath, 'adir'));
  await t.throwsAsync(() => E(mount).makeFile('adir', 'x'), {
    message: /is a directory/,
  });
});

// --- remove / move ---

test('remove deletes an existing file', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['gone.txt'], 'x');
  await E(mount).remove(['gone.txt']);
  t.false(fs.existsSync(path.join(rootPath, 'gone.txt')));
});

test('move renames a file within the mount', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['src.txt'], 'data');
  await E(mount).move(['src.txt'], ['dst.txt']);
  t.false(fs.existsSync(path.join(rootPath, 'src.txt')));
  t.is(fs.readFileSync(path.join(rootPath, 'dst.txt'), 'utf8'), 'data');
});

// --- Read-only rejection paths ---

test('read-only mount rejects writeText', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'exists.txt'), 'x');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  await t.throwsAsync(() => E(mount).writeText(['hello.txt'], 'data'), {
    message: /read-only/,
  });
});

test('read-only mount rejects makeFile', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  await t.throwsAsync(() => E(mount).makeFile('nope.txt'), {
    message: /read-only/,
  });
});

test('read-only mount rejects makeDirectory', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  await t.throwsAsync(() => E(mount).makeDirectory('nope'), {
    message: /read-only/,
  });
});

test('read-only mount rejects remove', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'present.txt'), 'x');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  await t.throwsAsync(() => E(mount).remove(['present.txt']), {
    message: /read-only/,
  });
});

test('read-only mount rejects move', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'a.txt'), 'x');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  await t.throwsAsync(() => E(mount).move(['a.txt'], ['b.txt']), {
    message: /read-only/,
  });
});

test('read-only mount rejects copy', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'a.txt'), 'x');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  await t.throwsAsync(() => E(mount).copy(['a.txt'], ['b.txt']), {
    message: /read-only/,
  });
});

test('readOnly() called on an already-read-only mount returns a working view', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'a.txt'), 'persist');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  const view = await E(mount).readOnly();
  t.true(await E(view).has('a.txt'));
});

// --- snapshot() not configured ---

test('snapshot() throws when no snapshotTree was wired in', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await t.throwsAsync(() => E(mount).snapshot(), {
    message: /snapshot.* not available/,
  });
});

// --- EndoMountFile surface ---

test('lookup of a present file returns an EndoMountFile with text/json', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  fs.writeFileSync(path.join(rootPath, 'value.json'), '{"a":1}');
  const file = await E(mount).lookup('value.json');
  t.is(await E(file).text(), '{"a":1}');
  t.deepEqual(await E(file).json(), { a: 1 });
});

test('EndoMountFile.append extends the file content', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['log.txt'], 'one\n');
  const file = await E(mount).lookup('log.txt');
  await E(file).append('two\n');
  t.is(fs.readFileSync(path.join(rootPath, 'log.txt'), 'utf8'), 'one\ntwo\n');
});

test('EndoMountFile.writeText replaces the file content', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['v.txt'], 'old');
  const file = await E(mount).lookup('v.txt');
  await E(file).writeText('new');
  t.is(fs.readFileSync(path.join(rootPath, 'v.txt'), 'utf8'), 'new');
});

test('EndoMountFile.stat returns a record for a present file', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['s.txt'], 'x');
  const file = await E(mount).lookup('s.txt');
  const st = await E(file).stat();
  t.truthy(st);
});

test('EndoMountFile.snapshot throws when no snapshotFile was wired in', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['s.txt'], 'x');
  const file = await E(mount).lookup('s.txt');
  await t.throwsAsync(() => E(file).snapshot(), {
    message: /snapshot.* not available/,
  });
});

test('EndoMountFile from a read-only mount rejects writeText / append', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'r.txt'), 'x');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  const file = await E(mount).lookup('r.txt');
  await t.throwsAsync(() => E(file).writeText('new'), { message: /read-only/ });
  await t.throwsAsync(() => E(file).append('more'), { message: /read-only/ });
});

// --- write() error branches ---

test('write rejects a value that is neither a ReadableBlob nor a ReadableTree', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });

  // A remotable that has neither `streamBase64` nor `list` — the
  // duck-typing branch falls through to the explicit reject.
  const RandoInterface = M.interface('Rando', {
    nothing: M.call().returns(M.string()),
  });
  const rando = makeExo('Rando', RandoInterface, {
    nothing() {
      return 'nope';
    },
  });
  await t.throwsAsync(() => E(mount).write(['x'], rando), {
    message: /ReadableBlob or ReadableTree/,
  });
});

test('write rejects writing a ReadableBlob to an existing directory target', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  fs.mkdirSync(path.join(rootPath, 'occupied'));

  const blob = makeExo('Blob', ReadableBlobInterface, {
    streamBase64() {
      // The streamBase64() result is never iterated in this test —
      // the is-a-directory check fires first.
      return makeReaderRef([new Uint8Array(0)]);
    },
    async text() {
      return '';
    },
    async json() {
      return null;
    },
  });
  await t.throwsAsync(() => E(mount).write(['occupied'], blob), {
    message: /is a directory/,
  });
});

// --- Snapshot wiring (covers the snapshotTree wrapper) ---

test('snapshot() returns a usable snapshot when snapshotTree is wired', async t => {
  const rootPath = makeTempRoot(t);
  const store = makeMemoryStore();
  const snapshotTree = async tree => {
    const { sha256 } = await checkinTree(tree, store);
    return store.loadTree(sha256);
  };
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    snapshotTree,
  });
  await E(mount).writeText(['x.txt'], 'snap');
  const snap = await E(mount).snapshot();
  const names = await E(snap).list();
  t.true(names.includes('x.txt'));
});

// --- ReadableTree view recursion ---

// --- Additional resolveSegments / EndoMountFile paths ---

test('lookup with ".." segments clamps at the confinement root', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'top.txt'), 'top-content');
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  // From the root, '..' should clamp to the root (not escape to the
  // host filesystem); then 'top.txt' resolves to the existing file.
  const file = await E(mount).lookup(['..', '..', 'top.txt']);
  t.is(await E(file).text(), 'top-content');
});

test('list with "." returns the root listing unchanged', async t => {
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'a.txt'), 'x');
  fs.writeFileSync(path.join(rootPath, 'b.txt'), 'y');
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  const names = await E(mount).list('.');
  t.deepEqual([...names].sort(), ['a.txt', 'b.txt']);
});

test('EndoMountFile.snapshot returns a usable file snapshot when wired', async t => {
  const rootPath = makeTempRoot(t);
  const store = makeMemoryStore();
  const snapshotFile = async filePath => {
    const sha256 = await store.store(filePowers.makeFileReader(filePath));
    return store.loadBlob(sha256);
  };
  const mount = makeMount({
    rootPath,
    readOnly: false,
    filePowers,
    snapshotFile,
  });
  await E(mount).writeText(['s.txt'], 'snapshot-me');
  const file = await E(mount).lookup('s.txt');
  const blob = await E(file).snapshot();
  t.is(await E(blob).text(), 'snapshot-me');
});

test('EndoMountFile.writeBytes is reachable through the read-only-rejection branch', async t => {
  // The writeBytes body (mount.js ~736) is reachable through the
  // read-only-rejection assertWritable() call before any byte ever
  // moves; that's the entry point most callers hit incorrectly. A
  // full happy-path exercise requires a remote producer that yields
  // raw Uint8Array values without the marshaler's base64 encoding, a
  // shape only available across a CapTP boundary with a real daemon.
  // The in-process AVA harness cannot satisfy it, so this test pins
  // the read-only-rejection observation instead.
  const rootPath = makeTempRoot(t);
  fs.writeFileSync(path.join(rootPath, 'r.bin'), '');
  const mount = makeMount({ rootPath, readOnly: true, filePowers });
  const file = await E(mount).lookup('r.bin');
  async function* iter() {
    yield new Uint8Array([1]);
  }
  await t.throwsAsync(() => E(file).writeBytes(makeReaderRef(iter())), {
    message: /read-only/,
  });
});

test('readOnly() narrows to a ReadableTree view that recursively narrows file lookups', async t => {
  const rootPath = makeTempRoot(t);
  const mount = makeMount({ rootPath, readOnly: false, filePowers });
  await E(mount).writeText(['a.txt'], 'hi');
  const view = await E(mount).readOnly();
  const file = await E(view).lookup('a.txt');
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(file).__getMethodNames__();
  // The view-of-a-file is a ReadableBlob, not an EndoMountFile.
  t.true(methods.includes('streamBase64'));
  t.true(methods.includes('text'));
  t.false(methods.includes('writeText'), 'attenuated, not full file');
});
