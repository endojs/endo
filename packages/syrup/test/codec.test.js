// @ts-check

import test from 'ava';
import { makeSyrupReader } from '../src/decode.js';
import { makeSyrupWriter } from '../src/encode.js';
import { RecordUnionCodec, SyrupRecordCodecType, SyrupStringCodec } from '../src/codec.js';


const testCodecBidirectionally = (t, codec, value) => {
  const writer = makeSyrupWriter();
  codec.marshal(value, writer);
  const bytes = writer.bufferWriter.subarray(0, writer.bufferWriter.length);
  const reader = makeSyrupReader(bytes);
  const result = codec.unmarshal(reader);
  t.deepEqual(result, value);
};

test('simple string codec', t => {
  const codec = SyrupStringCodec;
  const value = 'hello';
  testCodecBidirectionally(t, codec, value);
});

test('basic record codec cases', t => {
  const codec = new SyrupRecordCodecType('test', [
    ['field1', 'string'],
    ['field2', 'integer'],
  ]);
  const value = {
    type: 'test',
    field1: 'hello',
    field2: 123n,
  };
  testCodecBidirectionally(t, codec, value);
});

test('record union codec', t => {
  const codec = new RecordUnionCodec({
    testA: new SyrupRecordCodecType('testA', [
      ['field1', 'string'],
      ['field2', 'integer'],
    ]),
    testB: new SyrupRecordCodecType('testB', [
      ['field1', 'string'],
      ['field2', 'integer'],
    ]),
  });
  const value = {
    type: 'testA',
    field1: 'hello',
    field2: 123n,
  };
  testCodecBidirectionally(t, codec, value);
});
