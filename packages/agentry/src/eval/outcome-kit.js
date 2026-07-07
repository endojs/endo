// @ts-check
/// <reference types="ses"/>

/** @import { OutcomeCheck, ReadText } from './types.js' */

import { E } from '@endo/eventual-send';

/**
 * One outcome check: a named pass/fail with a human-readable detail string.
 * Shared by every eval's outcome assertion.
 *
 * @param {string} name
 * @param {boolean} ok
 * @param {string} detail
 * @returns {OutcomeCheck}
 */
export const check = (name, ok, detail) => harden({ name, ok, detail });
harden(check);

/**
 * Read the UTF-8 content of a tracked file at a git ref, or `undefined` when the
 * path is not tracked at that ref. Reads out of the committed tree
 * (`filesystemAt(ref)`), never the working tree, so a file written-but-not-
 * committed does not pass a content check.
 *
 * The endo fs `lookup` raises an `ENOENT`-tagged error when the path is absent
 * from the tree; that genuine "path not tracked" case returns `undefined`. Any
 * other failure (a backend fault, a broken capability, an unexpected error
 * shape) is infrastructure, not a model miss, and is rethrown so it surfaces
 * loudly rather than masquerading as a clean "file not committed".
 *
 * The byte reader is injected as `readText` so this kit carries no stream
 * dependency.
 *
 * @param {object} args
 * @param {unknown} args.git A live `@endo/exo-git` Git capability.
 * @param {ReadText} args.readText Read a File capability's content as UTF-8.
 * @param {string} args.ref The ref whose tree to read (a branch name, `HEAD`).
 * @param {string} args.path Repository-relative path to read.
 * @returns {Promise<string | undefined>}
 */
export const readTrackedFileAt = async ({ git, readText, ref, path }) => {
  const gitRef = /** @type {any} */ (git);
  try {
    const committedFs = await E(gitRef).filesystemAt(ref);
    const committedRoot = await E(committedFs).root();
    const file = await E(committedRoot).lookup(path);
    return await readText(file);
  } catch (err) {
    const message = /** @type {Error} */ (err)?.message ?? '';
    if (!/ENOENT/.test(message)) {
      throw err;
    }
    return undefined;
  }
};
harden(readTrackedFileAt);

/**
 * Resolve a branch's commit list, newest-first, through the live `git`
 * capability. `log({ ref })` returns the branch's commits with the tip first.
 *
 * @param {object} args
 * @param {unknown} args.git A live `@endo/exo-git` Git capability.
 * @param {string} args.ref The branch (or ref) whose log to read.
 * @returns {Promise<Array<{ oid: string, summary: string }>>}
 */
export const branchLog = async ({ git, ref }) => {
  const gitRef = /** @type {any} */ (git);
  return E(gitRef).log({ ref });
};
harden(branchLog);
