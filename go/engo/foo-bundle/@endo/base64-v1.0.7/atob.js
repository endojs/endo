import { decodeBase64 } from './decode.js';

/**
 * @param {string} encodedData a binary string containing base64-encoded data
 * @returns {string} an ASCII string containing decoded data from `encodedData`
 */
export const atob = encodedData => {
  const buf = decodeBase64(encodedData);
  return String.fromCharCode(...buf);
};
