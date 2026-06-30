// @ts-check

// The per-eval repository fixture for the stage-and-commit scenario. Named with
// a leading underscore so ava's `test/**/*.test.*` glob does not pick it up as
// a test file. It builds on the shared bootstrap in `../_eval-fixture.js` and
// adds only the commits and untracked file this scenario's repository needs.

import fs from 'node:fs';
import path from 'node:path';

import { initRepo, makePowersOver } from '../_eval-fixture.js';

/**
 * Provision a real git repository for the stage-and-commit scenario: an initial
 * commit (so HEAD exists), then the scenario's target file written into the
 * working tree **untracked**. Returns the live `workspace` Filesystem and `git`
 * capability over that worktree, plus the on-disk `repoRoot` for any out-of-band
 * ground-truth checks the test wants to make.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {object} options
 * @param {string} options.path Repository-relative path of the untracked file.
 * @param {string} options.content Its content.
 * @returns {Promise<{ repoRoot: string, workspace: unknown, git: unknown }>}
 */
export const provisionStageAndCommitRepo = async (
  t,
  { path: filePath, content },
) => {
  const { repoRoot, run } = await initRepo(t, { branch: 'main' });
  // An initial commit so the repository has a HEAD before the scenario runs.
  await fs.promises.writeFile(path.join(repoRoot, '.keep'), '');
  await run(['add', '.keep']);
  await run(['commit', '-q', '-m', 'chore: initialize repository']);
  // The scenario's target file, present in the working tree but untracked.
  await fs.promises.writeFile(path.join(repoRoot, filePath), content);

  const { workspace, git } = makePowersOver(repoRoot);
  return harden({ repoRoot, workspace, git });
};
harden(provisionStageAndCommitRepo);
