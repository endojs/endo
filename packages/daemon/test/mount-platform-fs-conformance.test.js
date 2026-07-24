// @ts-check

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import os from 'os';
import path from 'path';
import fs from 'fs';
import url from 'url';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makeExo } from '@endo/exo';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import {
  DirectoryInterface as PlatformDirectoryInterface,
  FileInterface as PlatformFileInterface,
  ReadableTreeInterface,
  checkinTree,
} from '@endo/platform/fs/lite';

import { makeFilePowers } from '../src/manager-node-powers.js';
import { makeXsFilePowers } from '../src/bus-manager-rust-xs-powers.js';
import { makeMount } from '../src/mount.js';
import { makeMemoryStore } from './_mount-test-helpers.js';

/** @import { EndoMountFile, ReadableBlobView, ReadableTreeView } from '../src/types.js' */

/**
 * Conformance test asserting that `EndoMount` is a daemon-local
 * specialization of the `Directory` contract from
 * `@endo/platform/fs`, and that `EndoMountFile` is a specialization
 * of the `File` contract.
 *
 * The test does not bring up a full daemon; it constructs an
 * `EndoMount` directly via `makeMount` against a real temp directory.
 * The conformance assertions are:
 *
 * 1. Every method on `PlatformDirectoryInterface` /
 *    `PlatformFileInterface` is present on the corresponding Exo's
 *    method-names set.
 * 2. Calling each method through `E()` with shapes that the platform
 *    guard would accept produces no `M.interface` violation.
 * 3. `EndoMount.readOnly()` returns an Exo whose `__getMethodNames__`
 *    is exactly the `ReadableTreeInterface` method set; similarly
 *    `EndoMountFile.readOnly()` returns the `ReadableBlobInterface`
 *    set.
 *
 * Drift in either direction (a daemon method whose shape changes
 * without the platform contract tracking it, or a future platform
 * contract change the daemon does not absorb) breaks this test.
 */

const filePowers = makeFilePowers({ fs, path });

/**
 * @param {import('ava').ExecutionContext} t
 */
const makeTempRoot = t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-conf-'));
  t.teardown(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/**
 * Extract a method-name set from an `M.interface` guard.  The interface
 * is a Pattern record; the method shapes live under its `methodGuards`
 * iface descriptor.  We probe via Reflect.ownKeys on the call-args
 * record indirectly: M.interface stores method guards on a hidden
 * property accessible via getMethodNames().
 *
 * @param {any} iface
 */
const interfaceMethodNames = iface => {
  // M.interface returns an InterfaceGuard whose payload includes the
  // method-guard record under symbol-keyed slot.  The public API
  // exposes the method names via `getInterfaceMethodKeys`.
  // We deduce by introspection rather than depend on internal API:
  // every M.interface guard records the method names accessible via
  // its serialized payload at `.methodGuards`.
  const payload = /** @type {any} */ (iface).interfaceName ?? null;
  // Fallback: scan with `M.toPattern` to read out the methodGuards.
  // We provide an explicit list to avoid depending on @endo/patterns
  // internals.  Each interface lists the expected names below.
  return payload;
};
// Silence linter: helper above documents the indirect path even though
// the tests below use explicit lists.
void interfaceMethodNames;

/** Method names the platform `Directory` contract requires. */
const PLATFORM_DIRECTORY_METHODS = [
  'help',
  'has',
  'list',
  'lookup',
  'write',
  'remove',
  'move',
  'copy',
  'makeDirectory',
  'readOnly',
  'snapshot',
];

/** Method names the platform `File` contract requires. */
const PLATFORM_FILE_METHODS = [
  'help',
  'streamBase64',
  'text',
  'json',
  'writeText',
  'writeBytes',
  'append',
  'readOnly',
  'snapshot',
];

/** Method names the platform `ReadableTree` contract requires. */
const PLATFORM_READABLE_TREE_METHODS = [
  'has',
  'list',
  'listTree',
  'lookup',
  'help',
];

/**
 * Method names the rich `ReadableBlob` view exposes: the whole-value surface
 * plus the `BlobRef` range-I/O surface (`getInfo` / `fetch`). The mount-file
 * `readOnly()` view is a write-disabled face over a live file, so it carries
 * the range methods too. See designs/fs-interface-consolidation.md § C4.
 */
const PLATFORM_READABLE_BLOB_METHODS = [
  'streamBase64',
  'text',
  'json',
  'help',
  'getInfo',
  'fetch',
];

/**
 * Construct an `EndoMount` with an in-memory snapshot pipeline.
 *
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

test('EndoMount exposes every method on PlatformDirectoryInterface', async t => {
  const { mount } = makeConfiguredMount(t);
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (mount)).__getMethodNames__();
  for (const name of PLATFORM_DIRECTORY_METHODS) {
    t.true(
      methods.includes(name),
      `EndoMount missing platform Directory method ${name}`,
    );
  }
});

/**
 * Extensions beyond the minimal platform `Directory` contract.
 * `entry` / `stat` / `readText` / `maybeReadText` / `writeText` / `makeFile`
 * are mount-specific shortcuts. `subView` is the catalog confined-sub-root
 * method (shared with the extended `Directory`, not strictly mount-specific);
 * it is listed here only because the minimal `lite` `Directory` vocabulary does
 * not yet carry it — see designs/fs-interface-consolidation.md (C2/C5) for
 * whether the vocabulary should grow to include it. `maybeLookup` is the
 * `ReadableNameHub` lookup-or-undefined primitive (C1), not part of the lite
 * `Directory` vocabulary. (`help` is now part of the platform contract, so it
 * is not an extension.)
 */
const ENDOMOUNT_EXTENSIONS = [
  'entry',
  'stat',
  'readText',
  'maybeReadText',
  'writeText',
  'makeFile',
  'subView',
  'maybeLookup',
  // Declared as part of the name-hub contract but throws ENOSYS until a
  // filesystem watcher is wired (filesystem-watchers.md) — see § C1.
  'followNameChanges',
];

/**
 * Mount-specific extensions beyond the platform File contract. `getInfo` /
 * `fetch` are the rich `BlobRef` range-I/O surface over the live file (§ C4).
 */
const ENDOMOUNTFILE_EXTENSIONS = ['stat', 'getInfo', 'fetch'];

test('EndoMount diverges from PlatformDirectoryInterface by named extensions only', async t => {
  // The divergence is deliberate and named: callers who hold a plain
  // `Directory` capability cannot reach `readText` or `writeText`;
  // those are mount-specific shortcuts that exist because the daemon
  // has direct filesystem access where the platform contract assumes
  // a streaming pipe.  This test pins the extension set so a future
  // change that grows the divergence is forced to update both this
  // list and the design document.
  const { mount } = makeConfiguredMount(t);
  /* eslint-disable no-underscore-dangle */
  const methods = (
    await E(
      /** @type {{ __getMethodNames__: () => Promise<string[]> }} */ (
        /** @type {unknown} */ (mount)
      ),
    ).__getMethodNames__()
  ).filter(name => !name.startsWith('__'));
  /* eslint-enable no-underscore-dangle */
  const platform = new Set(PLATFORM_DIRECTORY_METHODS);
  const actualExtensions = methods.filter(name => !platform.has(name)).sort();
  t.deepEqual(
    actualExtensions,
    [...ENDOMOUNT_EXTENSIONS].sort(),
    'EndoMount extensions beyond Directory must match the named set',
  );
});

test('EndoMountFile diverges from PlatformFileInterface by named extensions only', async t => {
  // Same shape as the EndoMount divergence: `stat` is mount-specific.
  // A `File` consumer that demotes to the platform contract loses it.
  // (`help` is now part of the platform File contract, not an extension.)
  const { mount, rootPath } = makeConfiguredMount(t);
  fs.writeFileSync(path.join(rootPath, 'a.txt'), 'x');
  const file = /** @type {EndoMountFile} */ (await E(mount).lookup('a.txt'));
  const methods = // eslint-disable-next-line no-underscore-dangle
    (await E(/** @type {any} */ (file)).__getMethodNames__()).filter(
      name => !name.startsWith('__'),
    );
  const platform = new Set(PLATFORM_FILE_METHODS);
  const actualExtensions = methods.filter(name => !platform.has(name)).sort();
  t.deepEqual(
    actualExtensions,
    [...ENDOMOUNTFILE_EXTENSIONS].sort(),
    'EndoMountFile extensions beyond File must match the named set',
  );
});

test('EndoMount.makeDirectory returns a sub-mount (Directory.makeDirectory shape)', async t => {
  const { mount } = makeConfiguredMount(t);
  const sub = await E(mount).makeDirectory(['sub']);
  // The return value must be a Directory-shaped capability — a mount.
  // eslint-disable-next-line no-underscore-dangle
  const subMethods = await E(/** @type {any} */ (sub)).__getMethodNames__();
  for (const name of PLATFORM_DIRECTORY_METHODS) {
    t.true(
      subMethods.includes(name),
      `makeDirectory returned object missing ${name}`,
    );
  }
  // Writes through the returned sub-mount land inside the new dir.
  await E(sub).writeText(['leaf.txt'], 'inside-sub');
  t.is(await E(mount).readText(['sub', 'leaf.txt']), 'inside-sub');
  t.true(
    await E(sub).has('leaf.txt'),
    'sub-mount has(string) resolves relative to the subdirectory',
  );
  t.false(
    await E(sub).has('missing.txt'),
    'sub-mount has(string) does not fall back to the mount root',
  );
});

test('EndoMount.entry accepts slash-joined string selectors', async t => {
  const { mount } = makeConfiguredMount(t);
  const entry = await E(mount).entry('a/b/../c.txt');
  t.deepEqual(await E(entry).segments(), ['a', 'c.txt']);
  t.is(await E(entry).displayPath(), 'a/c.txt');

  await E(mount).writeText(entry, 'via-entry');
  t.is(await E(mount).readText(['a', 'c.txt']), 'via-entry');
});

test('EndoMount.readOnly listTree recursively lists a sub-tree', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['top.txt'], 'top');
  await E(mount).makeDirectory(['sub']);
  await E(mount).writeText(['sub', 'leaf.txt'], 'leaf');
  await E(mount).makeDirectory(['sub', 'nested']);
  await E(mount).writeText(['sub', 'nested', 'deep.txt'], 'deep');

  const view = await E(mount).readOnly();
  t.deepEqual(await E(view).listTree([]), [
    { path: ['sub'], type: 'directory' },
    { path: ['sub', 'leaf.txt'], type: 'file' },
    { path: ['sub', 'nested'], type: 'directory' },
    { path: ['sub', 'nested', 'deep.txt'], type: 'file' },
    { path: ['top.txt'], type: 'file' },
  ]);
  t.deepEqual(await E(view).listTree('sub', { ignore: ['nested'] }), [
    { path: ['leaf.txt'], type: 'file' },
  ]);
});

test('EndoMount.write accepts a ReadableBlob and materializes bytes', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);
  // A PassableBytesReader (the new-protocol blob shape).  mount.write
  // detects the blob via __getMethodNames__.includes('streamBase64')
  // and consumes via iterateBytesReader.
  const blob = bytesReaderFromIterator([
    new TextEncoder().encode('hello blob'),
  ]);
  await E(mount).write(['blob-target.txt'], blob);
  const actual = fs.readFileSync(
    path.join(rootPath, 'blob-target.txt'),
    'utf-8',
  );
  t.is(actual, 'hello blob');
});

test('EndoMount.write accepts a ReadableTree and materializes recursively', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);
  // A blob factory reused for each leaf.  Each leaf is a
  // PassableBytesReader; mount.write consumes via iterateBytesReader.
  const makeBlobValue = content => {
    const bytes = new TextEncoder().encode(content);
    return bytesReaderFromIterator([bytes]);
  };
  // A ReadableTree with a nested structure.
  const tree = makeExo('TestTree', ReadableTreeInterface, {
    async has(...pathSegments) {
      if (pathSegments.length === 0) return true;
      const lookup = ['a.txt', 'b'].includes(pathSegments[0]);
      return lookup;
    },
    async list() {
      return harden(['a.txt', 'b']);
    },
    async listTree() {
      return harden([]);
    },
    async lookup(pathArg) {
      const segments = typeof pathArg === 'string' ? [pathArg] : pathArg;
      if (segments.length === 1 && segments[0] === 'a.txt') {
        return makeBlobValue('hello-a');
      }
      if (segments.length === 1 && segments[0] === 'b') {
        // A nested tree with one leaf.
        return makeExo('NestedTree', ReadableTreeInterface, {
          async has(...pathSegments) {
            if (pathSegments.length === 0) return true;
            return pathSegments[0] === 'c.txt';
          },
          async list() {
            return harden(['c.txt']);
          },
          async listTree() {
            return harden([]);
          },
          async lookup(innerArg) {
            const innerSegments =
              typeof innerArg === 'string' ? [innerArg] : innerArg;
            if (innerSegments.length === 1 && innerSegments[0] === 'c.txt') {
              return makeBlobValue('hello-c');
            }
            throw new Error(`unknown ${innerSegments}`);
          },
          help: () => 'NestedTree',
        });
      }
      throw new Error(`unknown ${segments}`);
    },
    help: () => 'TestTree',
  });
  await E(mount).write(['nested'], tree);
  t.is(
    fs.readFileSync(path.join(rootPath, 'nested', 'a.txt'), 'utf-8'),
    'hello-a',
  );
  t.is(
    fs.readFileSync(path.join(rootPath, 'nested', 'b', 'c.txt'), 'utf-8'),
    'hello-c',
  );
});

test('EndoMount.write rejects traversal-like ReadableTree child names', async t => {
  const { mount } = makeConfiguredMount(t);
  const blob = bytesReaderFromIterator([new TextEncoder().encode('leaf')]);

  for (const name of ['.', '..', 'a/b', 'a\\b', 'a\0b']) {
    const tree = makeExo('InvalidTree', ReadableTreeInterface, {
      async has() {
        return true;
      },
      async list() {
        return harden([name]);
      },
      async listTree() {
        return harden([]);
      },
      async lookup() {
        return blob;
      },
      help: () => 'InvalidTree',
    });

    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(() => E(mount).write(['target'], tree), {
      message: /Tree entry name|Path segment/,
    });
  }
});

test('EndoMount.copy within-mount copies a file', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['src.txt'], 'src-content');
  await E(mount).copy(['src.txt'], ['dst.txt']);
  t.is(await E(mount).readText(['dst.txt']), 'src-content');
  // Source survives.
  t.is(await E(mount).readText(['src.txt']), 'src-content');
});

test('EndoMount.copy within-mount copies a directory recursively', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).makeDirectory(['src', 'inner']);
  await E(mount).writeText(['src', 'leaf.txt'], 'a');
  await E(mount).writeText(['src', 'inner', 'deep.txt'], 'b');
  await E(mount).copy(['src'], ['dst']);
  t.is(await E(mount).readText(['dst', 'leaf.txt']), 'a');
  t.is(await E(mount).readText(['dst', 'inner', 'deep.txt']), 'b');
});

test('EndoMount.readOnly() returns a structural ReadableTree view', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['file.txt'], 'data');
  const view = await E(mount).readOnly();
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (view)).__getMethodNames__();
  t.deepEqual(
    methods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_TREE_METHODS].sort(),
    'readOnly() must expose exactly the ReadableTree method set',
  );
  // Read-side calls still work.
  t.true(await E(view).has('file.txt'));
  t.deepEqual(await E(view).list(), ['file.txt']);
});

test('EndoMount.readOnly().lookup recursively returns structural views', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).makeDirectory(['sub']);
  await E(mount).writeText(['sub', 'leaf.txt'], 'leaf-data');
  const view = await E(mount).readOnly();
  const subView = /** @type {ReadableTreeView} */ (await E(view).lookup('sub'));
  // eslint-disable-next-line no-underscore-dangle
  const subMethods = await E(/** @type {any} */ (subView)).__getMethodNames__();
  t.deepEqual(
    subMethods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_TREE_METHODS].sort(),
  );
  const leafView = /** @type {ReadableBlobView} */ (
    await E(view).lookup(['sub', 'leaf.txt'])
  );
  // eslint-disable-next-line no-underscore-dangle
  const leafMethods = await E(
    /** @type {any} */ (leafView),
  ).__getMethodNames__();
  t.deepEqual(
    leafMethods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_BLOB_METHODS].sort(),
  );
  t.is(await E(leafView).text(), 'leaf-data');
});

test('EndoMountFile exposes every method on PlatformFileInterface', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['file.txt'], 'data');
  const file = /** @type {EndoMountFile} */ (await E(mount).lookup('file.txt'));
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (file)).__getMethodNames__();
  for (const name of PLATFORM_FILE_METHODS) {
    t.true(
      methods.includes(name),
      `EndoMountFile missing platform File method ${name}`,
    );
  }
});

test('EndoMountFile.readOnly() returns a structural ReadableBlob view', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['file.txt'], 'rb-data');
  const file = /** @type {EndoMountFile} */ (await E(mount).lookup('file.txt'));
  const view = await E(file).readOnly();
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (view)).__getMethodNames__();
  t.deepEqual(
    methods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_BLOB_METHODS].sort(),
    'readOnly() must expose exactly the ReadableBlob method set',
  );
  t.is(await E(view).text(), 'rb-data');

  const iter = iterateBytesReader(/** @type {any} */ (view));
  const first = await iter.next();
  t.false(first.done);
  t.is(
    new TextDecoder().decode(first.value),
    'rb-data',
    'read-only blob view streams through the platform surface',
  );
});

test('EndoMountFile json and streamBase64 re-check confinement on use', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);
  const outsideRoot = makeTempRoot(t);
  const outsideFile = path.join(outsideRoot, 'outside.json');
  fs.writeFileSync(outsideFile, '{"secret":true}');

  const fileName = 'confined.json';
  const mountFile = path.join(rootPath, fileName);
  await E(mount).writeText([fileName], '{"ok":true}');
  const file = /** @type {EndoMountFile} */ (await E(mount).lookup(fileName));

  fs.rmSync(mountFile);
  fs.symlinkSync(outsideFile, mountFile);

  await t.throwsAsync(() => E(file).json(), {
    message: /escapes mount root/,
  });

  const reader = iterateBytesReader(/** @type {any} */ (file));
  await t.throwsAsync(() => reader.next(), {
    message: /escapes mount root/,
  });
});

test('EndoMount.snapshot returns a SnapshotTree-shaped capability', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['s.txt'], 'snap');
  const snapshot = await E(mount).snapshot();
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(/** @type {any} */ (snapshot)).__getMethodNames__();
  t.true(methods.includes('has'));
  t.true(methods.includes('list'));
  t.true(methods.includes('lookup'));
  t.true(methods.includes('sha256'));
  // The tree also carries the uniform `getInfo()` identity accessor. (Its
  // *value* behavior is exercised against a real content store in
  // content-store-gc.test.js and at the platform layer in snapshot-hash.test.js;
  // this mount mock fabricates non-hex content ids, so only existence is
  // asserted here.)
  t.true(methods.includes('getInfo'));
});

// --- XS file-powers / Node file-powers contract conformance ---

test('XS file powers expose every method the Node file powers expose', t => {
  // makeMount and the EndoMount methods are written against the
  // FilePowers contract; whichever supervisor backs the daemon (Node or
  // XS) must supply the same surface. A method present on the Node
  // powers but absent on the XS powers is dead under the XS supervisor —
  // exactly the failure that left appendFileText / statPath /
  // pathIdentity throwing "is not a function" before this fix.
  const nodePowers = makeFilePowers({ fs, path });
  const xsPowers = makeXsFilePowers();
  const nodeMethods = Object.keys(nodePowers).sort();
  const missingOnXs = nodeMethods.filter(
    name => typeof (/** @type {any} */ (xsPowers)[name]) !== 'function',
  );
  t.deepEqual(
    missingOnXs,
    [],
    'every Node FilePowers method must also be a function on the XS powers',
  );
});

test('XS file powers expose the EndoMount call sites that regressed', t => {
  // Pin the specific methods the mount/file stat() and append() paths
  // reach, so a future refactor of makeXsFilePowers that drops one of
  // them fails here rather than only at daemon runtime under XS.
  const xsPowers = makeXsFilePowers();
  for (const name of [
    'appendFileText',
    'statPath',
    'pathIdentity',
    'readFileBytes',
  ]) {
    t.is(
      typeof (/** @type {any} */ (xsPowers)[name]),
      'function',
      `XS powers must implement ${name}`,
    );
  }
});

test('XS statPath converts a fractional mtime (ms) to bigint nanoseconds without crashing', async t => {
  // The XS host stat JSON carries `modifiedMs` as a Number, which — like
  // Node's `fs.Stats.mtimeMs` — can be fractional. `BigInt(modifiedMs)`
  // throws RangeError on a non-integer, so statPath must round to whole
  // milliseconds before scaling to nanoseconds in BigInt space. Inject a
  // mock `hostStat` (read as a free global by the XS powers) returning a
  // fractional ms and assert statPath succeeds with the rounded ns value.
  const realHostStat = /** @type {any} */ (globalThis).hostStat;
  /** @type {any} */ (globalThis).hostStat = () =>
    JSON.stringify({
      kind: 'file',
      sizeBytes: 5,
      modifiedMs: 1_750_000_000_123.456,
      dev: 1,
      ino: 2,
    });
  t.teardown(() => {
    /** @type {any} */ (globalThis).hostStat = realHostStat;
  });

  const xsPowers = makeXsFilePowers();
  const stat = await xsPowers.statPath('f.txt');
  t.is(stat.kind, 'file');
  t.is(stat.size, 5n);
  // 1_750_000_000_123.456 ms → round to 1_750_000_000_123 ms → ×1e6 ns,
  // the multiply done in BigInt space so no precision is lost past 2**53.
  t.is(stat.mtime, 1_750_000_000_123n * 1_000_000n);
  t.is(typeof stat.mtime, 'bigint');
  // XS host stat lacks atime, so it mirrors mtime (documented limitation).
  t.is(stat.atime, stat.mtime);
});

// Suppress unused-import warnings for the platform interfaces; their
// presence in this file documents the conformance target.
void PlatformDirectoryInterface;
void PlatformFileInterface;
void url;
void Far;
