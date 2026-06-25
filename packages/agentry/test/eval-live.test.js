// @ts-check

// The live-model git code-mode eval: the SAME scenarios and SAME outcome scorers
// as the no-LLM tests, but driven by a real provider. It is gated on the
// `ENDO_LLM_*` / `LAL_*` environment credentials: when they are absent every row
// skips rather than failing. To run it, set `ENDO_LLM_HOST` / `ENDO_LLM_MODEL`
// / `ENDO_LLM_AUTH_TOKEN` (or their `LAL_*` aliases) to point at an
// OpenAI-compatible endpoint, then:
//
//   yarn workspace @endo/agentry test
//
// Pass = the repository reached the target end-state (outcome assertion), not a
// transcript score. A failure here is an eval signal about the model, not a
// harness bug; the no-LLM tests are what prove the harness.
//
// The test is table-driven over a registry of eval rows, one per scenario, so
// the credential-gating logic lives in one place and adding an eval adds one
// row rather than one more gated file.

/* global globalThis */

import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeStageAndCommitScenario,
  runGitScenario,
  resolveEvalModelFromEnv,
} from '../src/eval/index.js';
import { readText } from './_eval-fixture.js';
import { provisionStageAndCommitRepo } from './eval/_stage-and-commit-repo.js';

/**
 * @typedef {object} EvalRow One live-eval scenario.
 * @property {string} title The test title for this row.
 * @property {(t: import('ava').ExecutionContext) => Promise<{ repoRoot: string, workspace: unknown, git: unknown }>} provisionRepo
 *   Provision the scenario's repository and return its powers.
 * @property {(repo: any) => import('../src/eval/types.js').GitScenario} makeScenario
 *   Build the scenario from the provisioned repository.
 */

/**
 * The registered scenarios. Each eval folder contributes one row; the live test
 * iterates them all under the single credential gate.
 *
 * @type {EvalRow[]}
 */
const evalRows = [
  {
    title: 'a live model stages and commits the file (outcome assertion)',
    provisionRepo: t => {
      const scenario = makeStageAndCommitScenario();
      return provisionStageAndCommitRepo(t, {
        path: scenario.expected.path,
        content: scenario.expected.content,
      });
    },
    makeScenario: () => makeStageAndCommitScenario(),
  },
];

const env =
  /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (
    globalThis
  ).process?.env || {};
const live = resolveEvalModelFromEnv(env);
const liveTest = live ? test : test.skip;

for (const row of evalRows) {
  liveTest(row.title, async t => {
    // `live` is defined here (otherwise this test was skipped at registration).
    const { model, getApiKey } = /** @type {NonNullable<typeof live>} */ (live);
    const repo = await row.provisionRepo(t);
    const scenario = row.makeScenario(repo);

    const { outcome } = await runGitScenario({
      model,
      workspace: repo.workspace,
      git: repo.git,
      scenario,
      readText,
      getApiKey,
    });

    t.true(
      outcome.pass,
      `live run did not reach target end-state in ${repo.repoRoot}; checks: ${JSON.stringify(
        outcome.checks,
        null,
        2,
      )}`,
    );
  });
}
