// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import { makeSyrupReader } from '../src/syrup/decode.js';
import { makeSyrupWriter } from '../src/syrup/encode.js';
import { OCapNComponentUnionCodec } from '../src/codecs/components.js';
import { OCapNDescriptorUnionCodec } from '../src/codecs/descriptors.js';
import { OCapNMessageUnionCodec } from '../src/codecs/operations.js';
import {
  componentsTable,
  descriptorsTable,
  operationsTable,
  passableTable,
} from './_table.js';
import { OCapNPassableUnionCodec } from '../src/codecs/passable.js';
import { sel } from './_syrup_util.js';
import { throws, notThrowsWithErrorUnwrapping, maybeDecode } from './_util.js';

const textEncoder = new TextEncoder();

/**
 * @typedef {import('../src/syrup/codec.js').SyrupCodec} SyrupCodec
 */

/**
 * @param {any} t
 * @param {SyrupCodec} codec
 * @param {string | Uint8Array} syrup
 * @param {any} value
 */
const testBidirectionally = (t, codec, syrup, value) => {
  // This text decoder is only for testing label purposes, so it doesn't need to be strict.
  const descDecoder = new TextDecoder('utf-8', { fatal: false });
  const syrupDesc =
    typeof syrup === 'string' ? syrup : descDecoder.decode(syrup);
  const syrupBytes =
    typeof syrup === 'string' ? textEncoder.encode(syrup) : syrup;
  const syrupReader = makeSyrupReader(syrupBytes, { name: syrupDesc });
  let result;
  notThrowsWithErrorUnwrapping(
    t,
    () => {
      result = codec.read(syrupReader);
    },
    syrupDesc,
  );
  t.deepEqual(result, value, syrupDesc);
  const syrupWriter = makeSyrupWriter();
  notThrowsWithErrorUnwrapping(
    t,
    () => {
      codec.write(value, syrupWriter);
    },
    syrupDesc,
  );
  const bytes2 = syrupWriter.getBytes();
  const { value: syrup2, isValidUtf8 } = maybeDecode(bytes2);
  // We only match the syrup strings for easier debugging,
  // and we can only do this if the syrup is valid UTF-8.
  if (isValidUtf8) {
    t.deepEqual(syrup2, syrupDesc, syrupDesc);
  }
  // Testing the bytes is what we actually care about.
  t.deepEqual(syrupBytes, bytes2, syrupDesc);
};

test('affirmative component cases', t => {
  const codec = OCapNComponentUnionCodec;
  for (const { syrup, value } of componentsTable) {
    testBidirectionally(t, codec, syrup, value);
  }
});

test('affirmative descriptor cases', t => {
  const codec = OCapNDescriptorUnionCodec;
  for (const { syrup, value } of descriptorsTable) {
    testBidirectionally(t, codec, syrup, value);
  }
});

test('affirmative operation cases', t => {
  const codec = OCapNMessageUnionCodec;
  for (const { syrup, value } of operationsTable) {
    testBidirectionally(t, codec, syrup, value);
  }
});

test('affirmative passable cases', t => {
  const codec = OCapNPassableUnionCodec;
  for (const { syrup, value } of passableTable) {
    testBidirectionally(t, codec, syrup, value);
  }
});

test('error on unknown record type in passable', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = `<${sel('unknown-record-type')}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'unknown record type',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OCapNPassableCodec: read failed at index 0 of unknown record type',
    cause: {
      message:
        'OCapNPassableRecordUnionCodec: read failed at index 0 of unknown record type',
      cause: {
        message: 'Unexpected record type: "unknown-record-type"',
      },
    },
  });
});

test('descriptor fails with negative integer', t => {
  const codec = OCapNDescriptorUnionCodec;
  const syrup = `<${sel('desc:import-object')}1-}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'import-object with negative integer',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OCapNDescriptorUnionCodec: read failed at index 0 of import-object with negative integer',
    cause: {
      message: 'PositiveIntegerCodec: value must be positive',
    },
  });
});

test('passable fails with unordered keys', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = '{3"dog20+3"cat10+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with unordered keys',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OCapNPassableCodec: read failed at index 0 of passable with unordered keys',
    cause: {
      message:
        'OCapNStructCodec: read failed at index 0 of passable with unordered keys',
      cause: {
        message:
          'OCapN Structs keys must be in bytewise sorted order, got "cat" immediately after "dog" at index 9 of passable with unordered keys',
      },
    },
  });
});

test('passable fails with repeated keys', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = '{3"cat10+3"cat20+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with repeated keys',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OCapNPassableCodec: read failed at index 0 of passable with repeated keys',
    cause: {
      message:
        'OCapNStructCodec: read failed at index 0 of passable with repeated keys',
      cause: {
        message:
          'OCapN Structs must have unique keys, got repeated "cat" at index 9 of passable with repeated keys',
      },
    },
  });
});
