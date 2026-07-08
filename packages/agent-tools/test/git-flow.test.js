// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { E } from '@endo/eventual-send';
import { walk, collectBytes } from '@endo/platform/fs/extended';
import { makeNativeGitBackend } from '@endo/git';
import { makeGit } from '@endo/exo-git';
import { makeMount, lineageOf } from '@endo/daemon/src/mount.js';
import { makeFilePowers } from '@endo/daemon/src/daemon-node-powers.js';

import { makeGitTool } from '../src/git-tool.js';
import { makeGitMountTools } from '../src/git-mount-tool.js';

/**
 * Integration proof that `makeGitTool`'s agent-facing tool records drive a
 * *live* exo `Git` capability end-to-end — not a stub. The unit tests
 * (`git-tool.test.js`) prove the marshal/guard layer against a stub; this test
 * proves the same records work against a real native-git-backed `Git` exo over
 * a real on-disk repository: the records `invoke` correctly, the named→positional
 * marshal reaches the capability, and the capability's results flow back.
 *
 * `add` and `status` — whose native signatures traffic in mount-entry
 * remotables — are driven through the mount-bridged `makeGitMountTools` records
 * (Phase 3: path strings in, JSON-safe rows out), while the in-slice JSON-safe
 * methods (`commit`, `log`, the branch operations) go through `makeGitTool`.
 * Only `filesystemAt` (it returns a live `Filesystem` remotable) is still driven
 * through the raw cap, awaiting the result serialization of a later PR.
 */

const execFileAsync = promisify(execFile);

/**
 * Initialize a real git repository at a tmp path with an empty initial commit
 * on `main`. Mirrors `packages/daemon/test/git.test.js`'s helper.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} [rootPath] Use this pre-existing directory as the worktree
 *   root instead of a fresh `mkdtemp`. The caller owns its lifecycle (teardown),
 *   letting a test control the worktree's *parent* — needed to prove a `../`
 *   escape cannot reach a file above the root.
 * @returns {Promise<string>} the worktree root path
 */
const provisionGitWorktree = async (t, rootPath) => {
  await null;
  const root =
    rootPath ??
    (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agent-tools-git-')));
  if (rootPath === undefined) {
    t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  }
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  // Pin signing off so the setup is independent of a user-global
  // `commit.gpgSign`. (The exo backend supplies its own author identity and
  // disables signing for its own commits.)
  await execFileAsync('git', ['config', '--local', 'commit.gpgsign', 'false'], {
    cwd: root,
  });
  await execFileAsync('git', ['config', '--local', 'tag.gpgsign', 'false'], {
    cwd: root,
  });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '-m',
      'init commit',
    ],
    { cwd: root },
  );
  return root;
};

/**
 * Construct a live exo `Git` capability over a fresh real repository, using the
 * same recipe as the daemon's git tests: a writable `EndoMount` over the
 * worktree, a `NativeGitBackend`, and `makeGit`.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} [rootPath] Forwarded to `provisionGitWorktree` when a test
 *   needs to control the worktree root's parent directory.
 */
const provisionGit = async (t, rootPath) => {
  const repoRoot = await provisionGitWorktree(t, rootPath);
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot });
  const git = makeGit({ mount, backend, lineageOf });
  return { repoRoot, mount, git };
};

/**
 * Look a tool up by name, throwing if absent (so the result is non-undefined).
 *
 * @param {import('../src/types.js').ToolRecord[]} tools
 */
const byNameOf = tools => name => {
  const found = tools.find(tool => tool.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

test('git tools drive a real Git cap: stage → status → commit → log → filesystemAt', async t => {
  const { repoRoot, git } = await provisionGit(t);
  const byName = byNameOf(makeGitTool(git));
  const byMountName = byNameOf(makeGitMountTools(git));

  // Write and stage a file entirely through the mount-bridged `add` tool: it
  // takes a path string, resolves it to a mount entry, and reaches the cap.
  await fs.promises.writeFile(
    path.join(repoRoot, 'greeting.txt'),
    'hello tools',
  );
  const added = await byMountName('add').invoke({ paths: ['greeting.txt'] });
  t.is(added, 'Staged 1 path.');

  // `status` (mount-bridged tool) reports the staged file as JSON-safe rows,
  // with no remotables on the wire.
  const staged = /** @type {Array<{ path: string, index: string }>} */ (
    await byMountName('status').invoke({})
  );
  const stagedRow = staged.find(row => row.path === 'greeting.txt');
  t.truthy(stagedRow, 'status should report the staged file');
  t.is(stagedRow?.index, 'added');
  for (const row of staged) {
    t.false('entry' in row);
    t.false('node' in row);
  }

  // `commit` (tool) records it; the marshalled message reaches the cap.
  const commit = /** @type {{ oid: string, summary: string }} */ (
    await byName('commit').invoke({ message: 'add greeting' })
  );
  t.regex(commit.oid, /^[0-9a-f]{7,64}$/);
  t.is(commit.summary, 'add greeting');

  // Status (mount-bridged tool) is clean once the file is committed.
  const afterStatus = /** @type {Array<{ path: string }>} */ (
    await byMountName('status').invoke({})
  );
  t.false(
    afterStatus.some(row => row.path === 'greeting.txt'),
    'the committed file should no longer be dirty',
  );

  // `log` (tool) read-back surfaces the new commit, most-recent-first.
  const log = /** @type {Array<{ oid: string, summary: string }>} */ (
    await byName('log').invoke({})
  );
  t.is(log[0].summary, 'add greeting');
  t.is(log[0].oid, commit.oid);

  // `filesystemAt` is likewise out of the tool slice (it returns a live
  // `Filesystem` remotable, which awaits result serialization), so open it
  // through the raw cap; walk the read-only `@endo/platform/fs/extended` Filesystem over the
  // committed tree to read the committed file content back.
  const fsView = await E(git).filesystemAt('HEAD');
  const root = await E(/** @type {any} */ (fsView)).root();
  const file = /** @type {any} */ (await walk(root, ['greeting.txt']));
  const opened = await E(file).open({ read: true });
  const bytes = await collectBytes(await E(opened).read(0n));
  t.is(new TextDecoder().decode(bytes), 'hello tools');
});

test('makeGitTool drives branch operations over a real Git cap', async t => {
  const { git } = await provisionGit(t);
  const byName = byNameOf(makeGitTool(git));

  // `currentBranch` (tool) reports the initial branch.
  const current = /** @type {{ name: string }} */ (
    await byName('currentBranch').invoke({})
  );
  t.is(current.name, 'main');

  // `createBranch` then `switchBranch` (tools); the new branch becomes current.
  const created = /** @type {{ name: string }} */ (
    await byName('createBranch').invoke({ name: 'feature' })
  );
  t.is(created.name, 'feature');
  await byName('switchBranch').invoke({ branch: 'feature' });
  const afterSwitch = /** @type {{ name: string }} */ (
    await byName('currentBranch').invoke({})
  );
  t.is(afterSwitch.name, 'feature');

  // `branches` (tool) lists both branches.
  const branches = /** @type {Array<{ name: string }>} */ (
    await byName('branches').invoke({})
  );
  const names = branches.map(ref => ref.name).sort();
  t.deepEqual(names, ['feature', 'main']);
});

test('the runtime guard rejects a bad arg before reaching the live cap', async t => {
  const { git } = await provisionGit(t);
  const byName = byNameOf(makeGitTool(git));
  await null;
  // `commit`'s `message` guard is M.string(); a number must be rejected by the
  // tool's `mustMatch` before the capability is ever touched — proving the
  // guard fires over a live cap, not only the stub.
  await t.throwsAsync(() => byName('commit').invoke({ message: 123 }));
  // The fail-closed key check rejects an unknown arg key too.
  await t.throwsAsync(() => byName('commit').invoke({ bogus: 'x' }));
});

test('add/restore stay out of the JSON-transparent makeGitTool slice', t => {
  // The cap is only touched at invoke time, so an empty object suffices to
  // inspect the record names.
  const tools = makeGitTool(
    /** @type {import('../src/types.js').GitToolCapability} */ (harden({})),
  );
  const names = new Set(tools.map(tool => tool.name));
  // `add`/`restore` take `M.arrayOf(M.remotable())`, so they cannot sit in the
  // one-to-one guard-mapped slice. `add` is now served by the mount-bridged
  // `makeGitMountTools` (proved above); `restore` remains deferred entirely.
  t.false(names.has('add'));
  t.false(names.has('restore'));
  t.false(names.has('status'));

  const mountToolNames = new Set(
    makeGitMountTools(
      /** @type {import('../src/types.js').GitMountToolCapability} */ (
        harden({})
      ),
    ).map(tool => tool.name),
  );
  t.true(mountToolNames.has('add'));
  t.true(mountToolNames.has('status'));
  t.false(mountToolNames.has('restore'));
});

test('a "../" escape in an add path is contained by the mount, clamped at the worktree root', async t => {
  // Lay out an OUTER directory holding two same-named files: one *above* the
  // worktree root (the escape target — it must never be reached) and one at the
  // root inside the repo. If a leading `..` escaped its confinement, `add`
  // would resolve to the outer file; the mount clamps `..` at the root, so it
  // resolves to the in-repo file instead. Sharing the basename makes the
  // difference observable in the staged blob's bytes.
  const outer = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'agent-tools-git-escape-'),
  );
  t.teardown(() => fs.promises.rm(outer, { recursive: true, force: true }));
  await fs.promises.writeFile(
    path.join(outer, 'contained.txt'),
    'OUTSIDE THE WORKTREE — must never be staged',
  );
  const repoRoot = path.join(outer, 'worktree');
  await fs.promises.mkdir(repoRoot);

  const { git } = await provisionGit(t, repoRoot);
  const byMountName = byNameOf(makeGitMountTools(git));

  await fs.promises.writeFile(
    path.join(repoRoot, 'contained.txt'),
    'inside the worktree',
  );

  // Drive `add` with a `../`-bearing path through the real tool → mount → Git →
  // git-binary stack. The `..` pops but is clamped at the worktree root, so the
  // path resolves to `contained.txt` at the root: staging SUCCEEDS and stays
  // inside the repo rather than escaping upward.
  const added = await byMountName('add').invoke({
    paths: ['../contained.txt'],
  });
  t.is(added, 'Staged 1 path.');

  // `status` reports the file at its root-relative path — no leading `..`, no
  // outer path — proving the segment was clamped, not preserved as an escape.
  const staged = /** @type {Array<{ path: string, index: string }>} */ (
    await byMountName('status').invoke({})
  );
  const row = staged.find(entry => entry.path === 'contained.txt');
  t.truthy(row, 'the clamped path should stage the in-repo root file');
  t.is(row?.index, 'added');
  t.false(
    staged.some(entry => entry.path.includes('..')),
    'no staged path should retain a ".." segment',
  );

  // The load-bearing proof: the STAGED bytes are the in-repo file's, not the
  // identically-named file one level above the worktree. The escape was
  // contained at the capability, not by a string check in the tool.
  const { stdout: stagedBytes } = await execFileAsync(
    'git',
    ['show', ':contained.txt'],
    { cwd: repoRoot },
  );
  t.is(stagedBytes, 'inside the worktree');
  t.not(stagedBytes, 'OUTSIDE THE WORKTREE — must never be staged');
});
