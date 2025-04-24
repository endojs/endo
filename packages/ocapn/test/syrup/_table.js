import { SyrupSelectorFor } from '../../src/syrup/js-representation.js';

const textEncoder = new TextEncoder();

const stringFromBytes = bytes => {
  return bytes.map(c => String.fromCharCode(c)).join('');
};

export const table = [
  { syrup: '0+', value: 0n },
  { syrup: '1+', value: 1n },
  { syrup: '1-', value: -1n },
  { syrup: '1-', value: -1n },
  {
    syrup: `D${stringFromBytes([0xff, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])}`,
    value: -Infinity,
  },
  {
    syrup: `D${stringFromBytes([0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])}`,
    value: Infinity,
  },
  { syrup: 't', value: true },
  { syrup: 'f', value: false },
  { syrup: '5"hello', value: 'hello' },
  { syrup: "5'hello", value: SyrupSelectorFor('hello') },
  { syrup: '5:hello', value: textEncoder.encode('hello') },
  { syrup: '[1+2+3+]', value: [1n, 2n, 3n] },
  { syrup: '[3"abc3"def]', value: ['abc', 'def'] },
  { syrup: '{1"a10+1"b20+}', value: { a: 10n, b: 20n } },
  { syrup: '{1"a10+1"b20+}', value: { b: 20n, a: 10n } },
  // order canonicalization
  { syrup: '{0"10+1"i20+}', value: { '': 10n, i: 20n } },
  // order canonicalization
  { syrup: '{0"10+1"i20+}', value: { i: 20n, '': 10n } },
  // dictionary with mixed string and selector keys
  {
    syrup: '{3"dog20+3\'cat10+}',
    value: { dog: 20n, [SyrupSelectorFor('cat')]: 10n },
  },
  { syrup: 'D?\xf0\x00\x00\x00\x00\x00\x00', value: 1 },
  { syrup: 'D@^\xdd/\x1a\x9f\xbew', value: 123.456 },
  { syrup: '[3"foo123+t]', value: ['foo', 123n, true] },
  {
    syrup: '{3"age12+4"name7"Tabatha7"species3"cat}',
    value: { age: 12n, name: 'Tabatha', species: 'cat' },
  },
];
