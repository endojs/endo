// @ts-check

// The no-LLM assertion-path test for the git code-mode eval. It runs the real
// code-mode git-loop agent and the real outcome scorer against a real git
// repository, with the only non-live piece being a scripted faux pi-ai provider
// standing in for the model. It needs zero credentials and no network, so it
// runs anywhere — the live-model counterpart (same scenario, same scorer) runs
// only on a host where the `ENDO_LLM_*` / `LAL_*` credentials are present.

import test from '@endo/ses-ava/prepare-endo.js';
import {
  registerFauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from '@earendil-works/pi-ai';

import {
  makeRunMetricsRecorder,
  makeStageAndCommitScenario,
  runGitScenario,
} from '../../src/eval/index.js';
import { readText } from '../_eval-fixture.js';
import { provisionStageAndCommitRepo } from './_stage-and-commit-repo.js';

/** @import { AssistantMessage, Model, Usage } from '@earendil-works/pi-ai' */

/**
 * @typedef {Omit<Partial<Usage>, 'cost'> & {
 *   reasoning?: number,
 *   cost?: Partial<Usage['cost']>,
 * }} PartialUsage
 */

/**
 * @param {PartialUsage} fields
 * @returns {Usage & { reasoning?: number }}
 */
const usage = fields => ({
  input: fields.input ?? 0,
  output: fields.output ?? 0,
  cacheRead: fields.cacheRead ?? 0,
  cacheWrite: fields.cacheWrite ?? 0,
  reasoning: fields.reasoning ?? 0,
  totalTokens: fields.totalTokens ?? 0,
  cost: {
    input: fields.cost?.input ?? 0,
    output: fields.cost?.output ?? 0,
    cacheRead: fields.cost?.cacheRead ?? 0,
    cacheWrite: fields.cost?.cacheWrite ?? 0,
    total: fields.cost?.total ?? 0,
  },
});

/**
 * @param {Usage & { reasoning?: number }} messageUsage
 * @returns {AssistantMessage}
 */
const assistantMessageWithUsage = messageUsage => ({
  role: 'assistant',
  content: [],
  api: 'faux',
  provider: 'faux',
  model: 'faux-model',
  usage: messageUsage,
  stopReason: 'stop',
  timestamp: 0,
});

/**
 * Register a per-test faux pi-ai provider seeded with `responses` and return
 * the faux `Model`. The registration is torn down with the test.
 *
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
 * Source the faux model "writes" into a single execute call: find the target
 * path's status row, stage it, and commit with `message`. This is the reference
 * solution a competent code-mode agent would converge on; the live eval scores
 * a real model against the same outcome.
 *
 * @param {string} filePath
 * @param {string} message
 * @returns {string}
 */
const stageAndCommitSource = (filePath, message) => `\
(async () => {
  const rows = await E(git).status();
  const row = rows.find(candidate => candidate.path === ${JSON.stringify(filePath)});
  if (row === undefined) {
    throw new Error('target path not found in git status');
  }
  await E(git).add([row.entry]);
  const commit = await E(git).commit(${JSON.stringify(message)});
  return commit.summary;
})()`;

/**
 * A faux-model source that overwrites the target path with the WRONG bytes
 * before staging and committing it with the RIGHT message. The working tree's
 * `wrongContent` replaces the fixture's correct content, so the commit lands the
 * right path under the right message but the committed content diverges from
 * `expected.content`. This discriminates the scorer's `file-content` check from
 * `file-tracked-at-head`: they no longer share a truth value.
 *
 * @param {string} filePath
 * @param {string} wrongContent
 * @param {string} message
 * @returns {string}
 */
const stageWrongContentAndCommitSource = (filePath, wrongContent, message) => `\
(async () => {
  const root = await E(workspace).root();
  await E(root).write(${JSON.stringify(filePath)}, ${JSON.stringify(
    wrongContent,
  )});
  const rows = await E(git).status();
  const row = rows.find(candidate => candidate.path === ${JSON.stringify(
    filePath,
  )});
  if (row === undefined) {
    throw new Error('target path not found in git status');
  }
  await E(git).add([row.entry]);
  const commit = await E(git).commit(${JSON.stringify(message)});
  return commit.summary;
})()`;

/**
 * @param {import('ava').ExecutionContext} t
 * @param {string} source
 * @returns {Model<string>}
 */
const executeOnceModel = (t, source) =>
  fauxModel(t, [
    fauxAssistantMessage(fauxToolCall('execute', { source }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('done'),
  ]);

test('run metrics recorder sums assistant usage and tool errors', t => {
  const recorder = makeRunMetricsRecorder();
  const first = assistantMessageWithUsage(
    usage({
      input: 11,
      output: 13,
      cacheRead: 17,
      cacheWrite: 19,
      reasoning: 29,
      totalTokens: 60,
      cost: { total: 23 },
    }),
  );
  const second = assistantMessageWithUsage(
    usage({
      input: 2,
      output: 3,
      cacheRead: 5,
      cacheWrite: 7,
      reasoning: 11,
      totalTokens: 17,
      cost: { total: 4 },
    }),
  );

  recorder.listener({ type: 'agent_start' });
  recorder.listener({ type: 'message_end', message: first });
  recorder.listener({ type: 'message_end', message: second });
  recorder.listener({ type: 'turn_end', message: first, toolResults: [] });
  recorder.listener({ type: 'turn_end', message: second, toolResults: [] });
  recorder.listener({
    type: 'tool_execution_end',
    toolCallId: 'call-1',
    toolName: 'execute',
    result: {},
    isError: false,
  });
  recorder.listener({
    type: 'tool_execution_end',
    toolCallId: 'call-2',
    toolName: 'execute',
    result: {},
    isError: true,
  });
  recorder.listener({ type: 'agent_end', messages: [first, second] });

  const metrics = recorder.snapshot();
  t.deepEqual(metrics.usage, {
    input: 13,
    output: 16,
    cacheRead: 22,
    cacheWrite: 26,
    reasoning: 40,
    totalTokens: 77,
    cost: { total: 27 },
  });
  t.is(metrics.turns, 2);
  t.is(metrics.assistantMessages, 2);
  t.is(metrics.toolExecutions, 2);
  t.is(metrics.toolExecutionErrors, 1);
  t.true(metrics.wallTimeMs >= 0);
});

test('outcome assertion passes when the scripted run reaches the target end-state', async t => {
  const scenario = makeStageAndCommitScenario();
  const { workspace, git } = await provisionStageAndCommitRepo(t, {
    path: scenario.expected.path,
    content: scenario.expected.content,
  });
  const model = executeOnceModel(
    t,
    stageAndCommitSource(scenario.expected.path, scenario.expected.message),
  );

  const { outcome, metrics } = await runGitScenario({
    model,
    workspace,
    git,
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
      ['commit-exists', true],
      ['commit-message', true],
      ['file-tracked-at-head', true],
      ['file-content', true],
      ['worktree-clean', true],
    ],
  );
  t.is(metrics.turns, 2);
  t.is(metrics.assistantMessages, 2);
  t.is(metrics.toolExecutions, 1);
  t.is(metrics.toolExecutionErrors, 0);
  t.true(metrics.usage.input > 0);
  t.true(metrics.usage.output > 0);
  t.is(
    metrics.usage.totalTokens,
    metrics.usage.input +
      metrics.usage.output +
      metrics.usage.cacheRead +
      metrics.usage.cacheWrite,
  );
  t.true(metrics.wallTimeMs >= 0);
});

test('outcome assertion fails the commit-message check when the wrong message is used', async t => {
  const scenario = makeStageAndCommitScenario();
  const { workspace, git } = await provisionStageAndCommitRepo(t, {
    path: scenario.expected.path,
    content: scenario.expected.content,
  });
  // The run stages and commits the right file with the WRONG message.
  const model = executeOnceModel(
    t,
    stageAndCommitSource(scenario.expected.path, 'chore: wrong message'),
  );

  const { outcome } = await runGitScenario({
    model,
    workspace,
    git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  // The file is tracked with the right content, but the message is wrong, so
  // only the message check fails — outcome assertion is precise about why.
  t.false(byName['commit-message']);
  t.true(byName['file-tracked-at-head']);
  t.true(byName['file-content']);
  t.true(byName['worktree-clean']);
});

test('outcome assertion fails the file-content check when the wrong content is committed', async t => {
  const scenario = makeStageAndCommitScenario();
  const { workspace, git } = await provisionStageAndCommitRepo(t, {
    path: scenario.expected.path,
    content: scenario.expected.content,
  });
  // The run overwrites the target path with the WRONG bytes, then stages and
  // commits it under the RIGHT path with the RIGHT message. This isolates the
  // `file-content` check: the file is tracked at HEAD and the message matches,
  // but the committed content differs from the target.
  const wrongContent = `${scenario.expected.content}DIVERGED\n`;
  const model = executeOnceModel(
    t,
    stageWrongContentAndCommitSource(
      scenario.expected.path,
      wrongContent,
      scenario.expected.message,
    ),
  );

  const { outcome } = await runGitScenario({
    model,
    workspace,
    git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  // The file is tracked under the right message, but the committed content is
  // wrong, so only the content check fails — outcome assertion is precise about
  // why, and the `file-content` comparison is exercised in its discriminating
  // direction (true `file-tracked-at-head`, false `file-content`).
  t.false(byName['file-content']);
  t.true(byName['file-tracked-at-head']);
  t.true(byName['commit-message']);
  t.true(byName['worktree-clean']);
});

test('outcome assertion fails when the agent never commits the file', async t => {
  const scenario = makeStageAndCommitScenario();
  const { workspace, git } = await provisionStageAndCommitRepo(t, {
    path: scenario.expected.path,
    content: scenario.expected.content,
  });
  // The model answers in prose without ever calling execute: the working tree
  // is untouched, so the target file stays untracked.
  const model = fauxModel(t, [
    fauxAssistantMessage('I will not touch the repo.'),
  ]);

  const { outcome } = await runGitScenario({
    model,
    workspace,
    git,
    scenario,
    readText,
  });

  t.false(outcome.pass);
  const byName = Object.fromEntries(outcome.checks.map(c => [c.name, c.ok]));
  t.false(byName['file-tracked-at-head']);
  t.false(byName['file-content']);
  t.false(byName['worktree-clean']);
  // The pre-existing initial commit is still there, so a commit "exists" — but
  // it is not the scenario's commit, so the message check fails.
  t.true(byName['commit-exists']);
  t.false(byName['commit-message']);
});
