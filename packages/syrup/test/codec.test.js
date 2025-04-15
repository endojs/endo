// @ts-check

import test from 'ava';
import path from 'path';
import fs from 'fs';
import { makeSyrupReader } from '../src/decode.js';
import { makeSyrupWriter } from '../src/encode.js';
import {
  makeRecordUnionCodec,
  makeRecordCodecFromDefinition,
  StringCodec,
  makeListCodecFromEntryCodec,
} from '../src/codec.js';

/** @typedef {import('../src/codec.js').SyrupCodec} SyrupCodec */

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
// zoo.bin from https://github.com/ocapn/syrup/tree/2214cbb7c0ee081699fdef64edbc2444af2bb1d2/test-data
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const zooBinRaw = fs.readFileSync(path.resolve(__dirname, '_zoo.bin'));
// nodejs can provide a buffer with a non-zero byteOffset, which confuses the buffer reader
const zooBin = Uint8Array.from(zooBinRaw);

const testCodecBidirectionally = (t, codec, value) => {
  const writer = makeSyrupWriter();
  codec.write(value, writer);
  const bytes = writer.getBytes();
  const reader = makeSyrupReader(bytes);
  const result = codec.read(reader);
  t.deepEqual(result, value);
};

test('simple string codec', t => {
  const codec = StringCodec;
  const value = 'hello';
  testCodecBidirectionally(t, codec, value);
});

test('basic record codec cases', t => {
  const codec = makeRecordCodecFromDefinition('test', 'selector', [
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
  const codec = makeRecordUnionCodec({
    testA: makeRecordCodecFromDefinition('testA', 'selector', [
      ['field1', 'string'],
      ['field2', 'integer'],
    ]),
    testB: makeRecordCodecFromDefinition('testB', 'selector', [
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

test('zoo.bin', t => {
  /** @type {SyrupCodec} */
  const inhabitantCodec = {
    read: syrupReader => {
      const result = {};
      syrupReader.enterDictionary();
      t.is(syrupReader.readSelectorAsString(), 'age');
      result.age = syrupReader.readInteger();
      t.is(syrupReader.readSelectorAsString(), 'eats');
      result.eats = [];
      syrupReader.enterSet();
      while (!syrupReader.peekSetEnd()) {
        result.eats.push(textDecoder.decode(syrupReader.readBytestring()));
      }
      syrupReader.exitSet();
      t.is(syrupReader.readSelectorAsString(), 'name');
      result.name = syrupReader.readString();
      t.is(syrupReader.readSelectorAsString(), 'alive?');
      result.alive = syrupReader.readBoolean();
      t.is(syrupReader.readSelectorAsString(), 'weight');
      result.weight = syrupReader.readFloat64();
      t.is(syrupReader.readSelectorAsString(), 'species');
      result.species = textDecoder.decode(syrupReader.readBytestring());
      syrupReader.exitDictionary();
      return result;
    },
    write: (value, syrupWriter) => {
      syrupWriter.enterDictionary();
      syrupWriter.writeSelector('age');
      syrupWriter.writeInteger(value.age);
      syrupWriter.writeSelector('eats');
      syrupWriter.enterSet();
      for (const eat of value.eats) {
        syrupWriter.writeBytestring(textEncoder.encode(eat));
      }
      syrupWriter.exitSet();
      syrupWriter.writeSelector('name');
      syrupWriter.writeString(value.name);
      syrupWriter.writeSelector('alive?');
      syrupWriter.writeBoolean(value.alive);
      syrupWriter.writeSelector('weight');
      syrupWriter.writeFloat64(value.weight);
      syrupWriter.writeSelector('species');
      syrupWriter.writeBytestring(textEncoder.encode(value.species));
      syrupWriter.exitDictionary();
    },
  };

  const inhabitantListCodec = makeListCodecFromEntryCodec(inhabitantCodec);

  const zooCodec = makeRecordCodecFromDefinition('zoo', 'bytestring', [
    ['title', 'string'],
    ['inhabitants', inhabitantListCodec],
  ]);

  const reader = makeSyrupReader(zooBin, { name: 'zoo' });
  const value = zooCodec.read(reader);
  t.deepEqual(value, {
    type: 'zoo',
    title: 'The Grand Menagerie',
    inhabitants: [
      {
        age: 12n,
        eats: ['fish', 'mice', 'kibble'],
        name: 'Tabatha',
        alive: true,
        weight: 8.2,
        species: 'cat',
      },
      {
        age: 6n,
        eats: ['bananas', 'insects'],
        name: 'George',
        alive: false,
        weight: 17.24,
        species: 'monkey',
      },
      {
        age: -12n,
        eats: [],
        name: 'Casper',
        alive: false,
        weight: -34.5,
        species: 'ghost',
      },
    ],
  });
  const writer = makeSyrupWriter();
  zooCodec.write(value, writer);
  const bytes = writer.getBytes();
  const resultSyrup = textDecoder.decode(bytes);
  const originalSyrup = textDecoder.decode(zooBin);
  t.deepEqual(resultSyrup, originalSyrup);
});
