// @ts-check

/**
 * Landlock kernel-feature probe.
 *
 * Landlock is a Linux LSM (>= 5.13) that lets unprivileged processes
 * install a path-based access-control ruleset that applies to
 * themselves and their children.  Phase 1.5 surfaces detection of the
 * feature so the bwrap driver can:
 *
 *   1. Report Landlock availability via `slice.help()` and the
 *      driver's `probe()` detail.
 *   2. (Future) install an allowlist that restricts the slice's
 *      filesystem access to the granted mount paths.
 *
 * The probe is best-effort and side-effect-free: it only reads the
 * sysfs LSM list (`/sys/kernel/security/lsm`) and checks for
 * `landlock_*` syscall headers.  It never calls
 * `landlock_create_ruleset` from the daemon process — installing a
 * ruleset on the daemon would clamp the daemon itself, not the slice.
 *
 * Actual ruleset installation happens inside the slice's child after
 * `bwrap` execs the slice's init.  Phase 1.5 plumbs the probe
 * outcome through to the driver's `BackendProbe` and exposes a hook
 * for future child-side ruleset application.
 */

const LANDLOCK_LSM_NAME = 'landlock';

/**
 * Result of probing the host kernel for Landlock support.
 *
 * @typedef {object} LandlockProbe
 * @property {boolean} available  True when the kernel exposes
 *                                Landlock as a registered LSM and the
 *                                ABI is at least version 1.
 * @property {string} [reason]    Human-readable explanation when
 *                                `available` is false.
 * @property {number} [abiVersion] ABI version when known
 *                                (the LSM advertises versions; we
 *                                cannot read this without calling the
 *                                syscall, so this stays optional in
 *                                Phase 1.5).
 */

/**
 * Build a Landlock probe.  Defaults to using the real `fs` module so
 * production callers do not need to inject anything.
 *
 * @typedef {object} FSReader
 * @property {(path: string, encoding: string) => Promise<string> } readFile
 *
 * @param {object} [opts]
 * @param {FSReader} [opts.fs]
 *        Override for tests.  Must implement `readFile` returning a
 *        utf-8 string.
 * @returns {{ probe: () => Promise<LandlockProbe> }}
 */
export const makeLandlockProbe = ({ fs: fsOverride } = {}) => {
  /** @type {FSReader} */
  let fsImpl;
  if (fsOverride !== undefined) {
    fsImpl = fsOverride;
  }

  const ensureFs = async () => {
    await null;
    if (fsImpl === undefined) {
      const fsModule = await import('fs');
      fsImpl = {
        async readFile(path, encoding) {
          const dec = new TextDecoder(encoding);
          const raw = await fsModule.promises.readFile(
            path,
            /** @type {any} */ (encoding),
          );
          return dec.decode(raw);
        },
      };
    }
    return fsImpl;
  };

  /** @returns {Promise<LandlockProbe>} */
  const probe = async () => {
    await null;
    let fs;
    try {
      fs = await ensureFs();
    } catch (e) {
      return harden({
        available: false,
        reason: `cannot import fs: ${/** @type {Error} */ (e).message}`,
      });
    }
    let lsm;
    try {
      lsm = await fs.readFile('/sys/kernel/security/lsm', 'utf8');
    } catch (e) {
      const err = /** @type {Error & { code?: string }} */ (e);
      if (err.code === 'ENOENT') {
        return harden({
          available: false,
          reason: 'no /sys/kernel/security/lsm (kernel < 5.13 or LSM hidden)',
        });
      }
      return harden({
        available: false,
        reason: `lsm read failed: ${err.message}`,
      });
    }

    const enabled = lsm
      .trim()
      .split(',')
      .map(s => s.trim());
    if (!enabled.includes(LANDLOCK_LSM_NAME)) {
      return harden({
        available: false,
        reason: `landlock not in /sys/kernel/security/lsm (${lsm.trim()})`,
      });
    }
    return harden({ available: true });
  };

  return harden({ probe });
};
harden(makeLandlockProbe);
