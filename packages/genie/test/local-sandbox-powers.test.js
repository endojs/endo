// @ts-check

/**
 * Unit tests for {@link makeLocalSandboxPowers} — the daemon-free
 * in-process implementation of the `SandboxPowers` contract that
 * `@endo/sandbox`'s `makeSandboxFactory` consumes.
 *
 * The tests pin four invariants from
 * `TODO/51_genie_dev_repl_local_sandbox_powers.md`:
 *
 *   1. `provideScratchMount` mints distinct tmpdirs per call.
 *   2. `provideHostPath` round-trips a cap minted by
 *      `makeMountCapForPath`.
 *   3. `provideHostPath` rejects an unknown cap with a structured
 *      error matching the daemon's "not a … mount" pattern
 *      (`packages/daemon/src/host.js` `provideHostPath`).
 *   4. `dispose()` removes every tmpdir minted via
 *      `provideScratchMount`.
 *
 * The tests run without spinning up a daemon — they exercise the
 * powers exo directly via `E()` to mirror how the sandbox factory
 * would call them.
 */

import '@endo/init/debug.js';

import { promises as fs, mkdtempSync } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import test from 'ava';

import { makeLocalSandboxPowers } from '../src/sandbox/local-powers.js';
import { assertIsMountCap } from '../src/sandbox/slice.js';
import { makeFileTools } from '../src/tools/filesystem.js';
import { makeMountVFS } from '../src/tools/vfs-mount.js';

// ---------------------------------------------------------------------------
// provideScratchMount
// ---------------------------------------------------------------------------

test('provideScratchMount mints distinct tmpdirs per call', async t => {
  const { powers, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const capA = await E(powers).provideScratchMount('alpha');
  const capB = await E(powers).provideScratchMount('alpha'); // same petName
  const capC = await E(powers).provideScratchMount('beta');

  const pathA = await E(powers).provideHostPath(capA);
  const pathB = await E(powers).provideHostPath(capB);
  const pathC = await E(powers).provideHostPath(capC);

  t.not(pathA, pathB, 'two scratch mounts with the same petName must differ');
  t.not(pathA, pathC);
  t.not(pathB, pathC);

  // Each path is an actual host directory.
  for (const path of [pathA, pathB, pathC]) {
    // eslint-disable-next-line no-await-in-loop
    const stat = await fs.stat(path);
    t.true(stat.isDirectory(), `${path} should be a real directory`);
  }

  // The petName is reflected in the tmpdir name so an operator
  // grepping `os.tmpdir()` can attribute a leak to its source.
  t.regex(pathA, /genie-local-alpha-/);
  t.regex(pathC, /genie-local-beta-/);
});

// ---------------------------------------------------------------------------
// provideHostPath round-trip via makeMountCapForPath
// ---------------------------------------------------------------------------

test('provideHostPath round-trips a cap minted by makeMountCapForPath', async t => {
  const { powers, makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  // Set up a real host directory the operator would hand to the
  // dev-repl as its workspace.
  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-ws-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  const cap = makeMountCapForPath(workspaceDir);
  const resolved = await E(powers).provideHostPath(cap);
  t.is(resolved, workspaceDir, 'round-trip must yield the original path');

  // The cap exposes the full Mount surface the genie's downstream
  // consumers drive: `spawnAgent`'s pet-name validation,
  // `initWorkspaceMount`, and (the one that broke in TODO/57) the
  // `vfs-mount.js` adapter for the `files` tool group.  `vfs-mount.js`
  // drives `lookup` to discriminate file vs. directory before listing
  // / removing, and `remove` to back the `unlink` / `rmdir` / `rm`
  // tools.  Pinning the wider surface here guards against the next
  // refactor accidentally re-thinning the cap and silently breaking
  // the dev-repl's `listDirectory` again.
  const methods = /** @type {string[]} */ (
    // eslint-disable-next-line no-underscore-dangle
    await E(/** @type {any} */ (cap)).__getMethodNames__()
  );
  for (const m of [
    'help',
    'readText',
    'maybeReadText',
    'writeText',
    'makeDirectory',
    'has',
    'list',
    'lookup',
    'remove',
    'move',
  ]) {
    t.true(
      methods.includes(m),
      `Mount cap should expose ${m} (got: ${methods.join(', ')})`,
    );
  }
});

// ---------------------------------------------------------------------------
// provideHostPath rejection paths
// ---------------------------------------------------------------------------

test('assertIsMountCap is a shape gate; provideHostPath is the identity gate', async t => {
  // The two-gate layering this test pins:
  //
  //   1. `assertIsMountCap` (in `src/sandbox/slice.js`) is a method-set
  //      probe.  It produces friendly, agent-named errors when the
  //      operator pet-names something that isn't a Mount (a typo, a
  //      guest, a value blob).  Crucially it does NOT authenticate the
  //      cap's identity — any `makeExo` / `Far` exo with the right
  //      method names passes.
  //   2. `provideHostPath` (here on the local-powers side; daemon-side
  //      counterpart in `packages/daemon/src/host.js`) is the
  //      authoritative identity check.  The local powers consult a
  //      per-instance `WeakMap`; the daemon consults its mount-formula
  //      registry.  Either way, a spoofed exo is rejected before any
  //      host path crosses the slice boundary.
  //
  // Without (2) the shape gate would be the only authentication on a
  // pet-name Mount — saboteur finding 3 in TODO/60.  This test fails
  // loudly if a future refactor moves identity into the shape gate or
  // collapses the gates together.
  const { powers, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  // Hand-roll an exo that matches the daemon's MountInterface method
  // set — `assertIsMountCap`'s probe returns these names — but is NOT
  // wired into the local powers' WeakMap.
  const SpoofInterface = M.interface('SpoofMount', {
    has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    readText: M.call(M.any()).returns(M.promise()),
    writeText: M.call(M.any(), M.string()).returns(M.promise()),
    makeDirectory: M.call(M.any()).returns(M.promise()),
  });
  const spoof = makeExo('SpoofMount', SpoofInterface, {
    async has() {
      return true;
    },
    async list() {
      return harden([]);
    },
    async readText() {
      return 'spoofed contents';
    },
    async writeText() {
      await null;
    },
    async makeDirectory() {
      await null;
    },
  });

  // Gate 1: `assertIsMountCap` accepts the spoof — it only probes the
  // method-name surface.
  const accepted = await assertIsMountCap(spoof, {
    agentName: 'test-agent',
    role: 'workspace',
    petName: 'spoof',
  });
  t.is(accepted, spoof, 'shape gate returns the cap on success');

  // Gate 2: `provideHostPath` rejects it — the WeakMap has no entry
  // for an exo the local powers never minted.  The error wording
  // mirrors the daemon's `not a daemon-minted mount` (the local
  // powers say `not a local-minted mount`) on purpose.
  await t.throwsAsync(() => E(powers).provideHostPath(spoof), {
    message: /not a local-minted mount/,
  });

  // Symmetric negative: a cap that does NOT match the method-set
  // never reaches the identity gate — the shape gate refuses it at
  // the form boundary so the operator sees a friendly diagnostic.
  const wrongShape = Far('WrongShape', { help: () => 'no methods' });
  await t.throwsAsync(
    () =>
      assertIsMountCap(wrongShape, {
        agentName: 'test-agent',
        role: 'rootfs',
        petName: 'wrong',
      }),
    {
      message:
        /rootfs pet name "wrong" does not refer to a Mount cap \(missing methods:/,
    },
  );
});

test('provideHostPath rejects an unknown cap with a structured error', async t => {
  const { powers, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  // A `Far` exo the powers never minted — the daemon would reject
  // this with `cap is not a daemon-minted mount`; the local powers
  // mirror that pattern with `not a local-minted mount`.
  const stranger = Far('Stranger', { help: () => 'not minted here' });
  await t.throwsAsync(() => E(powers).provideHostPath(stranger), {
    message: /not a local-minted mount/,
  });

  // Caps minted by *another* `makeLocalSandboxPowers` instance are
  // strangers to this one, even though both surfaces look identical
  // — the WeakMap is per-instance.
  const other = makeLocalSandboxPowers();
  t.teardown(other.dispose);
  const fromOther = await E(other.powers).provideScratchMount('x');
  await t.throwsAsync(() => E(powers).provideHostPath(fromOther), {
    message: /not a local-minted mount/,
  });

  // Non-object inputs are rejected up front (the `M.call(M.any())`
  // guard accepts them, so the runtime check carries the weight).
  for (const garbage of [null, undefined, 42, 'a string', true]) {
    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(
      () => E(powers).provideHostPath(/** @type {any} */ (garbage)),
      { message: /not a local-minted mount/ },
      `unknown cap of type ${typeof garbage} should be rejected`,
    );
  }
});

// ---------------------------------------------------------------------------
// Confinement hardening — symlink escape, sub-Mount rejection, absolute
// segments.  See `TODO/61_genie_local_powers_symlink_realpath.md` for
// the saboteur findings these pin.
// ---------------------------------------------------------------------------

test('Mount.lookup rejects a symlink that points outside the mount root', async t => {
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  // Construct a workspace with a sibling tree that the workspace
  // should NOT be able to reach.  The sibling tree stands in for any
  // out-of-workspace host directory an attacker would want to bind
  // into a slice — `/etc` in the saboteur's original example.
  const tmp = mkdtempSync(join(tmpdir(), 'genie-local-test-symlink-'));
  t.teardown(() => fs.rm(tmp, { recursive: true, force: true }));
  const workspaceDir = join(tmp, 'ws');
  const siblingDir = join(tmp, 'sibling');
  await fs.mkdir(workspaceDir);
  await fs.mkdir(siblingDir);
  await fs.writeFile(join(siblingDir, 'secret.txt'), 'must not leak');
  await fs.symlink(siblingDir, join(workspaceDir, 'escape'));

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));

  // The kernel happily resolves `escape` to the sibling directory if
  // `lookup` does not realpath; this test pins the rejection so that
  // a regression resurfaces as a failed assertion rather than as
  // silent host-fs disclosure.
  await t.throwsAsync(() => E(mount).lookup('escape'), {
    message: /escapes mount root/,
  });
});

test('Mount.lookup allows a symlink whose target stays inside the mount root', async t => {
  // The symmetric positive case: an in-workspace symlink that
  // genuinely points to an in-workspace directory must still work
  // (otherwise the rejection above is too aggressive and silently
  // breaks operator-set-up workspace trees).
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-ws-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  await fs.mkdir(join(workspaceDir, 'real'));
  await fs.writeFile(join(workspaceDir, 'real', 'hello.txt'), 'hi');
  await fs.symlink(join(workspaceDir, 'real'), join(workspaceDir, 'alias'));

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));
  const sub = await E(mount).lookup('alias');
  const entries = /** @type {string[]} */ (await E(sub).list());
  t.deepEqual(entries, ['hello.txt']);
});

test('provideHostPath rejects sub-Mounts minted by Mount.lookup', async t => {
  // Composition of saboteur findings 1 and 2: if `lookup` returned a
  // sub-Mount and `provideHostPath` accepted it, an attacker could
  // bind any directory reachable from the workspace tree (via a
  // symlink or even via a legitimate sub-directory the operator did
  // not intend to grant) into the slice.  Both the daemon (see
  // `packages/daemon/src/host.js:290-297`) and the local powers now
  // refuse the call.
  const { powers, makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-subroot-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));
  await fs.mkdir(join(workspaceDir, 'subdir'));

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));
  const sub = await E(mount).lookup('subdir');

  await t.throwsAsync(() => E(powers).provideHostPath(sub), {
    message: /sub-Mount view, not a top-level mount/,
  });

  // The recommended workaround is to mint a fresh top-level cap
  // against the sub-directory's host path.  That cap resolves
  // normally — the explicit-mint workflow mirrors the daemon's
  // `provideMount(absolutePath, ...)` shape called out in the
  // host-side comment.
  const subPath = join(workspaceDir, 'subdir');
  const explicit = makeMountCapForPath(subPath);
  // On macOS, `tmpdir()` is reached through a `/private` symlink, so
  // the returned path may be realpath'd.  Compare via realpath to
  // avoid a false negative.
  const resolved = await E(powers).provideHostPath(explicit);
  t.is(await fs.realpath(resolved), await fs.realpath(subPath));
});

test('Mount path-segment veto rejects absolute path segments', async t => {
  // Saboteur finding 4: POSIX `path.join(hostPath, '/etc/passwd')`
  // happens to neutralise the absolute prefix today, but a future
  // swap to `path.resolve` or `path.win32` semantics would promote
  // the segment.  The textual veto closes the gap unconditionally.
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-abs-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));
  await fs.writeFile(join(workspaceDir, 'inside.txt'), 'ok');

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));

  // String-form absolute path:
  await t.throwsAsync(() => E(mount).readText('/etc/passwd'), {
    message: /must not be absolute/,
  });
  // Array-form absolute first segment:
  await t.throwsAsync(() => E(mount).readText(['/etc', 'passwd']), {
    message: /must not be absolute/,
  });
  // Windows-style separator is vetoed for the same reason.  The
  // single character `'\\'` (a backslash) is the segment under test.
  await t.throwsAsync(() => E(mount).readText('\\Windows\\System32'), {
    message: /must not be absolute/,
  });
  // The same veto applies to writeText, makeDirectory, lookup, etc.
  // Pinning one more arm (lookup) here guards against the next
  // refactor reintroducing the gap on the path that was originally
  // attacked.
  await t.throwsAsync(() => E(mount).lookup('/etc'), {
    message: /must not be absolute/,
  });

  // Legitimate non-absolute paths still resolve.  `sep` is `/` on
  // POSIX and `\` on Windows — the test never asserts a backslash on
  // POSIX runners, only that the host separator works for joining
  // multi-segment paths.
  void sep;
  t.is(await E(mount).readText('inside.txt'), 'ok');
});

// ---------------------------------------------------------------------------
// dispose() cleanup
// ---------------------------------------------------------------------------

test('dispose() removes every tmpdir minted via provideScratchMount', async t => {
  const { powers, dispose } = makeLocalSandboxPowers();

  const capA = await E(powers).provideScratchMount('one');
  const capB = await E(powers).provideScratchMount('two');
  const pathA = await E(powers).provideHostPath(capA);
  const pathB = await E(powers).provideHostPath(capB);

  // Both directories are real on disk before disposal.
  for (const p of [pathA, pathB]) {
    // eslint-disable-next-line no-await-in-loop
    t.true((await fs.stat(p)).isDirectory(), `${p} present before dispose`);
  }

  // Drop a sentinel inside one of them so we know `dispose()` is
  // genuinely doing a recursive removal rather than relying on the
  // tmpdir being empty.
  await fs.writeFile(join(pathA, 'sentinel.txt'), 'present');

  await dispose();

  for (const p of [pathA, pathB]) {
    // eslint-disable-next-line no-await-in-loop
    await t.throwsAsync(() => fs.stat(p), { code: 'ENOENT' });
  }

  // Calling dispose() again is a no-op; the internal scratch list was
  // drained on the first call.
  await t.notThrowsAsync(dispose);
});

test('dispose() does not remove operator-supplied paths from makeMountCapForPath', async t => {
  // `makeMountCapForPath` wraps a directory the caller already owns;
  // `dispose()` must never delete those.  This pins the asymmetry
  // documented at the top of `local-powers.js` so a future refactor
  // does not accidentally collapse the two paths into one cleanup
  // list and start eating workspace contents on REPL exit.
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();

  const operatorDir = mkdtempSync(join(tmpdir(), 'genie-local-test-op-'));
  t.teardown(() => fs.rm(operatorDir, { recursive: true, force: true }));
  await fs.writeFile(join(operatorDir, 'precious.txt'), 'do not delete me');

  // Mint a cap for the operator's path, then dispose.
  makeMountCapForPath(operatorDir);
  await dispose();

  // Both the directory and the file inside it must still be on disk.
  t.true((await fs.stat(operatorDir)).isDirectory());
  t.is(
    await fs.readFile(join(operatorDir, 'precious.txt'), 'utf8'),
    'do not delete me',
  );
});

// ---------------------------------------------------------------------------
// vfs-mount integration: the dev-repl's `files` tool group rides the
// local Mount cap through `vfs-mount.js`, which drives `lookup` /
// `remove` (and not just the trivial readText/writeText subset).  An
// earlier rev of `local-powers.js` exposed only the trivial subset, so
// the genie's `listDirectory` / `unlink` / `rmdir` / `rm` tools failed
// at runtime with "target has no method \"lookup\"".  These tests pin
// the surface end-to-end through the same code path the dev-repl uses,
// so the next refactor that thins the cap fails here loudly rather
// than only at runtime under an interactive prompt.  See
// `TODO/57_genie_dev_repl_sandbox_test_fails.md`.
// ---------------------------------------------------------------------------

test('vfs-mount listDirectory drives lookup through the local Mount cap', async t => {
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-ws-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  // Seed a few entries so we have both files and a subdirectory.
  await fs.mkdir(join(workspaceDir, 'sub'), { recursive: true });
  await fs.writeFile(join(workspaceDir, 'a.txt'), 'alpha');
  await fs.writeFile(join(workspaceDir, 'sub', 'b.txt'), 'beta');

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));
  const vfs = makeMountVFS({ mount, rootDir: workspaceDir });
  const { listDirectory } = makeFileTools({ root: workspaceDir, vfs });

  const result =
    /** @type {{ entries: Array<{ name: string, type: string }> }} */ (
      await listDirectory.execute({ path: '.' })
    );
  const byName = Object.fromEntries(result.entries.map(e => [e.name, e.type]));
  t.is(byName['a.txt'], 'file');
  t.is(byName.sub, 'directory');
});

test('vfs-mount stat drives lookup + text on the local Mount cap', async t => {
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-ws-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  await fs.writeFile(join(workspaceDir, 'sized.txt'), 'twelve chars');

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));
  const vfs = makeMountVFS({ mount, rootDir: workspaceDir });
  const { stat } = makeFileTools({ root: workspaceDir, vfs });

  const fileInfo = /** @type {{ type: string, size: number }} */ (
    await stat.execute({ path: 'sized.txt' })
  );
  t.is(fileInfo.type, 'file');
  t.is(fileInfo.size, 'twelve chars'.length);

  const rootInfo = /** @type {{ type: string }} */ (
    await stat.execute({ path: '.' })
  );
  t.is(rootInfo.type, 'directory');
});

test('vfs-mount removeFile drives lookup + remove on the local Mount cap', async t => {
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-ws-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  await fs.writeFile(join(workspaceDir, 'doomed.txt'), 'goodbye');

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));
  const vfs = makeMountVFS({ mount, rootDir: workspaceDir });
  const { removeFile } = makeFileTools({ root: workspaceDir, vfs });

  await removeFile.execute({ path: 'doomed.txt' });
  await t.throwsAsync(() => fs.stat(join(workspaceDir, 'doomed.txt')), {
    code: 'ENOENT',
  });
});

test('vfs-mount removeDirectory recursive walks the local Mount tree', async t => {
  const { makeMountCapForPath, dispose } = makeLocalSandboxPowers();
  t.teardown(dispose);

  const workspaceDir = mkdtempSync(join(tmpdir(), 'genie-local-test-ws-'));
  t.teardown(() => fs.rm(workspaceDir, { recursive: true, force: true }));

  // Build a small tree so the depth-first walk inside `vfs.rm` has
  // something to traverse.  `rm` exercises `lookup` + `list` +
  // `remove` together, so a regression in any one of those surfaces
  // here.
  await fs.mkdir(join(workspaceDir, 'tree', 'inner'), { recursive: true });
  await fs.writeFile(join(workspaceDir, 'tree', 'top.txt'), '1');
  await fs.writeFile(join(workspaceDir, 'tree', 'inner', 'leaf.txt'), '2');

  const mount = /** @type {any} */ (makeMountCapForPath(workspaceDir));
  const vfs = makeMountVFS({ mount, rootDir: workspaceDir });
  const { removeDirectory } = makeFileTools({ root: workspaceDir, vfs });

  await removeDirectory.execute({ path: 'tree', recursive: true });
  await t.throwsAsync(() => fs.stat(join(workspaceDir, 'tree')), {
    code: 'ENOENT',
  });
});
