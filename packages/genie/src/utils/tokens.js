// @ts-check

/**
 * Token Estimation Utilities
 *
 * Provides a rough heuristic for estimating the number of tokens in a
 * string.  The initial implementation uses a simple chars÷4 ratio which
 * is intentionally approximate — a more accurate tokenizer (e.g.
 * tiktoken bindings) can replace this later without changing the
 * interface.
 */

import harden from '@endo/harden';

/**
 * Estimate the number of tokens in the given text.
 *
 * Uses a chars÷4 heuristic that approximates GPT-style BPE
 * tokenization for typical English prose.
 *
 * @param {string} text - The input text to estimate.
 * @returns {number} Estimated token count (always ≥ 0).
 */
const estimateTokens = text => {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
};
harden(estimateTokens);

export { estimateTokens };
