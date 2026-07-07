// @ts-check
/// <reference types="ses"/>

/** @import { GitCommitTarget, OutcomeReport, ReadText } from '../../types.js' */

import { E } from '@endo/eventual-send';

import { check, readTrackedFileAt } from '../../outcome-kit.js';

/**
 * Score a git code-mode run by **outcome assertion**: read the repository's
 * actual end-state through the live `git` capability and confirm it reached the
 * target. This deliberately ignores how the agent got there — the agent ran
 * `E(git).x()` / `E(workspace).x()` inside an opaque `execute` block, so there
 * is no per-git-op tool-call trace to score, and an alternate-but-correct call
 * sequence (different staging order, an extra status read) must still pass.
 *
 * The three checks mirror the minimal-success bar: a commit exists carrying the
 * target message, the target file is tracked at HEAD with the exact content,
 * and the working tree is clean for that path (the change was committed, not
 * merely written).
 *
 * Reading the committed bytes needs an `@endo/exo-stream`-style byte reader,
 * which is injected as `readText` rather than imported here so this scorer
 * stays free of a stream dependency and runs anywhere the caller can supply a
 * reader.
 *
 * @param {object} args
 * @param {unknown} args.git A live `@endo/exo-git` Git capability.
 * @param {ReadText} args.readText Read a File capability's content as UTF-8.
 * @param {GitCommitTarget} args.expected
 * @returns {Promise<OutcomeReport>}
 */
export const assertGitCommitOutcome = async ({ git, readText, expected }) => {
  const gitRef = /** @type {any} */ (git);
  /** @type {Array<{ name: string, ok: boolean, detail: string }>} */
  const checks = [];

  // 1. A commit exists at HEAD carrying the target message.
  const recent = await E(gitRef).log({ maxCount: 1 });
  const head = recent[0];
  checks.push(
    check(
      'commit-exists',
      head !== undefined,
      head !== undefined
        ? `HEAD is ${head.oid}`
        : 'no commit found at HEAD (log is empty)',
    ),
  );
  checks.push(
    check(
      'commit-message',
      head !== undefined && head.summary === expected.message,
      `HEAD summary ${JSON.stringify(head?.summary)} (expected ${JSON.stringify(
        expected.message,
      )})`,
    ),
  );

  // 2. The target file is tracked at HEAD with the exact content. Read it out
  // of the committed tree (`filesystemAt('HEAD')`), not the working tree, so a
  // file written-but-not-committed does not pass the content check.
  const committedText = await readTrackedFileAt({
    git,
    readText,
    ref: 'HEAD',
    path: expected.path,
  });
  const tracked = committedText !== undefined;
  checks.push(
    check(
      'file-tracked-at-head',
      tracked,
      tracked
        ? `${expected.path} is present in the HEAD tree`
        : `${expected.path} is not tracked at HEAD`,
    ),
  );
  checks.push(
    check(
      'file-content',
      committedText === expected.content,
      `committed content ${JSON.stringify(
        committedText,
      )} (expected ${JSON.stringify(expected.content)})`,
    ),
  );

  // 3. The working tree is clean for the target path: the scenario asked for a
  // commit, so the file must no longer show as untracked or modified.
  const rows = await E(gitRef).status();
  const lingering = rows.find(
    /** @param {{ path: string }} row */ row => row.path === expected.path,
  );
  checks.push(
    check(
      'worktree-clean',
      lingering === undefined,
      lingering === undefined
        ? `${expected.path} has no pending status row`
        : `${expected.path} still shows index=${lingering.index} worktree=${lingering.worktree}`,
    ),
  );

  const pass = checks.every(entry => entry.ok);
  return harden({ pass, checks });
};
harden(assertGitCommitOutcome);
