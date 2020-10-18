// @ts-check
/* eslint no-bitwise: ["off"] */

/**
 * The following functions `makeTable` and `crc32` come from `pako`, from
 * pako/lib/zlib/crc32.js released under the MIT license, see pako
 * https://github.com/nodeca/pako/
 */

// Use ordinary array, since untyped makes no boost here
/**
 * @returns {Array<number>}
 */
function makeTable() {
  let c;
  const table = [];

  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }

  return table;
}

// Initialize a table of 256 signed 32 bit integers.
const table = makeTable();

/**
 * @param {Uint8Array} bytes
 * @param {number} length
 * @param {number} index
 * @param {number} crc
 */
export function crc32(bytes, length = bytes.length, index = 0, crc = 0) {
  const end = index + length;

  crc ^= -1;

  for (let i = index; i < end; i += 1) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  }

  return (crc ^ -1) >>> 0;
}
