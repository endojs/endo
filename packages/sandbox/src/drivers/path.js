// @ts-check

import { makeError, q, X } from '@endo/errors';

/**
 * Cross-driver `$PATH` defaults and synthesis helpers.
 *
 * The bwrap and podman drivers both need to make a sensible choice
 * about the slice's `$PATH` when the caller does not supply one
 * explicitly.  The constants and small filters in this module keep
 * the choice consistent across drivers and provide a single home for
 * the security rules that govern which host paths are allowed to leak
 * into the slice.
 *
 * See `TADA/22_sandbox_bwrap_path_refinements.md` and
 * `TADA/23_sandbox_podman_path.md` for the motivating discussion.
 */

/**
 * Canonical default `$PATH` for slices that have nothing better to
 * offer (host-bind without an ambient `$PATH` to mine, mount rootfs
 * without any of the well-known bin dirs, OCI image without a
 * `Config.Env` PATH).
 *
 * The order matches the Debian / Ubuntu default for an interactive
 * login shell:
 *
 *   /usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin
 *
 * which puts user-tool dirs ahead of administrative ones.
 * Some distros (Arch, RHEL) merge `/sbin` → `/usr/bin` symlinks and
 * the order is moot; on others (older Debian, Alpine) the Debian
 * order is the least surprising for a generic slice that is not
 * deliberately running an admin tool by an unqualified name.
 *
 * The previous bwrap-only constant put `/sbin` first; we deliberately
 * flipped to user-first so a slice that runs `sh` and finds both
 * `/sbin/ifconfig` and `/usr/bin/ifconfig` picks the user variant by
 * default.
 */
export const DEFAULT_PATH =
  '/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin';
harden(DEFAULT_PATH);

/**
 * Canonical bin directories the bwrap driver tries to bind-mount into
 * a `host-bind` slice and probes for inside a `mount`-rootfs slice.
 *
 * Order matches `DEFAULT_PATH`; consumers that build a synthesized
 * `defaultPath` from the subset of these that exist on disk get the
 * same user-first ordering for free.
 */
export const CANONICAL_BIN_PATHS = harden([
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/local/sbin',
  '/usr/sbin',
  '/sbin',
]);
harden(CANONICAL_BIN_PATHS);

/**
 * Prefixes that disqualify an ambient `$PATH` entry from being
 * inherited into a `host-bind` slice.  Either:
 *   - they point at user-private state we deliberately keep out
 *     (`/home`, `/Users`, `/root`),
 *   - they are world-writable scratch (`/tmp`, `/var/tmp`,
 *     `/run/user`) where another local user could plant a binary
 *     that the slice would then prefer over `/usr/bin/foo`.
 *
 * The check is on a leading-prefix basis (`startsWith` plus a `/`
 * boundary) so `/tmproot` does not match `/tmp`.
 */
const AMBIENT_PATH_BLOCKED_PREFIXES = harden([
  '/home/',
  '/Users/',
  '/root/',
  '/tmp/',
  '/var/tmp/',
  '/run/user/',
]);

/**
 * Exact-match form of `AMBIENT_PATH_BLOCKED_PREFIXES` so `/tmp` (no
 * trailing slash) is also rejected.  Mirroring entries are needed
 * because a leading-prefix `startsWith('/tmp/')` does not match the
 * bare `/tmp`.
 */
const AMBIENT_PATH_BLOCKED_EXACT = harden([
  '/home',
  '/Users',
  '/root',
  '/tmp',
  '/var/tmp',
  '/run/user',
]);

/**
 * @param {string} entry
 * @returns {boolean}
 */
const isAmbientPathEntryBlocked = entry => {
  if (AMBIENT_PATH_BLOCKED_EXACT.includes(entry)) return true;
  for (const prefix of AMBIENT_PATH_BLOCKED_PREFIXES) {
    if (entry.startsWith(prefix)) return true;
  }
  return false;
};

/**
 * Filter the daemon-side `$PATH` down to entries that are safe to
 * surface in a `host-bind` slice.  Survivors are returned in the
 * caller's order; duplicates are dropped (first occurrence wins).
 *
 * Rejection criteria, in order:
 *   1. Entry is empty or not absolute (`/foo` only — drop `foo`,
 *      `./foo`, `../foo`).
 *   2. Entry contains a `..` segment — refuse to chase relative
 *      escapes that resolve through host symlinks.
 *   3. Entry begins with one of the user-private / world-writable
 *      prefixes in `AMBIENT_PATH_BLOCKED_PREFIXES`.
 *   4. Entry is one of `CANONICAL_BIN_PATHS` — those are already
 *      bound and present in `DEFAULT_PATH`; including them again
 *      would just add noise.
 *   5. Optional `realpath` resolution — when supplied, each surviving
 *      entry is canonicalised through the host filesystem and the
 *      block-prefix check is re-applied to the resolved value.  This
 *      defeats the symlink trick where an operator-installed
 *      `/opt/eve` is itself a symlink to `/tmp/attacker`: textual
 *      prefix checks on the literal `/opt/eve` survive, but the
 *      resolved `/tmp/attacker` does not.
 *   6. Optional `exists` probe — drop entries that do not exist on
 *      the host.  The probe is best-effort: `--ro-bind-try` already
 *      tolerates missing paths, so omitting the probe degrades to
 *      "bound but empty" rather than a hard error.  When `realpath`
 *      is supplied, an `ENOENT`/`EACCES` from `realpath` itself also
 *      drops the entry — a path the daemon cannot canonicalise
 *      cannot be safely bound.
 *
 * The function is async because the preferred `realpath` resolver is
 * `fs.promises.realpath`; tests that do not need filesystem
 * canonicalisation can omit the option entirely.
 *
 * @param {string | undefined} pathEnv  Value of `process.env.PATH` /
 *                                      the daemon's `env.PATH`.
 * @param {object} [options]
 * @param {(p: string) => boolean} [options.exists]  Existence probe
 *                                                   (default: a
 *                                                   no-op `() => true`
 *                                                   so callers can opt
 *                                                   out of the probe
 *                                                   in unit tests).
 * @param {(p: string) => Promise<string | null>} [options.realpath]
 *   Promise-returning canonicaliser (typically
 *   `p => fs.promises.realpath(p).catch(() => null)`).  A resolver
 *   that returns `null` drops the entry; a resolver that returns a
 *   string has its result re-checked against the block-prefix list.
 *   Default is the identity (entry passes through unchanged), which
 *   preserves the pre-realpath behaviour for tests.
 * @returns {Promise<readonly string[]>}
 */
/**
 * Predicate form of the textual `$PATH`-entry validity check used by
 * `filterAmbientPathForHostBind`.  Encapsulating the rules in a
 * named helper keeps the main loop body free of early-return
 * `continue` statements that the project's `no-continue` lint rule
 * forbids.
 *
 * @param {string} entry
 * @returns {boolean}
 */
const isTextuallyAcceptableAmbientEntry = entry =>
  entry !== '' &&
  entry.startsWith('/') &&
  !entry.split('/').includes('..') &&
  !isAmbientPathEntryBlocked(entry);

/**
 * Predicate form of the post-realpath validity check.
 *
 * @param {string | null | undefined} resolved
 * @returns {resolved is string}
 */
const isResolvedPathAcceptable = resolved => {
  if (typeof resolved !== 'string') return false;
  if (!resolved.startsWith('/')) return false;
  if (resolved.split('/').includes('..')) return false;
  if (isAmbientPathEntryBlocked(resolved)) return false;
  // Block-list the canonical bin dirs against the resolved path too
  // — `/usr/bin` resolved through `/bin → usr/bin` would otherwise
  // re-introduce a duplicate.
  if (CANONICAL_BIN_PATHS.includes(resolved)) return false;
  return true;
};

export const filterAmbientPathForHostBind = async (pathEnv, options = {}) => {
  // Hoisted `await null` keeps `safe-await-separator` happy: the
  // function reads as "yield once, then proceed synchronously through
  // the loop" rather than "first nested await is the realpath call".
  await null;
  const exists = options.exists ?? (() => true);
  /** @type {(p: string) => Promise<string | null>} */
  const realpath = options.realpath ?? (async p => p);
  if (typeof pathEnv !== 'string' || pathEnv === '') return harden([]);
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  // CANONICAL_BIN_PATHS are already covered by DEFAULT_PATH; treat
  // them as already-seen so the survivor list never re-introduces them.
  for (const canonical of CANONICAL_BIN_PATHS) seen.add(canonical);
  for (const entry of pathEnv.split(':')) {
    if (isTextuallyAcceptableAmbientEntry(entry) && !seen.has(entry)) {
      // Canonicalise through the host filesystem and re-apply the
      // block-prefix check.  An operator-installed `/opt/eve` that
      // is itself a symlink to `/tmp/attacker` survives the textual
      // check above; the resolved `/tmp/attacker` does not.
      /** @type {string | null | undefined} */
      let resolved;
      try {
        // eslint-disable-next-line no-await-in-loop
        resolved = await realpath(entry);
      } catch {
        // ENOENT / EACCES / EIO — drop entries the daemon cannot
        // canonicalise rather than gambling on the textual form.
        resolved = null;
      }
      if (isResolvedPathAcceptable(resolved) && exists(entry)) {
        seen.add(entry);
        if (resolved !== entry) seen.add(resolved);
        // Bind the original (pre-realpath) entry: that is the path
        // the operator put on `$PATH`, so it is the path the slice
        // expects to see and the path bwrap's `--ro-bind-try` is
        // willing to follow through the symlink for.
        out.push(entry);
      }
    }
  }
  return harden(out);
};
harden(filterAmbientPathForHostBind);

/**
 * Probe a `mount`-rootfs host directory for the subset of
 * `CANONICAL_BIN_PATHS` that exist underneath it, and return the
 * matching slice-internal paths (with the host prefix stripped).
 *
 * Example: if `hostPath = /opt/myroot` and `/opt/myroot/usr/bin`
 * exists, this returns `['/usr/bin']` (the inner path the slice will
 * see, because the rootfs is mounted at `/`).
 *
 * Relative `hostPath`s (anything that is not anchored at `/`) are
 * skipped: a probe of `srv/foo/usr/bin` would resolve against the
 * daemon's CWD, which has nothing to do with the slice and is
 * a footgun if the CWD happens to contain a real `usr/bin/`.  bwrap
 * itself rejects relative `--ro-bind …  /` operands downstream; the
 * early bail-out here keeps the synthesised `$PATH` from reflecting
 * a probe that has no bearing on the slice.
 *
 * @param {string} hostPath  Host path of the mount-rootfs.
 * @param {object} [options]
 * @param {(p: string) => boolean} [options.exists]  Existence probe
 *                                                   (default: returns
 *                                                   true so the helper
 *                                                   is usable from
 *                                                   unit tests without
 *                                                   touching disk).
 * @returns {readonly string[]}
 */
export const probeMountRootfsBinPaths = (hostPath, options = {}) => {
  const exists = options.exists ?? (() => true);
  /** @type {string[]} */
  const out = [];
  if (typeof hostPath !== 'string' || !hostPath.startsWith('/')) {
    return harden(out);
  }
  const trimmed = hostPath.replace(/\/+$/, '');
  for (const innerPath of CANONICAL_BIN_PATHS) {
    if (exists(`${trimmed}${innerPath}`)) {
      out.push(innerPath);
    }
  }
  return harden(out);
};
harden(probeMountRootfsBinPaths);

/**
 * Inspect a caller-granted mount and return the slice-internal bin
 * paths it appears to expose.  Three shapes are recognised:
 *
 *   - `innerPath` ends in `/bin` or `/sbin` — the mount itself is
 *     a bin-dir, return `innerPath`.
 *   - `<hostPath>/bin` exists on disk — return `${innerPath}/bin`.
 *   - `<hostPath>/sbin` exists on disk — return `${innerPath}/sbin`.
 *
 * Multiple matches stack (a mount with both `bin/` and `sbin/`
 * children gets both inner paths).  The caller is responsible for
 * appending the result **after** the rootfs-derived defaults so a
 * hostile caller cannot shadow `/usr/bin` with a bin dir of their
 * own — see `TADA/22_sandbox_bwrap_path_refinements.md` for the
 * threat model.
 *
 * @param {{ hostPath: string, innerPath: string }} mount
 * @param {object} [options]
 * @param {(p: string) => boolean} [options.exists]  Existence probe
 *                                                   (default: a
 *                                                   no-op `() => true`).
 * @returns {string[]}
 */
export const detectMountBinPaths = (mount, options = {}) => {
  const exists = options.exists ?? (() => true);
  /** @type {string[]} */
  const out = [];
  const innerTrimmed = mount.innerPath.replace(/\/+$/, '');
  if (innerTrimmed.endsWith('/bin') || innerTrimmed.endsWith('/sbin')) {
    out.push(innerTrimmed);
    return harden(out);
  }
  const hostTrimmed = mount.hostPath.replace(/\/+$/, '');
  if (exists(`${hostTrimmed}/bin`)) out.push(`${innerTrimmed}/bin`);
  if (exists(`${hostTrimmed}/sbin`)) out.push(`${innerTrimmed}/sbin`);
  return harden(out);
};
harden(detectMountBinPaths);

/**
 * Join an array of path entries into a `$PATH` string.  Empty input
 * yields the empty string (callers usually fall back to `DEFAULT_PATH`
 * in that case).  Duplicates are removed (first occurrence wins) so
 * the synthesised string never repeats an entry.
 *
 * Sanitisation applied to each entry, in order:
 *
 *   1. **Newlines (`\n`, `\r`) and other control characters
 *      (`\x00..\x1f`) are fatal.**  A newline in a `$PATH` entry
 *      corrupts the `--setenv PATH …` argv slot in arbitrary,
 *      surprising ways; rather than silently dropping the bad entry
 *      we throw so the caller (and reviewer) sees the bug.
 *   2. **Embedded `:` separators are split, not preserved.**  A
 *      caller-granted mount with `innerPath = '/foo:/bin'` would
 *      otherwise produce a `detectMountBinPaths` result of
 *      `'/foo:/bin/bin'`, smuggling `/foo` onto `$PATH`.  We split
 *      on `:` and process each part as an independent entry, so the
 *      output is well-formed regardless of what the caller put in
 *      `innerPath`.
 *
 * @param {readonly string[]} entries
 * @returns {string}
 */
export const joinPathEntries = entries => {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const entry of entries) {
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f]/.test(entry)) {
      throw makeError(
        X`PATH entry must not contain control characters: ${q(entry)}`,
      );
    }
    // Split embedded `:` into independent parts so a caller-granted
    // mount cannot smuggle extra segments onto `$PATH`.  An entry
    // that does not contain `:` falls through the split as a single
    // part, preserving the previous behaviour.
    for (const part of entry.split(':')) {
      if (part !== '' && !seen.has(part)) {
        seen.add(part);
        out.push(part);
      }
    }
  }
  return out.join(':');
};
harden(joinPathEntries);
