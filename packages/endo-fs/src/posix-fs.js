// @ts-check
/**
 * `PosixFs` — POSIX-shaped extensions over a base endo-fs `Filesystem`.
 *
 * The seam refactor (designs/endo-fs-backend-seam.md) pulls
 * POSIX-specific attrs (`mode`, `uid`, `gid`, `ctime`, `btime`,
 * `nlink`, real inode identity), native disk xattrs, and OS-level
 * locks (`fcntl(F_SETLK)`, `flock(2)`, `LockFileEx`) out of base
 * endo-fs and into this companion cap. Consumers that need POSIX
 * semantics — 9P2000.L bridges, hosts that surface real file metadata
 * — compose `Filesystem` + `PosixFs` and call into the right cap for
 * each piece.
 *
 * This module is a scaffold: it sketches the surface and provides a
 * synthesizing implementation over a base Filesystem (mode defaults
 * to 0o644 / 0o755, uid/gid to 0, inode identity from a path hash).
 * Backends with real POSIX support (a future `makeNodeFsPosixBackend`)
 * can replace the synth with real `stat()` reads.
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X, q } from '@endo/errors';

const Pass = M.any();

/**
 * Interface guard for `PosixFs`.
 */
export const PosixFsInterface = M.interface(
  'PosixFs',
  {
    /**
     * Read full POSIX attrs for a node identified by its Filesystem
     * cap (a File or Directory exo). Returns `{ size, mtime, atime,
     * ctime, btime, mode, uid, gid, nlink, pathId, version }`.
     */
    attrs: M.call(M.remotable('Node')).returns(M.promise()),
    /**
     * Update POSIX-specific attrs. Accepts `{ mode?, uid?, gid? }`
     * (mtime/atime/size go through `Filesystem.setStat`).
     */
    setAttrs: M.call(M.remotable('Node'), Pass).returns(M.promise()),
    help: M.call().optional(M.string()).returns(M.string()),
  },
  { sloppy: true },
);
harden(PosixFsInterface);

/**
 * Build a synthesizing `PosixFs` over a base `Filesystem`. The
 * synth fills in POSIX-only fields from defaults; real per-backing
 * implementations can replace this when a host needs disk-truthful
 * metadata.
 *
 * @param {object} _fs  base Filesystem cap (currently unused; the
 *                      synth doesn't need it because all metadata
 *                      comes from defaults)
 * @returns {object}
 */
export const synthesizePosixFs = _fs => {
  const DEFAULT_FILE_MODE = 0o644;
  const DEFAULT_DIR_MODE = 0o755;

  return makeExo('PosixFs', PosixFsInterface, {
    async attrs(node) {
      // Read narrow stat from base Filesystem.
      const stat = await E(node).getStat();
      const qid = await E(node).getQid();
      const kind = qid.type;
      return harden({
        size: stat.size ?? 0n,
        mtime: stat.mtime ?? 0n,
        atime: stat.atime ?? 0n,
        ctime: stat.mtime ?? 0n,
        btime: stat.mtime ?? null,
        mode: kind === 'directory' ? DEFAULT_DIR_MODE : DEFAULT_FILE_MODE,
        uid: 0,
        gid: 0,
        nlink: 1,
        pathId: qid.pathId,
        version: qid.version,
      });
    },
    async setAttrs(_node, patch) {
      // mode/uid/gid are synthesized constants in this implementation
      // — accept the call so consumers can avoid feature-detecting,
      // but throw if they try to set anything other than ignorable
      // defaults.
      if (
        patch &&
        typeof patch === 'object' &&
        (patch.mode !== undefined ||
          patch.uid !== undefined ||
          patch.gid !== undefined)
      ) {
        throw makeError(
          X`ENOSYS: synthesizing PosixFs does not persist ${q(
            'mode/uid/gid',
          )}; provide a backing-specific PosixFs for real persistence`,
        );
      }
    },
    help(method) {
      if (method === undefined) {
        return 'PosixFs (synth): POSIX-shaped attrs over a base Filesystem. mode/uid/gid synthesized from defaults; mtime/atime read from base.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(synthesizePosixFs);
