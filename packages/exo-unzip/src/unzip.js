// @ts-check

/** @import { ReadableTree } from '@endo/platform/fs/lite/types' */

import harden from '@endo/harden';
import { makeExo } from '@endo/exo';
import { Far } from '@endo/far';
import { encodeBase64 } from '@endo/base64';
import { ZipReader } from '@endo/zip/reader.js';
import { inflate } from '@endo/zip/inflate.js';
import {
  assertSafePathSegments,
  splitAndValidatePath,
} from '@endo/zip/path.js';
import {
  ReadableBlobInterface,
  ReadableTreeInterface,
} from '@endo/platform/fs/lite';
import { bytesToText } from '@endo/bytes/to-string.js';
import { Fail } from '@endo/errors';

/**
 * Wrap an async iterator (or iterable) as a hardened, CapTP-passable
 * remotable exposing `next`/`return`/`throw`, so a `streamBase64`
 * consumer can drain it over an eventual-send boundary via
 * `E(ref).next()`. Mirrors `@endo/daemon`'s `makeIteratorRef`
 * (referenced by the shared `@endo/platform` fs design), reproduced
 * locally because this workspace does not depend on `@endo/daemon`.
 *
 * @param {AsyncIterator<unknown> | AsyncIterable<unknown>} iterable
 */
const makeIteratorRef = iterable => {
  const iterator =
    Symbol.asyncIterator in iterable
      ? /** @type {AsyncIterable<unknown>} */ (iterable)[Symbol.asyncIterator]()
      : /** @type {AsyncIterator<unknown>} */ (iterable);
  return Far('AsyncIterator', {
    async next() {
      return iterator.next();
    },
    /** @param {unknown} [value] */
    async return(value) {
      if (iterator.return !== undefined) {
        return iterator.return(value);
      }
      return harden({ value, done: true });
    },
    /** @param {unknown} [error] */
    async throw(error) {
      if (iterator.throw !== undefined) {
        return iterator.throw(error);
      }
      return harden({ value: undefined, done: true });
    },
  });
};
harden(makeIteratorRef);

// `@endo/zip/inflate.js` is implemented atop `DecompressionStream`,
// which is available in every host the project targets (Node 18+,
// modern browsers, XS via web-stream shims) but the read side will
// still throw a clear error from `@endo/zip` at decompress time if
// the platform omits the global. Probe once at module load so the
// `unzip` factory only injects an inflate the host can actually run;
// archives that contain only `STORE` entries continue to work even
// when DEFLATE is unavailable.
// Construct a probe stream so the check actually exercises support for
// `'deflate-raw'`; Node 18 ships `DecompressionStream` but only accepts
// `'deflate'` and `'gzip'`, so the typeof probe alone falsely reports
// support and `inflate()` then throws at archive-read time.
let canInflate = false;
try {
  // eslint-disable-next-line no-new
  new DecompressionStream('deflate-raw');
  canInflate = true;
  // eslint-disable-next-line no-empty
} catch {}

/**
 * @typedef {object} TreeNode
 * A node in the synthesized directory hierarchy. Either holds a
 * non-empty children map (directory) OR a `fullPath` to a zip entry
 * (leaf blob). The two cases are mutually exclusive; an entry whose
 * own path is a prefix of another entry's path causes a collision
 * error at construction time.
 * @property {Map<string, TreeNode>=} children
 * @property {string=} fullPath
 */

/**
 * Insert a single zip-entry path as a leaf into the tree, creating
 * any intermediate directory nodes along the way and validating each
 * segment.
 *
 * @param {TreeNode} root
 * @param {string} fullPath
 * @param {string} archiveName
 */
const addEntry = (root, fullPath, archiveName) => {
  const segments = splitAndValidatePath(fullPath, archiveName);
  let node = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!node.children) {
      // Reached a leaf where a directory was expected: an existing
      // file's path is a prefix of the current entry's path.
      throw Fail`Zip ${archiveName} entry ${JSON.stringify(fullPath)} collides with an existing file at ${JSON.stringify(segments.slice(0, i).join('/'))}`;
    }
    let child = node.children.get(segment);
    if (!child) {
      child = { children: new Map() };
      node.children.set(segment, child);
    }
    node = child;
  }

  const leaf = segments[segments.length - 1];
  if (!node.children) {
    throw Fail`Zip ${archiveName} entry ${JSON.stringify(fullPath)} collides with an existing file`;
  }
  if (node.children.has(leaf)) {
    const existing = /** @type {TreeNode} */ (node.children.get(leaf));
    if (existing.children) {
      throw Fail`Zip ${archiveName} entry ${JSON.stringify(fullPath)} collides with an existing directory of the same name`;
    }
    throw Fail`Zip ${archiveName} contains duplicate entry ${JSON.stringify(fullPath)}`;
  }
  node.children.set(leaf, { fullPath });
};
harden(addEntry);

/**
 * Group zip entries into a synthesized directory tree.
 *
 * @param {Iterable<string>} entryPaths
 * @param {string} archiveName
 * @returns {TreeNode}
 */
const buildTree = (entryPaths, archiveName) => {
  /** @type {TreeNode} */
  const root = { children: new Map() };

  for (const fullPath of entryPaths) {
    if (fullPath.endsWith('/')) {
      // Skip explicit directory entries (zip stores directories as
      // entries whose name ends with `/`); the directory hierarchy
      // is re-derived from leaf paths.
      // Validate even directory-only entries so adversarial inputs
      // (`../`, empty segments, NUL) cannot slip through.
      splitAndValidatePath(fullPath.slice(0, -1), archiveName);
    } else {
      addEntry(root, fullPath, archiveName);
    }
  }

  return root;
};
harden(buildTree);

/**
 * Maximum raw byte count per yielded base64 chunk. A multiple of 3 so
 * each non-final encoded chunk lands on a base64 4-character group
 * boundary and carries no `=` padding; only the final chunk may be
 * padded. This invariant lets a consumer concatenate the yielded
 * strings and decode the result in a single `decodeBase64` call.
 *
 * 48 KiB raw -> 64 KiB base64 keeps a single chunk well within typical
 * CapTP frame budgets while amortising the per-yield overhead.
 */
const BASE64_CHUNK_RAW_BYTES = 48 * 1024;

/**
 * Yield base64-encoded chunks for the given bytes via an async iterator.
 *
 * Contract: every chunk except possibly the last has a length divisible
 * by 4 (i.e. encodes a raw-byte slice whose length is a multiple of 3).
 * Only the final chunk may carry `=` padding. This means a consumer can
 * accumulate the yielded strings and decode the concatenation in a
 * single `decodeBase64(chunks.join(''))` call. Decoding each chunk
 * independently and concatenating the resulting bytes happens to work
 * here too, but the encoded-string-concat strategy is cheaper (one
 * decoder pass) and matches the contract documented for downstream
 * consumers.
 *
 * Chunking at `BASE64_CHUNK_RAW_BYTES` (48 KiB raw, ~64 KiB encoded)
 * keeps individual frames small enough for CapTP without amplifying
 * per-yield overhead.
 *
 * Accepts either a `Uint8Array` or a `Promise<Uint8Array>` so the
 * caller can defer (potentially async) decompression to the moment
 * the consumer asks for the first chunk; the `streamBase64()` exo
 * method must return a remotable iterator synchronously per its
 * `M.remotable()` guard, but the iterator body itself is async.
 *
 * @param {Uint8Array | Promise<Uint8Array>} bytesOrPromise
 */
async function* base64Chunks(bytesOrPromise) {
  const bytes = await bytesOrPromise;
  const total = bytes.length;
  if (total === 0) {
    yield '';
    return;
  }
  for (let offset = 0; offset < total; offset += BASE64_CHUNK_RAW_BYTES) {
    const end = Math.min(offset + BASE64_CHUNK_RAW_BYTES, total);
    yield encodeBase64(bytes.subarray(offset, end));
  }
}

/**
 * Construct a ReadableBlob exo backed by a single zip entry.
 *
 * @param {ZipReader} zipReader
 * @param {string} fullPath
 */
const makeUnzipBlob = (zipReader, fullPath) => {
  // Decompress lazily on first method call. `@endo/zip`'s reader
  // already holds the compressed bytes in memory; the async `get`
  // path runs the configured `inflate` (DEFLATE) once per call.
  // STORE entries skip inflate entirely.
  return makeExo('UnzipBlob', ReadableBlobInterface, {
    streamBase64: () => {
      // `get` returns a Promise; pass it to the async iterator and
      // await inside so `streamBase64` can return its remotable
      // iterator synchronously per the `M.remotable()` guard.
      return makeIteratorRef(base64Chunks(zipReader.get(fullPath)));
    },
    text: async () => {
      const bytes = await zipReader.get(fullPath);
      return bytesToText(bytes);
    },
    json: async () => {
      const bytes = await zipReader.get(fullPath);
      return JSON.parse(bytesToText(bytes));
    },
    /** @param {string} [method] */
    help: method =>
      method === undefined
        ? 'UnzipBlob: read-only view of a single ZIP entry (streamBase64, text, json).'
        : `No documentation for method ${method}.`,
  });
};
harden(makeUnzipBlob);

/**
 * Construct a ReadableTree exo backed by a node in the synthesized
 * directory hierarchy. Sub-tree and leaf exos are materialised lazily
 * on lookup and not cached: a 10 000-entry archive that is enumerated
 * once allocates 10 000 exos at most, but a checkin walk that touches
 * each entry once never holds more than the active path's worth of
 * exos at the same time.
 *
 * @param {ZipReader} zipReader
 * @param {TreeNode} node
 * @param {string} archiveName
 */
const makeUnzipTree = (zipReader, node, archiveName) => {
  const children = node.children;
  if (!children) {
    throw Fail`makeUnzipTree called on a leaf node`;
  }

  /** @type {ReadableTree} */
  const methods = {
    has: async (...names) => {
      assertSafePathSegments(names, archiveName);
      if (names.length === 0) return true;
      const [head, ...tail] = names;
      const child = children.get(head);
      if (child === undefined) return false;
      if (tail.length === 0) return true;
      if (!child.children) {
        // The named child is a blob; further descent is not possible.
        return false;
      }
      const subtree = makeUnzipTree(zipReader, child, archiveName);
      return subtree.has(...tail);
    },
    list: async (...names) => {
      assertSafePathSegments(names, archiveName);
      let target = node;
      for (const name of names) {
        if (!target.children) {
          throw Fail`Cannot list ${JSON.stringify(name)} inside a blob`;
        }
        const next = target.children.get(name);
        if (next === undefined) {
          throw Fail`No such entry: ${JSON.stringify(name)}`;
        }
        target = next;
      }
      if (!target.children) {
        throw Fail`Cannot list a blob entry`;
      }
      return harden([...target.children.keys()].sort());
    },
    /**
     * Recursive listing of the subtree under `petNamePath` (a single
     * name, a path of segments, or `[]` for the whole tree). Returns
     * every descendant as a `{ path, type }` record — `path` relative
     * to the queried node, lexically sorted, each directory emitted
     * before its own children (matching `@endo/platform`'s `LocalTree`).
     * `options.ignore` augments the set of top-level segment names to
     * skip for this call. The synthesized tree lives entirely in local
     * Maps, so the walk is synchronous under an async signature.
     *
     * @param {string | string[]} petNamePath
     * @param {{ ignore?: string[] }} [listTreeOptions]
     * @returns {Promise<Array<{ path: string[], type: 'file' | 'directory' }>>}
     */
    listTree: async (petNamePath, listTreeOptions = {}) => {
      const namePath =
        typeof petNamePath === 'string' ? [petNamePath] : petNamePath;
      assertSafePathSegments(namePath, archiveName);
      const { ignore = [] } = listTreeOptions;
      const ignoredHere = new Set(ignore);

      let start = node;
      for (const name of namePath) {
        if (!start.children) {
          throw Fail`Cannot descend into a blob at ${JSON.stringify(name)}`;
        }
        const next = start.children.get(name);
        if (next === undefined) {
          throw Fail`No such entry: ${JSON.stringify(name)}`;
        }
        start = next;
      }
      if (!start.children) {
        throw Fail`Cannot list a blob entry`;
      }

      /** @type {Array<{ path: string[], type: 'file' | 'directory' }>} */
      const entries = [];

      /**
       * @param {TreeNode} current
       * @param {string[]} relSegments
       */
      const walk = (current, relSegments) => {
        const kept = [...(current.children?.keys() ?? [])]
          .filter(name => !(relSegments.length === 0 && ignoredHere.has(name)))
          .sort();
        for (const name of kept) {
          const child = /** @type {TreeNode} */ (
            /** @type {Map<string, TreeNode>} */ (current.children).get(name)
          );
          const childRel = harden([...relSegments, name]);
          if (child.children) {
            entries.push(harden({ path: childRel, type: 'directory' }));
            walk(child, childRel);
          } else {
            entries.push(harden({ path: childRel, type: 'file' }));
          }
        }
      };

      walk(start, []);
      return harden(entries);
    },
    lookup: async petNamePath => {
      const namePath =
        typeof petNamePath === 'string' ? [petNamePath] : petNamePath;
      if (namePath.length === 0) {
        throw Fail`lookup requires at least one name`;
      }
      assertSafePathSegments(namePath, archiveName);
      // Walk the synthesized tree synchronously. Both intermediate
      // and terminal nodes resolve from the local Map, so there is
      // no need to use `E(...)` or `await` here. The single exo
      // creation happens at the leaf (or last directory).
      let target = node;
      for (let i = 0; i < namePath.length - 1; i += 1) {
        if (!target.children) {
          throw Fail`Cannot descend into a blob at ${JSON.stringify(namePath.slice(0, i).join('/'))}`;
        }
        const next = target.children.get(namePath[i]);
        if (next === undefined) {
          throw Fail`No such entry: ${JSON.stringify(namePath[i])}`;
        }
        target = next;
      }
      if (!target.children) {
        throw Fail`Cannot descend into a blob`;
      }
      const last = namePath[namePath.length - 1];
      const child = target.children.get(last);
      if (child === undefined) {
        throw Fail`No such entry: ${JSON.stringify(last)}`;
      }
      if (child.children) {
        return makeUnzipTree(zipReader, child, archiveName);
      }
      return makeUnzipBlob(zipReader, /** @type {string} */ (child.fullPath));
    },
    /** @param {string} [method] */
    help: method =>
      method === undefined
        ? 'UnzipTree: read-only view of an in-memory ZIP archive (has, list, listTree, lookup).'
        : `No documentation for method ${method}.`,
  };

  return makeExo('UnzipTree', ReadableTreeInterface, methods);
};
harden(makeUnzipTree);

/**
 * Open a ZIP archive in memory and present it as a `ReadableTree`
 * exo whose leaves are `ReadableBlob` exos. Suitable for handing to
 * `E(agent).storeTree(...)` over CapTP.
 *
 * The factory is synchronous because `@endo/zip`'s `ZipReader`
 * constructor is synchronous: it parses the central directory and
 * decompresses each entry on demand when `.read(name)` is called.
 *
 * Adversarial inputs (entries with `..`, `.`, empty path segments,
 * control characters in the `\x00`-`\x1f` range, duplicate paths,
 * or paths that collide with a directory) are rejected at
 * construction time so the resulting tree cannot escape the
 * archive's namespace. The same segment validator runs on the
 * path arguments to `has`, `list`, and `lookup`, so adversarial
 * input arriving over CapTP cannot bypass the construction-time
 * checks.
 *
 * @param {Uint8Array} zipBytes
 * @param {object} [options]
 * @param {string} [options.name] A diagnostic name for the archive,
 *   used in error messages. Defaults to `<zip>`.
 */
export const unzip = (zipBytes, options = {}) => {
  const { name = '<zip>' } = options;
  // Inject `inflate` whenever the host platform supports it so DEFLATE
  // entries decode transparently; STORE entries take the fast path
  // through `ZipReader.get` regardless. On a host without
  // `DecompressionStream` (the probe runs once at module load) the
  // reader is constructed without `inflate` and falls back to its
  // legacy "no inflate implementation configured" error if the
  // archive contains a DEFLATE entry.
  const zipReader = new ZipReader(zipBytes, {
    name,
    ...(canInflate ? { inflate } : {}),
  });
  const tree = buildTree(zipReader.files.keys(), name);
  return makeUnzipTree(zipReader, tree, name);
};
harden(unzip);
