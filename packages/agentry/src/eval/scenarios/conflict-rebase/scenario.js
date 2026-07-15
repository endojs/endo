// @ts-check
/// <reference types="ses"/>

/** @import { GitScenario } from '../../types.js' */
/** @import { GitConflictRebaseTarget } from './types.js' */

import { assertGitConflictRebaseOutcome } from './outcome.js';

export const conflictRebasePrompt = `\
Rebase the current feature branch onto integration.
When app.txt conflicts, keep the integration wording, then add the feature
sentence after it.
Preserve the feature note and the integration note.
Leave the branch rebased, with a clean working tree.`;
harden(conflictRebasePrompt);

/** Repo-relative path to this scenario's reference solution. */
const referenceSourcePath =
  'packages/agentry/src/eval/scenarios/conflict-rebase/reference.js';
/** Named export in {@link referenceSourcePath} holding the reference solution. */
const referenceSourceExport = 'conflictRebaseSource';

/**
 * A git code-mode scenario for a rebase that must stop for a content conflict,
 * resolve it deliberately, then continue replaying the remaining clean commit.
 *
 * @param {GitConflictRebaseTarget} expected
 * @returns {GitScenario<GitConflictRebaseTarget>}
 */
export const makeConflictRebaseScenario = ({
  featureBranch,
  integrationBranch,
  integrationOid,
  replayedSummaries,
  originalFeatureOids,
  expectedPatches,
  featureTreeOid,
  appText,
  notes,
}) => {
  const expected = harden({
    featureBranch,
    integrationBranch,
    integrationOid,
    replayedSummaries,
    originalFeatureOids,
    expectedPatches,
    featureTreeOid,
    appText,
    notes,
  });
  return harden({
    name: 'conflict-rebase',
    expected,
    prompt: conflictRebasePrompt,
    referenceSourcePath,
    referenceSourceExport,
    assertOutcome: ({ git, readText }) =>
      assertGitConflictRebaseOutcome({ git, readText, expected }),
  });
};
harden(makeConflictRebaseScenario);
