// @ts-check
/// <reference types="ses"/>

/** @import { GitScenario } from '../../types.js' */
/** @import { GitCommitTarget } from './types.js' */

import { assertGitCommitOutcome } from './outcome.js';

/** Repo-relative path to this scenario's reference solution. */
const referenceSourcePath =
  'packages/agentry/src/eval/scenarios/stage-and-commit/reference.js';
/** Named export in {@link referenceSourcePath} holding the reference solution. */
const referenceSourceExport = 'stageAndCommitSource';

/**
 * The minimal-success git code-mode scenario: an untracked file already exists
 * in the working tree; the agent must stage it and commit it with a given
 * message. Scoring is pure outcome assertion (see {@link assertGitCommitOutcome}):
 * the commit exists with the message, the file is tracked at HEAD with the
 * exact content, and the working tree is clean.
 *
 * The scenario is model-agnostic. The caller provisions a repository whose
 * working tree already holds `path` with `content` untracked (see the test
 * fixture), then drives this scenario with whichever model is under eval.
 *
 * @param {object} [options]
 * @param {string} [options.path] Repository-relative path. Default `README.md`.
 * @param {string} [options.content] The untracked file's content. Default a
 *   one-line README.
 * @param {string} [options.message] The commit message the agent must use.
 * @returns {GitScenario<GitCommitTarget>}
 */
export const makeStageAndCommitScenario = ({
  path = 'README.md',
  content = '# endo-but-for-bots\n\nA repository for bots.\n',
  message = 'docs: add README',
} = {}) => {
  const expected = harden({ path, content, message });
  return harden({
    name: 'stage-and-commit',
    expected,
    prompt: `The file ${path} already exists in the working tree but git is not yet tracking it. Stage ${path} and commit it. Use exactly this commit message: ${message}`,
    referenceSourcePath,
    referenceSourceExport,
    assertOutcome: ({ git, readText }) =>
      assertGitCommitOutcome({ git, readText, expected }),
  });
};
harden(makeStageAndCommitScenario);
