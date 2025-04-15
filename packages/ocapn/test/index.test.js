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
} from './_table.js';
import { OCapNPassableUnionCodec } from '../src/codecs/passable.js';

const textEncoder = new TextEncoder();
const sym = s => `${s.length}'${s}`;

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

test('error on unknown record type in passable', t => {
  const codec = OCapNPassableUnionCodec;
  const syrup = `<${sym('unknown-record-type')}>`;
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
  const syrup = `<${sym('desc:import-object')}1-}>`;
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
