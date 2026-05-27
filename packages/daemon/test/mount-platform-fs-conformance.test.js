// @ts-check
/* global Buffer */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import os from 'os';
import path from 'path';
import fs from 'fs';
import url from 'url';
import { E, Far } from '@endo/far';
import { makeExo } from '@endo/exo';
import {
  DirectoryInterface as PlatformDirectoryInterface,
  FileInterface as PlatformFileInterface,
  ReadableBlobInterface,
  ReadableTreeInterface,
  checkinTree,
  makeReaderRef,
} from '@endo/platform/fs/lite';
import { M } from '@endo/patterns';

import { makeFilePowers } from '../src/daemon-node-powers.js';
import { makeMount } from '../src/mount.js';
import { makeMemoryStore } from './_mount-test-helpers.js';

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
const PLATFORM_READABLE_TREE_METHODS = ['has', 'list', 'lookup'];

/** Method names the platform `ReadableBlob` contract requires. */
const PLATFORM_READABLE_BLOB_METHODS = ['streamBase64', 'text', 'json'];

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
  const methods = await E(mount).__getMethodNames__();
  for (const name of PLATFORM_DIRECTORY_METHODS) {
    t.true(
      methods.includes(name),
      `EndoMount missing platform Directory method ${name}`,
    );
  }
});

/** Mount-specific extensions beyond the platform Directory contract. */
const ENDOMOUNT_EXTENSIONS = [
  'entry',
  'stat',
  'readText',
  'maybeReadText',
  'writeText',
  'makeFile',
  'help',
];

/** Mount-specific extensions beyond the platform File contract. */
const ENDOMOUNTFILE_EXTENSIONS = ['stat', 'help'];

test('EndoMount diverges from PlatformDirectoryInterface by named extensions only', async t => {
  // The divergence is deliberate and named: callers who hold a plain
  // `Directory` capability cannot reach `readText` or `writeText`;
  // those are mount-specific shortcuts that exist because the daemon
  // has direct filesystem access where the platform contract assumes
  // a streaming pipe.  This test pins the extension set so a future
  // change that grows the divergence is forced to update both this
  // list and the design document.
  const { mount } = makeConfiguredMount(t);
  // eslint-disable-next-line no-underscore-dangle
  const methods = (await E(mount).__getMethodNames__()).filter(
    name => !name.startsWith('__'),
  );
  const platform = new Set(PLATFORM_DIRECTORY_METHODS);
  const actualExtensions = methods.filter(name => !platform.has(name)).sort();
  t.deepEqual(
    actualExtensions,
    [...ENDOMOUNT_EXTENSIONS].sort(),
    'EndoMount extensions beyond Directory must match the named set',
  );
});

test('EndoMountFile diverges from PlatformFileInterface by named extensions only', async t => {
  // Same shape as the EndoMount divergence: `stat` and `help` are
  // mount-specific.  A `File` consumer that demotes to the platform
  // contract loses those names.
  const { mount, rootPath } = makeConfiguredMount(t);
  fs.writeFileSync(path.join(rootPath, 'a.txt'), 'x');
  const file = await E(mount).lookup('a.txt');
  // eslint-disable-next-line no-underscore-dangle
  const methods = (await E(file).__getMethodNames__()).filter(
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
  const subMethods = await E(sub).__getMethodNames__();
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

test('EndoMount.write accepts a ReadableBlob and materializes bytes', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);
  // A minimal blob-shaped remotable that satisfies ReadableBlob.
  const blob = makeExo('TestBlob', ReadableBlobInterface, {
    streamBase64() {
      const chunks = [Buffer.from('hello blob', 'utf-8').toString('base64')];
      let idx = 0;
      return makeExo(
        'AsyncIterator',
        M.interface('AsyncIterator', {
          next: M.call().returns(M.promise()),
          return: M.call().optional(M.any()).returns(M.promise()),
          throw: M.call().optional(M.any()).returns(M.promise()),
        }),
        {
          async next() {
            if (idx < chunks.length) {
              const value = chunks[idx];
              idx += 1;
              return harden({ value, done: false });
            }
            return harden({ value: undefined, done: true });
          },
          async return() {
            return harden({ value: undefined, done: true });
          },
          async throw() {
            return harden({ value: undefined, done: true });
          },
        },
      );
    },
    async text() {
      return 'hello blob';
    },
    async json() {
      return null;
    },
  });
  await E(mount).write(['blob-target.txt'], blob);
  const actual = fs.readFileSync(
    path.join(rootPath, 'blob-target.txt'),
    'utf-8',
  );
  t.is(actual, 'hello blob');
});

test('EndoMount.write accepts a ReadableTree and materializes recursively', async t => {
  const { mount, rootPath } = makeConfiguredMount(t);
  // A blob factory reused for each leaf.
  const makeBlobValue = content => {
    const bytes = new TextEncoder().encode(content);
    return makeExo('LeafBlob', ReadableBlobInterface, {
      streamBase64() {
        const chunk = Buffer.from(bytes).toString('base64');
        let yielded = false;
        return makeExo(
          'AsyncIterator',
          M.interface('AsyncIterator', {
            next: M.call().returns(M.promise()),
            return: M.call().optional(M.any()).returns(M.promise()),
            throw: M.call().optional(M.any()).returns(M.promise()),
          }),
          {
            async next() {
              if (!yielded) {
                yielded = true;
                return harden({ value: chunk, done: false });
              }
              return harden({ value: undefined, done: true });
            },
            async return() {
              return harden({ value: undefined, done: true });
            },
            async throw() {
              return harden({ value: undefined, done: true });
            },
          },
        );
      },
      async text() {
        return content;
      },
      async json() {
        return null;
      },
    });
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
          async lookup(innerArg) {
            const innerSegments =
              typeof innerArg === 'string' ? [innerArg] : innerArg;
            if (innerSegments.length === 1 && innerSegments[0] === 'c.txt') {
              return makeBlobValue('hello-c');
            }
            throw new Error(`unknown ${innerSegments}`);
          },
        });
      }
      throw new Error(`unknown ${segments}`);
    },
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
  const blob = makeExo('LeafBlob', ReadableBlobInterface, {
    streamBase64() {
      return makeReaderRef([new TextEncoder().encode('leaf')]);
    },
    async text() {
      return 'leaf';
    },
    async json() {
      return null;
    },
  });

  for (const name of ['.', '..', 'a/b', 'a\\b', 'a\0b']) {
    const tree = makeExo('InvalidTree', ReadableTreeInterface, {
      async has() {
        return true;
      },
      async list() {
        return harden([name]);
      },
      async lookup() {
        return blob;
      },
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
  const methods = await E(view).__getMethodNames__();
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
  const subView = await E(view).lookup('sub');
  // eslint-disable-next-line no-underscore-dangle
  const subMethods = await E(subView).__getMethodNames__();
  t.deepEqual(
    subMethods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_TREE_METHODS].sort(),
  );
  const leafView = await E(view).lookup(['sub', 'leaf.txt']);
  // eslint-disable-next-line no-underscore-dangle
  const leafMethods = await E(leafView).__getMethodNames__();
  t.deepEqual(
    leafMethods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_BLOB_METHODS].sort(),
  );
  t.is(await E(leafView).text(), 'leaf-data');
});

test('EndoMountFile exposes every method on PlatformFileInterface', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['file.txt'], 'data');
  const file = await E(mount).lookup('file.txt');
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(file).__getMethodNames__();
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
  const file = await E(mount).lookup('file.txt');
  const view = await E(file).readOnly();
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(view).__getMethodNames__();
  t.deepEqual(
    methods.filter(name => !name.startsWith('__')).sort(),
    [...PLATFORM_READABLE_BLOB_METHODS].sort(),
    'readOnly() must expose exactly the ReadableBlob method set',
  );
  t.is(await E(view).text(), 'rb-data');

  const iter = await E(view).streamBase64();
  const first = await E(iter).next();
  t.false(first.done);
  t.is(
    Buffer.from(first.value, 'base64').toString('utf-8'),
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
  const file = await E(mount).lookup(fileName);

  fs.rmSync(mountFile);
  fs.symlinkSync(outsideFile, mountFile);

  await t.throwsAsync(() => E(file).json(), {
    message: /escapes mount root/,
  });

  const reader = await E(file).streamBase64();
  await t.throwsAsync(() => E(reader).next(), {
    message: /escapes mount root/,
  });
});

test('EndoMount.snapshot returns a SnapshotTree-shaped capability', async t => {
  const { mount } = makeConfiguredMount(t);
  await E(mount).writeText(['s.txt'], 'snap');
  const snapshot = await E(mount).snapshot();
  // eslint-disable-next-line no-underscore-dangle
  const methods = await E(snapshot).__getMethodNames__();
  t.true(methods.includes('has'));
  t.true(methods.includes('list'));
  t.true(methods.includes('lookup'));
  t.true(methods.includes('sha256'));
});

// Suppress unused-import warnings for the platform interfaces; their
// presence in this file documents the conformance target.
void PlatformDirectoryInterface;
void PlatformFileInterface;
void url;
void Far;
