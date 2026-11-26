// @ts-check
/* eslint no-bitwise: ["off"] */

/**
 * @param {string} string
 * @returns {Uint8Array}
 */
function u(string) {
  const array = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i += 1) {
    array[i] = string.charCodeAt(i) & 0xff;
  }
  return array;
}

export const LOCAL_FILE_HEADER = u('PK\x03\x04');
export const CENTRAL_FILE_HEADER = u('PK\x01\x02');
export const CENTRAL_DIRECTORY_END = u('PK\x05\x06');
