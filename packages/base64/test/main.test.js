import test from 'ava';
import { atob as origAtob, btoa as origBtoa } from './_capture-atob-btoa.js';
import { encodeBase64, decodeBase64, atob, btoa } from '../index.js';

/**
 * @param {string} string Only uses the low byte of each UTF16 code unit, which
 * is ok as long as it is used only for this purpose for a local test, and not
 * exported.
 * @returns {Uint8Array}
 */
const stringToUint8Array = string => {
  const data = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i += 1) {
    data[i] = string.charCodeAt(i);
  }
  return data;
};

/**
 * @param {Uint8Array} data
 * @returns {string} Interpreting each 8-bit value as an 8-bit UTF-16 code
 * unit. Since this cannot include any UTF-16 surrogates, this is equivalent
 * to interpreting each 8-bit value as an 8-bit ascii code point. This
 * may be unexpected, and so is ok as long as it is used only for this purpose
 * for a local test, and not exported.
 */
const unit8ArrayToString = data => String.fromCharCode(...data);

test('bytes conversions', t => {
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
    t.is(encodeBase64(stringToUint8Array(inp)), outp, `${inp} encodes`);
    t.is(unit8ArrayToString(decodeBase64(outp)), inp, `${outp} decodes`);
    t.is(btoa(inp), outp, `${inp} encodes with btoa`);
    t.is(atob(outp), inp, `${outp} decodes with atob`);
    origBtoa && t.is(origBtoa(inp), outp, `${inp} encodes with origBtoa`);
    origAtob && t.is(origAtob(outp), inp, `${outp} decodes with origAtob`);
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
      unit8ArrayToString(decodeBase64(encodeBase64(stringToUint8Array(str)))),
      str,
      `${str} round trips`,
    );
    origBtoa &&
      t.is(atob(origBtoa(str)), str, `${str} round trips with atob(origBtoa)`);
    origAtob &&
      t.is(origAtob(btoa(str)), str, `${str} round trips with origAtob(btoa)`);
    t.is(atob(btoa(str)), str, `${str} round trips with atob(btoa)`);
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
      () => decodeBase64(badInput),
      message ? { message } : undefined,
      `${badInput} is rejected`,
    );
  }
});
