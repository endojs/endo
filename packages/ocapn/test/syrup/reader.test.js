// @ts-check
/* global Buffer */
import test from '@endo/ses-ava/test.js';
import * as fs from 'fs';
import path from 'path';
import { makeSyrupReader } from '../../src/syrup/decode.js';

// zoo.bin from https://github.com/ocapn/syrup/tree/2214cbb7c0ee081699fdef64edbc2444af2bb1d2/test-data
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const zooBinRaw = fs.readFileSync(path.resolve(__dirname, '_zoo.bin'));
// nodejs can provide a buffer with a non-zero byteOffset, which confuses the buffer reader
const zooBin = Uint8Array.from(zooBinRaw);

const toUtf8 = bytes => Buffer.from(bytes).toString('utf8');

test('exciting a dictionary without entering it', t => {
  const syrup = '}';
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(bytes, { name: 'test' });

  t.throws(() => syrupReader.exitDictionary(), {
    message:
      'Attempted to exit dictionary without entering it at index 1 of test',
  });
});

test('incremental reading of dictionary', t => {
  const syrup = '{3"age12+4"name7"Tabatha7"species3"cat}';
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(bytes);

  syrupReader.enterDictionary();
  const key1 = syrupReader.readString();
  const value1 = syrupReader.readInteger();
  const key2 = syrupReader.readString();
  const value2 = syrupReader.readString();
  const key3 = syrupReader.readString();
  const value3 = syrupReader.readString();
  syrupReader.exitDictionary();

  const result = {
    [key1]: value1,
    [key2]: value2,
    [key3]: value3,
  };
  t.deepEqual(result, {
    age: 12n,
    name: 'Tabatha',
    species: 'cat',
  });
});

// ;; Booleans: t or f
// ;; Single flonum: F<ieee-single-float>   (big endian)
// ;; Double flonum: D<ieee-double-float>   (big endian)
// ;; Positive integers: <int>+
// ;; Negative integers: <int>-
// ;; Bytestrings: 3:cat
// ;; Strings: 3"cat                        (utf-8 encoded)
// ;; Symbols: 3'cat                        (utf-8 encoded)
// ;; Dictionary: {<key1><val1><key2><val2>}
// ;; Lists: [<item1><item2><item3>]
// ;; Records: <<label><val1><val2><val3>>  (the outer <> for realsies tho)
// ;; Sets: #<item1><item2><item3>$

/*
<
  3:zoo
  19"The Grand Menagerie
  [
    {
      3'age
      12+
      4'eats
      #
        4:fish
        4:mice
        6:kibble
        $
      4'name
      7"Tabatha
      6'alive?
      t
      6'weight
      (binary float64 value)
      7'species
      3:cat
      }
    {
      3'age
      6+
      4'eats
      #
        7:bananas
        7:insects
        $
      4'name
      6"George
      6'alive?
      f
      6'weight
      (binary float64 value)
      7'species
      6:monkey
      }
    {
      3'age
      12-
      4'eats
      #
        $
      4'name
      6"Casper
      6'alive?
      f
      6'weight
      (binary float64 value)
      7'species
      5:ghost
      }
    ]
  >
*/

const readZooInhabitant = (t, syrupReader) => {
  const result = {};
  // first value (dictionary)
  syrupReader.enterDictionary();
  // eslint-disable-next-line no-lone-blocks
  {
    // first key (symbol)
    t.deepEqual(syrupReader.readSelectorAsString(), 'age');
    // first value (integer)
    result.age = syrupReader.readInteger();
    // second key (symbol)
    t.deepEqual(syrupReader.readSelectorAsString(), 'eats');
    // second value (set)
    result.eats = [];
    syrupReader.enterSet();
    while (!syrupReader.peekSetEnd()) {
      // value (bytestring)
      result.eats.push(toUtf8(syrupReader.readBytestring()));
    }
    syrupReader.exitSet();
    // second value (symbol)
    t.deepEqual(syrupReader.readSelectorAsString(), 'name');
    // third value (string)
    result.name = syrupReader.readString();
    // fourth value (symbol)
    t.deepEqual(syrupReader.readSelectorAsString(), 'alive?');
    // fifth value (boolean)
    result.alive = syrupReader.readBoolean();
    // sixth value (symbol)
    t.deepEqual(syrupReader.readSelectorAsString(), 'weight');
    // seventh value (float64)
    result.weight = syrupReader.readFloat64();
    // eighth value (symbol)
    t.deepEqual(syrupReader.readSelectorAsString(), 'species');
    // ninth value (bytestring)
    result.species = toUtf8(syrupReader.readBytestring());
  }
  syrupReader.exitDictionary();
  return result;
};

test('incremental parsing of whole value', t => {
  const syrupReader = makeSyrupReader(zooBin, { name: 'zoo.bin' });
  syrupReader.enterRecord();
  // eslint-disable-next-line no-lone-blocks
  {
    // label (bytestring)
    t.deepEqual(toUtf8(syrupReader.readBytestring()), 'zoo');
    // first value (string)
    t.deepEqual(syrupReader.readString(), 'The Grand Menagerie');
    // second value (list)
    syrupReader.enterList();
    // eslint-disable-next-line no-lone-blocks
    {
      t.deepEqual(readZooInhabitant(t, syrupReader), {
        age: 12n,
        eats: ['fish', 'mice', 'kibble'],
        name: 'Tabatha',
        alive: true,
        weight: 8.2,
        species: 'cat',
      });
      t.deepEqual(readZooInhabitant(t, syrupReader), {
        age: 6n,
        eats: ['bananas', 'insects'],
        name: 'George',
        alive: false,
        weight: 17.24,
        species: 'monkey',
      });
      t.deepEqual(readZooInhabitant(t, syrupReader), {
        age: -12n,
        eats: [],
        name: 'Casper',
        alive: false,
        weight: -34.5,
        species: 'ghost',
      });
    }
    syrupReader.exitList();
  }
  syrupReader.exitRecord();
});
