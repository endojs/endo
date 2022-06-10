import { encodeBase64 } from './encode.js';

/**
 * @param {string} stringToEncode the binary string to encode
 * @returns {string} an ASCII string containing the base64 representation of `stringToEncode`
 */
export const btoa = stringToEncode => {
  const bytes = stringToEncode.split('').map(char => {
    const b = char.charCodeAt(0);
    if (b > 0xff) {
      throw new Error(`btoa: character out of range: ${char}`);
    }
    return b;
  });
  const buf = new Uint8Array(bytes);
  return encodeBase64(buf);
};
