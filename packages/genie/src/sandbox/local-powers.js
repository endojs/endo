// @ts-check

/**
 * Local, in-process implementation of `SandboxPowers` for callers that
 * do not have an Endo daemon.
 *
 * The `@endo/sandbox` factory's `scratchProvider` argument is shaped as
 * `SandboxPowers` (see `packages/sandbox/src/types.d.ts`):
 *
 * ```ts
 * type SandboxPowers = ERef<{
 *   provideScratchMount(petName: string): Promise<MountCap>;
 *   provideHostPath(cap: MountCap): Promise<string>;
 * }>;
 * ```
 *
 * Inside the daemon, `EndoHost` provides this via the daemon's mount
 * machinery — see `packages/daemon/src/host.js`'s `provideHostPath`
 * for the daemon-side counterpart, which consults the daemon's
 * mount-formula registry and rejects strangers with `not a
 * daemon-minted mount`.  This file is the dev-repl-shaped analogue:
 * a `WeakMap<cap, hostPath>`-backed implementation that rejects
 * strangers with `not a local-minted mount`, mirroring the daemon's
 * error wording so a misrouted cap looks the same on both paths.
 *
 * Outside the daemon — the dev-repl, scripted harnesses, unit tests
 * outside `packages/sandbox` — callers either build a stub (every test
 * in `packages/sandbox/test/*.test.js` does this) or go without slice
 * support entirely.  This module provides the former, shared,
 * in-process implementation so a single `makeLocalSandboxPowers` call
 * hands you a `SandboxPowers`-shaped exo plus a helper to mint a
 * Mount cap from any operator-supplied host path.
 *
 * The exposed Mount methods match the daemon's `MountInterface` as far
 * as the genie's downstream consumers drive it.  Three callers matter:
 *
 *   1. `spawnAgent`'s Mount-cap validation (`packages/genie/main.js`),
 *      which only checks `__getMethodNames__()` against the subset
 *      `['readText', 'writeText', 'makeDirectory', 'has', 'list']`.
 *   2. `initWorkspaceMount` (`packages/genie/src/workspace/init.js`),
 *      which drives `has` / `readText` / `writeText` / `makeDirectory`
 *      for the template-seed flow.
 *   3. The `files` tool group's Mount-backed VFS adapter
 *      (`packages/genie/src/tools/vfs-mount.js`), which drives `has`,
 *      `list`, `lookup`, `readText`, `writeText`, `remove`, and
 *      `makeDirectory`.  `lookup` returns either a sub-Mount-shaped exo
 *      (for directories) or a `MountFile`-shaped exo with a `text()`
 *      method (for files); the adapter uses both shapes to discriminate
 *      file vs. directory before listing / removing.
 *
 * The third caller is the one that drove the surface here from "just
 * what the factory needs" up to the full daemon-side method set.  An
 * earlier rev exposed only the first-caller subset; that left the
 * dev-repl's `listDirectory` / `unlink` / `rmdir` tools failing with
 * "target has no method \"lookup\"" because they were silently driving
 * the third caller through the same cap.  See
 * `TODO/57_genie_dev_repl_sandbox_test_fails.md` for the regression.
 *
 * The factory itself never calls these methods on the cap — it only
 * passes the cap through `provideHostPath` to recover the host path
 * — but it does forward the cap to other callers that do.  See
 * `TODO/51_genie_dev_repl_local_sandbox_powers.md`.
 *
 * Out of scope (deliberately a thinner abstraction than the daemon's):
 *   - Honouring Endo `provideMount`'s confinement-root semantics
 *     beyond a textual `..` check.  The dev-repl owns its workspace
 *     and trusts the operator-supplied path.
 *   - Persisting / reusing tmpdirs across runs.  Each `makeLocalSandboxPowers`
 *     call mints fresh scratch on demand and disposes on caller exit.
 */

import { promises as fs, mkdtempSync } from 'fs';
import { join, isAbsolute, sep } from 'path';
import { tmpdir } from 'os';

import { makeError, q, X } from '@endo/errors';
import { makeExo } from '@endo/exo';
import harden from '@endo/harden';
import { M } from '@endo/patterns';

/** @import { MountCap, SandboxPowers } from '@endo/sandbox/types.js' */

/**
 * Subset of the daemon's `MountInterface` exposed by the local
 * Mount-cap exo.  Restricted to what `spawnAgent`'s pet-name
 * validation and `initWorkspaceMount` actually drive — the factory
 * itself only stuffs the cap through a `WeakMap` and never calls any
 * of these methods.
 */
const PathSegmentsShape = M.arrayOf(M.string());
const PathArgShape = M.or(M.string(), PathSegmentsShape);

const LocalMountInterface = M.interface('LocalMount', {
  help: M.call().returns(M.string()),
  has: M.call().rest(PathSegmentsShape).returns(M.promise()),
  list: M.call().rest(PathSegmentsShape).returns(M.promise()),
  lookup: M.call(PathArgShape).returns(M.promise()),
  readText: M.call(PathArgShape).returns(M.promise()),
  maybeReadText: M.call(PathArgShape).returns(M.promise()),
  writeText: M.call(PathArgShape, M.string()).returns(M.promise()),
  makeDirectory: M.call(PathArgShape).returns(M.promise()),
  remove: M.call(PathArgShape).returns(M.promise()),
  move: M.call(PathArgShape, PathArgShape).returns(M.promise()),
});

const LocalMountFileInterface = M.interface('LocalMountFile', {
  help: M.call().returns(M.string()),
  text: M.call().returns(M.promise()),
});

const LocalSandboxPowersInterface = M.interface('LocalSandboxPowers', {
  provideScratchMount: M.call(M.string()).returns(M.promise()),
  provideHostPath: M.call(M.any()).returns(M.promise()),
});

/**
 * Coerce a `string | string[]` path argument into a flat array of
 * non-empty segments.  Mirrors the daemon's permissive shape.
 *
 * @param {string | string[]} pathArg
 * @returns {string[]}
 */
const segmentsOf = pathArg => {
  if (Array.isArray(pathArg)) return [...pathArg];
  return [pathArg];
};
harden(segmentsOf);

/**
 * Reject path segments that would escape the mount root.  The local
 * powers do not pretend to be a confined filesystem — they only veto
 * the obvious textual escape so a typo does not silently address an
 * unrelated host directory.
 *
 * In addition to `..` and `\0`, segments that begin with a path
 * separator (`/` on POSIX, `\\` for Windows) are vetoed as defense in
 * depth.  POSIX `path.join` happens to neutralise `/etc/passwd`
 * today, but any future swap to `path.resolve` or `path.win32`
 * semantics would promote the segment to an absolute path and quietly
 * widen the surface.  See
 * `TODO/61_genie_local_powers_symlink_realpath.md` saboteur finding
 * 4.
 *
 * @param {string[]} segments
 */
const assertNoEscape = segments => {
  for (const segment of segments) {
    if (typeof segment !== 'string') {
      throw makeError(
        X`local Mount: path segment must be a string, got ${q(typeof segment)}`,
      );
    }
    if (segment === '..' || segment.includes('\0')) {
      throw makeError(
        X`local Mount: path segment ${q(segment)} is not allowed`,
      );
    }
    if (segment.startsWith('/') || segment.startsWith('\\')) {
      throw makeError(
        X`local Mount: path segment ${q(segment)} must not be absolute`,
      );
    }
  }
};
harden(assertNoEscape);

/**
 * Build a Mount-shaped exo rooted at `hostPath`.  The cap and its
 * `hostPath` are wired into `capToHostPath` so the same powers'
 * `provideHostPath` can resolve it.  Top-level caps (those minted by
 * `provideScratchMount` or `makeMountCapForPath`) are also registered
 * in `topLevelCaps` so that `provideHostPath` can distinguish them
 * from sub-Mount views returned by `lookup` — only top-level caps
 * may be bound into a slice, mirroring the daemon's
 * `EndoHost.provideHostPath` which rejects subdirectory views minted
 * by `Mount.lookup()` (see `packages/daemon/src/host.js:290-297`).
 *
 * @param {string} hostPath - Absolute host path the mount represents.
 * @param {WeakMap<object, string>} capToHostPath
 * @param {WeakSet<object>} topLevelCaps
 * @param {{ topLevel: boolean }} options
 * @returns {object}
 */
const makeLocalMountCap = (hostPath, capToHostPath, topLevelCaps, options) => {
  if (!isAbsolute(hostPath)) {
    throw makeError(
      X`local Mount: hostPath must be absolute, got ${q(hostPath)}`,
    );
  }

  /**
   * Cached realpath of `hostPath`, resolved lazily on first use.  We
   * realpath the root once so the per-`lookup` symlink-escape check
   * is robust against a mount whose own `hostPath` is reached through
   * a symlink (e.g. macOS where `/tmp` is a symlink to `/private/tmp`
   * and `mkdtempSync('/tmp/foo')` returns a `/tmp/...` path that
   * realpaths to `/private/tmp/...`).  Without normalising the root,
   * legitimate sub-paths would falsely trip the escape check.
   *
   * @type {string | undefined}
   */
  let cachedRealHostPath;
  const realHostPath = async () => {
    await null;
    if (cachedRealHostPath !== undefined) return cachedRealHostPath;
    cachedRealHostPath = await fs.realpath(hostPath);
    return cachedRealHostPath;
  };

  /** @param {string[]} segments */
  const resolve = segments => {
    assertNoEscape(segments);
    return segments.length === 0 ? hostPath : join(hostPath, ...segments);
  };

  /**
   * Build a `MountFile`-shaped exo for a file lookup result.  The
   * adapter in `vfs-mount.js` discriminates file vs. directory via
   * `__getMethodNames__()`; presence of `text` says "file".  The
   * surface is intentionally minimal — only what `vfs-mount.js` and
   * `initWorkspaceMount` drive.
   *
   * @param {string} filePath
   */
  const makeLocalMountFile = filePath =>
    makeExo('LocalMountFile', LocalMountFileInterface, {
      help() {
        return `local MountFile @ ${filePath}`;
      },
      async text() {
        await null;
        return fs.readFile(filePath, 'utf8');
      },
    });

  const cap = makeExo('LocalMount', LocalMountInterface, {
    help() {
      return `local Mount @ ${hostPath}`;
    },

    /** @param {string[]} segments */
    async has(...segments) {
      await null;
      const target = resolve(segments);
      try {
        await fs.access(target);
        return true;
      } catch {
        return false;
      }
    },

    /** @param {string[]} segments */
    async list(...segments) {
      const target = resolve(segments);
      const entries = await fs.readdir(target);
      return harden(entries.sort());
    },

    /**
     * Mirror the daemon's `Mount.lookup` shape: return a sub-Mount cap
     * for directories (the genie tools only feature-test it, so any
     * Mount-shaped exo will do — we rebuild it rooted at the child path
     * so subsequent `list` / `readText` calls go through a fresh cap
     * with its own `hostPath` confinement check) and a
     * `MountFile`-shaped exo for files.  Throws ENOENT for missing
     * entries so the VFS adapter (`vfs-mount.js`) can wrap the error
     * in its usual "Path not found" wording.
     *
     * The returned sub-Mount is recorded in `capToHostPath` so a future
     * caller can resolve it back to the host path; sub-Mounts are
     * **not** registered in `topLevelCaps`, so `provideHostPath`
     * rejects them — mirroring
     * `packages/daemon/src/host.js:290-297`, which refuses
     * subdirectory views minted by `Mount.lookup()`.
     *
     * Before returning a sub-Mount, the resolved target is realpath'd
     * and compared against the canonical mount root so a symlink
     * inside the workspace cannot escape upward into an unrelated
     * directory.  The daemon's counterpart calls `assertConfined`
     * (`packages/daemon/src/mount.js:217-233`) for the same reason.
     * See `TODO/61` saboteur finding 1.
     *
     * @param {string | string[]} pathArg
     */
    async lookup(pathArg) {
      const segments = segmentsOf(pathArg);
      const target = resolve(segments);
      /** @type {import('fs').Stats} */
      let info;
      try {
        info = await fs.stat(target);
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          throw makeError(X`local Mount.lookup: ${q(target)} does not exist`);
        }
        throw err;
      }
      // Symlink-escape check: realpath the target and verify it stays
      // under the canonical mount root.  `fs.stat` above follows
      // symlinks, so `info.isDirectory()` is true even when `target`
      // is `${hostPath}/escape -> /etc`; without this check, the
      // resulting sub-Mount would happily list `/etc`'s contents.
      const realTarget = await fs.realpath(target);
      const realRoot = await realHostPath();
      const rootWithSep = realRoot.endsWith(sep)
        ? realRoot
        : `${realRoot}${sep}`;
      if (realTarget !== realRoot && !realTarget.startsWith(rootWithSep)) {
        throw makeError(
          X`local Mount.lookup: ${q(target)} escapes mount root ${q(realRoot)}`,
        );
      }
      if (info.isDirectory()) {
        // Mint the sub-Mount rooted at the realpath rather than the
        // possibly-symlinked target so subsequent operations on the
        // sub-Mount do not need to re-resolve and so the
        // `capToHostPath` entry records the canonical path.
        return makeLocalMountCap(realTarget, capToHostPath, topLevelCaps, {
          topLevel: false,
        });
      }
      return makeLocalMountFile(realTarget);
    },

    /** @param {string | string[]} pathArg */
    async readText(pathArg) {
      const target = resolve(segmentsOf(pathArg));
      return fs.readFile(target, 'utf8');
    },

    /**
     * Best-effort read that returns `undefined` on miss rather than
     * throwing, mirroring `EndoMountInterface.maybeReadText`.  The
     * genie tools do not drive this yet but adding it now keeps the
     * surface matched to the daemon-side counterpart so a future
     * consumer cannot regress with a "no method maybeReadText" error
     * the same way `lookup` did (see TODO/57).
     *
     * @param {string | string[]} pathArg
     */
    async maybeReadText(pathArg) {
      const target = resolve(segmentsOf(pathArg));
      try {
        return await fs.readFile(target, 'utf8');
      } catch {
        return undefined;
      }
    },

    /**
     * @param {string | string[]} pathArg
     * @param {string} content
     */
    async writeText(pathArg, content) {
      const segments = segmentsOf(pathArg);
      const target = resolve(segments);
      // Mirror the daemon's behaviour: ensure parent directories exist.
      const parent =
        segments.length <= 1
          ? hostPath
          : join(hostPath, ...segments.slice(0, -1));
      await fs.mkdir(parent, { recursive: true });
      await fs.writeFile(target, content);
    },

    /** @param {string | string[]} pathArg */
    async makeDirectory(pathArg) {
      const target = resolve(segmentsOf(pathArg));
      await fs.mkdir(target, { recursive: true });
    },

    /**
     * Remove a single entry — a file, symlink, or empty directory.
     * Non-recursive: a non-empty directory raises ENOTEMPTY so the
     * caller (typically `vfs-mount.js`'s depth-first `rm` walk) sees
     * an explicit failure rather than silent recursive deletion.
     *
     * Discriminates file vs. directory before dispatching because
     * Node's `fs.rm(path, { force: true })` refuses directories
     * outright (returns EISDIR) without `recursive: true`, so the
     * naive "one call handles both" shape doesn't work.  Files /
     * symlinks go through `fs.rm` (so missing entries are tolerated
     * via `force: true`, matching the daemon's idempotent semantics);
     * directories go through `fs.rmdir`.
     *
     * @param {string | string[]} pathArg
     */
    async remove(pathArg) {
      const segments = segmentsOf(pathArg);
      if (segments.length === 0) {
        throw makeError(X`local Mount.remove: cannot remove the mount root`);
      }
      const target = resolve(segments);
      /** @type {import('fs').Stats | undefined} */
      let info;
      try {
        info = await fs.lstat(target);
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          // Idempotent miss, matching the daemon's `force: true`
          // semantics.
          return;
        }
        throw err;
      }
      if (info.isDirectory()) {
        await fs.rmdir(target);
      } else {
        await fs.rm(target, { force: true });
      }
    },

    /**
     * Atomically move (rename) one path under the mount to another.
     * Both segments must stay within the mount; the textual
     * `assertNoEscape` veto is applied by `resolve()` on both ends.
     *
     * @param {string | string[]} fromArg
     * @param {string | string[]} toArg
     */
    async move(fromArg, toArg) {
      const fromSegments = segmentsOf(fromArg);
      const toSegments = segmentsOf(toArg);
      if (fromSegments.length === 0 || toSegments.length === 0) {
        throw makeError(X`local Mount.move: cannot move the mount root`);
      }
      const from = resolve(fromSegments);
      const to = resolve(toSegments);
      // Ensure the destination's parent exists, mirroring writeText.
      const parent =
        toSegments.length <= 1
          ? hostPath
          : join(hostPath, ...toSegments.slice(0, -1));
      await fs.mkdir(parent, { recursive: true });
      await fs.rename(from, to);
    },
  });

  capToHostPath.set(cap, hostPath);
  if (options.topLevel) {
    topLevelCaps.add(cap);
  }
  return cap;
};
harden(makeLocalMountCap);

/**
 * Construct an in-process `SandboxPowers` plus the helpers a caller
 * needs to mint workspace-shaped Mount caps and clean up afterwards.
 *
 * The returned `powers` object satisfies the
 * `MakeSandboxFactoryInput.scratchProvider` contract:
 *
 *   - `provideScratchMount(petName)` mints a fresh tmpdir and wraps it
 *     in a Mount cap whose `hostPath` is recorded in the same WeakMap
 *     `provideHostPath` consults.
 *   - `provideHostPath(cap)` resolves a previously-minted Mount cap to
 *     its host path, throwing a structured error for any cap the
 *     powers did not mint.  This mirrors the daemon's `EndoHost.provideHostPath`
 *     (`packages/daemon/src/host.js`) which rejects unknown caps with
 *     "not a daemon-minted mount".
 *
 * `makeMountCapForPath(hostPath)` mints a workspace-shaped Mount cap
 * pointing at the operator-supplied path; the cap is wired into the
 * same WeakMap so the factory can resolve it through `provideHostPath`.
 * Callers pass the resulting cap into `factory.make({ mounts: [...] })`
 * (and, in the dev-repl's case, also into `initWorkspaceMount` and
 * `buildGenieTools` so the daemon-side and slice-side views land on
 * the same bytes).
 *
 * `dispose()` removes every tmpdir minted via `provideScratchMount`.
 * Caps minted by `makeMountCapForPath` are owned by the caller (the
 * powers never created the directory) and are not removed by
 * `dispose()`.
 *
 * @returns {{
 *   powers: SandboxPowers,
 *   makeMountCapForPath: (hostPath: string) => MountCap,
 *   dispose: () => Promise<void>,
 * }}
 */
export const makeLocalSandboxPowers = () => {
  /** @type {WeakMap<object, string>} */
  const capToHostPath = new WeakMap();
  /**
   * Caps minted by `provideScratchMount` and `makeMountCapForPath`
   * land in this set; sub-Mounts returned by `Mount.lookup` do not.
   * `provideHostPath` consults the set to refuse subdirectory views,
   * matching the daemon's behaviour
   * (`packages/daemon/src/host.js:290-297`).  See
   * `TODO/61_genie_local_powers_symlink_realpath.md` saboteur finding
   * 2.
   *
   * @type {WeakSet<object>}
   */
  const topLevelCaps = new WeakSet();
  /** @type {string[]} */
  const scratchDirs = [];

  const powersExo = makeExo('LocalSandboxPowers', LocalSandboxPowersInterface, {
    /** @param {string} petName */
    async provideScratchMount(petName) {
      // `mkdtemp` ensures distinct tmpdirs per call even when two
      // requests land in the same tick.
      const safePet = petName.replace(/[^a-zA-Z0-9-]/g, '-');
      const dir = mkdtempSync(join(tmpdir(), `genie-local-${safePet}-`));
      scratchDirs.push(dir);
      return /** @type {MountCap} */ (
        makeLocalMountCap(dir, capToHostPath, topLevelCaps, { topLevel: true })
      );
    },

    /** @param {unknown} cap */
    async provideHostPath(cap) {
      // The WeakMap lookup is the privileged operation: a cap the
      // powers did not mint will have no entry, mirroring the
      // daemon's "cap is not a daemon-minted mount" error.
      if (
        cap === null ||
        (typeof cap !== 'object' && typeof cap !== 'function')
      ) {
        throw makeError(
          X`local provideHostPath: cap is not a local-minted mount`,
        );
      }
      const obj = /** @type {object} */ (cap);
      const path = capToHostPath.get(obj);
      if (path === undefined) {
        throw makeError(
          X`local provideHostPath: cap is not a local-minted mount`,
        );
      }
      // Sub-Mounts minted by `Mount.lookup` are tracked in
      // `capToHostPath` (so they keep their own hostPath for internal
      // resolution) but deliberately not in `topLevelCaps` — the
      // daemon's `EndoHost.provideHostPath` likewise refuses
      // subdirectory views.  Callers that want to grant a
      // subdirectory must mint a fresh top-level cap via
      // `makeMountCapForPath(subPath)`.
      if (!topLevelCaps.has(obj)) {
        throw makeError(
          X`local provideHostPath: cap is a sub-Mount view, not a top-level mount; mint a fresh top-level Mount via makeMountCapForPath instead`,
        );
      }
      return path;
    },
  });
  const powers = /** @type {SandboxPowers} */ (
    /** @type {unknown} */ (powersExo)
  );

  /** @param {string} hostPath */
  const makeMountCapForPath = hostPath =>
    /** @type {MountCap} */ (
      makeLocalMountCap(hostPath, capToHostPath, topLevelCaps, {
        topLevel: true,
      })
    );

  const dispose = async () => {
    await null;
    // Drain the array so a second `dispose()` call is a no-op even
    // when the first one was interrupted partway through.
    const dirs = scratchDirs.splice(0);
    await Promise.all(
      dirs.map(async dir => {
        await null;
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch (e) {
          // Surface unexpected rm failures on stderr without
          // poisoning a clean shutdown — the tmpdir lives under
          // `os.tmpdir()` and the OS will reap it eventually.
          console.error(
            `[local-sandbox-powers] failed to remove scratch ${dir}: ${
              /** @type {Error} */ (e).message
            }`,
          );
        }
      }),
    );
  };

  return harden({
    powers,
    makeMountCapForPath,
    dispose,
  });
};
harden(makeLocalSandboxPowers);
