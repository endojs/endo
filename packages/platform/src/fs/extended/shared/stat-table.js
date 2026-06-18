// @ts-check
/**
 * Vat-local per-path stat tracking for `wrapBackend`.
 *
 * `wrapBackend` synthesizes `mtime` / `atime` / `ctime` / `btime`
 * for backends that don't surface them through `backend.getStat?`.
 * The semantics are POSIX-like:
 *
 * - **mtime** (modification time): updated on `write`, `setStat`,
 *   `truncate`. Initialized to "now" on first observation.
 * - **atime** (access time): updated on `read`. Initialized to "now."
 * - **ctime** (status-change time): bumped whenever `mtime` bumps.
 * - **btime** (birth/created time): fixed at first observation; not
 *   updated.
 *
 * `readStatNow(path)` is the canonical accessor for wrap-backend's
 * `getStat` / `getAttrs` methods: it prefers `backend.getStat?` when
 * present (so node-fs surfaces real disk truth) and falls back to
 * the vat-local table for toy backends. The vat-local entries also
 * carry forward across rename via `transplantTables` and clean up
 * on `remove` via `cleanupTables` (see `shared/path-tables.js`).
 *
 * @import { FsBackend } from '../backend-types.js'
 */

/**
 * @typedef {{
 *   mtime: bigint,
 *   atime: bigint,
 *   ctime: bigint,
 *   btime: bigint,
 * }} StatRec
 */

/**
 * Build a fresh stat-table.
 *
 * @param {(path: string[]) => string} lockKeyOf
 */
export const makeStatTable = lockKeyOf => {
  /** @type {Map<string, StatRec>} */
  const statTable = new Map();

  const nowNs = () => BigInt(Date.now()) * 1_000_000n;

  /**
   * Update mtime and/or atime for `path` to "now." `ctime` follows
   * `mtime`. `btime` is fixed at first observation.
   *
   * @param {string[]} path
   * @param {{ mtime?: boolean, atime?: boolean }} [fields]
   */
  const touch = (path, fields) => {
    const wantMtime = fields ? !!fields.mtime : true;
    const wantAtime = fields ? !!fields.atime : false;
    const key = lockKeyOf(path);
    let rec = statTable.get(key);
    const t = nowNs();
    if (!rec) {
      rec = { mtime: t, atime: t, ctime: t, btime: t };
      statTable.set(key, rec);
    }
    if (wantMtime) {
      rec.mtime = t;
      rec.ctime = t;
    }
    if (wantAtime) rec.atime = t;
  };

  /**
   * Get the stat record for `path`, initializing it to "now" on
   * first observation. Mutable — callers may mutate the returned
   * record's fields in place (wrap-backend's `setStat` does this
   * to record explicit mtime/atime from the caller).
   *
   * @param {string[]} path
   * @returns {StatRec}
   */
  const statOf = path => {
    const key = lockKeyOf(path);
    let rec = statTable.get(key);
    if (!rec) {
      const t = nowNs();
      rec = { mtime: t, atime: t, ctime: t, btime: t };
      statTable.set(key, rec);
    }
    return rec;
  };

  /**
   * Read the portable stat subset for a path. Prefers `backend.getStat?`
   * when available so persistent backings (e.g. node-fs) surface
   * disk-truthful values instead of the vat-local fallback.
   *
   * @param {FsBackend} backend
   * @param {boolean} hasGetStat  whether `backend.getStat` is callable
   * @param {string[]} path
   * @returns {Promise<{ size?: bigint, mtime: bigint, atime: bigint, ctime: bigint, btime: bigint }>}
   */
  const readStatNow = async (backend, hasGetStat, path) => {
    if (hasGetStat) {
      // @ts-expect-error optional method checked by hasGetStat
      const backendStat = await backend.getStat(path);
      const local = statOf(path);
      return harden({
        size: backendStat.size,
        mtime: backendStat.mtime ?? local.mtime,
        atime: backendStat.atime ?? local.atime,
        ctime: local.ctime,
        btime: local.btime,
      });
    }
    return statOf(path);
  };

  return harden({ statTable, touch, statOf, readStatNow });
};
harden(makeStatTable);
