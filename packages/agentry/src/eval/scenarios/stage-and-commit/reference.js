// @ts-check
/// <reference types="ses"/>

// This module holds the reference `evaluate` source for the stage-and-commit
// scenario, which a competent code-mode agent should converge on.
// Keep it beside the scenario so `makeStageAndCommitScenario`'s
// `referenceSourcePath` / `referenceSourceExport` fields can point here.
// The no-LLM test imports it to drive the scripted faux model, and a live run's
// `results.jsonl` row carries the same path/export pair so a downstream
// reporter can link a scenario's transcript to its reference solution.

/**
 * Build the reference `evaluate` source for the stage-and-commit scenario.
 * Find the target path's status row, stage it, and commit with `message`.
 *
 * @param {string} filePath
 * @param {string} message
 * @returns {string}
 */
export const stageAndCommitSource = (filePath, message) => `\
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
harden(stageAndCommitSource);
