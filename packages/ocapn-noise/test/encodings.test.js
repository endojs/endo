import test from '@endo/ses-ava/prepare-endo.js';

import { encodeSupportedEncodingsInto } from '../src/bindings.js';

test('encodeSupportedEncodingsInto', t => {
  const bytes = new Uint8Array(4);

  const words = (hi, lo) => {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint16(0, hi, false);
    view.setUint16(2, lo, false);
    return new Uint8Array(buffer);
  };

  encodeSupportedEncodingsInto(bytes, [0]);
  t.deepEqual(bytes, words(0, 0));

  encodeSupportedEncodingsInto(bytes, [1]);
  t.deepEqual(bytes, words(1, 0));

  encodeSupportedEncodingsInto(bytes, [1, 2]);
  t.deepEqual(bytes, words(1, 1));

  encodeSupportedEncodingsInto(bytes, [0, 2]);
  t.deepEqual(bytes, words(0, 0b10));

  encodeSupportedEncodingsInto(bytes, [0, 2, 4]);
  t.deepEqual(bytes, words(0, 0b1010));

  encodeSupportedEncodingsInto(bytes, [2, 4, 6]);
  t.deepEqual(bytes, words(2, 0b1010));

  encodeSupportedEncodingsInto(bytes, [0, 8]);
  t.deepEqual(bytes, words(0, 0b1000_0000));

  encodeSupportedEncodingsInto(bytes, [42, 43, 44, 45, 46, 47, 48, 49, 50]);
  t.deepEqual(bytes, words(42, 0b1111_1111));

  encodeSupportedEncodingsInto(bytes, [65535]);
  t.deepEqual(bytes, words(65535, 0));

  t.throws(() => encodeSupportedEncodingsInto(bytes, [65536]));

  t.throws(() => encodeSupportedEncodingsInto(bytes, [0, 17]));

  t.throws(() =>
    encodeSupportedEncodingsInto(bytes, [
      42, // 0 first supported
      43, // 1 first bit in extra
      44, // 2
      45, // 3
      46, // 4
      47, // 5
      48, // 6
      49, // 7
      50, // 8
      51, // 9
      52, // 10
      53, // 11
      54, // 12
      55, // 13
      56, // 14
      57, // 15
      58, // 16 last bit in extra
      59, // 17 and one too many
    ]),
  );
});
