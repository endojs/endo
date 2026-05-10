import harden from '@endo/harden';

// Capture a single `TextDecoder` at module load.
// The default UTF-8 decoder is the only mode this helper supports;
// callers needing other encodings should construct their own decoder.
// Capturing once at module init avoids per-call allocation and avoids
// any post-lockdown mutation of the global from redirecting calls.
const textDecoder = new TextDecoder();

/**
 * Decodes UTF-8 bytes to a string.
 *
 * @param {Uint8Array} view
 * @returns {string}
 */
export const bytesToText = view => textDecoder.decode(view);
harden(bytesToText);
