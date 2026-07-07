// @ts-check
/// <reference types="ses"/>

/** @import { RunGitScenarioOptions, RunGitScenarioResult } from './types.js' */

import { makeCodeModeGitLoopAgent } from '../execute/preset.js';
import { makeRunMetricsRecorder } from './metrics.js';

/**
 * Run one git code-mode scenario end to end and score it by outcome assertion.
 *
 * The agent is the real code-mode git-loop preset: its sole tool is `execute`,
 * which evaluates JavaScript against the live `workspace` and `git` powers in a
 * Compartment. Only the model varies between a no-LLM run (a scripted faux
 * model) and a live run (a credentialed provider) — the agent, the powers, and
 * the scorer are identical, so the no-LLM path exercises the same machinery the
 * live path does.
 *
 * Scoring is outcome assertion, never trace-edit-distance: this returns the
 * scenario's `OutcomeReport` (did the repository reach the target end-state)
 * plus diagnostic run metrics. Metrics are recorded, but are not the gate.
 *
 * @param {RunGitScenarioOptions} options
 * @returns {Promise<RunGitScenarioResult>}
 */
export const runGitScenario = async ({
  model,
  workspace,
  git,
  scenario,
  readText,
  getApiKey,
  thinkingLevel,
  streamFn,
}) => {
  const agent = makeCodeModeGitLoopAgent({
    model,
    workspace,
    git,
    getApiKey,
    thinkingLevel,
    streamFn,
  });

  // `agent` is a local pi-agent-core instance (not a remotable), so drive it
  // directly rather than through eventual-send, matching the code-mode tests.
  const metricsRecorder = makeRunMetricsRecorder();
  const unsubscribeMetrics = agent.subscribe(metricsRecorder.listener);
  await null; // safe-await-separator
  try {
    await agent.prompt(scenario.prompt);
    await agent.waitForIdle();
  } finally {
    unsubscribeMetrics();
  }

  const outcome = await scenario.assertOutcome({ git, workspace, readText });
  return harden({ outcome, metrics: metricsRecorder.snapshot() });
};
harden(runGitScenario);
