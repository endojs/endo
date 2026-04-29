// @ts-check

/**
 * Resource-cap helpers for the bwrap driver.
 *
 * Phase 1.5 introduces three knobs:
 *
 *   1. `prlimit` wrappers that prepend rlimit settings to the slice's
 *      argv before bwrap execs.  Rlimits set on the bwrap process are
 *      inherited into the slice (rlimits survive `execve` and bwrap's
 *      namespace setup does not reset them).
 *   2. cgroup v2 detection so callers can tell, at probe time,
 *      whether `pids.max` / `memory.max` / `cpu.max` are usable
 *      from the daemon's process group.
 *   3. A canonical defaults table the factory applies when the
 *      caller does not pass `limits`.
 *
 * The actual cgroup-write / classid plumbing is left for
 * a follow-up patch that lands alongside the genie workspace
 * integration; this module focuses on detection and
 * argv-assembly so the rest of the driver can rely on it.
 *
 * The defaults are deliberately generous — the goal is to prevent
 * runaway DoS shapes (fork bombs, OOM, fd exhaustion), not to gate
 * legitimate workloads.  Callers that need tighter limits should
 * pass `SandboxMakeOpts.limits = { ... }`.
 */

/**
 * @typedef {object} ResourceLimits
 * @property {number} [as]      RLIMIT_AS — virtual memory bytes.
 * @property {number} [cpu]     RLIMIT_CPU — wallclock seconds.
 * @property {number} [nproc]   RLIMIT_NPROC — max processes per uid.
 * @property {number} [nofile]  RLIMIT_NOFILE — open file descriptors.
 * @property {number} [fsize]   RLIMIT_FSIZE — bytes any single file
 *                              the slice writes can grow to.
 * @property {number} [core]    RLIMIT_CORE — core dump size cap
 *                              (defaults to 0 to disable cores).
 */

/**
 * Defaults applied when the caller does not pass `limits`.
 *
 *  - `as`     — 4 GiB virtual memory.  Big enough for nodejs / a JVM,
 *               small enough to catch a runaway leak.
 *  - `cpu`    — undefined.  Wallclock CPU caps are too easy to trip
 *               on legitimate slow workloads; surface as opt-in.
 *  - `nproc`  — 512 processes.  Stops a `:(){ :|:& };:` fork bomb
 *               cold while still permitting normal multi-threaded
 *               work.
 *  - `nofile` — 4096 fds.  Above the typical default of 1024 (so
 *               `node`'s libuv pool is happy) and below host limits
 *               that would matter to a multi-tenant daemon.
 *  - `fsize`  — undefined.  Hard to pick a generic ceiling; let
 *               callers set it when their workload needs it.
 *  - `core`   — 0.  Disable core dumps — they spill scratch state
 *               outside the slice's mount.
 *
 * @type {Readonly<Required<Pick<ResourceLimits, 'as' | 'nproc' | 'nofile' | 'core'>>>}
 */
export const DEFAULT_LIMITS = harden({
  as: 4 * 1024 * 1024 * 1024,
  nproc: 512,
  nofile: 4096,
  core: 0,
});

/**
 * Return the merged limits dictionary the driver will apply.  Caller
 * overrides win over defaults; `undefined` keys keep the default.
 *
 * @param {ResourceLimits} [overrides]
 * @returns {ResourceLimits}
 */
export const resolveLimits = (overrides = {}) => {
  /** @type {ResourceLimits} */
  const merged = { ...DEFAULT_LIMITS };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      /** @type {any} */ (merged)[k] = v;
    }
  }
  return harden(merged);
};
harden(resolveLimits);

/**
 * Map of `ResourceLimits` keys to the matching `prlimit` long flag.
 * Driver call sites use this to translate the dictionary into argv.
 *
 * @type {Readonly<Record<keyof ResourceLimits, string>>}
 */
export const PRLIMIT_FLAGS = harden({
  as: '--as',
  cpu: '--cpu',
  nproc: '--nproc',
  nofile: '--nofile',
  fsize: '--fsize',
  core: '--core',
});

/**
 * Translate a resolved `ResourceLimits` dictionary into a `prlimit`
 * argv prefix (without the trailing `--` separator or COMMAND).
 * Returns an empty array when no limits are configured.
 *
 * Example: `assemblePrlimitArgv({ as: 4_000_000_000, nproc: 512 })`
 * → `['prlimit', '--as=4000000000', '--nproc=512']`.
 *
 * @param {ResourceLimits} limits
 * @returns {string[]}
 */
export const assemblePrlimitArgv = limits => {
  /** @type {string[]} */
  const argv = [];
  for (const [key, flag] of Object.entries(PRLIMIT_FLAGS)) {
    const value = /** @type {any} */ (limits)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      argv.push(`${flag}=${value}`);
    }
  }
  if (argv.length === 0) return harden([]);
  return harden(['prlimit', ...argv]);
};
harden(assemblePrlimitArgv);

/**
 * Outcome of probing the host for cgroup v2 support.
 *
 * @typedef {object} Cgroup2Probe
 * @property {boolean} available  Whether the daemon's process is in
 *                                a cgroup v2 hierarchy whose subtree
 *                                exposes the controllers we need.
 * @property {string[]} controllers  Active controllers reported by
 *                                `cgroup.controllers`.
 * @property {string} [reason]    Human-readable explanation when
 *                                `available` is false.
 */

const REQUIRED_CONTROLLERS = harden(['pids', 'memory', 'cpu']);

/**
 * Probe cgroup v2 availability + delegation status.  Looks at
 * `/proc/self/cgroup` to find the daemon's cgroup path then reads
 * `cgroup.controllers` from that path.  When all the controllers in
 * `REQUIRED_CONTROLLERS` are present, returns `available: true`.
 *
 * @typedef {object} FSReader
 * @property {(path: string, encoding: string) => Promise<string> } readFile
 *
 * @param {object} [opts]
 * @param {FSReader} [opts.fs]
 * @returns {{ probe: () => Promise<Cgroup2Probe> }}
 */
export const makeCgroup2Probe = ({ fs: fsOverride } = {}) => {
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

  /** @returns {Promise<Cgroup2Probe>} */
  const probe = async () => {
    await null;
    let fs;
    try {
      fs = await ensureFs();
    } catch (e) {
      return harden({
        available: false,
        controllers: harden([]),
        reason: `cannot import fs: ${/** @type {Error} */ (e).message}`,
      });
    }
    let cgroupLine;
    try {
      cgroupLine = await fs.readFile('/proc/self/cgroup', 'utf8');
    } catch (e) {
      return harden({
        available: false,
        controllers: harden([]),
        reason: `cannot read /proc/self/cgroup: ${/** @type {Error} */ (e).message}`,
      });
    }
    // Format: lines like `0::/user.slice/...`. v2 has a single
    // unified hierarchy keyed on `0::`.  Anything else means cgroup
    // v1 or hybrid — controller availability is then unreliable.
    /** @type {string | undefined} */
    let v2Path;
    for (const rawLine of cgroupLine.split('\n')) {
      const line = rawLine.trim();
      // eslint-disable-next-line no-continue
      if (line === '') continue;
      const [hierId, controllers, path] = line.split(':');
      if (hierId === '0' && controllers === '') {
        v2Path = path;
        break;
      }
    }
    if (v2Path === undefined) {
      return harden({
        available: false,
        controllers: harden([]),
        reason: 'no cgroup v2 entry in /proc/self/cgroup',
      });
    }
    let controllersText;
    try {
      controllersText = await fs.readFile(
        `/sys/fs/cgroup${v2Path}/cgroup.controllers`,
        'utf8',
      );
    } catch (e) {
      return harden({
        available: false,
        controllers: harden([]),
        reason: `cannot read cgroup.controllers at ${v2Path}: ${/** @type {Error} */ (e).message}`,
      });
    }
    const controllers = controllersText
      .trim()
      .split(/\s+/)
      .filter(s => s !== '');
    const missing = REQUIRED_CONTROLLERS.filter(c => !controllers.includes(c));
    if (missing.length > 0) {
      return harden({
        available: false,
        controllers: harden(controllers),
        reason: `missing controllers (need ${missing.join(', ')}); systemd Delegate= may be unset`,
      });
    }
    return harden({ available: true, controllers: harden(controllers) });
  };

  return harden({ probe });
};
harden(makeCgroup2Probe);
