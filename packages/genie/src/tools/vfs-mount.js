// @ts-check
/* eslint-disable no-await-in-loop */

/**
 * Endo Mount-backed VFS Implementation
 *
 * Adapts an Endo `Mount` capability (see
 * `packages/daemon/src/interfaces.js` `MountInterface`) to the
 * {@link VFS} interface so the genie file tools can route reads and
 * writes through the cap surface that `setup.js` minted as
 * `workspace-mount`, instead of holding ambient host fs authority.
 *
 * Two facets meet at this seam:
 *
 *   - The genie's file tools call `vfs.readFile`, `vfs.writeFile`,
 *     `vfs.stat`, `vfs.readdir`, etc. with absolute paths under a
 *     `rootDir` they resolved via `safePath()`.
 *   - The `MountInterface` accepts `string | string[]` path arguments
 *     where the array form is the segment list relative to the mount
 *     root; segment validation and confinement checks live inside the
 *     daemon (`packages/daemon/src/mount.js`).
 *
 * The adapter bridges by stripping `rootDir` from each absolute path
 * to derive the segment list, then delegating to the Mount via
 * `E(mount).foo(segments, ...)`.  Path utilities (`sep`, `join`,
 * `relative`, `resolve`) stay as thin wrappers over Node's
 * `path/posix` so the genie tool bodies (which still operate on
 * strings) do not need to learn segment arrays.
 *
 * ## Adaptation gaps (documented for callers)
 *
 *   - **`stat` mtime**: `MountInterface` does not expose a stat
 *     operation, so this adapter synthesises `{ size, mtime, type }`
 *     from `lookup` (to discriminate file vs directory) plus a
 *     whole-file read for size.  The `mtime` field is reported as
 *     an empty ISO-8601 string — daemon-side helpers like
 *     `provideHostPath` could be wired up later if the file tools
 *     ever actually need mtime semantics.  See `TODO/25` for the
 *     follow-up to add a real `MountInterface.stat`.
 *
 *   - **Byte-range reads**: `EndoMountFile.streamBase64` is whole-file
 *     only, so `createReadStream({ start, end })` reads the whole file
 *     via `readText` and slices the resulting bytes.  This is fine for
 *     the genie's current consumers (`readFile` capped at 100 MiB) but
 *     is not a true streaming path.  A future deliverable could extend
 *     `MountFileInterface` with a `streamBytesRange(start, end)`
 *     method; for now, the adapter trades CapTP round-trips for memory.
 *
 *   - **Recursive `rm`**: `Mount.remove` is non-recursive (it bottoms
 *     out on `fs.promises.rm(path, { force: true })`).  This adapter
 *     implements `rm({ recursive: true })` by walking the tree
 *     depth-first via `list` and `lookup`, removing files then empty
 *     directories.
 *
 * @module
 */

import {
  resolve as posixResolve,
  relative as posixRelative,
  join as posixJoin,
  sep as posixSep,
} from 'path/posix';

import { E } from '@endo/eventual-send';
import harden from '@endo/harden';

/**
 * @import {
 *   VFS,
 *   VFSStat,
 *   VFSDirEntry,
 * } from './vfs.js'
 */

/**
 * Subset of the daemon's `MountInterface` that this adapter drives.
 * Kept as a structural type so unit tests can pass plain in-memory
 * fakes without spinning up a daemon.
 *
 * @typedef {object} MountVFSCapShape
 * @property {(...segments: string[]) => Promise<boolean>} has
 * @property {(...segments: string[]) => Promise<string[]>} list
 * @property {(pathArg: string | string[]) => Promise<unknown>} lookup
 * @property {(pathArg: string | string[]) => Promise<string>} readText
 * @property {(pathArg: string | string[], content: string) => Promise<void>} writeText
 * @property {(pathArg: string | string[]) => Promise<void>} remove
 * @property {(from: string | string[], to: string | string[]) => Promise<void>} move
 * @property {(pathArg: string | string[]) => Promise<void>} makeDirectory
 */

/**
 * Eventual-send-friendly form of {@link MountVFSCapShape}.  Methods on
 * a remote Mount cap return promises, so we let callers pass either a
 * local fake or a far reference.
 *
 * @typedef {import('@endo/eventual-send').ERef<MountVFSCapShape>} MountVFSCap
 */

/**
 * Synthesise a {@link VFSStat.type} from a remote object's interface.
 *
 * `Mount.lookup` returns either a sub-Mount (directory) or a
 * `EndoMountFile` (regular file).  We discriminate by feature-testing
 * `text` (file-only) and `list` (directory-only).
 *
 * Symlinks are not currently distinguishable through the `Mount`
 * surface; the daemon's `lookup` follows them transparently and
 * reports either `file` or `directory` depending on the target.
 * Special files (sockets, devices) cannot be reached through the
 * Mount surface at all, so `'other'` is unreachable here in practice.
 *
 * @param {string[]} methodNames
 * @returns {'file' | 'directory'}
 */
const typeFromMethods = methodNames => {
  if (methodNames.includes('text') || methodNames.includes('streamBase64')) {
    return 'file';
  }
  return 'directory';
};
harden(typeFromMethods);

/**
 * Make an ENOENT-style error with the same shape `vfs-node.js` would
 * surface.  Lets the genie file tools pattern-match on `err.code` for
 * the same "File not found" / "Directory not found" behaviour
 * regardless of which VFS backend they ride.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const enoent = path => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`ENOENT: no such file or directory, '${path}'`)
  );
  err.code = 'ENOENT';
  return err;
};
harden(enoent);

/**
 * Make an ENOTDIR-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const enotdir = path => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`ENOTDIR: not a directory, '${path}'`)
  );
  err.code = 'ENOTDIR';
  return err;
};
harden(enotdir);

/**
 * Make an EISDIR-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const eisdir = path => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`EISDIR: illegal operation on a directory, '${path}'`)
  );
  err.code = 'EISDIR';
  return err;
};
harden(eisdir);

/**
 * Create a Mount-backed VFS rooted at `rootDir`.
 *
 * `rootDir` is the absolute logical path the genie tools resolve
 * paths against (typically `GENIE_WORKSPACE` or
 * `provideHostPath(mountCap)` for the daemon-hosted genie).  The
 * adapter strips that prefix from every absolute path it receives to
 * derive the segment list it forwards to the Mount.
 *
 * @param {object} options
 * @param {MountVFSCap} options.mount - Endo Mount capability rooted
 *   at the same workspace as `rootDir`.
 * @param {string} options.rootDir - Absolute logical path the file
 *   tools resolve paths against.  Defaults to `'/'` when omitted,
 *   which is appropriate when the caller is feeding already-relative
 *   paths.
 * @returns {VFS}
 */
const makeMountVFS = ({ mount, rootDir = '/' }) => {
  const resolvedRoot = posixResolve(rootDir);

  // ---- Path utilities ---------------------------------------------------

  const sep = posixSep;

  /** @type {VFS['join']} */
  const join = (...parts) => posixJoin(...parts);

  /** @type {VFS['relative']} */
  const relative = (from, to) => posixRelative(from, to);

  /**
   * Resolve a sequence of paths into an absolute path under the
   * configured root.  The result is guaranteed to stay under
   * `resolvedRoot` (throws otherwise).
   *
   * @type {VFS['resolve']}
   */
  const resolve = (...paths) => {
    const resolved = posixResolve(resolvedRoot, ...paths);
    const rel = posixRelative(resolvedRoot, resolved);
    if (rel.startsWith('..') || posixResolve(rel) === rel) {
      throw new Error(
        `Invalid path: must resolve under root (${resolvedRoot})`,
      );
    }
    return resolved;
  };

  // ---- Path → segments translation -------------------------------------

  /**
   * Compute the segment list (relative to the mount root) for a path
   * the file tools resolved against `rootDir`.  Returns the empty
   * array when the path equals the root (i.e. the mount itself).
   *
   * @param {string} absolutePath
   * @returns {string[]}
   */
  const segmentsFor = absolutePath => {
    const rel = posixRelative(resolvedRoot, absolutePath);
    if (rel === '' || rel === '.') {
      return [];
    }
    if (rel.startsWith('..')) {
      throw new Error(
        `Invalid path: must resolve under root (${resolvedRoot}): ${absolutePath}`,
      );
    }
    return rel.split('/').filter(part => part !== '' && part !== '.');
  };

  // ---- VFS methods ------------------------------------------------------

  /**
   * Probe a remote object's method set so callers can discriminate
   * between Mount (directory) and MountFile (file) without duck-typing.
   * Falls back to a `text`-shaped guess when the remote does not
   * expose `__getMethodNames__` (e.g. an in-memory test fake).
   *
   * @param {unknown} ref
   * @returns {Promise<string[]>}
   */
  const methodNamesOf = async ref => {
    try {
      const names = /** @type {unknown} */ (
        // @ts-expect-error — exo / makeExo objects answer __getMethodNames__
        // eslint-disable-next-line no-underscore-dangle
        await E(ref).__getMethodNames__()
      );
      if (Array.isArray(names)) {
        return /** @type {string[]} */ (names);
      }
    } catch {
      // Fall through.
    }
    // Fallback for plain in-memory fakes that don't surface a method
    // list: treat anything with a `text` method as a file.
    /** @type {string[]} */
    const guessed = [];
    const candidate = /** @type {Record<string, unknown>} */ (ref);
    for (const name of ['text', 'streamBase64', 'list', 'lookup', 'has']) {
      if (typeof candidate[name] === 'function') {
        guessed.push(name);
      }
    }
    return guessed;
  };

  /** @type {VFS['stat']} */
  const stat = async path => {
    const segments = segmentsFor(path);
    if (segments.length === 0) {
      // The mount root itself is always a directory.
      return harden({
        size: 0,
        mtime: '',
        type: /** @type {const} */ ('directory'),
      });
    }
    if (!(await E(mount).has(...segments))) {
      throw enoent(path);
    }
    /** @type {unknown} */
    const node = await E(mount).lookup(harden(segments));
    const methods = await methodNamesOf(node);
    const type = typeFromMethods(methods);
    let size = 0;
    if (type === 'file') {
      // No `size` operation on `MountFileInterface`; read the text to
      // measure.  Documented as a tradeoff at the top of the file.
      const text = /** @type {string} */ (
        // @ts-expect-error — file-shaped lookups expose `text()`
        await E(node).text()
      );
      size = new TextEncoder().encode(text).byteLength;
    }
    return harden({ size, mtime: '', type });
  };

  /** @type {VFS['readFile']} */
  const readFile = async path => {
    const segments = segmentsFor(path);
    try {
      return await E(mount).readText(harden(segments));
    } catch (err) {
      // Surface a Node-shaped ENOENT so the file tool layer can
      // produce its usual "File not found" wording.
      if (
        err &&
        typeof (/** @type {Error} */ (err).message) === 'string' &&
        /** @type {Error} */ (err).message.includes('ENOENT')
      ) {
        throw enoent(path);
      }
      throw err;
    }
  };

  /** @type {VFS['createReadStream']} */
  const createReadStream = (path, opts = {}) => {
    return harden({
      async *[Symbol.asyncIterator]() {
        const segments = segmentsFor(path);
        /** @type {string} */
        let text;
        try {
          text = await E(mount).readText(harden(segments));
        } catch (err) {
          if (
            err &&
            typeof (/** @type {Error} */ (err).message) === 'string' &&
            /** @type {Error} */ (err).message.includes('ENOENT')
          ) {
            throw enoent(path);
          }
          throw err;
        }
        const bytes = new TextEncoder().encode(text);
        const start = opts.start ?? 0;
        // `end` is inclusive, matching Node.js fs.createReadStream
        // semantics (and the `vfs-memory.js` implementation).
        const end = opts.end !== undefined ? opts.end + 1 : bytes.byteLength;
        yield bytes.slice(start, end);
      },
    });
  };

  /** @type {VFS['writeFile']} */
  const writeFile = async (path, content) => {
    const segments = segmentsFor(path);
    if (segments.length === 0) {
      throw eisdir(path);
    }
    await E(mount).writeText(harden(segments), content);
  };

  /** @type {VFS['mkdir']} */
  const mkdir = async (path, _opts = {}) => {
    const segments = segmentsFor(path);
    if (segments.length === 0) {
      // The mount root always exists.
      return false;
    }
    const existed = await E(mount).has(...segments);
    // `Mount.makeDirectory` is idempotent (it bottoms out on
    // `filePowers.makePath`, which uses `fs.mkdir({ recursive: true })`).
    // The genie's `mkdir(opts.recursive)` distinction collapses here:
    // both modes funnel to the same daemon call.  We diverge only on
    // the boolean return shape — `false` if the path already existed.
    await E(mount).makeDirectory(harden(segments));
    return !existed;
  };

  /** @type {VFS['unlink']} */
  const unlink = async path => {
    const segments = segmentsFor(path);
    if (segments.length === 0) {
      throw eisdir(path);
    }
    if (!(await E(mount).has(...segments))) {
      throw enoent(path);
    }
    /** @type {unknown} */
    const node = await E(mount).lookup(harden(segments));
    const type = typeFromMethods(await methodNamesOf(node));
    if (type === 'directory') {
      throw eisdir(path);
    }
    await E(mount).remove(harden(segments));
  };

  /** @type {VFS['rmdir']} */
  const rmdir = async path => {
    const segments = segmentsFor(path);
    if (segments.length === 0) {
      throw new Error('Refusing to remove the mount root');
    }
    if (!(await E(mount).has(...segments))) {
      throw enoent(path);
    }
    /** @type {unknown} */
    const node = await E(mount).lookup(harden(segments));
    const type = typeFromMethods(await methodNamesOf(node));
    if (type !== 'directory') {
      throw enotdir(path);
    }
    // `Mount.remove` bottoms out on `fs.promises.rm(path, { force: true })`,
    // which fails on non-empty directories — same semantics as `rmdir`.
    await E(mount).remove(harden(segments));
  };

  /**
   * Walk the Mount tree under `segments` depth-first, yielding the
   * segment list for every entry (files and directories).  Files are
   * yielded before their parent directory so a depth-first remove can
   * unwind from the leaves.
   *
   * @param {string[]} segments
   * @returns {AsyncGenerator<{ segments: string[]; type: 'file' | 'directory' }>}
   */
  async function* walkDepthFirst(segments) {
    /** @type {string[]} */
    const names = /** @type {string[]} */ (await E(mount).list(...segments));
    for (const name of names) {
      const childSegments = [...segments, name];
      /** @type {unknown} */
      const node = await E(mount).lookup(harden(childSegments));
      const childType = typeFromMethods(await methodNamesOf(node));
      if (childType === 'directory') {
        yield* walkDepthFirst(childSegments);
      }
      yield { segments: childSegments, type: childType };
    }
  }

  /** @type {VFS['rm']} */
  const rm = async (path, opts = {}) => {
    const segments = segmentsFor(path);
    if (segments.length === 0) {
      throw new Error('Refusing to remove the mount root');
    }
    if (!(await E(mount).has(...segments))) {
      throw enoent(path);
    }
    /** @type {unknown} */
    const node = await E(mount).lookup(harden(segments));
    const type = typeFromMethods(await methodNamesOf(node));
    if (type === 'directory' && !opts.recursive) {
      throw eisdir(path);
    }
    if (type === 'directory') {
      // Walk depth-first and remove leaves first so the underlying
      // daemon `fs.rm({ force: true })` (non-recursive) sees only
      // empty directories at each step.
      for await (const entry of walkDepthFirst(segments)) {
        await E(mount).remove(harden(entry.segments));
      }
    }
    await E(mount).remove(harden(segments));
  };

  /** @type {VFS['readdir']} */
  const readdir = (path, opts = {}) => {
    return harden({
      async *[Symbol.asyncIterator]() {
        const segments = segmentsFor(path);
        if (segments.length > 0 && !(await E(mount).has(...segments))) {
          throw enoent(path);
        }
        if (segments.length > 0) {
          /** @type {unknown} */
          const node = await E(mount).lookup(harden(segments));
          const type = typeFromMethods(await methodNamesOf(node));
          if (type !== 'directory') {
            throw enotdir(path);
          }
        }

        /**
         * @param {string[]} dirSegments
         * @param {string} prefix
         * @returns {AsyncGenerator<VFSDirEntry>}
         */
        async function* collect(dirSegments, prefix) {
          /** @type {string[]} */
          const names = /** @type {string[]} */ (
            await E(mount).list(...dirSegments)
          );
          for (const name of names) {
            const childSegments = [...dirSegments, name];
            /** @type {unknown} */
            const child = await E(mount).lookup(harden(childSegments));
            const childMethods = await methodNamesOf(child);
            const childType = typeFromMethods(childMethods);
            const entryName = prefix ? `${prefix}/${name}` : name;
            let size = 0;
            if (childType === 'file') {
              // Same tradeoff as `stat`: pull the bytes to measure
              // since `MountFileInterface` does not expose a size.
              try {
                const text = /** @type {string} */ (
                  // @ts-expect-error — file-shaped lookups expose `text()`
                  await E(child).text()
                );
                size = new TextEncoder().encode(text).byteLength;
              } catch {
                // Best-effort: leave as 0 if the read fails.
              }
            }
            yield harden({ name: entryName, type: childType, size });
            if (opts.recursive && childType === 'directory') {
              yield* collect(childSegments, entryName);
            }
          }
        }

        yield* collect(segments, '');
      },
    });
  };

  return harden({
    stat,
    readFile,
    createReadStream,
    writeFile,
    mkdir,
    unlink,
    rmdir,
    rm,
    readdir,
    sep,
    join,
    relative,
    resolve,
  });
};
harden(makeMountVFS);

export { makeMountVFS };
