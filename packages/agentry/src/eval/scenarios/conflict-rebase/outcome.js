// @ts-check
/// <reference types="ses"/>

/** @import { OutcomeReport, ReadText } from '../../types.js' */
/** @import { GitConflictRebaseTarget } from './types.js' */

import { E } from '@endo/eventual-send';

import { branchLog, check, readTrackedFileAt } from '../../outcome-kit.js';

/**
 * Check whether replayed commit summaries match their target sequence exactly.
 *
 * @param {string[]} actual
 * @param {string[]} expected
 * @returns {boolean}
 */
export const summariesMatch = (actual, expected) =>
  actual.length === expected.length &&
  actual.every((summary, index) => summary === expected[index]);
harden(summariesMatch);

/**
 * Score a conflict-rebase run by outcome assertion.
 * The scorer reads the final repository state through the git capability and
 * deliberately ignores the path the agent used to reach it.
 *
 * @param {object} args
 * @param {unknown} args.git A live `@endo/exo-git` Git capability.
 * @param {ReadText} args.readText Read a File capability's content as UTF-8.
 * @param {GitConflictRebaseTarget} args.expected
 * @returns {Promise<OutcomeReport>}
 */
export const assertGitConflictRebaseOutcome = async ({
  git,
  readText,
  expected,
}) => {
  const gitRef = /** @type {any} */ (git);
  /** @type {Array<{ name: string, ok: boolean, detail: string }>} */
  const checks = [];

  const featureLog = await branchLog({ git, ref: expected.featureBranch });
  let integrationTip;
  try {
    integrationTip = await E(gitRef).revParse(expected.integrationBranch);
  } catch (err) {
    checks.push(
      check(
        'integration-branch-tip',
        false,
        `${expected.integrationBranch} cannot be resolved: ${/** @type {Error} */ (err).message}`,
      ),
    );
  }
  const featureOids = featureLog.map(entry => entry.oid);

  const integrationTipPreserved =
    integrationTip?.oid === expected.integrationOid;
  if (integrationTip !== undefined) {
    checks.push(
      check(
        'integration-branch-tip',
        integrationTipPreserved,
        integrationTipPreserved
          ? `${expected.integrationBranch} still points at ${expected.integrationOid}`
          : `${expected.integrationBranch} points at ${integrationTip.oid} (expected ${expected.integrationOid})`,
      ),
    );
  }

  const integrationIsAncestor = featureOids.includes(expected.integrationOid);
  checks.push(
    check(
      'integration-is-ancestor',
      integrationIsAncestor,
      integrationIsAncestor
        ? `${expected.integrationBranch} tip ${expected.integrationOid} is an ancestor of ${expected.featureBranch}`
        : `${expected.integrationBranch} tip ${expected.integrationOid} is not in ${expected.featureBranch} history`,
    ),
  );

  const integrationIndex = featureOids.indexOf(expected.integrationOid);
  const replayedNewestFirst =
    integrationIndex >= 0 ? featureLog.slice(0, integrationIndex) : featureLog;
  const replayed = [...replayedNewestFirst].reverse();

  const replayedSummaries = replayed.map(entry => entry.summary);
  const replayedSummariesMatch = summariesMatch(
    replayedSummaries,
    expected.replayedSummaries,
  );
  checks.push(
    check(
      'replayed-summaries',
      replayedSummariesMatch,
      `replayed summaries ${JSON.stringify(
        replayedSummaries,
      )} (expected ${JSON.stringify(expected.replayedSummaries)})`,
    ),
  );

  const original = new Set(expected.originalFeatureOids);
  const reused = replayed.filter(entry => original.has(entry.oid));
  const rewritten =
    replayed.length === expected.originalFeatureOids.length &&
    reused.length === 0;
  checks.push(
    check(
      'replayed-rewritten',
      rewritten,
      rewritten
        ? `all ${replayed.length} replayed commit(s) carry fresh oids`
        : `replayed commit(s) ${JSON.stringify(
            reused.map(entry => entry.oid),
          )} reuse pre-rebase oids`,
    ),
  );

  let patchesMatch = false;
  if (replayed.length === expected.expectedPatches.length) {
    const replayedPatches = await Promise.all(
      replayed.map(entry =>
        E(gitRef).diff({ base: `${entry.oid}^`, head: entry.oid }),
      ),
    );
    patchesMatch = replayedPatches.every(
      (patch, index) => patch === expected.expectedPatches[index],
    );
  }
  checks.push(
    check(
      'replayed-patches',
      patchesMatch,
      patchesMatch
        ? `all ${replayed.length} replayed patch(es) match the expected sequence`
        : 'replayed patch sequence differs from the expected conflict resolution',
    ),
  );

  const featureTree = await E(gitRef).revParse(
    `${expected.featureBranch}^{tree}`,
  );
  const featureTreeMatches = featureTree.oid === expected.featureTreeOid;
  checks.push(
    check(
      'feature-tree-exact',
      featureTreeMatches,
      featureTreeMatches
        ? `${expected.featureBranch} tree matches ${expected.featureTreeOid}`
        : `${expected.featureBranch} tree is ${featureTree.oid} (expected ${expected.featureTreeOid})`,
    ),
  );

  const appText = await readTrackedFileAt({
    git,
    readText,
    ref: 'HEAD',
    path: 'app.txt',
  });
  checks.push(
    check(
      'app-text',
      appText === expected.appText,
      `app.txt content ${JSON.stringify(appText)} (expected ${JSON.stringify(
        expected.appText,
      )})`,
    ),
  );

  const noteTexts = await Promise.all(
    expected.notes.map(note =>
      readTrackedFileAt({
        git,
        readText,
        ref: 'HEAD',
        path: note.path,
      }),
    ),
  );
  expected.notes.forEach((note, index) => {
    const text = noteTexts[index];
    checks.push(
      check(
        `note-present:${note.path}`,
        text === note.content,
        `${note.path} content ${JSON.stringify(
          text,
        )} (expected ${JSON.stringify(note.content)})`,
      ),
    );
  });

  const rows = await E(gitRef).status();
  checks.push(
    check(
      'worktree-clean',
      rows.length === 0,
      rows.length === 0
        ? 'working tree and index have no pending status rows'
        : `${rows.length} pending status row(s) remain`,
    ),
  );

  const current = await E(gitRef).currentBranch();
  const onFeature =
    current !== undefined && current.name === expected.featureBranch;
  checks.push(
    check(
      'rebase-complete-on-feature-branch',
      onFeature,
      onFeature
        ? `current branch resolved to ${expected.featureBranch}`
        : `current branch is ${JSON.stringify(
            current?.name,
          )}; a rebase in progress detaches HEAD`,
    ),
  );
  const pass = checks.every(entry => entry.ok);
  return harden({ pass, checks });
};
harden(assertGitConflictRebaseOutcome);
