import test from '@endo/ses-ava/prepare-endo.js';
import {
  byteArrayToUint8Array,
  decodeBase64ToByteArray,
  encodeByteArrayToBase64,
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
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];
  for (const [inp, outp] of insouts) {
    t.is(
      encodeByteArrayToBase64(stringToByteArray(inp)),
      outp,
      `${inp} encodes`,
    );
    t.is(
      byteArrayToString(decodeBase64ToByteArray(outp)),
      inp,
      `${outp} decodes`,
    );
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
      byteArrayToString(
        decodeBase64ToByteArray(
          encodeByteArrayToBase64(stringToByteArray(str)),
        ),
      ),
      str,
      `${str} round trips`,
    );
  }
});

test('invalid encodings', t => {
  const badInputs = [
    ['%', /Invalid base64 character %/],
    ['=', undefined], // this input is bad in multiple ways

    ['Z%', /Invalid base64 character %/],
    ['Z', /Missing padding at offset 1/],
    ['Z=', /Missing padding at offset 2/],
    ['Z=%', /Missing padding at offset 2/],
    ['Z==%', /Missing padding at offset 3/],
    ['Z==m', /Missing padding at offset 3/],

    ['Zg%', /Invalid base64 character %/],
    ['Zg', /Missing padding at offset 2/],
    ['Zg=', /Missing padding at offset 3/],
    ['Zg=%', /Missing padding at offset 3/],
    ['Zg==%', /trailing garbage %/],
    ['Zg==m', /trailing garbage m/],

    ['Zm8%', /Invalid base64 character %/],
    ['Zm8', /Missing padding at offset 3/],
    // not invalid: 'Zm8='
    ['Zm8=%', /trailing garbage %/],
    ['Zm8==%', /trailing garbage =%/],
    ['Zm8==m', /trailing garbage =m/],

    // non-zero padding bits (MAY reject): ['Qf==', ...],
  ];
  for (const [badInput, message] of badInputs) {
    t.throws(
      // @ts-expect-error intentional error
      () => decodeBase64ToByteArray(badInput),
      message ? { message } : undefined,
      `${badInput} is rejected`,
    );
  }
});
