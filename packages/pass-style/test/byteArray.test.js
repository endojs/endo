import test from '@endo/ses-ava/prepare-endo.js';
import {
  byteArrayToUint8Array,
  hexToByteArray,
  byteArrayToHex,
  uint8ArrayToByteArray,
} from '../src/byteArray.js';

// modeled on `@endo/base64`'s main.test.js

/**
 * @param {string} string Only uses the low byte of each UTF16 code unit, which
 * is ok as long as it is used only for this purpose for a local test, and not
 * exported.
 * @returns {ArrayBuffer} A ByteArray, i.e., a hardened Immutable ArrayBuffer
 */
const stringToByteArray = string => {
  const data = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i += 1) {
    data[i] = string.charCodeAt(i);
  }
  return uint8ArrayToByteArray(data);
};

/**
 * @param {ArrayBuffer} byteArray
 * @returns {string} Interpreting each 8-bit value as an 8-bit UTF-16 code
 * unit. Since this cannot include any UTF-16 surrogates, this is equivalent
 * to interpreting each 8-bit value as an 8-bit ascii code point. This
 * may be unexpected, and so is ok as long as it is used only for this purpose
 * for a local test, and not exported.
 */
const byteArrayToString = byteArray => {
  return String.fromCharCode(...byteArrayToUint8Array(byteArray));
};

test('byteArray / base64 conversion', t => {
  const insouts = [
    ['', ''],
    ['f', '66'],
    ['fo', '666f'],
    ['foo', '666f6f'],
    ['foob', '666f6f62'],
    ['fooba', '666f6f6261'],
    ['foobar', '666f6f626172'],
  ];
  for (const [inp, outp] of insouts) {
    t.is(byteArrayToHex(stringToByteArray(inp)), outp, `${inp} encodes`);
    t.is(byteArrayToString(hexToByteArray(outp)), inp, `${outp} decodes`);
  }
  const inputs = [
    'a',
    'ab',
    'abc',
    'Hello, world!',
    '\x0d\x02\x09\xff\xfe',
    'other--+iadtedata',
  ];
  for (const str of inputs) {
    t.is(
      byteArrayToString(hexToByteArray(byteArrayToHex(stringToByteArray(str)))),
      str,
      `${str} round trips`,
    );
  }
});

test('invalid encodings', t => {
  const badInputs = [
    ['%', '"%" must be an even number of characters'],
    ['0%', 'Invalid hex string: "0%"'], // this input is bad in multiple ways

    ['a', '"a" must be an even number of characters'],
    ['a00', '"a00" must be an even number of characters'],

    // non-zero padding bits (MAY reject): ['Qf==', ...],
  ];
  for (const [badInput, message] of badInputs) {
    t.throws(
      () => hexToByteArray(badInput),
      { message },
      `${badInput} is rejected`,
    );
  }
});
