// @ts-check
/// <reference types="ses"/>

/** @import { SnapshotTree } from '@endo/platform/fs/lite/types' */
/** @import { EndoMount, FilePowers, MountNameChange } from './types.js' */

import { E } from '@endo/eventual-send';
import { q } from '@endo/errors';
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import {
  ReadableBlobRangeInterface,
  ReadableTreeInterface,
} from '@endo/platform/fs/lite';
import { toSafeNumber } from '@endo/platform/fs/extended/shared/helpers.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import { fromHex } from './hex.js';
import { mountHelp, mountFileHelp, makeHelp } from './help-text.js';
import {
  MountControlInterface,
  MountEntryInterface,
  MountFileInterface,
  MountInterface,
} from './interfaces.js';

const mountEntryRecords = new WeakMap();
const mountRecords = new WeakMap();

// Unique wake token an open `followNameChanges` stream races against its
// mount's revocation signal; a symbol so it is discriminable from every
// possible watcher iterator result.
const revokedSentinel = Symbol('mount-revoked');

/**
 * Narrow a remote source after the Exo method-name check used by `write()`.
 * The runtime guard proves that a source advertising `streamBase64` is the
 * passable reader capability expected by `iterateBytesReader`.
 *
 * @param {unknown} value
 * @param {string[]} methodNames
 * @returns {asserts value is import('@endo/eventual-send').ERef<import('@endo/exo-stream').PassableBytesReader>}
 */
const assertReadableBlobSource = (value, methodNames) => {
  if (!methodNames.includes('streamBase64')) {
    throw new TypeError('Expected a ReadableBlob source');
  }
};
harden(assertReadableBlobSource);

/**
 * Wrap a byte range as a `PassableBytesReader` (what `fetch` returns). An empty
 * range yields a reader that is immediately done.
 *
 * @param {Uint8Array} bytes
 */
const bytesFromRange = bytes => {
  function* generator() {
    if (bytes.length > 0) {
      yield bytes;
    }
  }
  return bytesReaderFromIterator(generator());
};
harden(bytesFromRange);

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
    const random = (Math.floor(Math.random() * 0xffff_ffff) >>> 0).toString(16);
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
 * The default defense-in-depth deny set: segment names that a mount refuses
 * to resolve, list, or surface through a change stream, matched
 * case-insensitively. These are the well-known homedir credential and
 * configuration directories/files a confined guest has no business naming
 * when a mount root sits above them.
 *
 * Denial is **name-based**, not target-based: it matches the literal path
 * segments a caller supplies and the names `readDirectory` reports, not the
 * realpath a segment resolves to. It therefore denies a directly-named
 * restricted segment but does not, on its own, block reaching the same inode
 * through an in-root symlink under a non-restricted name, nor does it restrict
 * the mount root itself (only its children). This is why the layer is
 * defense-in-depth *behind* confinement (`isConfinedPath`) rather than a
 * standalone boundary: the mount API exposes no symlink-creation power, so a
 * guest cannot forge such an alias, but a pre-existing one in the mounted tree
 * is not caught here.
 *
 * A creation-time `deniedSegments` option **replaces** this set (callers
 * extend it by spreading `defaultDeniedSegments`; an empty iterable disables
 * denial entirely). Exported so callers can build on the canonical list
 * rather than restating it.
 *
 * @type {readonly string[]}
 */
export const defaultDeniedSegments = harden([
  '.ssh',
  '.aws',
  '.azure',
  '.gcloud',
  '.config',
  '.gnupg',
  '.password-store',
  '.docker',
  '.npmrc',
  '.env',
  '.env.local',
  '.env.production',
  '.kube',
  '.terraform',
]);

/**
 * Resolve the effective denied-segment set for a mount. `undefined` selects
 * the default; any provided iterable (including an empty one, which disables
 * denial) REPLACES the default. Matching is case-insensitive, so the returned
 * set holds lowercased names and callers lowercase the candidate before
 * probing it.
 *
 * @param {Iterable<string> | undefined} deniedSegments
 * @returns {Set<string>}
 */
const resolveDeniedSegments = deniedSegments => {
  const source =
    deniedSegments === undefined ? defaultDeniedSegments : deniedSegments;
  return new Set([...source].map(name => name.toLowerCase()));
};
harden(resolveDeniedSegments);

/**
 * Throw `Access denied` when a resolved path names a restricted segment.
 * Enforced at path resolution so any method that names a denied segment in a
 * path argument (`readText`, `lookup`, `remove`, `makeFile`, `entry`, …)
 * throws, while `list()` and `followNameChanges` filter denied names out of
 * their enumerations separately.
 *
 * @param {string} segment
 * @param {Set<string> | undefined} deniedSegments
 */
const assertSegmentAllowed = (segment, deniedSegments) => {
  if (
    deniedSegments !== undefined &&
    deniedSegments.has(segment.toLowerCase())
  ) {
    throw new Error(`Access denied: ${q(segment)} is a restricted path`);
  }
};
harden(assertSegmentAllowed);

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
 * @param {Set<string>} [deniedSegments]
 * @returns {string}
 */
const resolveSegments = (
  currentDir,
  confinementRoot,
  segments,
  filePowers,
  deniedSegments = undefined,
) => {
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
      assertSegmentAllowed(segment, deniedSegments);
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
 * @param {Set<string>} [deniedSegments]
 * @returns {string[]}
 */
const normalizeSegments = (
  baseSegments,
  segments,
  deniedSegments = undefined,
) => {
  const normalized = [...baseSegments];
  for (const segment of segments) {
    if (segment === '.') {
      // skip
    } else if (segment === '..') {
      normalized.pop();
    } else {
      assertValidSegment(segment);
      assertSegmentAllowed(segment, deniedSegments);
      normalized.push(segment);
    }
  }
  return normalized;
};
harden(normalizeSegments);

/**
 * Render an absolute host path as a path relative to the mount root. Error
 * messages reach whoever holds the mount capability — typically a guest — and
 * must never disclose the host's filesystem layout. `resolveSegments` clamps
 * `..` at the root, so a resolved path always sits lexically under
 * `confinementRoot`; the fallback exists only so a future caller that breaks
 * that invariant still cannot leak the absolute path.
 *
 * @param {string} candidatePath
 * @param {string} confinementRoot
 * @returns {string}
 */
const relativeToRoot = (candidatePath, confinementRoot) => {
  if (candidatePath === confinementRoot) {
    return '/';
  }
  const prefix = `${confinementRoot}/`;
  if (candidatePath.startsWith(prefix)) {
    return `/${candidatePath.slice(prefix.length)}`;
  }
  return '/';
};
harden(relativeToRoot);

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
      `ENOENT: path does not exist and cannot be verified: ${q(
        relativeToRoot(candidatePath, confinementRoot),
      )}`,
    );
  }
  const rootResolved = await filePowers.realPath(confinementRoot);
  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}/`)) {
    throw new Error(
      `EACCES: path escapes mount root: ${q(relativeToRoot(candidatePath, confinementRoot))}`,
    );
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
        throw new Error(
          `EACCES: path escapes mount root: ${q(relativeToRoot(candidatePath, confinementRoot))}`,
        );
      }
      return;
    } catch (/** @type {any} */ e) {
      if (e.message && e.message.includes('escapes mount root')) {
        throw e;
      }
      const parent = filePowers.joinPath(check, '..');
      if (parent === check) {
        throw new Error(
          `EACCES: path escapes mount root: ${q(relativeToRoot(candidatePath, confinementRoot))}`,
        );
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
 * Resolve a path to its symlink-free physical form even when the path
 * does not yet exist.  `realPath` only resolves an existing path, so this
 * walks up to the deepest existing ancestor, resolves *that*, and
 * re-appends the not-yet-existing tail.  Any symlink in an existing
 * component of `candidatePath` is followed; trailing components that do
 * not exist are appended verbatim (they cannot be symlinks because they
 * are not present).  Used by `copy()` to compare the *physical* target
 * against the source so a symlinked destination cannot re-enter the
 * source tree past the logical-segment descendant guard.
 *
 * @param {string} candidatePath
 * @param {FilePowers} filePowers
 * @returns {Promise<string>}
 */
const resolvePhysicalPath = async (candidatePath, filePowers) => {
  await null;
  /** @type {string[]} */
  const tail = [];
  let check = candidatePath;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await filePowers.realPath(check);
      return tail.length === 0
        ? resolved
        : filePowers.joinPath(resolved, ...tail);
    } catch {
      const parent = filePowers.joinPath(check, '..');
      if (parent === check) {
        // Reached the filesystem root without resolving; fall back to the
        // unresolved path joined onto the root.
        return filePowers.joinPath(check, ...tail);
      }
      // The last segment of `check` is the non-existing tail component.
      const base = check.slice(parent.length).replace(/^\/+/, '');
      tail.unshift(base);
      check = parent;
    }
  }
};
harden(resolvePhysicalPath);

/**
 * @typedef {object} MountContext
 * @property {string} currentDir
 * @property {string[]} currentSegments
 * @property {string} confinementRoot
 * @property {object} rootId
 * @property {boolean} readOnly
 * @property {FilePowers} filePowers
 * @property {string} description
 * @property {(tree: object) => Promise<SnapshotTree>} [snapshotTree]
 * @property {(path: string) => Promise<object>} [snapshotFile]
 * @property {Set<string>} [deniedSegments] Lowercased restricted-segment set
 *   shared across every derived face; undefined means no denial.
 * @property {{ revoked: boolean, whenRevoked: Promise<undefined> }} [revocation]
 *   Mutable liveness record shared across every derived face; undefined means
 *   the mount is never revocable. `whenRevoked` settles when `revoke()` runs,
 *   so an open stream can wake promptly rather than waiting on the next
 *   coincidental filesystem event.
 */

/**
 * Create a mount exo for a filesystem directory.
 *
 * @param {MountContext} ctx
 * @returns {EndoMount}
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
    deniedSegments,
    revocation,
  } = ctx;

  // Liveness gate shared by every method. A revocable mount carries a
  // mutable `revocation` record on its `ctx`; the `...ctx` spread that
  // derives sub-views, entries, files, and read-only views shares that one
  // record, so a single `control.revoke()` trips every derived face at once.
  // A plain (non-revocable) mount has no record and this is a no-op.
  const assertLive = () => {
    if (revocation !== undefined && revocation.revoked) {
      throw new Error('Mount has been revoked');
    }
  };

  const assertWritable = () => {
    assertLive();
    if (readOnly) {
      throw new Error('Mount is read-only');
    }
  };

  /**
   * Whether an enumerated child name is restricted (case-insensitive). Used
   * to hide denied names from `list()` and `followNameChanges`, which surface
   * names that were never passed as path arguments and so never reached
   * `assertSegmentAllowed`.
   *
   * @param {string} name
   */
  const isDenied = name =>
    deniedSegments !== undefined && deniedSegments.has(name.toLowerCase());

  /**
   * @param {string[]} segments
   * @returns {string}
   */
  const resolve = segments => {
    assertLive();
    return resolveSegments(
      currentDir,
      confinementRoot,
      segments,
      filePowers,
      deniedSegments,
    );
  };

  /**
   * Resolve mount-root-relative segments.
   *
   * @param {string[]} segments
   */
  const resolveFromRoot = segments => {
    assertLive();
    return resolveSegments(
      confinementRoot,
      confinementRoot,
      segments,
      filePowers,
      deniedSegments,
    );
  };

  /**
   * @param {string | string[] | object} pathArg
   * @returns {string[]}
   */
  const segmentsFromPathArg = pathArg => {
    if (Array.isArray(pathArg)) {
      return normalizeSegments(currentSegments, pathArg, deniedSegments);
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
    return normalizeSegments(currentSegments, [pathArg], deniedSegments);
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
      return normalizeSegments(currentSegments, pathArg, deniedSegments);
    }
    if (typeof pathArg !== 'string') {
      throw new Error('entry() path must be a string or array');
    }
    return normalizeSegments(
      currentSegments,
      pathArg.split('/'),
      deniedSegments,
    );
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
    return normalizeSegments(
      currentSegments,
      /** @type {string[]} */ (args),
      deniedSegments,
    );
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
      revocation,
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
      assertLive();
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
        // Restricted names never appear in a listing, even though naming
        // one directly in a path would throw. `list()` enumerates children
        // that were never passed through `assertSegmentAllowed`, so it
        // filters them here.
        if (isDenied(entry)) {
          // eslint-disable-next-line no-continue
          continue;
        }
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

    // The `ReadableNameHub` lookup-or-undefined primitive: resolve `pathArg`
    // and return its handle, or `undefined` when the path is absent (or
    // escapes confinement). Mirrors `maybeReadText`'s broad catch — any
    // resolution failure yields `undefined` rather than throwing.
    async maybeLookup(pathArg) {
      await null;
      // A revoked mount throws rather than masquerading the revocation as a
      // benign "absent" undefined; the gate runs before the swallowing try.
      assertLive();
      const segments = segmentsFromPathArg(pathArg);
      try {
        return await openExisting(resolveFromRoot(segments), segments);
      } catch {
        return undefined;
      }
    },

    async subView(pathArg) {
      await null;
      const segments = segmentsFromPathArg(pathArg);
      const target = resolveFromRoot(segments);
      await assertConfined(target, confinementRoot, filePowers);
      if (!(await filePowers.isDirectory(target))) {
        throw new Error(
          `ENOTDIR: subView target is not a directory: ${q(
            relativeToRoot(target, confinementRoot),
          )}`,
        );
      }
      // A genuine confinement shift: the sub-view's own `confinementRoot`
      // is `target`, so `..` clamps at the sub-view root and cannot reach
      // the parent mount's siblings or root. This is unlike a `lookup`
      // sub-handle, which deliberately inherits the mount's
      // `confinementRoot` for in-mount navigation. For a *persisted*
      // sub-root, use `provideSubMount` (a new formula); `subView` is the
      // transient, in-session attenuator.
      //
      // Mint a FRESH `rootId` so the sub-view is its own identity domain:
      // a `mountEntry` minted by the parent (whose `segments` are
      // parent-root-relative) is rejected by `segmentsFromPathArg`'s
      // `record.rootId !== rootId` check rather than being silently
      // re-based against the sub-view root. Entries minted *by* the
      // sub-view capture this new id (via the new exo's closure) and keep
      // working.
      return makeMountExo({
        ...ctx,
        currentDir: target,
        currentSegments: [],
        confinementRoot: target,
        rootId: harden({}),
        description: `Subview of ${description}`,
      });
    },

    entry(pathArg) {
      assertLive();
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

    followNameChanges(...pathSegments) {
      /**
       * Snapshot-then-diff stream of immediate children of the
       * resolved subdirectory.  The implementation lifts the
       * structure from `pet-store.js`'s `followNameChanges`: yield
       * the existing entries in sorted order, then yield diff
       * records (`{ add, type }` / `{ remove }`) as
       * `FilePowers.watchDirectory` reports changes.
       *
       * Confinement: the watched path is validated up-front, and
       * each emitted name passes through the same `isConfinedPath`
       * filter `list()` uses, so symlinks escaping the mount root
       * are silently dropped from both the snapshot and the diff
       * stream.
       *
       * Lifecycle: the `try / finally` releases the OS-level
       * watcher handle when the consumer drops the iterator
       * (the standard `for await … of` cleanup path, and what
       * `makeIteratorRef` triggers when a remote subscription
       * closes).
       */
      // `resolve` is liveness-gated, so invoking `followNameChanges` on an
      // already-revoked mount throws here, synchronously.
      const target = resolve(pathSegments);
      /** @returns {AsyncGenerator<MountNameChange, undefined, undefined>} */
      const generate = async function* generate() {
        assertLive();
        await assertConfined(target, confinementRoot, filePowers);

        const watcher = filePowers.watchDirectory(target);
        try {
          /** @type {Map<string, 'file' | 'directory'>} */
          const known = new Map();
          const entries = await filePowers.readDirectory(target);
          for (const name of entries.sort()) {
            // Restricted names appear in neither the snapshot batch nor the
            // diff stream, mirroring `list()`.
            if (isDenied(name)) {
              // eslint-disable-next-line no-continue
              continue;
            }
            const childPath = filePowers.joinPath(target, name);
            // eslint-disable-next-line no-await-in-loop
            if (await isConfinedPath(childPath, confinementRoot, filePowers)) {
              // eslint-disable-next-line no-await-in-loop
              const isDir = await filePowers.isDirectory(childPath);
              const type = isDir ? 'directory' : 'file';
              known.set(name, type);
              yield harden({ add: name, type });
            }
          }

          // Race each event pull against the revocation signal so a revoke
          // that lands while the stream is parked awaiting the next filesystem
          // event wakes it immediately, rather than stranding the stream until
          // the directory next happens to change (or forever, if it never
          // does). A plain (non-revocable) mount has no signal and just
          // iterates the watcher directly.
          const eventIterator = watcher.events[Symbol.asyncIterator]();
          /** @type {Promise<typeof revokedSentinel> | undefined} */
          const revokedSignal =
            revocation !== undefined
              ? revocation.whenRevoked.then(() => revokedSentinel)
              : undefined;
          try {
            for (;;) {
              // A revoke mid-stream fails the change stream rather than
              // continuing to leak the directory's evolution.
              assertLive();
              // eslint-disable-next-line no-await-in-loop
              const next = await (revokedSignal
                ? Promise.race([eventIterator.next(), revokedSignal])
                : eventIterator.next());
              if (next === revokedSentinel) {
                // The signal woke us; the re-check trips the revoked gate and
                // throws. The `break` is unreachable in practice (the signal
                // only fires on revoke) but keeps the loop from spinning and
                // narrows `next` to an iterator result below.
                assertLive();
                break;
              }
              if (next.done) {
                break;
              }
              const event = next.value;
              if (isDenied(event.name)) {
                // eslint-disable-next-line no-continue
                continue;
              }
              const childPath = filePowers.joinPath(target, event.name);
              // eslint-disable-next-line no-await-in-loop
              const present = await filePowers.exists(childPath);
              const confined =
                present &&
                // eslint-disable-next-line no-await-in-loop
                (await isConfinedPath(childPath, confinementRoot, filePowers));
              if (confined && !known.has(event.name)) {
                // eslint-disable-next-line no-await-in-loop
                const isDir = await filePowers.isDirectory(childPath);
                const type = isDir ? 'directory' : 'file';
                known.set(event.name, type);
                yield harden({ add: event.name, type });
              } else if (!confined && known.has(event.name)) {
                known.delete(event.name);
                yield harden({ remove: event.name });
              }
              // Otherwise the event was a same-name in-place mutation
              // (file contents changed, or a quick remove/re-add that
              // the debounce window collapsed); name-set is unchanged.
            }
          } finally {
            await eventIterator.return?.();
          }
        } finally {
          watcher.cancel();
        }
      };
      return readerFromIterator(generate());
    },

    readOnly() {
      assertLive();
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
      assertLive();
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
      const source = /** @type {{
       *   __getMethodNames__: () => Promise<string[]>;
       *   list: () => Promise<string[]>;
       *   lookup: (path: string | string[]) => Promise<unknown>;
       * }} */ (value);
      // eslint-disable-next-line no-underscore-dangle
      const methodNames = await E(source).__getMethodNames__();
      if (methodNames.includes('streamBase64')) {
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
          assertReadableBlobSource(source, methodNames);
          for await (const bytes of iterateBytesReader(source)) {
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
      if (methodNames.includes('list')) {
        await filePowers.makePath(target);
        const names = await E(source).list();
        for (const name of names) {
          assertValidTreeEntryName(name);
          // eslint-disable-next-line no-await-in-loop
          const child = await E(source).lookup(name);
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
      // loop until the filesystem is exhausted.  The first check is a
      // segment-prefix test on the resolved paths: `to` is a descendant
      // of `from` when `from`'s segments are a strict prefix of `to`'s.
      const toSegments = segmentsFromPathArg(toArg);
      const to = resolveFromRoot(toSegments);
      const rejectDescendant = () => {
        throw new Error(
          `Cannot copy ${q(relativeToRoot(from, confinementRoot))} into its own descendant ${q(relativeToRoot(to, confinementRoot))}`,
        );
      };
      if (
        toSegments.length > fromSegments.length &&
        fromSegments.every((segment, i) => segment === toSegments[i])
      ) {
        rejectDescendant();
      }
      // The logical-segment test above is blind to symlinks: a `to` whose
      // segments are not a prefix of `from`'s can still resolve *under*
      // `from` when an intermediate `to` component is a symlink back into
      // the source (e.g. `to = ['link', 'x']` where `link` -> the source
      // tree).  Re-run the descendant test on the symlink-resolved
      // physical paths so a symlinked re-entry cannot slip past.  Both
      // operands resolve from the same confinement root, so a shared
      // physical prefix is a genuine ancestor relationship, not a
      // coincidence of a common mount root above the confinement.
      const fromPhysical = await resolvePhysicalPath(from, filePowers);
      const toPhysical = await resolvePhysicalPath(to, filePowers);
      if (toPhysical.startsWith(`${fromPhysical}/`)) {
        rejectDescendant();
      }
      const source = await openExisting(from, fromSegments);
      await this.self.write(
        /** @type {string | string[] | import('./types.js').EndoMountEntry} */ (
          toArg
        ),
        source,
      ); // eslint-disable-line no-invalid-this
    },
  });

  mountRecords.set(
    exo,
    harden({ rootId, currentDir, confinementRoot, readOnly }),
  );
  // `MountInterface` is the canonical CapTP contract and `makeExo` checks the
  // implementation against it above.
  // Runtime patterns can only express broad
  // `M.promise()` / `M.remotable()` results, so refine that one inferred guard
  // surface to the promise payloads documented by `EndoMount` at this boundary.
  return /** @type {EndoMount} */ (/** @type {unknown} */ (exo));
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
    help(method) {
      return method === undefined
        ? 'EndoMountReadableTree: read-only ReadableTree view over a mount.'
        : `No documentation for method ${q(method)}.`;
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
  const { entrySegments, rootId, deniedSegments, revocation } = ctx;

  const assertLive = () => {
    if (revocation !== undefined && revocation.revoked) {
      throw new Error('Mount has been revoked');
    }
  };

  const help = makeHelp({});

  return makeExo('EndoMountEntry', MountEntryInterface, {
    help,
    segments() {
      assertLive();
      return harden([...entrySegments]);
    },
    displayPath() {
      assertLive();
      return entrySegments.length === 0 ? '.' : entrySegments.join('/');
    },
    child(name) {
      assertLive();
      assertValidSegment(name);
      assertSegmentAllowed(name, deniedSegments);
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
            deniedSegments,
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
 * @param {{ revoked: boolean, whenRevoked: Promise<undefined> }} [revocation]
 *   Liveness record shared with the minting mount; a flip trips this file
 *   handle too.
 * @returns {object}
 */
const makeMountFileExo = (
  filePath,
  readOnly,
  filePowers,
  confinementRoot,
  snapshotFile = undefined,
  revocation = undefined,
) => {
  const assertLive = () => {
    if (revocation !== undefined && revocation.revoked) {
      throw new Error('Mount has been revoked');
    }
  };

  const assertWritable = () => {
    assertLive();
    if (readOnly) {
      throw new Error('Mount is read-only');
    }
  };

  const help = makeHelp(mountFileHelp);

  return makeExo('EndoMountFile', MountFileInterface, {
    help,

    async text() {
      await null;
      assertLive();
      await assertConfined(filePath, confinementRoot, filePowers);
      return filePowers.readFileText(filePath);
    },

    /** @param {import('@endo/eventual-send').ERef<unknown>} synPromise */
    streamBase64(synPromise) {
      /** @returns {AsyncGenerator<Uint8Array>} */
      const readConfined = async function* readConfinedFile() {
        assertLive();
        await assertConfined(filePath, confinementRoot, filePowers);
        const reader = filePowers.makeFileReader(filePath);
        try {
          for (;;) {
            // Re-check liveness every chunk: a revoke that lands mid-read
            // stops delivering the remaining bytes rather than draining the
            // file to completion. A file reader advances chunk-by-chunk (it
            // never parks indefinitely the way `followNameChanges` does on a
            // directory watcher), so the per-chunk gate suffices — no
            // revocation-signal race is needed to wake it.
            assertLive();
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
      const pump = makeReaderPump(mapReader(readConfined(), encodeBase64));
      return pump(/** @type {any} */ (synPromise));
    },

    async json() {
      await null;
      assertLive();
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
      for await (const value of iterateBytesReader(
        /** @type {any} */ (readableRef),
      )) {
        // eslint-disable-next-line no-await-in-loop
        await writer.next(value);
      }
      await writer.return(undefined);
    },

    async stat() {
      await null;
      assertLive();
      await assertConfined(filePath, confinementRoot, filePowers);
      return filePowers.statPath(filePath);
    },

    // `getInfo` / `fetch` are the rich `BlobRef` range-I/O surface over the
    // *live* file (this is a read-only face, not a snapshot — the content can
    // still change underneath and is observed on each call). `getInfo` returns
    // the `{ algorithm, hash, size }` triple of the current bytes (hash base64,
    // matching `BlobRef`); `fetch` is a windowed read.
    //
    // The hash and size are read with one concurrent `Promise.all` to keep the
    // window minimal, but a fully atomic snapshot would require a single
    // combined hash+size host primitive (the XS host hashes by *path*, not over
    // an in-memory buffer, so there is no portable read-bytes-once path). A
    // concurrent writer mutating the file between the two reads can therefore
    // yield a hash and size from adjacent instants; callers needing a stable
    // identity should `snapshot()` (content-addressed, immutable) rather than
    // reading a live face. See designs/fs-interface-consolidation.md § C4.
    async getInfo() {
      await null;
      assertLive();
      await assertConfined(filePath, confinementRoot, filePowers);
      const [hashHex, fileStat] = await Promise.all([
        filePowers.sha256(filePath),
        filePowers.statPath(filePath),
      ]);
      return harden({
        algorithm: 'sha256',
        hash: encodeBase64(fromHex(hashHex)),
        size: fileStat.size,
      });
    },

    /**
     * @param {bigint} offset
     * @param {bigint} length
     */
    async fetch(offset, length) {
      await null;
      assertLive();
      await assertConfined(filePath, confinementRoot, filePowers);
      // Validate at the bigint→Number boundary (same `toSafeNumber` the
      // extended `BlobRef.fetch` uses) so negative or out-of-range windows
      // throw `EINVAL` rather than silently losing precision in `fs.read`.
      const bytes = await filePowers.readFileRange(
        filePath,
        toSafeNumber(offset, 'offset'),
        toSafeNumber(length, 'length'),
      );
      return bytesFromRange(bytes);
    },

    async snapshot() {
      assertLive();
      if (snapshotFile === undefined) {
        throw new Error('snapshot() is not available for this mount file');
      }
      await assertConfined(filePath, confinementRoot, filePowers);
      return snapshotFile(filePath);
    },

    readOnly() {
      assertLive();
      // Structural narrowing: return a ReadableBlob view, not an
      // EndoMountFile.  Mount-specific surface (`stat`, `snapshot`)
      // is removed; callers that need it keep a reference to the
      // un-attenuated mount file. The same `revocation` record flows in
      // so the derived read-only face revokes together with its origin.
      const readOnlyFile = makeMountFileExo(
        filePath,
        true,
        filePowers,
        confinementRoot,
        snapshotFile,
        revocation,
      );
      return makeReadableBlobView(readOnlyFile);
    },
  });
};
harden(makeMountFileExo);

/**
 * Structural-narrowing view exposing the read-only `ReadableBlob` surface
 * (`streamBase64`, `text`, `json`) plus the rich range-I/O surface (`getInfo`,
 * `fetch`) over a read-only mount file. This is a write-disabled *face* over a
 * live file — it delegates to the underlying file, so content changes are
 * observed; it just cannot be written through.
 *
 * @param {object} readOnlyFile - An EndoMountFile whose `readOnly` is true.
 * @returns {object}
 */
const makeReadableBlobView = readOnlyFile => {
  return makeExo('EndoMountReadableBlob', ReadableBlobRangeInterface, {
    /** @param {import('@endo/eventual-send').ERef<any>} synPromise */
    async streamBase64(synPromise) {
      return E(readOnlyFile).streamBase64(synPromise);
    },
    async text() {
      return E(readOnlyFile).text();
    },
    async json() {
      return E(readOnlyFile).json();
    },
    async getInfo() {
      return E(readOnlyFile).getInfo();
    },
    /**
     * @param {bigint} offset
     * @param {bigint} length
     */
    async fetch(offset, length) {
      return E(readOnlyFile).fetch(offset, length);
    },
    help(method) {
      return method === undefined
        ? 'EndoMountReadableBlob: read-only ReadableBlob view over a live mount file (text, json, streamBase64, getInfo, fetch).'
        : `No documentation for method ${q(method)}.`;
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
 * @param {(tree: object) => Promise<SnapshotTree>} [opts.snapshotTree]
 * @param {(path: string) => Promise<object>} [opts.snapshotFile]
 * @param {Iterable<string>} [opts.deniedSegments] Restricted-segment set that
 *   REPLACES `defaultDeniedSegments` (an empty iterable disables denial);
 *   undefined selects the default.
 * @param {{ revoked: boolean, whenRevoked: Promise<undefined> }} [opts.revocation]
 *   Liveness record shared across every derived face; `makeRevocableMount`
 *   supplies it. Undefined means the mount is never revocable.
 * @returns {EndoMount}
 */
export const makeMount = ({
  rootPath,
  readOnly,
  filePowers,
  snapshotTree = undefined,
  snapshotFile = undefined,
  deniedSegments = undefined,
  revocation = undefined,
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
    deniedSegments: resolveDeniedSegments(deniedSegments),
    revocation,
  };

  return makeMountExo(ctx);
};
harden(makeMount);

/**
 * Create a mount paired with a caretaker facet that can revoke it.
 *
 * The mount is minted over a fresh, mutable `revocation` record; the returned
 * `control` is an `EndoMountControl` exo whose `revoke()` flips
 * `revocation.revoked`. Because the record is shared through the mount's `ctx`
 * spread, a single `revoke()` trips the `assertLive()` gate on the root mount
 * and every face derived from it — sub-views, entries, opened files,
 * `readOnly()` views, `makeDirectory` results, and any open `followNameChanges`
 * stream. The daemon's `mount` / `scratch-mount` formulas wire
 * `context.onCancel(() => control.revoke())`, tying revocation to formula
 * cancellation, and keep the `control` captive so only the daemon can revoke.
 *
 * @param {Parameters<typeof makeMount>[0]} opts
 * @returns {{ mount: object, control: object }}
 */
export const makeRevocableMount = opts => {
  // `whenRevoked` settles the instant `revoke()` runs, so an open
  // `followNameChanges` stream parked on the next filesystem event wakes and
  // fails promptly instead of hanging until the directory happens to change.
  const { promise: whenRevoked, resolve: signalRevoked } =
    /** @type {import('@endo/promise-kit').PromiseKit<undefined>} */ (
      makePromiseKit()
    );
  const revocation = { revoked: false, whenRevoked };
  const mount = makeMount({ ...opts, revocation });
  const control = makeExo('EndoMountControl', MountControlInterface, {
    revoke() {
      revocation.revoked = true;
      signalRevoked(undefined);
    },
    help(method) {
      return method === undefined
        ? 'EndoMountControl: revoke() the paired mount and every face derived from it.'
        : `No documentation for method ${q(method)}.`;
    },
  });
  return harden({ mount, control });
};
harden(makeRevocableMount);
