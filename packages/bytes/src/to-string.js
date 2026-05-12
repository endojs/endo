// @ts-check

import harden from '@endo/harden';

// Capture both `TextDecoder` modes once at module load.
// The default UTF-8 decoder substitutes U+FFFD for malformed sequences;
// the `fatal: true` decoder throws on the same input.
// Capturing once at module init avoids per-call allocation and avoids
// any post-lockdown mutation of the global from redirecting calls.
const lenientTextDecoder = new TextDecoder();
const fatalTextDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * @typedef {object} BytesToTextOptions
 * @property {boolean} [fatal] When `true`, malformed UTF-8 throws instead of
 *   substituting U+FFFD.
 */

/**
 * Decodes UTF-8 bytes to a string.
 *
 * Pass `{ fatal: true }` for strict UTF-8 decoding that throws on
 * invalid input. The default lenient mode substitutes the
 * Unicode replacement character (U+FFFD) for malformed sequences.
 *
 * @param {Uint8Array} view
 * @param {BytesToTextOptions} [options]
 * @returns {string}
 */
export const bytesToText = (view, options = undefined) => {
  if (options !== undefined && options.fatal) {
    return fatalTextDecoder.decode(view);
  }
  return lenientTextDecoder.decode(view);
};
harden(bytesToText);
