// @ts-check
/// <reference types="ses"/>

/** @import { FilePowers } from './types.js' */

import { E } from '@endo/far';
import { q } from '@endo/errors';
import { makeExo } from '@endo/exo';
import {
  ReadableBlobInterface,
  ReadableTreeInterface,
} from '@endo/platform/fs/lite';

import { mountHelp, mountFileHelp, makeHelp } from './help-text.js';
import {
  MountEntryInterface,
  MountFileInterface,
  MountInterface,
} from './interfaces.js';
import { makeReaderRef } from './reader-ref.js';
import { makeRefIterator, makeRefReader } from './ref-reader.js';

const mountEntryRecords = new WeakMap();
const mountRecords = new WeakMap();

// Monotonic suffix for the scratch path `write()` streams a blob into
// before atomically renaming it onto the target.  The counter alone is
// guessable: a caller who can predict `${target}.${N}.tmp` could plant a
// file there ahead of the write, and `makeFileWriter` (open with `'w'`)
// would truncate it.  Confinement bounds the damage to the caller's own
// mount, but a write should never clobber an unrelated pre-existing file.
// The counter is therefore paired with an unpredictable random suffix
// (the same `Math.random` entropy `host.js` uses for scratch labels) and
// a probe-before-use collision check, so the scratch name lands on a free
// path.  It does not (and need not) make concurrent writes to the *same*
// target safe — that race predates this module and is the caller's
// responsibility.
let writeScratchCounter = 0;

/**
 * Pick a scratch path that is a sibling of `target` and does not collide
 * with any existing file.  The name is unpredictable (random suffix) so a
 * caller cannot pre-plant a file at the path the write will truncate, and
 * the `exists` probe rejects the astronomically unlikely random collision
 * by drawing again.  Returning a sibling keeps the final `renamePath`
 * atomic (same directory, same filesystem).
 *
 * @param {string} target
 * @param {FilePowers} filePowers
 * @returns {Promise<string>}
 */
const reserveScratchPath = async (target, filePowers) => {
  await null;
  for (;;) {
    writeScratchCounter += 1;
    // eslint-disable-next-line no-bitwise
    const random = (Math.floor(Math.random() * 0xffffffff) >>> 0).toString(16);
    const scratch = `${target}.${writeScratchCounter}.${random}.tmp`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await filePowers.exists(scratch))) {
      return scratch;
    }
  }
};
harden(reserveScratchPath);

/**
 * Returns the daemon-private lineage sentinel for a mount or mount entry.
 *
 * @param {unknown} value
 * @returns {object | undefined}
 */
export const lineageOf = value => {
  const key = /** @type {object} */ (value);
  return mountEntryRecords.get(key)?.rootId || mountRecords.get(key)?.rootId;
};
harden(lineageOf);

/**
 * Host-private accessor for daemon-minted physical mount backing.
 *
 * @param {unknown} mount
 * @returns {{ kind: 'physical', physicalRoot: string, currentDir: string, readOnly: boolean } | undefined}
 */
export const getMountBacking = mount => {
  const record = mountRecords.get(/** @type {object} */ (mount));
  if (record === undefined) {
    return undefined;
  }
  return harden({
    kind: /** @type {'physical'} */ ('physical'),
    physicalRoot: record.confinementRoot,
    currentDir: record.currentDir,
    readOnly: record.readOnly,
  });
};
harden(getMountBacking);

/**
 * Host-private accessor for daemon-minted mount entry paths.
 *
 * @param {unknown} entry
 * @returns {string | undefined}
 */
export const getEntryPhysicalPath = entry =>
  mountEntryRecords.get(/** @type {object} */ (entry))?.physicalPath;
harden(getEntryPhysicalPath);

/**
 * Validate a single path segment.
 * Rejects '/', '\', '\0', and empty strings.
 *
 * @param {string} segment
 */
const assertValidSegment = segment => {
  if (typeof segment !== 'string') {
    throw new Error(`Path segment must be a string, got ${q(typeof segment)}`);
  }
  if (segment === '') {
    throw new Error('Path segment must not be empty');
  }
  if (
    segment.includes('/') ||
    segment.includes('\\') ||
    segment.includes('\0')
  ) {
    throw new Error(
      `Path segment must not contain '/', '\\', or '\\0': ${q(segment)}`,
    );
  }
};
harden(assertValidSegment);

/**
 * Validate a child name advertised by a remote ReadableTree. Unlike
 * path arguments, tree child names are literal directory entries, so
 * "." and ".." must not be interpreted.
 *
 * Delegates to `assertValidSegment` (above) for the type, empty-string,
 * and separator-character checks (`/`, `\`, `\0`), and adds the
 * tree-specific `.`/`..` reject on top.  Exported so callers that walk
 * a remote ReadableTree from outside this module (e.g.
 * `host.js`'s `materializeTree`) share one validator rather than
 * maintaining a freestanding twin.  Runs check-before-trust on names
 * arriving from a remote ReadableTree before any filesystem
 * materialisation.
 *
 * @param {string} name
 */
export const assertValidTreeEntryName = name => {
  assertValidSegment(name);
  if (name === '.' || name === '..') {
    throw new Error(`Tree entry name must not be "." or "..": ${q(name)}`);
  }
};
harden(assertValidTreeEntryName);

/**
 * Resolve path segments relative to a current directory, clamped to a
 * confinement root.  '.' skips, '..' pops (clamped at root).
 *
 * @param {string} currentDir
 * @param {string} confinementRoot
 * @param {string[]} segments
 * @param {FilePowers} filePowers
 * @returns {string}
 */
const resolveSegments = (currentDir, confinementRoot, segments, filePowers) => {
  let resolved = currentDir;
  for (const segment of segments) {
    if (segment === '.') {
      // skip
    } else if (segment === '..') {
      const parent = filePowers.joinPath(resolved, '..');
      if (parent.length >= confinementRoot.length) {
        resolved = parent;
      } else {
        resolved = confinementRoot;
      }
    } else {
      assertValidSegment(segment);
      resolved = filePowers.joinPath(resolved, segment);
    }
  }
  return resolved;
};
harden(resolveSegments);

/**
 * Normalize path segments against a mount-relative base, clamping '..' at root.
 *
 * @param {string[]} baseSegments
 * @param {string[]} segments
 * @returns {string[]}
 */
const normalizeSegments = (baseSegments, segments) => {
  const normalized = [...baseSegments];
  for (const segment of segments) {
    if (segment === '.') {
      // skip
    } else if (segment === '..') {
      normalized.pop();
    } else {
      assertValidSegment(segment);
      normalized.push(segment);
    }
  }
  return normalized;
};
harden(normalizeSegments);

/**
 * Assert that a resolved path is contained within the confinement root.
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @param {FilePowers} filePowers
 */
const assertConfined = async (candidatePath, confinementRoot, filePowers) => {
  let resolved;
  try {
    resolved = await filePowers.realPath(candidatePath);
  } catch {
    throw new Error(
      `Path does not exist and cannot be verified: ${q(candidatePath)}`,
    );
  }
  const rootResolved = await filePowers.realPath(confinementRoot);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}/`)) {
    throw new Error(`Path escapes mount root: ${q(candidatePath)}`);
  }
};
harden(assertConfined);

/**
 * Check confinement of a path that may not exist yet.
 * Walks up to find the deepest existing ancestor.
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @param {FilePowers} filePowers
 */
const assertConfinedOrAncestor = async (
  candidatePath,
  confinementRoot,
  filePowers,
) => {
  const rootResolved = await filePowers.realPath(confinementRoot);
  let check = candidatePath;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await filePowers.realPath(check);
      if (
        resolved !== rootResolved &&
        !resolved.startsWith(`${rootResolved}/`)
      ) {
        throw new Error(`Path escapes mount root: ${q(candidatePath)}`);
      }
      return;
    } catch (/** @type {any} */ e) {
      if (e.message && e.message.startsWith('Path escapes')) {
        throw e;
      }
      const parent = filePowers.joinPath(check, '..');
      if (parent === check) {
        throw new Error(`Path escapes mount root: ${q(candidatePath)}`);
      }
      check = parent;
    }
  }
};
harden(assertConfinedOrAncestor);

/**
 * Check if a path is confined (returns boolean, does not throw).
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @param {FilePowers} filePowers
 * @returns {Promise<boolean>}
 */
const isConfinedPath = async (candidatePath, confinementRoot, filePowers) => {
  try {
    const resolved = await filePowers.realPath(candidatePath);
    const rootResolved = await filePowers.realPath(confinementRoot);
    return resolved === rootResolved || resolved.startsWith(`${rootResolved}/`);
  } catch {
    return false;
  }
};
harden(isConfinedPath);

/**
 * @typedef {object} MountContext
 * @property {string} currentDir
 * @property {string[]} currentSegments
 * @property {string} confinementRoot
 * @property {object} rootId
 * @property {boolean} readOnly
 * @property {FilePowers} filePowers
 * @property {string} description
 * @property {(tree: object) => Promise<object>} [snapshotTree]
 * @property {(path: string) => Promise<object>} [snapshotFile]
 */

/**
 * Create a mount exo for a filesystem directory.
 *
 * @param {MountContext} ctx
 * @returns {object}
 */
const makeMountExo = ctx => {
  const {
    currentDir,
    currentSegments,
    confinementRoot,
    rootId,
    readOnly,
    filePowers,
    description,
    snapshotTree,
    snapshotFile,
  } = ctx;

  const assertWritable = () => {
    if (readOnly) {
      throw new Error('Mount is read-only');
    }
  };

  /**
   * @param {string[]} segments
   * @returns {string}
   */
  const resolve = segments =>
    resolveSegments(currentDir, confinementRoot, segments, filePowers);

  /**
   * Resolve mount-root-relative segments.
   *
   * @param {string[]} segments
   */
  const resolveFromRoot = segments =>
    resolveSegments(confinementRoot, confinementRoot, segments, filePowers);

  /**
   * @param {string | string[] | object} pathArg
   * @returns {string[]}
   */
  const segmentsFromPathArg = pathArg => {
    if (Array.isArray(pathArg)) {
      return normalizeSegments(currentSegments, pathArg);
    }
    if (typeof pathArg === 'object' && pathArg !== null) {
      const record = mountEntryRecords.get(pathArg);
      if (record === undefined) {
        throw new Error('Path argument is not a daemon-minted mount entry');
      }
      if (record.rootId !== rootId) {
        throw new Error('Mount entry belongs to a different mount root');
      }
      return record.segments;
    }
    if (typeof pathArg !== 'string') {
      throw new Error(`Path must be a string, array, or mount entry`);
    }
    return normalizeSegments(currentSegments, [pathArg]);
  };

  /**
   * `entry()` is the one mount API where a string is a slash-joined
   * selector rather than a single name.  Other path-bearing convenience
   * methods keep their existing single-name string compatibility.
   *
   * @param {string | string[]} pathArg
   * @returns {string[]}
   */
  const segmentsFromEntryPathArg = pathArg => {
    if (Array.isArray(pathArg)) {
      return normalizeSegments(currentSegments, pathArg);
    }
    if (typeof pathArg !== 'string') {
      throw new Error('entry() path must be a string or array');
    }
    return normalizeSegments(currentSegments, pathArg.split('/'));
  };

  /**
   * Distinguish a single `has(entry)` call from variadic
   * `has(...segments)`.  The dispatch layers two contracts:
   *
   * 1. A single non-null object argument is treated as an entry value;
   *    `segmentsFromPathArg` validates the entry's mount-root
   *    provenance (or rejects a non-entry object) and returns its
   *    segments.  The `args[0] !== null` guard here keeps `null` from
   *    falling into this branch — `segmentsFromPathArg` would reject
   *    `null` on its own (`typeof null === 'object'`), but the explicit
   *    guard makes the dispatch read as "string-or-entry-not-null"
   *    rather than relying on the downstream throw for shape.
   * 2. Otherwise every argument must be a string; the array is
   *    normalised as a path-segment sequence relative to the current
   *    directory.
   *
   * The two cases are mutually exclusive at the boundary, so an
   * accidental call like `has(null)` reaches the loop's
   * `typeof arg !== 'string'` reject rather than the entry branch.
   *
   * @param {Array<string | object>} args
   * @returns {string[]}
   */
  const segmentsFromHasArgs = args => {
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      return segmentsFromPathArg(args[0]);
    }
    for (const arg of args) {
      if (typeof arg !== 'string') {
        throw new Error('has() path segments must be strings');
      }
    }
    return normalizeSegments(currentSegments, /** @type {string[]} */ (args));
  };

  /**
   * @param {string | string[] | object} pathArg
   */
  const resolvePathArg = pathArg =>
    resolveFromRoot(segmentsFromPathArg(pathArg));

  /**
   * @param {string} target
   * @param {string[]} targetSegments
   */
  const openExisting = async (target, targetSegments) => {
    await assertConfined(target, confinementRoot, filePowers);
    const isDir = await filePowers.isDirectory(target);
    if (isDir) {
      return makeMountExo({
        ...ctx,
        currentDir: target,
        currentSegments: targetSegments,
        description: `Subdirectory of ${description}`,
      });
    }
    return makeMountFileExo(
      target,
      readOnly,
      filePowers,
      confinementRoot,
      snapshotFile,
    );
  };

  /**
   * @param {string[]} segments
   */
  const makeEntryRecord = segments =>
    harden({
      rootId,
      segments,
      physicalPath: resolveFromRoot(segments),
    });

  /**
   * @param {string[]} segments
   */
  const makeEntry = segments => {
    const entry = makeMountEntryExo({
      ...ctx,
      entrySegments: segments,
    });
    mountEntryRecords.set(entry, makeEntryRecord(segments));
    return entry;
  };

  const help = makeHelp(mountHelp);

  const exo = makeExo('EndoMount', MountInterface, {
    help,

    async has(...args) {
      await null;
      const pathSegments = segmentsFromHasArgs(args);
      if (pathSegments.length === 0) {
        return true;
      }
      const target = resolveFromRoot(pathSegments);
      const pathExists = await filePowers.exists(target);
      if (!pathExists) {
        return false;
      }
      return isConfinedPath(target, confinementRoot, filePowers);
    },

    async list(...pathSegments) {
      await null;
      const target = resolve(pathSegments);
      await assertConfined(target, confinementRoot, filePowers);
      const entries = await filePowers.readDirectory(target);
      const confined = [];
      for (const entry of entries.sort()) {
        const entryPath = filePowers.joinPath(target, entry);
        // eslint-disable-next-line no-await-in-loop
        if (await isConfinedPath(entryPath, confinementRoot, filePowers)) {
          confined.push(entry);
        }
      }
      return harden(confined);
    },

    async lookup(pathArg) {
      await null;
      const segments = segmentsFromPathArg(pathArg);
      return openExisting(resolveFromRoot(segments), segments);
    },

    entry(pathArg) {
      return makeEntry(segmentsFromEntryPathArg(pathArg));
    },

    async makeDirectory(pathArg) {
      await null;
      assertWritable();
      const segments = segmentsFromPathArg(pathArg);
      const target = resolveFromRoot(segments);
      await assertConfinedOrAncestor(target, confinementRoot, filePowers);
      await filePowers.makePath(target);
      // Return a sub-mount handle on the freshly-made path so the
      // method satisfies `Directory.makeDirectory(path):
      // Promise<Directory>`.  Existing callers that ignore the
      // return value are source-compatible.
      return openExisting(target, segments);
    },

    async makeFile(pathArg, content) {
      await null;
      assertWritable();
      const target = resolvePathArg(pathArg);
      await assertConfinedOrAncestor(target, confinementRoot, filePowers);
      const parent = filePowers.joinPath(target, '..');
      await filePowers.makePath(parent);
      if (await filePowers.isDirectory(target)) {
        throw new Error('Path is a directory');
      }
      if (content === undefined) {
        if (!(await filePowers.exists(target))) {
          await filePowers.writeFileText(target, '');
        }
        return;
      }
      if (typeof content === 'string') {
        await filePowers.writeFileText(target, content);
        return;
      }
      // Binary content is supplied via `write(path, readableBlob)` /
      // `copy(from, to)` rather than `makeFile`: mutable typed arrays
      // are rejected at the exo boundary, so a `Uint8Array` argument
      // cannot reach this method through CapTP. Callers that hold raw
      // bytes wrap them in a `ReadableBlob` and use `write()`.
      throw new Error(
        'makeFile content must be a string (use write() with a ReadableBlob for binary content)',
      );
    },

    async stat(pathArg) {
      await null;
      const target = resolvePathArg(pathArg);
      try {
        await assertConfined(target, confinementRoot, filePowers);
        return filePowers.statPath(target);
      } catch {
        return undefined;
      }
    },

    async readText(pathArg) {
      await null;
      const target = resolvePathArg(pathArg);
      await assertConfined(target, confinementRoot, filePowers);
      return filePowers.readFileText(target);
    },

    async maybeReadText(pathArg) {
      await null;
      const target = resolvePathArg(pathArg);
      try {
        await assertConfined(target, confinementRoot, filePowers);
        return await filePowers.readFileText(target);
      } catch {
        return undefined;
      }
    },

    async writeText(pathArg, content) {
      await null;
      assertWritable();
      const target = resolvePathArg(pathArg);
      await assertConfinedOrAncestor(target, confinementRoot, filePowers);
      const parent = filePowers.joinPath(target, '..');
      await filePowers.makePath(parent);
      await filePowers.writeFileText(target, content);
    },

    async remove(pathArg) {
      await null;
      assertWritable();
      const target = resolvePathArg(pathArg);
      await assertConfined(target, confinementRoot, filePowers);
      await filePowers.removePath(target);
    },

    async move(fromArg, toArg) {
      await null;
      assertWritable();
      const from = resolvePathArg(fromArg);
      const to = resolvePathArg(toArg);
      await assertConfined(from, confinementRoot, filePowers);
      await assertConfinedOrAncestor(to, confinementRoot, filePowers);
      await filePowers.renamePath(from, to);
    },

    readOnly() {
      // Structural narrowing: return a ReadableTree view, not an
      // EndoMount.  Mount-specific extensions (`entry`, `stat`,
      // `displayPath`, `readText`, `makeFile`) are removed from the
      // read-only surface; callers that need them keep a reference
      // to the un-attenuated mount.
      const readOnlyMount = readOnly
        ? this.self // eslint-disable-line no-invalid-this
        : makeMountExo({
            ...ctx,
            readOnly: true,
            description: `Read-only view of ${description}`,
          });
      return makeReadableTreeView(readOnlyMount);
    },

    async snapshot() {
      if (snapshotTree === undefined) {
        throw new Error('snapshot() is not available for this mount');
      }
      return snapshotTree(this.self); // eslint-disable-line no-invalid-this
    },

    async write(pathArg, value) {
      await null;
      assertWritable();
      const segments = segmentsFromPathArg(pathArg);
      const target = resolveFromRoot(segments);
      await assertConfinedOrAncestor(target, confinementRoot, filePowers);
      const parent = filePowers.joinPath(target, '..');
      await filePowers.makePath(parent);
      // Detect blob-vs-tree by method names, the same shape-test
      // `checkinTree` uses.  A `streamBase64`-bearing remotable is
      // materialised through bytes; a `list`-bearing remotable is
      // materialised recursively.
      // eslint-disable-next-line no-underscore-dangle
      const methods = await E(value).__getMethodNames__();
      if (methods.includes('streamBase64')) {
        if (await filePowers.isDirectory(target)) {
          throw new Error('Path is a directory');
        }
        // Stream into a sibling scratch file, then atomically rename it
        // onto the target.  Opening the writer directly on `target`
        // would truncate it the instant the stream opens — before the
        // source has been read.  When the source *is* the target (a live
        // `copy(name, name)` or `write(name, lookup(name))`), that
        // truncate destroys the very bytes the reader is about to stream,
        // leaving the target empty.  Routing through a scratch file means
        // the target is replaced only once the full source has been read.
        const scratch = await reserveScratchPath(target, filePowers);
        const writer = filePowers.makeFileWriter(scratch);
        try {
          const readerRef = E(value).streamBase64();
          for await (const bytes of makeRefReader(
            /** @type {import('@endo/far').ERef<AsyncIterator<string>>} */ (
              readerRef
            ),
          )) {
            // eslint-disable-next-line no-await-in-loop
            await writer.next(bytes);
          }
          await writer.return(undefined);
        } catch (error) {
          // Make a best effort to flush and discard the partial scratch
          // file so a failed write leaves no debris in the mount.
          await writer.return(undefined).catch(() => {});
          await filePowers.removePath(scratch).catch(() => {});
          throw error;
        }
        await filePowers.renamePath(scratch, target);
        return;
      }
      if (methods.includes('list')) {
        await filePowers.makePath(target);
        const names = await E(value).list();
        for (const name of names) {
          assertValidTreeEntryName(name);
          // eslint-disable-next-line no-await-in-loop
          const child = await E(value).lookup(name);
          // eslint-disable-next-line no-await-in-loop
          await this.self.write([...segments, name], child); // eslint-disable-line no-invalid-this
        }
        return;
      }
      throw new Error(
        'write() value must be a ReadableBlob or ReadableTree (no streamBase64 or list method)',
      );
    },

    async copy(fromArg, toArg) {
      await null;
      assertWritable();
      const fromSegments = segmentsFromPathArg(fromArg);
      const from = resolveFromRoot(fromSegments);
      await assertConfined(from, confinementRoot, filePowers);
      // Reject copying a tree into its own descendant.  `write()`
      // materialises the destination directory before enumerating the
      // *live* source listing, so a destination strictly below the
      // source (e.g. copy(['dir'], ['dir', 'copy'])) would see the
      // freshly created child, recurse into it, create its child, and
      // loop until the filesystem is exhausted.  The check is a
      // segment-prefix test on the resolved paths: `to` is a descendant
      // of `from` when `from`'s segments are a strict prefix of `to`'s.
      const toSegments = segmentsFromPathArg(toArg);
      if (
        toSegments.length > fromSegments.length &&
        fromSegments.every((segment, i) => segment === toSegments[i])
      ) {
        throw new Error(
          `Cannot copy ${q(from)} into its own descendant ${q(
            resolveFromRoot(toSegments),
          )}`,
        );
      }
      const source = await openExisting(from, fromSegments);
      await this.self.write(toArg, source); // eslint-disable-line no-invalid-this
    },
  });

  mountRecords.set(
    exo,
    harden({ rootId, currentDir, confinementRoot, readOnly }),
  );
  return exo;
};
harden(makeMountExo);

/**
 * Structural-narrowing view exposing only the `ReadableTree` surface
 * (`has`, `list`, `lookup`) over a read-only mount.  Mount-specific
 * extensions are not present on this Exo; the read-only surface is
 * deliberately the platform contract, not the daemon's superset.
 *
 * @param {object} readOnlyMount - An EndoMount whose `readOnly` flag is true.
 * @returns {object}
 */
const makeReadableTreeView = readOnlyMount => {
  const view = makeExo('EndoMountReadableTree', ReadableTreeInterface, {
    async has(...pathSegments) {
      return E(readOnlyMount).has(...pathSegments);
    },
    async list(...pathSegments) {
      return E(readOnlyMount).list(...pathSegments);
    },
    async lookup(pathArg) {
      const result = await E(readOnlyMount).lookup(pathArg);
      // The underlying mount returns either a sub-mount (an
      // EndoMount) or a mount file.  Either way it is already
      // read-only because the parent mount is; we wrap it in the
      // structural view so descendants surface the platform shape
      // too.
      // eslint-disable-next-line no-underscore-dangle
      const methods = await E(result).__getMethodNames__();
      if (methods.includes('list')) {
        return makeReadableTreeView(result);
      }
      return makeReadableBlobView(result);
    },
  });
  const record = mountRecords.get(readOnlyMount);
  if (record !== undefined) {
    mountRecords.set(view, harden({ ...record, readOnly: true }));
  }
  return view;
};
harden(makeReadableTreeView);

/**
 * Create a mount-scoped logical entry descriptor.  Entries are values
 * with no observational authority and no handle-minting authority of
 * their own — those operations live on `EndoMount` and accept the
 * entry as the path-bearing argument.
 *
 * @param {MountContext & { entrySegments: string[] }} ctx
 * @returns {object}
 */
const makeMountEntryExo = ctx => {
  const { entrySegments, rootId } = ctx;

  const help = makeHelp({});

  return makeExo('EndoMountEntry', MountEntryInterface, {
    help,
    segments() {
      return harden([...entrySegments]);
    },
    displayPath() {
      return entrySegments.length === 0 ? '.' : entrySegments.join('/');
    },
    child(name) {
      assertValidSegment(name);
      const childSegments = [...entrySegments, name];
      const child = makeMountEntryExo({
        ...ctx,
        entrySegments: childSegments,
      });
      mountEntryRecords.set(
        child,
        harden({
          rootId,
          segments: childSegments,
          physicalPath: resolveSegments(
            ctx.confinementRoot,
            ctx.confinementRoot,
            childSegments,
            ctx.filePowers,
          ),
        }),
      );
      return child;
    },
  });
};
harden(makeMountEntryExo);

/**
 * Create a transient file exo for a file within a mount.
 *
 * @param {string} filePath
 * @param {boolean} readOnly
 * @param {FilePowers} filePowers
 * @param {string} confinementRoot
 * @param {(path: string) => Promise<object>} [snapshotFile]
 * @returns {object}
 */
const makeMountFileExo = (
  filePath,
  readOnly,
  filePowers,
  confinementRoot,
  snapshotFile = undefined,
) => {
  const assertWritable = () => {
    if (readOnly) {
      throw new Error('Mount is read-only');
    }
  };

  const help = makeHelp(mountFileHelp);

  return makeExo('EndoMountFile', MountFileInterface, {
    help,

    async text() {
      await null;
      await assertConfined(filePath, confinementRoot, filePowers);
      return filePowers.readFileText(filePath);
    },

    streamBase64() {
      /** @returns {AsyncGenerator<Uint8Array>} */
      const readConfined = async function* readConfinedFile() {
        await assertConfined(filePath, confinementRoot, filePowers);
        const reader = filePowers.makeFileReader(filePath);
        try {
          for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const result = await reader.next();
            if (result.done) {
              return;
            }
            yield result.value;
          }
        } finally {
          if (reader.return !== undefined) {
            await reader.return(undefined);
          }
        }
      };
      return makeReaderRef(readConfined());
    },

    async json() {
      await null;
      await assertConfined(filePath, confinementRoot, filePowers);
      const text = await filePowers.readFileText(filePath);
      return JSON.parse(text);
    },

    async writeText(content) {
      await null;
      assertWritable();
      await assertConfined(filePath, confinementRoot, filePowers);
      await filePowers.writeFileText(filePath, content);
    },

    async append(content) {
      await null;
      assertWritable();
      await assertConfined(filePath, confinementRoot, filePowers);
      await filePowers.appendFileText(filePath, content);
    },

    async writeBytes(readableRef) {
      await null;
      assertWritable();
      await assertConfined(filePath, confinementRoot, filePowers);
      const writer = filePowers.makeFileWriter(filePath);
      for await (const value of makeRefIterator(
        /** @type {import('@endo/far').ERef<AsyncIterator<Uint8Array>>} */ (
          readableRef
        ),
      )) {
        // eslint-disable-next-line no-await-in-loop
        await writer.next(value);
      }
      await writer.return(undefined);
    },

    async stat() {
      await null;
      await assertConfined(filePath, confinementRoot, filePowers);
      return filePowers.statPath(filePath);
    },

    async snapshot() {
      if (snapshotFile === undefined) {
        throw new Error('snapshot() is not available for this mount file');
      }
      await assertConfined(filePath, confinementRoot, filePowers);
      return snapshotFile(filePath);
    },

    readOnly() {
      // Structural narrowing: return a ReadableBlob view, not an
      // EndoMountFile.  Mount-specific surface (`stat`, `snapshot`)
      // is removed; callers that need it keep a reference to the
      // un-attenuated mount file.
      const readOnlyFile = makeMountFileExo(
        filePath,
        true,
        filePowers,
        confinementRoot,
        snapshotFile,
      );
      return makeReadableBlobView(readOnlyFile);
    },
  });
};
harden(makeMountFileExo);

/**
 * Structural-narrowing view exposing only the `ReadableBlob` surface
 * (`streamBase64`, `text`, `json`) over a read-only mount file.
 *
 * @param {object} readOnlyFile - An EndoMountFile whose `readOnly` is true.
 * @returns {object}
 */
const makeReadableBlobView = readOnlyFile => {
  return makeExo('EndoMountReadableBlob', ReadableBlobInterface, {
    streamBase64() {
      return /** @type {{ streamBase64: () => object }} */ (
        readOnlyFile
      ).streamBase64();
    },
    async text() {
      return E(readOnlyFile).text();
    },
    async json() {
      return E(readOnlyFile).json();
    },
  });
};
harden(makeReadableBlobView);

/**
 * Create a mount exo backed by a filesystem directory.
 *
 * @param {object} opts
 * @param {string} opts.rootPath
 * @param {boolean} opts.readOnly
 * @param {FilePowers} opts.filePowers
 * @param {(tree: object) => Promise<object>} [opts.snapshotTree]
 * @param {(path: string) => Promise<object>} [opts.snapshotFile]
 * @returns {object}
 */
export const makeMount = ({
  rootPath,
  readOnly,
  filePowers,
  snapshotTree = undefined,
  snapshotFile = undefined,
}) => {
  const prefix = readOnly ? 'Read-only mount' : 'Mount';
  /** @type {MountContext} */
  const ctx = {
    currentDir: rootPath,
    currentSegments: harden([]),
    confinementRoot: rootPath,
    rootId: harden({}),
    readOnly,
    filePowers,
    description: `${prefix} at ${rootPath}`,
    snapshotTree,
    snapshotFile,
  };

  return makeMountExo(ctx);
};
harden(makeMount);
