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

import { E } from '@endo/far';
import { walk, collectBytes } from '@endo/endo-fs';
import { makeNativeGitBackend } from '@endo/git';
import { makeGit } from '@endo/exo-git';
import { makeMount, lineageOf } from '@endo/daemon/src/mount.js';
import { makeFilePowers } from '@endo/daemon/src/daemon-node-powers.js';
import { makeReaderRef } from '@endo/daemon/reader-ref.js';

import { makeGitTool } from '../src/git-tool.js';

/**
 * Integration proof that `makeGitTool`'s agent-facing tool records drive a
 * *live* exo `Git` capability end-to-end — not a stub. The unit tests
 * (`git-tool.test.js`) prove the marshal/guard layer against a stub; this test
 * proves the same records work against a real native-git-backed `Git` exo over
 * a real on-disk repository: the records `invoke` correctly, the named→positional
 * marshal reaches the capability, and the capability's results flow back.
 *
 * `add` is deliberately NOT part of the tool slice (its `M.arrayOf(M.remotable())`
 * arg awaits the handle-table / capref registry, a later PR), so staging is done
 * through the raw `Git` cap; every other step of the flow goes through the tools.
 */

const execFileAsync = promisify(execFile);

/**
 * Initialize a real git repository at a tmp path with an empty initial commit
 * on `main`. Mirrors `packages/daemon/test/git.test.js`'s helper.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {Promise<string>} the worktree root path
 */
const provisionGitWorktree = async t => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'agent-tools-git-'),
  );
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
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
 */
const provisionGit = async t => {
  const repoRoot = await provisionGitWorktree(t);
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot, makeReaderRef });
  const git = makeGit({ mount, backend, lineageOf });
  return { repoRoot, mount, git };
};

/**
 * Look a tool up by name, throwing if absent (so the result is non-undefined).
 *
 * @param {import('../src/tool.js').ToolRecord[]} tools
 */
const byNameOf = tools => name => {
  const found = tools.find(tool => tool.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

test('makeGitTool drives a real Git cap: stage → status → commit → log → filesystemAt', async t => {
  const { repoRoot, mount, git } = await provisionGit(t);
  const byName = byNameOf(makeGitTool(git));

  // Write and stage a file. `add` is not in the tool slice, so stage through
  // the raw cap; the rest of the flow is driven through the tool records.
  await fs.promises.writeFile(
    path.join(repoRoot, 'greeting.txt'),
    'hello tools',
  );
  const entry = await E(mount).entry(['greeting.txt']);
  await E(git).add([entry]);

  // `status` (tool) reports the staged file. Tool `invoke` returns `unknown`
  // (the contract is the wire shape, not a TS type), so each result is cast to
  // the git record shape the exo cap returns.
  const staged = /** @type {Array<{ path: string }>} */ (
    await byName('status').invoke({})
  );
  t.true(
    staged.some(row => row.path === 'greeting.txt'),
    'status tool should report the staged file',
  );

  // `commit` (tool) records it; the marshalled message reaches the cap.
  const commit = /** @type {{ oid: string, summary: string }} */ (
    await byName('commit').invoke({ arg0: 'add greeting' })
  );
  t.regex(commit.oid, /^[0-9a-f]{7,64}$/);
  t.is(commit.summary, 'add greeting');

  // `status` (tool) is clean once the file is committed.
  const afterStatus = /** @type {Array<{ path: string }>} */ (
    await byName('status').invoke({})
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

  // `filesystemAt` (tool) opens a read-only `@endo/endo-fs` Filesystem over the
  // committed tree; walk it to read the committed file content back, proving the
  // remotable result flows through the tool boundary intact.
  const fsView = await byName('filesystemAt').invoke({ arg0: 'HEAD' });
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
    await byName('createBranch').invoke({ arg0: 'feature' })
  );
  t.is(created.name, 'feature');
  await byName('switchBranch').invoke({ arg0: 'feature' });
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
  // `commit`'s arg0 guard is M.string(); a number must be rejected by the
  // tool's `mustMatch` before the capability is ever touched — proving the
  // guard fires over a live cap, not only the stub.
  await t.throwsAsync(() => byName('commit').invoke({ arg0: 123 }));
  // The fail-closed key check rejects an unknown arg key too.
  await t.throwsAsync(() => byName('commit').invoke({ bogus: 'x' }));
});

test('the deferred add/restore methods are absent from the slice', t => {
  // The cap is only touched at invoke time, so an empty object suffices to
  // inspect the record names.
  const tools = makeGitTool(harden({}));
  const names = new Set(tools.map(tool => tool.name));
  // `add`/`restore` take `M.arrayOf(M.remotable())` and stay out of the slice
  // until the capref registry lands; this pins the contract that justifies the
  // raw-cap staging above.
  t.false(names.has('add'));
  t.false(names.has('restore'));
});
