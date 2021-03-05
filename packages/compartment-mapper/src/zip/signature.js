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
export const ZIP64_CENTRAL_DIRECTORY_LOCATOR = u('PK\x06\x07');
export const ZIP64_CENTRAL_DIRECTORY_END = u('PK\x06\x06');
export const DATA_DESCRIPTOR = u('PK\x07\x08');
