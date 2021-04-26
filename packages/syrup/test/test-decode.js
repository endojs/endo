// @ts-check

import test from 'ava';
import { decodeSyrup } from '../src/decode.js';
import { table } from './table.js';

const textEncoder = new TextEncoder();

test('affirmative decode cases', t => {
  for (const { syrup, value } of table) {
    const bytes = new Uint8Array(syrup.length);
    for (let i = 0; i < syrup.length; i += 1) {
      bytes[i] = syrup.charCodeAt(i);
    }
    const actual = decodeSyrup(bytes);
    t.deepEqual(actual, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('must not be empty', t => {
  t.throws(
    () => {
      decodeSyrup(new Uint8Array(0), { name: 'known.sup' });
    },
    {
      message:
        'Unexpected end of Syrup, expected any value at index 0 of known.sup',
    },
  );
});

test('dictionary keys must be unique', t => {
  t.throws(
    () => {
      decodeSyrup(textEncoder.encode('{1"a10+1"a'));
    },
    {
      message:
        'Syrup dictionary keys must be unique, got repeated "a" at index 10 of <unknown>',
    },
  );
});

test('dictionary keys must be in bytewise order', t => {
  t.throws(
    () => {
      decodeSyrup(textEncoder.encode('{1"b10+1"a'));
    },
    {
      message:
        'Syrup dictionary keys must be in bytewise sorted order, got "a" immediately after "b" at index 10 of <unknown>',
    },
  );
});

test('must reject out-of-order prefix key', t => {
  t.throws(
    () => {
      decodeSyrup(textEncoder.encode('{1"i10+0"'));
    },
    {
      message:
        'Syrup dictionary keys must be in bytewise sorted order, got "" immediately after "i" at index 9 of <unknown>',
    },
  );
});

test('dictionary keys must be strings', t => {
  t.throws(
    () => {
      decodeSyrup(textEncoder.encode('{1+'));
    },
    {
      message:
        'Unexpected byte "+", Syrup dictionary keys must be strings or symbols at index 2 of <unknown>',
    },
  );
});

test('must reject non-canonical representations of NaN', t => {
  t.throws(
    () =>
      decodeSyrup(
        new Uint8Array([
          'D'.charCodeAt(0),
          0xff,
          0xf8,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
          0x00,
        ]),
      ),
    {
      message: 'Non-canonical NaN at index 1 of Syrup <unknown>',
    },
  );
});

test('must reject non-canonical -0', t => {
  const bytes = new Uint8Array(9);
  const data = new DataView(bytes.buffer);
  bytes[0] = 'D'.charCodeAt(0);
  data.setFloat64(1, -0);

  t.throws(() => decodeSyrup(bytes), {
    message: 'Non-canonical zero at index 1 of Syrup <unknown>',
  });
});
