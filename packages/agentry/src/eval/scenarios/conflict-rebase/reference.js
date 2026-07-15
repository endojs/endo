// @ts-check
/// <reference types="ses"/>

// This module holds the reference `execute` source for the conflict-rebase
// scenario, which a competent code-mode agent should converge on.
// Keep it beside the scenario so `makeConflictRebaseScenario`'s
// `referenceSourcePath` / `referenceSourceExport` fields can point here.
// The no-LLM test imports it to drive the scripted faux model, and a live run's
// `results.jsonl` row carries the same path/export pair so a downstream
// reporter can link a scenario's transcript to its reference solution.

/**
 * Build the reference `execute` source for the conflict-rebase scenario.
 * Stay on the feature branch, start the rebase onto `upstream`, and resolve
 * the `app.txt` conflict (or fall through when the rebase stopped without a
 * conflict) by writing `resolvedText`, staging the resolution, and continuing
 * the rebase.
 *
 * @param {string} featureBranch
 * @param {string} upstream
 * @param {string} resolvedText
 * @returns {string}
 */
export const conflictRebaseSource = (
  featureBranch,
  upstream,
  resolvedText,
) => `\
(async () => {
  const current = await E(git).currentBranch();
  if (current?.name !== ${JSON.stringify(featureBranch)}) {
    throw new Error('not on the feature branch');
  }
  try {
    await E(git).rebase({ mode: 'start', upstream: ${JSON.stringify(upstream)} });
    // Rebase succeeded without stopping for a conflict.
  } catch (err) {
    const rows = await E(git).status();
    const conflict = rows.find(
      row => row.path === 'app.txt' && row.worktree === 'conflicted',
    );
    if (conflict === undefined) {
      throw err;
    }
    // Rebase left app.txt conflicted; resolve that entry before continuing.
  }
  const root = await E(workspace).root();
  await E(root).write('app.txt', ${JSON.stringify(resolvedText)});
  const rows = await E(git).status();
  const app = rows.find(row => row.path === 'app.txt');
  if (app === undefined) {
    throw new Error('app.txt was not present in conflicted status');
  }
  await E(git).add([app.entry]);
  await E(git).rebase({ mode: 'continue' });
})()`;
harden(conflictRebaseSource);
