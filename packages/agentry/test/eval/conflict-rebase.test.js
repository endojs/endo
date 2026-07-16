// @ts-check

// The no-LLM assertion-path tests for the conflict-rebase scenario.
// They drive the real code-mode git-loop agent and scorer against a real
// repository, using a scripted faux model where a live test would use a
// provider.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify as nodePromisify } from 'node:util';

import test from '@endo/ses-ava/prepare-endo.js';
import {
  registerFauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai/compat';
import fc from 'fast-check';

import { makeConflictRebaseScenario } from '../../src/eval/scenarios/conflict-rebase/index.js';
import { runGitScenario } from '../../src/eval/index.js';
import {
  assertGitConflictRebaseOutcome,
  summariesMatch,
} from '../../src/eval/scenarios/conflict-rebase/outcome.js';
import { conflictRebaseSource } from '../../src/eval/scenarios/conflict-rebase/reference.js';
import { readText } from '../_eval-fixture.js';
import {
  appIntegrationText,
  appResolvedText,
  featureNoteText,
  provisionConflictRebaseRepo,
} from './_conflict-rebase-repo.js';

/** @import { Model } from '@earendil-works/pi-ai' */

const execFileAsync = nodePromisify(execFile);

/**
 * @param {import('ava').ExecutionContext} t
 * @param {import('@earendil-works/pi-ai').AssistantMessage[]} responses
 * @returns {Model<string>}
 */
const fauxModel = (t, responses) => {
  const registration = registerFauxProvider({
    provider: 'faux',
    models: [{ id: 'faux-model' }],
  });
  registration.setResponses(responses);
  t.teardown(() => registration.unregister());
  return registration.getModel();
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {string} source
 * @returns {Model<string>}
 */
const evaluateOnceModel = (t, source) =>
  fauxModel(t, [
    fauxAssistantMessage(fauxToolCall('evaluate', { source }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('done'),
  ]);

/**
 * @param {Awaited<ReturnType<typeof provisionConflictRebaseRepo>>} repo
 * @returns {ReturnType<typeof makeConflictRebaseScenario>}
 */
const makeScenarioFor = repo => makeConflictRebaseScenario(repo);

test('summary matching is exact for arbitrary summary sequences', t => {
  fc.assert(
    fc.property(
      fc.array(fc.string()),
      fc.array(fc.string()),
      (actual, expected) => {
        const expectedMatch =
          actual.length === expected.length &&
          actual.every((summary, index) => summary === expected[index]);
        t.is(summariesMatch(actual, expected), expectedMatch);
      },
    ),
  );
});

test('scenario retains only the declared conflict-rebase target', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);

  t.deepEqual(Object.keys(scenario.expected).sort(), [
    'appText',
    'expectedPatches',
    'featureBranch',
    'featureTreeOid',
    'integrationBranch',
    'integrationOid',
    'notes',
    'originalFeatureOids',
    'replayedSummaries',
  ]);
  t.false('git' in scenario.expected);
  t.false('workspace' in scenario.expected);
  t.false('repoRoot' in scenario.expected);
});

/**
 * @param {string} repoRoot
 * @returns {(args: string[]) => Promise<{ stdout: string, stderr: string }>}
 */
const gitRunner = repoRoot => args =>
  execFileAsync('git', args, { cwd: repoRoot });

test('fixture captures the conflict resolution patch and clean replay patch', async t => {
  const repo = await provisionConflictRebaseRepo(t);

  t.not(repo.expectedPatches[0], repo.originalFeaturePatches[0]);
  t.is(repo.expectedPatches[1], repo.originalFeaturePatches[1]);
});

test('outcome assertion passes when scripted run resolves and continues the rebase', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const model = evaluateOnceModel(
    t,
    conflictRebaseSource(
      repo.featureBranch,
      repo.integrationBranch,
      appResolvedText,
    ),
  );

  const { outcome } = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.true(
    outcome.pass,
    `expected pass; checks: ${JSON.stringify(outcome.checks, null, 2)}`,
  );
  t.deepEqual(
    outcome.checks.map(c => [c.name, c.ok]),
    [
      ['integration-branch-tip', true],
      ['integration-is-ancestor', true],
      ['replayed-summaries', true],
      ['replayed-rewritten', true],
      ['replayed-patches', true],
      ['feature-tree-exact', true],
      ['app-text', true],
      ['note-present:notes/feature.md', true],
      ['note-present:notes/integration.md', true],
      ['worktree-clean', true],
      ['rebase-complete-on-feature-branch', true],
    ],
  );
});

test('successful outcome check ordering is stable for arbitrary reruns', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const expectedNames = [
    'integration-branch-tip',
    'integration-is-ancestor',
    'replayed-summaries',
    'replayed-rewritten',
    'replayed-patches',
    'feature-tree-exact',
    'app-text',
    'note-present:notes/feature.md',
    'note-present:notes/integration.md',
    'worktree-clean',
    'rebase-complete-on-feature-branch',
  ];
  await fc.assert(
    fc.asyncProperty(fc.constant(undefined), async () => {
      const outcome = await scenario.assertOutcome({
        git: repo.git,
        workspace: repo.workspace,
        readText,
      });
      t.deepEqual(
        outcome.checks.map(({ name }) => name),
        expectedNames,
      );
    }),
  );
});

test('outcome assertion rejects an integration branch moved after a correct rebase', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const model = evaluateOnceModel(
    t,
    conflictRebaseSource(
      repo.featureBranch,
      repo.integrationBranch,
      appResolvedText,
    ),
  );

  const completed = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });
  t.true(completed.outcome.pass);

  const run = gitRunner(repo.repoRoot);
  await run(['switch', '-q', repo.integrationBranch]);
  await fs.promises.writeFile(
    path.join(repo.repoRoot, 'integration-after-rebase.txt'),
    'Integration moved after the rebase.\n',
  );
  await run(['add', 'integration-after-rebase.txt']);
  await run(['commit', '-q', '-m', 'test: move integration after rebase']);
  await run(['switch', '-q', repo.featureBranch]);

  const { outcome } = await runGitScenario({
    model: fauxModel(t, [fauxAssistantMessage('already rebased')]),
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.false(byName['integration-branch-tip']);
});

test('outcome assertion reports a deleted integration branch as a failed check', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const model = evaluateOnceModel(
    t,
    conflictRebaseSource(
      repo.featureBranch,
      repo.integrationBranch,
      appResolvedText,
    ),
  );

  await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });
  await gitRunner(repo.repoRoot)(['branch', '-D', repo.integrationBranch]);

  const outcome = await scenario.assertOutcome({
    git: repo.git,
    workspace: repo.workspace,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.false(byName['integration-branch-tip']);
});

test('empty target collections do not mask replay mismatches', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const outcome = await assertGitConflictRebaseOutcome({
    git: repo.git,
    readText,
    expected: {
      ...repo,
      replayedSummaries: [],
      originalFeatureOids: [],
      notes: [],
    },
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.false(byName['replayed-summaries']);
  t.false(byName['replayed-rewritten']);
});

test('outcome assertion fails when the run never rebases', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const model = fauxModel(t, [
    fauxAssistantMessage('I will not touch the repository.'),
  ]);

  const { outcome } = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.false(byName['integration-is-ancestor']);
  t.false(byName['replayed-rewritten']);
  t.true(byName['worktree-clean']);
  t.true(byName['rebase-complete-on-feature-branch']);
});

test('outcome assertion fails when app.txt keeps the wrong resolution', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const model = evaluateOnceModel(
    t,
    conflictRebaseSource(
      repo.featureBranch,
      repo.integrationBranch,
      appIntegrationText,
    ),
  );

  const { outcome } = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.true(byName['integration-is-ancestor']);
  t.false(byName['replayed-patches']);
  t.false(byName['feature-tree-exact']);
  t.false(byName['app-text']);
});

test('outcome assertion fails when the feature note commit is dropped', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const run = gitRunner(repo.repoRoot);
  await run(['switch', '-q', repo.integrationBranch]);
  await run(['switch', '-q', '-C', repo.featureBranch]);
  await fs.promises.writeFile(
    path.join(repo.repoRoot, 'app.txt'),
    appResolvedText,
  );
  await run(['add', 'app.txt']);
  await run(['commit', '-q', '-m', 'feat: update app wording']);
  const model = fauxModel(t, [fauxAssistantMessage('already in wrong state')]);

  const { outcome } = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.true(byName['integration-is-ancestor']);
  t.false(byName['replayed-summaries']);
  t.false(byName['note-present:notes/feature.md']);
});

test('outcome assertion fails when replayed commits are out of order', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const run = gitRunner(repo.repoRoot);
  await run(['switch', '-q', repo.integrationBranch]);
  await run(['switch', '-q', '-C', repo.featureBranch]);
  await fs.promises.writeFile(
    path.join(repo.repoRoot, 'notes/feature.md'),
    featureNoteText,
  );
  await run(['add', 'notes/feature.md']);
  await run(['commit', '-q', '-m', 'docs: add feature note']);
  await fs.promises.writeFile(
    path.join(repo.repoRoot, 'app.txt'),
    appResolvedText,
  );
  await run(['add', 'app.txt']);
  await run(['commit', '-q', '-m', 'feat: update app wording']);
  const model = fauxModel(t, [fauxAssistantMessage('already in wrong state')]);

  const { outcome } = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.true(byName['integration-is-ancestor']);
  t.false(byName['replayed-summaries']);
  t.false(byName['replayed-patches']);
});

test('outcome assertion fails when conflicted worktree is left mid-rebase', async t => {
  const repo = await provisionConflictRebaseRepo(t);
  const scenario = makeScenarioFor(repo);
  const run = gitRunner(repo.repoRoot);
  try {
    await run(['rebase', repo.integrationBranch]);
  } catch (err) {
    const { stdout } = await run(['status', '--porcelain']);
    if (!stdout.includes('UU app.txt')) {
      throw err;
    }
  }
  const model = fauxModel(t, [fauxAssistantMessage('already conflicted')]);

  const { outcome } = await runGitScenario({
    model,
    workspace: repo.workspace,
    git: repo.git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.false(byName['worktree-clean']);
  t.false(byName['rebase-complete-on-feature-branch']);
});
