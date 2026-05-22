// @ts-check
// Line-based diff helpers for the file-explorer's "View layer
// diff" viewer mode. Kept in its own module so the LCS walk is
// testable in isolation and stays out of the (already large)
// file-explorer entry file.

import harden from '@endo/harden';

// Above this product-of-line-counts, the O(m·n) LCS dynamic
// programming table would dominate the wall-clock cost and the
// UI starts to feel sluggish. Beyond the cutoff we fall back to
// a flat "remove all, then add all" diff, which is uninformative
// but bounded by O(m+n) and keeps the explorer responsive.
const LCS_BUDGET = 1_000_000;

/**
 * Produce a list of unified-diff body lines comparing `oldText`
 * to `newText`. Each output line is prefixed with one of:
 *   ' '  context line (present in both)
 *   '-'  line removed (only in oldText)
 *   '+'  line added (only in newText)
 *
 * Splits on `\n` only — `\r\n` line endings are not normalised,
 * matching `compose`'s byte-exact CoW semantics (a difference in
 * line endings IS a difference and should be visible).
 *
 * @param {string} oldText
 * @param {string} newText
 * @returns {string[]}
 */
export const diffLines = (oldText, newText) => {
  const aLines = oldText === '' ? [] : oldText.split('\n');
  const bLines = newText === '' ? [] : newText.split('\n');
  const m = aLines.length;
  const n = bLines.length;
  if (m === 0 && n === 0) return [];
  if (m * n > LCS_BUDGET) {
    return [
      ...aLines.map(line => `-${line}`),
      ...bLines.map(line => `+${line}`),
    ];
  }
  // LCS table: dp[i][j] = length of longest common subsequence
  // of aLines[i..] and bLines[j..]. Walk from the end so the
  // recurrence is bottom-up.
  /** @type {number[][]} */
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (aLines[i] === bLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  /** @type {string[]} */
  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      out.push(` ${aLines[i]}`);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`-${aLines[i]}`);
      i += 1;
    } else {
      out.push(`+${bLines[j]}`);
      j += 1;
    }
  }
  while (i < m) {
    out.push(`-${aLines[i]}`);
    i += 1;
  }
  while (j < n) {
    out.push(`+${bLines[j]}`);
    j += 1;
  }
  return out;
};
harden(diffLines);

/**
 * Build one unified-diff section (an `--- a/<path>` / `+++ b/<path>`
 * header followed by the line ops) for a single file at `pathStr`.
 * Returns a `# unchanged: ...` comment instead when the bodies are
 * identical, so the caller can still emit a one-line marker per
 * touched path without polluting the document with no-op patches.
 *
 * The output highlights as the `diff` language in Monaco.
 *
 * @param {string} pathStr
 * @param {string} oldText
 * @param {string} newText
 * @returns {string}
 */
export const buildUnifiedDiffSection = (pathStr, oldText, newText) => {
  if (oldText === newText) return `# unchanged: ${pathStr}`;
  const body = diffLines(oldText, newText).join('\n');
  return `--- a/${pathStr}\n+++ b/${pathStr}\n${body}`;
};
harden(buildUnifiedDiffSection);
