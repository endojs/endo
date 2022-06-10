import test from 'ava';
import { atob as origAtob, btoa as origBtoa } from './capture-atob-btoa.js';
import { encodeBase64, decodeBase64, atob, btoa } from '../index.js';

function stringToBytes(string) {
  const data = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i += 1) {
    data[i] = string.charCodeAt(i);
  }
  return data;
}

function bytesToString(data) {
  return String.fromCharCode(...data);
}

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
    t.is(encodeBase64(stringToBytes(inp)), outp, `${inp} encodes`);
    t.is(bytesToString(decodeBase64(outp)), inp, `${outp} decodes`);
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
      bytesToString(decodeBase64(encodeBase64(stringToBytes(str)))),
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
