// @ts-check
/**
 * `PosixFs` — POSIX-shaped extensions over a base endo-fs `Filesystem`.
 *
 * **Sketch only.** This module records the interface shape — what
 * a future PosixFs cap will look like — so the rest of the seam
 * refactor has something to reference. There is intentionally **no
 * synthesizing implementation** exported from here. A "PosixFs"
 * cap that defaults `mode` to `0o644`, `uid`/`gid` to `0`, and
 * rejects `setAttrs` of the only fields that distinguish PosixFs
 * from base would actively mislead consumers ("I am a PosixFs cap"
 * is a security-relevant signal — defaults are unsafe).
 *
 * The plan, when the real PosixFs lands:
 * - A backing-specific factory (`makeNodeFsPosixCap(fs, backend)`,
 *   `makeMountPosixCap(...)`) that reads / writes the disk's real
 *   mode/uid/gid via the backing's host primitives.
 * - The interface guard here defines the wire surface those impls
 *   must satisfy.
 *
 * The 9P bridge (F14/F15) is the prime consumer: 9P2000.L's
 * `Tgetattr` / `Tsetattr` / `Txattrwalk` map to PosixFs methods.
 *
 * @see designs/endo-fs-backend-seam.md "Phase 6 — PosixFs extension"
 */

import { M } from '@endo/patterns';

const Pass = M.any();

/**
 * Interface guard for `PosixFs`. Implementations are backing-specific
 * and live outside this module.
 *
 * Methods:
 * - `attrs(node)` → `{ size, mtime, atime, ctime, btime, mode, uid,
 *    gid, nlink, pathId, version }`
 * - `setAttrs(node, patch)` — accepts `mode`, `uid`, `gid`.
 *   `mtime`/`atime`/`size` go through `Filesystem.setStat` on the
 *   underlying base cap, not here.
 * - `xattrs(node)` → a real disk-backed `Xattrs` cap (the base
 *    Filesystem ships a vat-local sidecar; PosixFs persists).
 * - `flock(node, opts)` → real OS lock via `fcntl(F_SETLK)` etc.
 *   (the base `OpenFile.lock` is vat-local advisory only).
 */
export const PosixFsInterface = M.interface('PosixFs', {
  attrs: M.call(M.remotable('Node')).returns(M.promise()),
  setAttrs: M.call(M.remotable('Node'), Pass).returns(M.promise()),
  xattrs: M.call(M.remotable('Node')).returns(M.eref(M.remotable('Xattrs'))),
  flock: M.call(M.remotable('Node'), Pass).returns(M.eref(M.remotable('Lock'))),
  help: M.call().optional(M.string()).returns(M.string()),
});
harden(PosixFsInterface);
