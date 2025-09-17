import test from '@endo/ses-ava/prepare-endo.js';

import { encodeSupportedEncodingsInto } from '../src/bindings.js';

test('encodeSupportedEncodingsInto', t => {
  const buffer = [0, 0];

  encodeSupportedEncodingsInto(buffer, [0]);
  t.deepEqual(buffer, [0, 0]);

  encodeSupportedEncodingsInto(buffer, [1]);
  t.deepEqual(buffer, [1, 0]);

  encodeSupportedEncodingsInto(buffer, [1, 2]);
  t.deepEqual(buffer, [1, 1]);

  encodeSupportedEncodingsInto(buffer, [0, 2]);
  t.deepEqual(buffer, [0, 0b10]);

  encodeSupportedEncodingsInto(buffer, [0, 2, 4]);
  t.deepEqual(buffer, [0, 0b1010]);

  encodeSupportedEncodingsInto(buffer, [2, 4, 6]);
  t.deepEqual(buffer, [2, 0b1010]);

  encodeSupportedEncodingsInto(buffer, [0, 8]);
  t.deepEqual(buffer, [0, 0b1000_0000]);

  encodeSupportedEncodingsInto(buffer, [42, 43, 44, 45, 46, 47, 48, 49, 50]);
  t.deepEqual(buffer, [42, 0b1111_1111]);

  encodeSupportedEncodingsInto(buffer, [255]);
  t.deepEqual(buffer, [255, 0]);

  t.throws(() => encodeSupportedEncodingsInto(buffer, [256]));

  t.throws(() => encodeSupportedEncodingsInto(buffer, [0, 9]));

  t.throws(() =>
    encodeSupportedEncodingsInto(
      buffer,
      [42, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    ),
  );
});
