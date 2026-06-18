// @ts-check
/**
 * Pure helper: synthesize a stable `Qid` for a path.
 *
 * The base FsBackend doesn't track inode-like identity (`pathId`,
 * `version`) — that's POSIX-shaped territory belonging to the future
 * PosixFs cap. `wrapBackend` and other consumers that need a `Qid`
 * for a path (e.g. 9p-server's `Twalk`, `Treaddir`) call this to
 * synthesize one. The hash is deterministic, so two looks at the
 * same path return identical Qids and Qid equality stays meaningful
 * within a vat.
 *
 * @import { NodeKind } from '../backend-types.js'
 */

/**
 * @param {string[]} path
 * @param {NodeKind} kind
 */
export const synthQid = (path, kind) => {
  // 64-bit FNV-1a over the joined path, masked to fit a bigint we
  // can pass through CapTP. The `^` and `&` are inherent to the
  // algorithm; we silence `no-bitwise` rather than swap for a less
  // standard hash.
  let h = 0xcbf2_9ce4_8422_2325n;
  const FNV_PRIME = 0x100_0000_01b3n;
  const MASK = 0xffff_ffff_ffff_ffffn;
  const joined = path.join('\0');
  for (let i = 0; i < joined.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    h = (h ^ BigInt(joined.charCodeAt(i))) & MASK;
    // eslint-disable-next-line no-bitwise
    h = (h * FNV_PRIME) & MASK;
  }
  return harden({ type: kind, pathId: h, version: 0n });
};
harden(synthQid);
