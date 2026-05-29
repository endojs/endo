// @ts-check
/**
 * Adapt an `@endo/endo-fs` `Filesystem` cap to the small
 * `ReadableTree` / `Mount` shape that `@endo/daemon`'s
 * `make-from-tree` formula consumes:
 *
 *     E(tree).lookup(name)         // string | string[]
 *       -> blob
 *     E(blob).text()               // Promise<string>
 *
 * That is the entire contract used by
 * `packages/daemon/src/worker.js` `makeFromTree` and by the
 * daemon-side `packTreeIntoArchiveBytes` helper. With this adapter
 * a project tree exposed through endo-fs can drive `make-from-tree`
 * without inventing a new formula type.
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

import { TreeViewInterface, TreeBlobInterface } from './type-guards.js';

/**
 * Coerce a `string | string[]` lookup argument into a flat array of
 * non-empty, non-traversal segments. Each string element is split on
 * `/` so callers can pass either `'a/b/c'`, `['a/b', 'c']`, or
 * `['a', 'b', 'c']` interchangeably — the daemon's `make-from-tree`
 * worker passes the second form (the archive path split by `/`).
 *
 * @param {string | string[]} pathArg
 * @returns {string[]}
 */
const normalizeSegments = pathArg => {
  const raw = typeof pathArg === 'string' ? [pathArg] : pathArg;
  /** @type {string[]} */
  const out = [];
  for (const part of raw) {
    if (typeof part !== 'string') {
      throw makeError(X`TreeView lookup expects strings, got ${q(part)}`);
    }
    for (const seg of part.split('/')) {
      if (seg === '.' || seg === '..') {
        throw makeError(
          X`TreeView lookup rejects traversal segment ${q(seg)} in ${q(pathArg)}`,
        );
      }
      if (seg.includes('\0')) {
        throw makeError(
          X`TreeView lookup rejects NUL byte in segment ${q(seg)}`,
        );
      }
      if (seg !== '') {
        out.push(seg);
      }
    }
  }
  return out;
};

/**
 * Drain a `PassableBytesReader` into a single `Uint8Array`. The
 * `stringLengthLimit` accommodates backings (e.g.
 * `makeBytesReaderFromBytes`) that emit the whole payload in one
 * base64 frame; without it the default 100 KB cap on `M.string()`
 * would reject anything bigger.
 *
 * @param {unknown} readerRef
 * @param {bigint | number} expectedSize
 * @returns {Promise<Uint8Array>}
 */
const drainBytesReader = async (readerRef, expectedSize) => {
  const size =
    typeof expectedSize === 'bigint' ? Number(expectedSize) : expectedSize;
  const stringLengthLimit = Math.max(100_000, Math.ceil((size * 4) / 3) + 1024);
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(/** @type {any} */ (readerRef), {
    stringLengthLimit,
  })) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
};

/**
 * Wrap an `@endo/endo-fs` `Filesystem` cap as a tree-shaped cap
 * suitable for `@endo/daemon`'s `make-from-tree` formula.
 *
 * @param {object} filesystem  An endo-fs Filesystem cap (or eref).
 * @param {object} [opts]
 * @param {string | string[]} [opts.subPath]  Optional path within
 *   the filesystem to use as the tree root. A user wrapping a
 *   monorepo's root cap can rebase the view to `apps/widget` so
 *   `compartment-map.json` is resolved at
 *   `apps/widget/compartment-map.json`.
 * @returns {object} an exo implementing {@link TreeViewInterface}
 */
export const makeTreeView = (filesystem, opts = {}) => {
  const subPathArg = opts.subPath ?? [];
  const basePath = normalizeSegments(
    /** @type {string | string[]} */ (subPathArg),
  );

  /**
   * Pipeline the walk: never `await` between segments so the whole
   * `root -> lookup -> lookup -> ...` chain dispatches in one
   * CapTP batch. The `materialise` precedent in endo-fs's
   * `type-guards.js` documents why this matters for deep paths.
   *
   * @param {string[]} segments
   */
  const walk = segments => {
    let cursor = /** @type {any} */ (E(filesystem).root());
    for (const seg of segments) {
      cursor = E(cursor).lookup(seg);
    }
    return cursor;
  };

  const makeBlob = (segments, displayPath) => {
    // Walk lazily inside text() so a `lookup(...)` of a missing
    // path doesn't strand a rejected promise (the intermediate
    // pipelined `E(cursor).lookup(seg)` cursors have no catch
    // handlers and would surface as unhandled rejections). A side
    // effect of lazy walk: each `text()` call re-walks and re-reads
    // — blobs do not cache their bytes. `make-from-tree` reads each
    // module exactly once, so memoising would be dead weight.
    const text = async () => {
      // Pipeline the walk with both getAttrs and open in a single
      // CapTP batch: `walk(...)` is the unawaited tail of the lookup
      // chain, and getAttrs/open are E-sent against it directly.
      // We must own `openFile`'s close inside a try/finally — the
      // previous version awaited a `Promise.all([getAttrs, open])`
      // outside the try, which would leak the OpenFile if getAttrs
      // rejected while open resolved.
      const fileP = walk(segments);
      const attrsP = E(/** @type {any} */ (fileP)).getAttrs();
      // If `open` rejects first the attrsP rejection would become
      // unhandled; pre-attach a no-op handler so it stays observed
      // even when we throw before reaching the await below.
      attrsP.catch(() => undefined);
      const openFile = await E(/** @type {any} */ (fileP)).open({
        read: true,
      });
      try {
        const attrs = await attrsP;
        const size = /** @type {{ size: bigint }} */ (attrs).size;
        if (size === 0n) return '';
        const reader = await E(/** @type {any} */ (openFile)).read(0n, size);
        const bytes = await drainBytesReader(reader, size);
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } finally {
        await E(/** @type {any} */ (openFile))
          .close()
          .catch(() => undefined);
      }
    };

    return makeExo(
      'TreeBlob',
      TreeBlobInterface,
      /** @type {any} */ ({
        help: () => `TreeView blob at ${displayPath}`,
        text,
      }),
    );
  };

  return makeExo(
    'TreeView',
    TreeViewInterface,
    /** @type {any} */ ({
      help: () =>
        basePath.length === 0
          ? 'TreeView over an endo-fs Filesystem (rooted)'
          : `TreeView over an endo-fs Filesystem rooted at ${basePath.join('/')}`,
      lookup: pathArg => {
        const segments = normalizeSegments(pathArg);
        if (segments.length === 0) {
          throw makeError(X`TreeView lookup requires a non-empty path`);
        }
        const full = [...basePath, ...segments];
        return makeBlob(full, full.join('/'));
      },
    }),
  );
};
harden(makeTreeView);
