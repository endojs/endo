// @ts-check
/* eslint-disable no-await-in-loop */

/**
 * Tests for the Endo Mount-backed VFS adapter.
 *
 * The adapter sits between the genie's file tools (which speak the
 * {@link VFS} interface in `vfs.js`) and the daemon's
 * `MountInterface` (in `packages/daemon/src/interfaces.js`).  The
 * tests run against an **in-memory Mount fake** rather than a real
 * daemon-side `provideMount`: that keeps the unit suite portable and
 * avoids the ~5 s/test daemon-fork overhead.  The fake mirrors the
 * subset of `MountInterface` the adapter actually drives — `has`,
 * `list`, `lookup`, `readText`, `writeText`, `remove`,
 * `makeDirectory` — and exposes `__getMethodNames__()` so the
 * adapter's file-vs-directory discriminator (`typeFromMethods`) works
 * the same way it would against a real `makeExo()` Mount.
 *
 * Coverage matches the adapter's gap analysis at the top of
 * `vfs-mount.js`:
 *
 *   - `readFile` / `writeFile` / `mkdir` / `unlink` / `rmdir` ride the
 *     direct method translation.
 *   - `stat` size is synthesised by reading the file (documented gap).
 *   - `createReadStream({ start, end })` reads the whole text and
 *     slices (documented gap, exercised here for byte-range reads
 *     that the file tool uses for `offset` / `limit`).
 *   - `rm({ recursive: true })` walks depth-first because
 *     `Mount.remove` is non-recursive.
 *   - `readdir` yields async-iterable entries with size synthesis.
 */

import '@endo/init/debug.js';

import test from 'ava';

import { makeMountVFS } from '../../src/tools/vfs-mount.js';

// ---------------------------------------------------------------------------
// In-memory Mount fake
// ---------------------------------------------------------------------------

/**
 * @typedef {{ kind: 'file', content: string }} FakeFileNode
 * @typedef {{ kind: 'directory', children: Map<string, FakeFileNode | FakeDirNode> }} FakeDirNode
 */

/**
 * Build an in-memory Mount fake whose surface matches the subset of
 * `MountInterface` that `vfs-mount.js` consumes.
 *
 * The fake stores its tree as nested `Map`s and discriminates between
 * file and directory nodes via a `kind` tag.  `lookup` returns sub-
 * mounts (for directories) or `MountFile`-shaped objects (for files);
 * both expose `__getMethodNames__` so the adapter's
 * `typeFromMethods` discriminator works the same way it would
 * against a real `makeExo()` Mount.
 *
 * @param {Record<string, string | Record<string, unknown>>} [seed]
 *   Optional initial layout: `{ 'a/b.txt': 'hello', 'sub/': { ... } }`.
 *   Supports nested object literals for directories.
 * @returns {{
 *   mount: any;
 *   tree: FakeDirNode;
 * }}
 */
const makeFakeMount = (seed = {}) => {
  /** @type {FakeDirNode} */
  const root = { kind: 'directory', children: new Map() };

  /** @param {string | string[]} pathArg @returns {string[]} */
  const toSegments = pathArg => {
    if (Array.isArray(pathArg)) return pathArg;
    if (pathArg === '' || pathArg === '/') return [];
    // Strip leading slash, drop empties / dots.
    return pathArg.split('/').filter(part => part !== '' && part !== '.');
  };

  /**
   * @param {FakeDirNode} dir
   * @param {string[]} segments
   * @param {boolean} createDirs
   * @returns {{ parent: FakeDirNode, name: string } | null}
   */
  const walkToParent = (dir, segments, createDirs) => {
    if (segments.length === 0) return null;
    let current = dir;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const part = segments[i];
      let child = current.children.get(part);
      if (!child) {
        if (!createDirs) return null;
        /** @type {FakeDirNode} */
        const newDir = { kind: 'directory', children: new Map() };
        current.children.set(part, newDir);
        child = newDir;
      }
      if (child.kind !== 'directory') return null;
      current = child;
    }
    return { parent: current, name: segments[segments.length - 1] };
  };

  /**
   * @param {string[]} segments
   * @returns {FakeFileNode | FakeDirNode | undefined}
   */
  const lookupNode = segments => {
    if (segments.length === 0) return root;
    const walk = walkToParent(root, segments, false);
    if (!walk) return undefined;
    return walk.parent.children.get(walk.name);
  };

  /**
   * Wrap a file node into a MountFile-shaped exo: the adapter
   * discovers it via `__getMethodNames__()` and reads via `text()`.
   *
   * @param {FakeFileNode} node
   */
  const makeFileExo = node => ({
    __getMethodNames__: async () => ['text', 'streamBase64', 'help'],
    text: async () => node.content,
  });

  /**
   * Wrap a directory node into a sub-Mount-shaped object.  The
   * adapter only ever calls `__getMethodNames__()` on this to
   * classify it as a directory, so the rest of the surface is left
   * unimplemented.
   */
  const makeDirExo = () => ({
    __getMethodNames__: async () => [
      'has',
      'list',
      'lookup',
      'readText',
      'writeText',
      'remove',
      'makeDirectory',
      'help',
    ],
  });

  // Seed the tree.
  for (const [path, value] of Object.entries(seed)) {
    const segments = toSegments(path);
    if (typeof value === 'string') {
      const walk = walkToParent(root, segments, true);
      if (walk) {
        walk.parent.children.set(walk.name, { kind: 'file', content: value });
      }
    } else {
      // Nested object → directory.
      const walk = walkToParent(root, segments, true);
      if (walk) {
        const dir = /** @type {FakeDirNode} */ ({
          kind: 'directory',
          children: new Map(),
        });
        walk.parent.children.set(walk.name, dir);
      }
    }
  }

  const mount = {
    /** @param {string[]} pathSegments */
    has: async (...pathSegments) => {
      return lookupNode(pathSegments) !== undefined;
    },
    /** @param {string[]} pathSegments */
    list: async (...pathSegments) => {
      const node = lookupNode(pathSegments);
      if (!node) {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOENT: ${pathSegments.join('/')}`)
        );
        err.code = 'ENOENT';
        throw err;
      }
      if (node.kind !== 'directory') {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOTDIR: ${pathSegments.join('/')}`)
        );
        err.code = 'ENOTDIR';
        throw err;
      }
      return [...node.children.keys()].sort();
    },
    /** @param {string | string[]} pathArg */
    lookup: async pathArg => {
      const segments = toSegments(pathArg);
      const node = lookupNode(segments);
      if (!node) {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOENT: ${segments.join('/')}`)
        );
        err.code = 'ENOENT';
        throw err;
      }
      if (node.kind === 'directory') return makeDirExo();
      return makeFileExo(node);
    },
    /** @param {string | string[]} pathArg */
    readText: async pathArg => {
      const segments = toSegments(pathArg);
      const node = lookupNode(segments);
      if (!node) {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOENT: ${segments.join('/')}`)
        );
        err.code = 'ENOENT';
        throw err;
      }
      if (node.kind !== 'file') {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`EISDIR: ${segments.join('/')}`)
        );
        err.code = 'EISDIR';
        throw err;
      }
      return node.content;
    },
    /**
     * @param {string | string[]} pathArg
     * @param {string} content
     */
    writeText: async (pathArg, content) => {
      const segments = toSegments(pathArg);
      if (segments.length === 0) {
        throw new Error('Cannot writeText to mount root');
      }
      const walk = walkToParent(root, segments, true);
      if (!walk) throw new Error('write target not reachable');
      const existing = walk.parent.children.get(walk.name);
      if (existing && existing.kind === 'directory') {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`EISDIR: ${segments.join('/')}`)
        );
        err.code = 'EISDIR';
        throw err;
      }
      walk.parent.children.set(walk.name, { kind: 'file', content });
    },
    /** @param {string | string[]} pathArg */
    remove: async pathArg => {
      const segments = toSegments(pathArg);
      if (segments.length === 0) {
        throw new Error('Cannot remove mount root');
      }
      const walk = walkToParent(root, segments, false);
      if (!walk) {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOENT: ${segments.join('/')}`)
        );
        err.code = 'ENOENT';
        throw err;
      }
      const node = walk.parent.children.get(walk.name);
      if (!node) {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOENT: ${segments.join('/')}`)
        );
        err.code = 'ENOENT';
        throw err;
      }
      if (node.kind === 'directory' && node.children.size > 0) {
        const err = /** @type {NodeJS.ErrnoException} */ (
          new Error(`ENOTEMPTY: ${segments.join('/')}`)
        );
        err.code = 'ENOTEMPTY';
        throw err;
      }
      walk.parent.children.delete(walk.name);
    },
    /** @param {string | string[]} pathArg */
    makeDirectory: async pathArg => {
      const segments = toSegments(pathArg);
      if (segments.length === 0) return; // root always exists
      // Idempotent + recursive (matches Mount.makeDirectory semantics).
      const walk = walkToParent(root, segments, true);
      if (!walk) throw new Error('Cannot create directory under non-directory');
      const existing = walk.parent.children.get(walk.name);
      if (existing) {
        if (existing.kind !== 'directory') {
          const err = /** @type {NodeJS.ErrnoException} */ (
            new Error(`ENOTDIR: ${segments.join('/')}`)
          );
          err.code = 'ENOTDIR';
          throw err;
        }
        return;
      }
      walk.parent.children.set(walk.name, {
        kind: 'directory',
        children: new Map(),
      });
    },
  };

  return { mount, tree: root };
};

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

test('makeMountVFS — path utilities are POSIX-style', t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  t.is(vfs.sep, '/');
  t.is(vfs.join('a', 'b', 'c'), 'a/b/c');
  t.is(vfs.relative('/workspace', '/workspace/sub/file.txt'), 'sub/file.txt');
});

test('makeMountVFS — resolve enforces the root', t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  t.is(vfs.resolve('a/b'), '/workspace/a/b');
  t.is(vfs.resolve('/workspace/foo'), '/workspace/foo');
  t.throws(() => vfs.resolve('/etc/passwd'), { message: /under root/ });
  t.throws(() => vfs.resolve('../escape'), { message: /under root/ });
});

// ---------------------------------------------------------------------------
// readFile / writeFile
// ---------------------------------------------------------------------------

test('readFile reads through the Mount cap', async t => {
  const { mount } = makeFakeMount({ 'hello.txt': 'world' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const text = await vfs.readFile('/workspace/hello.txt');
  t.is(text, 'world');
});

test('readFile surfaces ENOENT for missing paths', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(() => vfs.readFile('/workspace/missing.txt'));
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'ENOENT');
});

test('writeFile writes through the Mount cap and creates parents', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await vfs.writeFile('/workspace/new.txt', 'fresh');
  // Confirm via the same Mount surface.
  t.is(await mount.readText('new.txt'), 'fresh');
});

test('writeFile rejects writing to the mount root', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(() => vfs.writeFile('/workspace', 'oops'));
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'EISDIR');
});

// ---------------------------------------------------------------------------
// createReadStream — partial reads (the file tool uses this for offset/limit)
// ---------------------------------------------------------------------------

/**
 * Concatenate Uint8Array chunks and decode as UTF-8.
 *
 * @param {Uint8Array[]} chunks
 * @returns {string}
 */
const concatChunksToString = chunks => {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(out);
};

test('createReadStream yields the full content when no range is given', async t => {
  const { mount } = makeFakeMount({ 'data.txt': '0123456789' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const chunks = [];
  for await (const chunk of vfs.createReadStream('/workspace/data.txt')) {
    chunks.push(chunk);
  }
  t.is(concatChunksToString(chunks), '0123456789');
});

test('createReadStream slices with start/end (inclusive end)', async t => {
  const { mount } = makeFakeMount({ 'data.txt': '0123456789' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const chunks = [];
  for await (const chunk of vfs.createReadStream('/workspace/data.txt', {
    start: 2,
    end: 5,
  })) {
    chunks.push(chunk);
  }
  t.is(concatChunksToString(chunks), '2345');
});

// ---------------------------------------------------------------------------
// stat
// ---------------------------------------------------------------------------

test('stat synthesises file metadata via lookup + text', async t => {
  const { mount } = makeFakeMount({ 'note.txt': 'hello' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const info = await vfs.stat('/workspace/note.txt');
  t.is(info.type, 'file');
  t.is(info.size, 5);
  // mtime is documented as empty (no MountInterface.stat yet).
  t.is(info.mtime, '');
});

test('stat reports the mount root as a directory', async t => {
  const { mount } = makeFakeMount({ 'a.txt': 'a' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const info = await vfs.stat('/workspace');
  t.is(info.type, 'directory');
  t.is(info.size, 0);
});

test('stat throws ENOENT for missing paths', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(() => vfs.stat('/workspace/missing'));
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'ENOENT');
});

// ---------------------------------------------------------------------------
// mkdir / unlink / rmdir
// ---------------------------------------------------------------------------

test('mkdir creates a directory and returns true on first creation', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const created = await vfs.mkdir('/workspace/new-dir');
  t.true(created);
  t.true(await mount.has('new-dir'));
});

test('mkdir is idempotent and returns false the second time', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await vfs.mkdir('/workspace/already');
  const second = await vfs.mkdir('/workspace/already');
  t.false(second);
});

test('unlink removes a file', async t => {
  const { mount } = makeFakeMount({ 'doomed.txt': 'bye' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await vfs.unlink('/workspace/doomed.txt');
  t.false(await mount.has('doomed.txt'));
});

test('unlink refuses to remove a directory', async t => {
  const { mount } = makeFakeMount({ 'sub/inner.txt': 'x' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(() => vfs.unlink('/workspace/sub'));
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'EISDIR');
});

test('rmdir removes an empty directory', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await vfs.mkdir('/workspace/empty');
  await vfs.rmdir('/workspace/empty');
  t.false(await mount.has('empty'));
});

test('rmdir refuses to remove a file', async t => {
  const { mount } = makeFakeMount({ 'note.txt': 'x' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(() => vfs.rmdir('/workspace/note.txt'));
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'ENOTDIR');
});

// ---------------------------------------------------------------------------
// rm — recursive walk
// ---------------------------------------------------------------------------

test('rm({ recursive: true }) walks depth-first because Mount.remove is non-recursive', async t => {
  const { mount } = makeFakeMount({
    'tree/a.txt': 'a',
    'tree/sub/b.txt': 'b',
    'tree/sub/c.txt': 'c',
  });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await vfs.rm('/workspace/tree', { recursive: true });
  t.false(await mount.has('tree'));
});

test('rm without recursive on a non-empty directory throws EISDIR', async t => {
  const { mount } = makeFakeMount({ 'tree/a.txt': 'a' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(() => vfs.rm('/workspace/tree'));
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'EISDIR');
});

test('rm refuses to delete the mount root', async t => {
  const { mount } = makeFakeMount({ 'a.txt': 'a' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await t.throwsAsync(() => vfs.rm('/workspace', { recursive: true }), {
    message: /mount root/,
  });
});

// ---------------------------------------------------------------------------
// readdir — async iterable
// ---------------------------------------------------------------------------

test('readdir yields shallow entries with synthesised size', async t => {
  const { mount } = makeFakeMount({
    'a.txt': 'aa',
    'b.txt': 'bbb',
    'sub/inner.txt': 'x',
  });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  /** @type {Array<{ name: string, type: string, size: number }>} */
  const entries = [];
  for await (const e of vfs.readdir('/workspace')) {
    entries.push({ name: e.name, type: e.type, size: e.size });
  }
  // Order matches Mount.list (sorted) since the fake sorts.
  t.deepEqual(
    entries.sort((x, y) => x.name.localeCompare(y.name)),
    [
      { name: 'a.txt', type: 'file', size: 2 },
      { name: 'b.txt', type: 'file', size: 3 },
      { name: 'sub', type: 'directory', size: 0 },
    ],
  );
});

test('readdir with recursive flattens descendants under prefixed names', async t => {
  const { mount } = makeFakeMount({
    'a.txt': 'a',
    'sub/b.txt': 'bb',
    'sub/deep/c.txt': 'ccc',
  });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  /** @type {string[]} */
  const names = [];
  for await (const e of vfs.readdir('/workspace', { recursive: true })) {
    names.push(e.name);
  }
  t.deepEqual(names.sort(), [
    'a.txt',
    'sub',
    'sub/b.txt',
    'sub/deep',
    'sub/deep/c.txt',
  ]);
});

test('readdir throws ENOENT when the path is missing', async t => {
  const { mount } = makeFakeMount();
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(async () => {
    for await (const _ of vfs.readdir('/workspace/missing')) {
      // unreachable
    }
  });
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'ENOENT');
});

test('readdir throws ENOTDIR when the path is a file', async t => {
  const { mount } = makeFakeMount({ 'a.txt': 'a' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  const err = await t.throwsAsync(async () => {
    for await (const _ of vfs.readdir('/workspace/a.txt')) {
      // unreachable
    }
  });
  t.is(/** @type {NodeJS.ErrnoException} */ (err).code, 'ENOTDIR');
});

// ---------------------------------------------------------------------------
// Confinement — paths outside the rootDir prefix must not reach the mount.
// ---------------------------------------------------------------------------

test('paths outside the configured rootDir are rejected', async t => {
  const { mount } = makeFakeMount({ 'a.txt': 'a' });
  const vfs = makeMountVFS({ mount, rootDir: '/workspace' });
  await t.throwsAsync(() => vfs.readFile('/etc/passwd'), {
    message: /under root/,
  });
});
