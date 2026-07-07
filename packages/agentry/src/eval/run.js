// @ts-check
/// <reference types="ses"/>

/** @import { RunGitScenarioOptions, RunGitScenarioResult } from './types.js' */

import { makeCodeModeGitLoopAgent } from '../execute/preset.js';

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
 * scenario's `OutcomeReport` (did the repository reach the target end-state),
 * not a transcript score. Capturing the run's events for debugging is a
 * separate, optional concern and is not the gate.
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
  await agent.prompt(scenario.prompt);
  await agent.waitForIdle();

  const outcome = await scenario.assertOutcome({ git, workspace, readText });
  return harden({ outcome });
};
harden(runGitScenario);
