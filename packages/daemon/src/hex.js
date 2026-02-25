// @ts-check

// Ponyfill for Uint8Array.prototype.toHex / Uint8Array.fromHex
// (TC39 proposal-arraybuffer-base64, Stage 4).
// Uses the native methods when available, otherwise falls back to
// portable implementations that work in SES-locked-down compartments.

/**
 * Convert a Uint8Array to a lowercase hex string.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const toHex =
  typeof Uint8Array.prototype.toHex === 'function'
    ? bytes => bytes.toHex()
    : bytes =>
        Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
harden(toHex);

/**
 * Convert a hex string to a Uint8Array.
 *
 * @param {string} hex
 * @returns {Uint8Array}
 */
export const fromHex =
  typeof Uint8Array.fromHex === 'function'
    ? hex => Uint8Array.fromHex(hex)
    : hex => {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return bytes;
      };
harden(fromHex);
