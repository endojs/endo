// @ts-check

// Shared, non-test helpers for the git code-mode eval tests. Named with a
// leading underscore so ava's `test/**/*.test.*` glob does not pick it up as a
// test file. This is the node-side, stream-side half of the eval harness, the
// part every scenario's repository shares: the UTF-8 `readText` reader the
// portable scorer is handed, the `workspace` + `git` powers built over an
// on-disk worktree, and the repo bootstrap (init, identity, gpgsign off). Each
// scenario's own repository shape lives in its per-eval `_<name>-repo.js`.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify as nodePromisify } from 'node:util';

import { E } from '@endo/far';
import { makeNodeFilesystem } from '@endo/platform/fs/extended';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
import { makeGit } from '@endo/exo-git';
import { makeNativeGitBackend } from '@endo/git';
import { makeMount, lineageOf } from '@endo/daemon/src/mount.js';
import { makeFilePowers } from '@endo/daemon/src/daemon-node-powers.js';

const execFileAsync = nodePromisify(execFile);

/**
 * @param {unknown} readerRef
 * @returns {Promise<Uint8Array>}
 */
const collectBytes = async readerRef => {
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of iterateBytesReader(
    /** @type {any} */ (readerRef),
  )) {
    chunks.push(chunk);
    total += chunk.length;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
};

/**
 * Read an `@endo/platform/fs` File capability's content as UTF-8. This is the
 * `readText` the eval scorer is injected with.
 *
 * @param {unknown} file
 * @returns {Promise<string>}
 */
export const readText = async file => {
  const fileRef = /** @type {any} */ (file);
  const stat = await E(fileRef).getStat();
  const openFile = await E(fileRef).open({ read: true });
  try {
    const reader = await E(openFile).read(0n, stat.size ?? 0n);
    return new TextDecoder().decode(await collectBytes(reader));
  } finally {
    await E(openFile).close();
  }
};
harden(readText);

/**
 * Build the live `workspace` + `git` powers over an existing git worktree on
 * disk. Shared by every per-eval provisioning helper.
 *
 * @param {string} repoRoot
 * @returns {{ workspace: unknown, git: unknown }}
 */
export const makePowersOver = repoRoot => {
  const workspace = makeNodeFilesystem({ rootPath: repoRoot });
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: repoRoot, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot });
  const git = makeGit({ mount, backend, lineageOf });
  return harden({ workspace, git });
};
harden(makePowersOver);

/**
 * Bootstrap an empty git repository every eval shares: a fresh temp directory
 * (torn down with the test), `git init` on the named branch, gpg signing
 * disabled, and a committer identity configured. Returns the on-disk `repoRoot`
 * and a `run(args)` helper that shells `git` in it, so each per-eval fixture
 * adds only the commits and branches its scenario needs.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {object} [options]
 * @param {string} [options.branch] The initial branch name. Default `main`.
 * @param {string} [options.prefix] The temp-directory name prefix.
 * @returns {Promise<{
 *   repoRoot: string,
 *   run: (args: string[]) => Promise<{ stdout: string, stderr: string }>,
 * }>}
 */
export const initRepo = async (
  t,
  { branch = 'main', prefix = 'agentry-eval-git-' } = {},
) => {
  const repoRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  t.teardown(() => fs.promises.rm(repoRoot, { recursive: true, force: true }));
  const run = args => execFileAsync('git', args, { cwd: repoRoot });
  await run(['init', '-q', '-b', branch]);
  await run(['config', '--local', 'commit.gpgsign', 'false']);
  await run(['config', '--local', 'tag.gpgsign', 'false']);
  await run(['config', '--local', 'user.email', 'eval@example.invalid']);
  await run(['config', '--local', 'user.name', 'Eval']);
  return harden({ repoRoot, run });
};
harden(initRepo);
