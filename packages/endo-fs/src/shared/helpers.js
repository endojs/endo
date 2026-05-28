// @ts-check
/**
 * Pure helpers used by the wrap-backend layer and its backend
 * adapters. Each export below is actively used; legacy helpers that
 * served the pre-seam-refactor backings (makeAttrs / nowNs /
 * makeStringReaderFromArray / makeBytesSinkWriter / makeNotSupported)
 * have been deleted along with their dead call sites.
 */

import { makeError, X, q } from '@endo/errors';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';

export const EMPTY_BYTES = harden(new Uint8Array(0));

/**
 * Wrap a `Uint8Array` snapshot as a `PassableBytesReader` that
 * yields its bytes in one chunk. Used by `shared/blobref.js` for
 * `BlobRef.fetch`.
 *
 * @param {Uint8Array} bytes
 */
export const makeBytesReaderFromBytes = bytes => {
  const generator = async function* () {
    if (bytes.length !== 0) yield bytes;
  };
  return bytesReaderFromIterator(generator());
};

/**
 * Test whether two byte ranges intersect. `length === 0n` means
 * "to end of file" (POSIX convention). Returns `true` if the
 * ranges share at least one byte.
 *
 * @param {{ start: bigint, length: bigint }} a
 * @param {{ start: bigint, length: bigint }} b
 */
export const rangesOverlap = (a, b) => {
  const aUnbounded = a.length === 0n;
  const bUnbounded = b.length === 0n;
  if (aUnbounded && bUnbounded) return true;
  if (aUnbounded) {
    const bEnd = b.start + b.length;
    return bEnd > a.start;
  }
  if (bUnbounded) {
    const aEnd = a.start + a.length;
    return aEnd > b.start;
  }
  const aEnd = a.start + a.length;
  const bEnd = b.start + b.length;
  return a.start < bEnd && b.start < aEnd;
};

/**
 * Validate a name passed to a `Directory` mutating verb. Rejects
 * empty strings, the `.` / `..` reserved names, and names
 * containing `/` or `NUL`.
 *
 * @param {string} name
 */
export const assertChildName = name => {
  if (typeof name !== 'string' || name.length === 0) {
    throw makeError(X`EINVAL: invalid name ${q(name)}`);
  }
  if (name === '.' || name === '..') {
    throw makeError(X`EINVAL: name ${q(name)} reserved`);
  }
  if (name.includes('/') || name.includes('\0')) {
    throw makeError(X`EINVAL: name ${q(name)} contains path separator`);
  }
};

/**
 * Convert a `bigint` (or `number`) offset/length to a safe
 * `Number`, throwing `EINVAL` on overflow, non-integer values,
 * or negatives. Used at the boundary where the bigint-shaped
 * public API meets Number-shaped host APIs (`Uint8Array.slice`,
 * `fs.read`, …) so out-of-range values can't silently lose
 * precision.
 *
 * @param {bigint | number} value
 * @param {string} name  argument name for error messages
 * @returns {number}
 */
export const toSafeNumber = (value, name) => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw makeError(
        X`EINVAL: ${q(name)} must be non-negative, got ${q(value)}`,
      );
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw makeError(
        X`EINVAL: ${q(name)} ${q(value)} exceeds Number.MAX_SAFE_INTEGER`,
      );
    }
    return Number(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw makeError(
        X`EINVAL: ${q(name)} ${q(value)} is not a safe non-negative integer`,
      );
    }
    return value;
  }
  throw makeError(
    X`EINVAL: ${q(name)} must be bigint or number, got ${q(typeof value)}`,
  );
};

/**
 * Mint a fresh process-unique brand ID for a primitive Filesystem.
 * The brand is a passable `bigint` that survives CapTP marshalling,
 * so a Filesystem cap passed across CapTP and re-composed locally
 * still reports its original brand — letting `bind` / `namespace`
 * / `compose` detect the cycle that the per-presence `Symbol` check
 * would miss. See ROADMAP §1.6.
 */
let nextBrand = 0n;
export const mintBrand = () => {
  nextBrand += 1n;
  return nextBrand;
};
harden(mintBrand);

/**
 * Default `Directory.materialise(path, opts)` for wrappers that
 * don't have a server-side fast path. Walks `path` step by step,
 * looking up the next segment and `mkdir`-ing it if absent. Each
 * step costs one CapTP round-trip in the worst case — primitive
 * backings should implement `materialise` server-side instead to
 * collapse the whole walk to a single RTT.
 *
 * Used by `compose.js`'s composed Filesystems, which don't have a
 * single backing path to push the walk down to.
 *
 * @param {object} startDir  starting Directory cap
 * @param {string[]} path
 * @param {any} opts
 */
export const materialiseViaWalk = async (startDir, path, opts) => {
  // Late import to avoid a circular dep on `@endo/eventual-send` at
  // module-load time (helpers.js is imported by everything).
  const { E } = await import('@endo/eventual-send');
  if (!Array.isArray(path)) {
    throw makeError(X`EINVAL: materialise path must be an array`);
  }
  let cur = startDir;
  for (const seg of path) {
    if (
      typeof seg !== 'string' ||
      seg.length === 0 ||
      seg === '.' ||
      seg === '..' ||
      seg.includes('/') ||
      seg.includes('\0')
    ) {
      throw makeError(X`EINVAL: invalid path segment ${q(seg)}`);
    }
    let child = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      child = await E(cur).lookup(seg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/ENOENT/.test(msg)) throw e;
    }
    if (child === null) {
      // eslint-disable-next-line no-await-in-loop
      cur = await E(cur).mkdir(seg, opts || {});
    } else {
      // eslint-disable-next-line no-await-in-loop
      const qid = await E(child).getQid();
      if (!qid || qid.type !== 'directory') {
        throw makeError(X`ENOTDIR: ${q(seg)} exists but is not a directory`);
      }
      cur = child;
    }
  }
  return cur;
};
harden(materialiseViaWalk);

/**
 * Compute the OpenFile mode flags from an `OpenOpts` record.
 *
 * `append` and `truncate` are POSIX write modifiers (`O_APPEND`,
 * `O_TRUNC`); they have no meaning without write access. Coerce
 * them to imply write so a caller can't accidentally land a
 * truncate-only handle that can't subsequently write its
 * replacement bytes. A handle with neither read nor write set
 * is useless; reject with EINVAL rather than silently flipping
 * one on.
 *
 * @param {any} opts
 * @returns {{ read: boolean, write: boolean, append: boolean, truncate: boolean }}
 */
export const computeOpenMode = opts => {
  const o = opts || {};
  const write = !!o.write || !!o.append || !!o.truncate;
  let read;
  if (o.read === true) read = true;
  else if (o.read === false) read = false;
  else read = !write;
  if (!read && !write) {
    throw makeError(
      X`EINVAL: open requires at least one of read or write to be true`,
    );
  }
  return {
    read,
    write,
    append: !!o.append,
    truncate: !!o.truncate,
  };
};
