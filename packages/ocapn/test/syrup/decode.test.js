// @ts-check

import test from '@endo/ses-ava/test.js';

import { decodeSyrup } from '../../src/syrup/js-representation.js';
import { table } from './_table.js';
import { throws } from '../_util.js';

const textEncoder = new TextEncoder();

test('affirmative decode cases', t => {
  for (const { syrup, value } of table) {
    const bytes = new Uint8Array(syrup.length);
    for (let i = 0; i < syrup.length; i += 1) {
      bytes[i] = syrup.charCodeAt(i);
    }
    const desc = `for ${String(syrup)}`;
    let actual;
    t.notThrows(() => {
      actual = decodeSyrup(bytes);
    }, desc);
    t.deepEqual(actual, value, desc);
  }
});

test('must not be empty', t => {
  throws(t, () => decodeSyrup(new Uint8Array(0), { name: 'known.sup' }), {
    message: 'SyrupAnyCodec: read failed at index 0 of known.sup',
    cause: {
      message: 'End of data reached (data length = 0, asked index 1)',
    },
  });
});

test('dictionary keys must be unique', t => {
  throws(t, () => decodeSyrup(textEncoder.encode('{1"a10+1"a')), {
    message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
    cause: {
      message:
        'Syrup dictionary keys must be unique, got repeated "a" at index 7 of <unknown>',
    },
  });
});

test('dictionary keys must be in bytewise order', t => {
  throws(t, () => decodeSyrup(textEncoder.encode('{1"b10+1"a')), {
    message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
    cause: {
      message:
        'Syrup dictionary keys must be in bytewise sorted order, got "a" immediately after "b" at index 7 of <unknown>',
    },
  });
});

test('must reject out-of-order prefix key', t => {
  throws(t, () => decodeSyrup(textEncoder.encode('{1"i10+0"1-}')), {
    message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
    cause: {
      message:
        'Syrup dictionary keys must be in bytewise sorted order, got "" immediately after "i" at index 7 of <unknown>',
    },
  });
});

test('dictionary keys must be strings or selectors', t => {
  throws(
    t,
    () => {
      decodeSyrup(textEncoder.encode('{1+'));
    },
    {
      message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
      cause: {
        message:
          'Unexpected type "integer", Syrup dictionary keys must be strings or selectors at index 1 of <unknown>',
      },
    },
  );
});

test('must reject non-canonical representations of NaN', t => {
  throws(
    t,
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
      message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
      cause: {
        message: 'Float64: read failed at index 0 of <unknown>',
        cause: {
          message: 'Non-canonical NaN at index 1 of Syrup <unknown>',
        },
      },
    },
  );
});

test('must reject non-canonical -0', t => {
  const bytes = new Uint8Array(9);
  const data = new DataView(bytes.buffer);
  bytes[0] = 'D'.charCodeAt(0);
  data.setFloat64(1, -0);

  throws(t, () => decodeSyrup(bytes), {
    message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
    cause: {
      message: 'Float64: read failed at index 0 of <unknown>',
      cause: {
        message: 'Non-canonical zero at index 1 of Syrup <unknown>',
      },
    },
  });
});

test('invalid string characters', t => {
  const bytes = new Uint8Array([
    // type prefix: string of length 2
    '2'.charCodeAt(0),
    '"'.charCodeAt(0),
    // invalid utf-8 encoding
    0xd8,
    0x00,
  ]);
  throws(t, () => decodeSyrup(bytes), {
    message: 'SyrupAnyCodec: read failed at index 0 of <unknown>',
    cause: {
      code: 'ERR_ENCODING_INVALID_ENCODED_DATA',
      message: 'The encoded data was not valid for encoding utf-8',
    },
  });
});
