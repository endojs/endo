/* eslint no-bitwise: ["off"] */
// @ts-check

const padding = '=';

const alphabet64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * The numeric value corresponding to each letter of the alphabet.
 * If an alphabet is named for the Greek letters alpha and beta, then clearly a
 * monodu is named for the corresponding Greek numbers mono and duo.
 * @type {Record<string, number>}
 */
const monodu64 = {};
for (let i = 0; i < alphabet64.length; i += 1) {
  const c = alphabet64[i];
  monodu64[c] = i;
}

/**
 * Encodes bytes into a Base64 string, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * @param {Uint8Array} data
 * @returns {string} base64 encoding
 */
export function encodeBase64(data) {
  // A cursory benchmark shows that string concatenation is about 25% faster
  // than building an array and joining it in v8, in 2020, for strings of about
  // 100 long.
  let string = '';
  let register = 0;
  let quantum = 0;

  for (let i = 0; i < data.length; i += 1) {
    const b = data[i];
    register = (register << 8) | b;
    quantum += 8;
    if (quantum === 24) {
      string +=
        alphabet64[(register >>> 18) & 0x3f] +
        alphabet64[(register >>> 12) & 0x3f] +
        alphabet64[(register >>> 6) & 0x3f] +
        alphabet64[(register >>> 0) & 0x3f];
      register = 0;
      quantum = 0;
    }
  }

  switch (quantum) {
    case 0:
      break;
    case 8:
      string +=
        alphabet64[(register >>> 2) & 0x3f] +
        alphabet64[(register << 4) & 0x3f] +
        padding +
        padding;
      break;
    case 16:
      string +=
        alphabet64[(register >>> 10) & 0x3f] +
        alphabet64[(register >>> 4) & 0x3f] +
        alphabet64[(register << 2) & 0x3f] +
        padding;
      break;
    default:
      throw Error(`internal: bad quantum ${quantum}`);
  }
  return string;
}

/**
 * Decodes a Base64 string into bytes, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * @param {string} string Base64-encoded string
 * @param {string} [name] The name of the string as it will appear in error
 * messages.
 * @returns {Uint8Array} decoded bytes
 */
export function decodeBase64(string, name = '<unknowwn>') {
  const data = new Uint8Array(Math.ceil((string.length * 4) / 3));
  let register = 0;
  let quantum = 0;
  let i = 0; // index in string
  let j = 0; // index in data

  while (i < string.length && string[i] !== padding) {
    const number = monodu64[string[i]];
    if (number === undefined) {
      throw Error(`Invalid base64 character ${string[i]} in string ${name}`);
    }
    register = (register << 6) | number;
    quantum += 6;
    if (quantum >= 8) {
      quantum -= 8;
      data[j] = register >>> quantum;
      j += 1;
      register &= (1 << quantum) - 1;
    }
    i += 1;
  }

  while (i < string.length && quantum % 8 !== 0) {
    if (string[i] !== padding) {
      throw Error(`Missing padding at offset ${i} of string ${name}`);
    }
    i += 1;
    quantum += 6;
  }

  if (i < string.length) {
    throw Error(
      `Base64 string has trailing garbage ${string.substr(
        i,
      )} in string ${name}`,
    );
  }

  return data.subarray(0, j);
}
