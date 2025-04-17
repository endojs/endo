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
import { sel } from './_util.js';

const textEncoder = new TextEncoder();

const testBidirectionally = (t, codec, syrup, value, testName) => {
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, { name: testName });
  let result;
  t.notThrows(() => {
    result = codec.read(syrupReader);
  }, testName);
  t.deepEqual(result, value, testName);
  const syrupWriter = makeSyrupWriter();
  t.notThrows(() => {
    codec.write(value, syrupWriter);
  }, testName);
  const bytes2 = syrupWriter.getBytes();
  const syrup2 = new TextDecoder().decode(bytes2);
  t.deepEqual(syrup2, syrup, testName);
};

test('affirmative component cases', t => {
  const codec = OCapNComponentUnionCodec;
  for (const { syrup, value } of componentsTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('affirmative descriptor cases', t => {
  const codec = OCapNDescriptorUnionCodec;
  for (const { syrup, value } of descriptorsTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('affirmative operation cases', t => {
  const codec = OCapNMessageUnionCodec;
  for (const { syrup, value } of operationsTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('affirmative passable cases', t => {
  const codec = OCapNPassableUnionCodec;
  for (const { syrup, value } of passableTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('error on unknown record type in passable', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = `<${sel('unknown-record-type')}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'unknown record type',
  });
  t.throws(
    () => {
      codec.read(syrupReader);
    },
    { message: 'Unexpected record type: "unknown-record-type"' },
  );
});

test('descriptor fails with negative integer', t => {
  const codec = OCapNDescriptorUnionCodec;
  const syrup = `<${sel('desc:import-object')}1-}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'import-object with negative integer',
  });
  t.throws(
    () => {
      codec.read(syrupReader);
    },
    {
      message: 'PositiveIntegerCodec: value must be positive',
    },
  );
});

test('passable fails with unordered keys', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = '{3"dog20+3"cat10+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with unordered keys',
  });
  t.throws(
    () => {
      codec.read(syrupReader);
    },
    {
      message:
        'OCapN Structs keys must be in bytewise sorted order, got "cat" immediately after "dog" at index 9 of passable with unordered keys',
    },
  );
});

test('passable fails with repeated keys', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = '{3"cat10+3"cat20+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with repeated keys',
  });
  t.throws(
    () => {
      codec.read(syrupReader);
    },
    {
      message:
        'OCapN Structs must have unique keys, got repeated "cat" at index 9 of passable with repeated keys',
    },
  );
});
