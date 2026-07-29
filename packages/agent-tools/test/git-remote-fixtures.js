// @ts-check

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { makeNativeGitBackend } from '@endo/git';
import { makeGit } from '@endo/exo-git';
import { makeMount, lineageOf } from '@endo/daemon/src/mount.js';
import { makeFilePowers } from '@endo/daemon/src/manager-node-powers.js';

/** @import { WritableEndoGit } from '@endo/exo-git' */

const execFileAsync = promisify(execFile);

/**
 * Compose a `mount -> native-git backend -> Git` over an existing on-disk
 * working tree. This is the shared bootstrap both round-trip tests repeat: the
 * filesystem mount provides the data plane, the native backend the control
 * plane, and `makeGit` mints the exo `Git` capability over the pair.
 *
 * @param {string} root absolute path to a git working tree
 * @param {object} [options]
 * @param {{ authorName: string, authorEmail: string }} [options.identity] The
 *   formula-owned commit identity to thread into the native backend, mirroring
 *   `provideGit`'s `{ identity }` construction option. Omitted, the backend
 *   falls back to its default `Endo <endo@invalid.local>` attribution.
 * @returns {Promise<{ git: WritableEndoGit, mount: ReturnType<typeof makeMount>, root: string }>}
 */
export const composeGitOverWorktree = async (root, { identity } = {}) => {
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot: root, identity });
  await backend.assertRepositoryRoot();
  const git = makeGit({ mount, backend, lineageOf });
  return { git, mount, root };
};

/**
 * Provision an empty git working tree at a tmp path with a single empty initial
 * commit on `main`, then compose a `mount -> Git` over it. Used by the
 * push/fetch round-trip that pushes from a freshly initialized local repo.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {Promise<{ git: WritableEndoGit, mount: ReturnType<typeof makeMount>, root: string }>}
 */
export const provisionGitContext = async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-remote-'));
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: root });
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
      'init',
    ],
    { cwd: root },
  );
  return composeGitOverWorktree(root);
};

/**
 * Clone an existing source working tree into a bare `file://` remote.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} sourceRepo absolute path to a non-bare source repository
 * @returns {Promise<string>} absolute path to the bare remote
 */
export const provisionBareRemote = async (t, sourceRepo) => {
  const remoteParent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-remote-bare-'),
  );
  t.teardown(() =>
    fs.promises.rm(remoteParent, { recursive: true, force: true }),
  );
  const remoteRoot = path.join(remoteParent, 'remote.git');
  await execFileAsync('git', ['clone', '--bare', sourceRepo, remoteRoot]);
  return remoteRoot;
};

/**
 * Seed a bare `file://` remote with a real commit on `main`, from scratch: init
 * a fresh source repo with a single real file commit, then clone it bare. Used
 * by the clone-loop test, which needs material content (not just an empty
 * commit) on the remote so a host clone has a file to edit.
 *
 * @param {import('ava').ExecutionContext} t
 * @returns {Promise<string>} absolute path to the bare remote
 */
export const seedBareRemote = async t => {
  const seedRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-clone-loop-seed-'),
  );
  t.teardown(() => fs.promises.rm(seedRoot, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: seedRoot });
  await fs.promises.writeFile(path.join(seedRoot, 'README.md'), 'seed\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: seedRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'seed'],
    { cwd: seedRoot },
  );

  const remoteParent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-clone-loop-bare-'),
  );
  t.teardown(() =>
    fs.promises.rm(remoteParent, { recursive: true, force: true }),
  );
  const remoteRoot = path.join(remoteParent, 'remote.git');
  await execFileAsync('git', ['clone', '--bare', seedRoot, remoteRoot]);
  return remoteRoot;
};

/**
 * Advance the bare remote's `main` by one real commit, returning the new head
 * oid. Clones the remote, commits a new file, pushes, and reports the oid the
 * remote now points at, so a fetch/pull round-trip can assert against it.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} remoteRoot absolute path to a bare remote
 * @returns {Promise<string>} the new `main` head oid
 */
export const advanceRemoteMain = async (t, remoteRoot) => {
  const cloneRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-remote-upstream-'),
  );
  t.teardown(() => fs.promises.rm(cloneRoot, { recursive: true, force: true }));
  await execFileAsync('git', ['clone', remoteRoot, cloneRoot]);
  await fs.promises.writeFile(
    path.join(cloneRoot, 'upstream.txt'),
    'upstream\n',
  );
  await execFileAsync('git', ['add', 'upstream.txt'], { cwd: cloneRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'upstream'],
    { cwd: cloneRoot },
  );
  await execFileAsync('git', ['push', 'origin', 'main'], { cwd: cloneRoot });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'main'], {
    cwd: cloneRoot,
  });
  return stdout.trim();
};
