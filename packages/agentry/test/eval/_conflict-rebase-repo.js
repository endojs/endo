// @ts-check

// Per-eval repository fixture for the conflict-rebase scenario.
// It builds a real repository whose feature branch conflicts on app.txt when
// rebased onto integration, then precomputes the exact successful replay by
// running that rebase once with the intended resolution and resetting back.

import fs from 'node:fs';
import path from 'node:path';

import { E } from '@endo/eventual-send';

import { initRepo, makePowersOver } from '../_eval-fixture.js';

export const appBaseText = `\
Release notes paragraph.
`;
harden(appBaseText);

export const appFeatureText = `\
Release notes paragraph with feature wording.
Feature sentence from branch.
`;
harden(appFeatureText);

export const appIntegrationText = `\
Release notes paragraph with integration wording.
`;
harden(appIntegrationText);

export const appResolvedText = `\
Release notes paragraph with integration wording.
Feature sentence from branch.
`;
harden(appResolvedText);

export const featureNoteText = `\
Feature note survives the rebase.
`;
harden(featureNoteText);

export const integrationNoteText = `\
Integration note stays present after the replay.
`;
harden(integrationNoteText);

/**
 * Provision the conflict-rebase repository.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {object} [options]
 * @param {string} [options.mainBranch] Default `main`.
 * @param {string} [options.featureBranch] Default `feature/conflict-rebase`.
 * @param {string} [options.integrationBranch] Default `integration`.
 * @returns {Promise<{
 *   repoRoot: string,
 *   workspace: unknown,
 *   git: unknown,
 *   featureBranch: string,
 *   integrationBranch: string,
 *   integrationOid: string,
 *   replayedSummaries: string[],
 *   originalFeatureOids: string[],
 *   expectedPatches: string[],
 *   originalFeaturePatches: string[],
 *   featureTreeOid: string,
 *   appText: string,
 *   notes: Array<{ path: string, content: string }>,
 * }>}
 */
export const provisionConflictRebaseRepo = async (
  t,
  {
    mainBranch = 'main',
    featureBranch = 'feature/conflict-rebase',
    integrationBranch = 'integration',
  } = {},
) => {
  const { repoRoot, run } = await initRepo(t, {
    branch: mainBranch,
    prefix: 'agentry-eval-conflict-rebase-',
  });
  const revParse = async ref => (await run(['rev-parse', ref])).stdout.trim();
  const writeFile = (filePath, content) =>
    fs.promises.writeFile(path.join(repoRoot, filePath), content);
  const writeAndCommit = async (filePath, content, message) => {
    await writeFile(filePath, content);
    await run(['add', filePath]);
    await run(['commit', '-q', '-m', message]);
  };

  await writeAndCommit('app.txt', appBaseText, 'chore: initialize app text');
  const baseOid = await revParse(mainBranch);

  await run(['switch', '-q', '-c', featureBranch]);
  await writeAndCommit('app.txt', appFeatureText, 'feat: update app wording');
  await fs.promises.mkdir(path.join(repoRoot, 'notes'), { recursive: true });
  await writeAndCommit(
    'notes/feature.md',
    featureNoteText,
    'docs: add feature note',
  );
  const featureAppOid = await revParse(`${featureBranch}~1`);
  const featureNoteOid = await revParse(featureBranch);
  const originalFeatureOids = [featureAppOid, featureNoteOid];
  const { git: setupGit } = makePowersOver(repoRoot);
  const diffCommit = oid =>
    E(/** @type {any} */ (setupGit)).diff({ base: `${oid}^`, head: oid });
  const originalFeaturePatches = await Promise.all(
    originalFeatureOids.map(diffCommit),
  );

  await run(['switch', '-q', '-c', integrationBranch, baseOid]);
  await writeFile('app.txt', appIntegrationText);
  await fs.promises.mkdir(path.join(repoRoot, 'notes'), { recursive: true });
  await writeFile('notes/integration.md', integrationNoteText);
  await run(['add', 'app.txt', 'notes/integration.md']);
  await run(['commit', '-q', '-m', 'feat: integrate app wording']);
  const integrationOid = await revParse(integrationBranch);

  await run(['switch', '-q', featureBranch]);
  try {
    await run(['rebase', integrationBranch]);
  } catch (err) {
    const message = /** @type {Error} */ (err).message;
    if (!/conflict|could not apply|CONFLICT/i.test(message)) {
      throw err;
    }
  }
  await writeFile('app.txt', appResolvedText);
  await run(['add', 'app.txt']);
  await run(['-c', 'core.editor=true', 'rebase', '--continue']);

  const replayed = (
    await run([
      'rev-list',
      '--reverse',
      `${integrationBranch}..${featureBranch}`,
    ])
  ).stdout
    .trim()
    .split('\n')
    .filter(Boolean);
  const expectedPatches = await Promise.all(replayed.map(diffCommit));
  const featureTreeOid = await revParse(`${featureBranch}^{tree}`);

  await run(['reset', '--hard', featureNoteOid]);
  await run(['switch', '-q', featureBranch]);

  const { workspace, git } = makePowersOver(repoRoot, {
    allowHistoryRewrite: true,
  });
  return harden({
    repoRoot,
    workspace,
    git,
    featureBranch,
    integrationBranch,
    integrationOid,
    replayedSummaries: ['feat: update app wording', 'docs: add feature note'],
    originalFeatureOids,
    expectedPatches,
    originalFeaturePatches,
    featureTreeOid,
    appText: appResolvedText,
    notes: [
      { path: 'notes/feature.md', content: featureNoteText },
      { path: 'notes/integration.md', content: integrationNoteText },
    ],
  });
};
harden(provisionConflictRebaseRepo);
