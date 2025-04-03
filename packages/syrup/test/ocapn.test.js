// @ts-check

import test from 'ava';
import { makeSyrupReader } from '../src/decode.js';
import { makeSyrupWriter } from '../src/encode.js';
import { OCapNComponentUnionCodec, OCapNDescriptorUnionCodec, OCapNMessageUnionCodec } from '../src/ocapn.js';
import { componentsTable, descriptorsTable, operationsTable } from './_ocapn.js';

const testBidirectionally = (t, codec, syrup, value, testName) => {
  const syrupBytes = new Uint8Array(syrup.length);
  for (let i = 0; i < syrup.length; i += 1) {
    syrupBytes[i] = syrup.charCodeAt(i);
  }
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
  t.deepEqual(bytes2, syrupBytes, testName);
}

test('affirmative component cases', t => {
  const codec = OCapNComponentUnionCodec;
  for (const { syrup, value } of componentsTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('affirmative descriptor read cases', t => {
  const codec = OCapNDescriptorUnionCodec;
  for (const { syrup, value } of descriptorsTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});

test('affirmative operation read cases', t => {
  const codec = OCapNMessageUnionCodec;
  for (const { syrup, value } of operationsTable) {
    testBidirectionally(t, codec, syrup, value, `for ${JSON.stringify(syrup)}`);
  }
});
