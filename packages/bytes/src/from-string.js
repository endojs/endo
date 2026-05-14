import harden from '@endo/harden';

// Capture a single `TextEncoder` at module load.
// `TextEncoder` only ever emits UTF-8 by spec, so the instance is
// stateless and safe to share across calls.
// Capturing once at module init avoids per-call allocation and avoids
// any post-lockdown mutation of the global from redirecting calls.
const textEncoder = new TextEncoder();

/**
 * Encodes a string as UTF-8 bytes.
 *
 * @param {string} s
 * @returns {Uint8Array}
 */
export const bytesFromText = s => textEncoder.encode(s);
harden(bytesFromText);
