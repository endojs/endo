// @ts-check
/**
 * Generic in-process advisory lock table (F8, DESIGN.md §4.6).
 *
 * In-memory and node-fs both maintain a `Map<key, Set<entry>>`
 * with identical `rangesOverlap` overlap-check semantics. The
 * only thing that differs is the key type — `bigint` node id
 * for in-memory, absolute `string` path for node-fs. This
 * module factors that out so both consume one implementation.
 *
 * Note: locks are advisory and in-process only. They don't
 * propagate to other processes touching the same path; that
 * would need a real `flock(2)` binding (out of scope for v1).
 */

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';

import { LockInterface } from '../guards.js';
import { rangesOverlap } from './helpers.js';

/**
 * Build a fresh lock table.
 *
 * @template K
 * @returns {{
 *   acquire: (key: K, opts: any) => object,
 *   probe: (key: K, opts: any) => { type: 'shared' | 'exclusive', start: bigint, length: bigint } | null,
 * }}
 */
export const makeLockTable = () => {
  /** @type {Map<K, Set<{ state: { type: 'shared' | 'exclusive', start: bigint, length: bigint } }>>} */
  const byKey = new Map();

  const getSet = key => {
    let s = byKey.get(key);
    if (!s) {
      s = new Set();
      byKey.set(key, s);
    }
    return s;
  };

  /**
   * Acquire a byte-range lock under `key`. Throws `EAGAIN` on
   * conflict (any non-shared-vs-shared overlap with an existing
   * lock). The returned `Lock` cap releases the lock when its
   * `release()` is called.
   *
   * @param {K} key
   * @param {any} opts  `{ type: 'shared'|'exclusive', start?: bigint, length?: bigint }`
   */
  const acquire = (key, opts) => {
    const o = opts || {};
    if (o.type !== 'shared' && o.type !== 'exclusive') {
      throw makeError(
        X`EINVAL: lock type must be 'shared' or 'exclusive', got ${q(o.type)}`,
      );
    }
    const requested = {
      type: o.type,
      start: BigInt(o.start ?? 0n),
      length: BigInt(o.length ?? 0n),
    };
    const set = getSet(key);
    for (const existing of set) {
      const sharedPair =
        existing.state.type === 'shared' && requested.type === 'shared';
      if (!sharedPair && rangesOverlap(existing.state, requested)) {
        throw makeError(
          X`EAGAIN: range conflicts with existing ${q(existing.state.type)} lock`,
        );
      }
    }
    const entry = { state: harden(requested) };
    set.add(entry);

    return makeExo('Lock', LockInterface, {
      async release() {
        if (!set.has(entry)) return;
        set.delete(entry);
        if (set.size === 0) byKey.delete(key);
      },
      help(method) {
        if (method === undefined) {
          return 'Lock: in-process advisory range lock on an OpenFile.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  /**
   * Probe for a lock overlapping the given range. Returns the
   * first matching state, or `null` if the range is free.
   *
   * @param {K} key
   * @param {any} opts  `{ start?: bigint, length?: bigint }`
   */
  const probe = (key, opts) => {
    const o = opts || {};
    const requested = {
      type: /** @type {'exclusive'} */ ('exclusive'),
      start: BigInt(o.start ?? 0n),
      length: BigInt(o.length ?? 0n),
    };
    const set = byKey.get(key);
    if (!set) return null;
    for (const existing of set) {
      if (rangesOverlap(existing.state, requested)) {
        return existing.state;
      }
    }
    return null;
  };

  return harden({ acquire, probe });
};
harden(makeLockTable);
