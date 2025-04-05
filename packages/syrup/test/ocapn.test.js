// @ts-check

import test from 'ava';
import { makeSyrupReader } from '../src/decode.js';
import { makeSyrupWriter } from '../src/encode.js';
import { OCapNComponentUnionCodec, OCapNDescriptorUnionCodec, OCapNMessageUnionCodec } from '../src/ocapn.js';
import { componentsTable, descriptorsTable, operationsTable } from './_ocapn.js';
import { OCapNPassableUnionCodec } from '../src/passable.js';

const textEncoder = new TextEncoder();
const sym = (s) => `${s.length}'${s}`;

const testBidirectionally = (t, codec, syrup, value, testName) => {
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, { name: testName });
  let result;
  t.notThrows(() => {
    result = codec.unmarshal(syrupReader);
  }, testName);
  t.deepEqual(result, value, testName);
  const syrupWriter = makeSyrupWriter();
  t.notThrows(() => {
    codec.marshal(value, syrupWriter);
  }, testName);
  const bytes2 = syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
  const syrup2 = new TextDecoder().decode(bytes2);
  t.deepEqual(syrup2, syrup, testName);
}

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
  const syrupReader = makeSyrupReader(syrupBytes, { name: 'unknown record type' });
  t.throws(() => {
    codec.unmarshal(syrupReader);
  }, { message: 'Unknown record type: unknown-record-type' });
});
