// 
import test from 'ava';
import * as fs from 'fs';
import path from 'path';
import { decodeSymbolName, parseSyrup, peekType } from '../src/decode.js';

// zoo.bin from https://github.com/ocapn/syrup/tree/2214cbb7c0ee081699fdef64edbc2444af2bb1d2/test-data
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const zooBin = fs.readFileSync(path.resolve(__dirname, '_zoo.bin'));

// test('incremental parsing of whole value', t => {
//   const syrup = '{3"age12+4"name7"Tabatha7"species3"cat}';
//   const textEncoder = new TextEncoder();
//   const bytes = textEncoder.encode(syrup);
//   const parser = parseSyrup(bytes);
//   const actual = parser.next();
//   t.deepEqual(actual, { age: 12n, name: 'Tabatha', species: 'cat' });
// });

test('incremental parsing', t => {
  const syrup = '{3"age12+4"name7"Tabatha7"species3"cat}';
  const textEncoder = new TextEncoder();
  const bytes = textEncoder.encode(syrup);
  const parser = parseSyrup(bytes);
  let nextType = parser.peekType();
  t.deepEqual(nextType, { type: 'dictionary', start: 1 });
  parser.enterDictionary();
  let nextKey = parser.nextDictionaryKey();
  t.deepEqual(nextKey, 'age');
  let nextValue = parser.nextDictionaryValue();
  t.deepEqual(nextValue, 12n);
  nextKey = parser.nextDictionaryKey();
  t.deepEqual(nextKey, 'name');
  nextValue = parser.nextDictionaryValue();
  t.deepEqual(nextValue, 'Tabatha');
  nextKey = parser.nextDictionaryKey();
  t.deepEqual(nextKey, 'species');
  nextValue = parser.nextDictionaryValue();
  t.deepEqual(nextValue, 'cat');
  parser.exitDictionary();
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
      D@ ffffff
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
      D@1=p��=
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
      D�A@     
      7'species
      5:ghost
      }
    ]
  >
*/
test('incremental parsing of whole value', t => {
  const parser = parseSyrup(zooBin);
  let nextType = parser.peekType();
  t.deepEqual(nextType, { type: 'record', start: 1 });
  parser.enterRecord();
  {
    // label (bytestring)
    nextType = parser.peekType();
    t.deepEqual(nextType, { type: 'bytestring', start: 6 });
    parser.skip();
    // first value (string)
    let nextValue = parser.next();
    t.deepEqual(nextValue, 'The Grand Menagerie');
    // second value (list)
    nextType = parser.peekType();
    t.deepEqual(nextType, { type: 'list', start: 29 });
    parser.enterList();
    {
      // first value (dictionary)
      nextType = parser.peekType();
      t.deepEqual(nextType, { type: 'dictionary', start: 30 });
      parser.enterDictionary();
      {
        // first key (symbol)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'symbol', start: 35 });
        parser.skip();
        // first value (integer)
        let nextValue = parser.next();
        t.deepEqual(nextValue, 12n);
        // second key (symbol)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'symbol', start: 44 });
        parser.skip();
        // second value (set)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'set', start: 45 });
        parser.enterSet();
        {
          // first value (bytestring)
          nextType = parser.peekType();
          t.deepEqual(nextType, { type: 'bytestring', start: 51 });
          parser.skip();
          // second value (bytestring)
          nextType = parser.peekType();
          t.deepEqual(nextType, { type: 'bytestring', start: 57 });
          parser.skip();
          // third value (bytestring)
          nextType = parser.peekType();
          t.deepEqual(nextType, { type: 'bytestring', start: 65 });
          parser.skip();
        }
        parser.exitSet();
        // third value (symbol)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'symbol', start: 72 });
        parser.skip();
        // fourth value (string)
        nextValue = parser.next();
        t.deepEqual(nextValue, 'Tabatha');
        // fifth value (symbol)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'symbol', start: 89 });
        parser.skip();
        // sixth value (boolean)
        nextValue = parser.next();
        t.deepEqual(nextValue, true);
        // seventh value (symbol)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'symbol', start: 98 });
        parser.skip();
        // eighth value (double)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'float64', start: 99 });
        parser.skip();
        // ninth value (symbol)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'symbol', start: 116 });
        parser.skip();
        // tenth value (bytestring)
        nextType = parser.peekType();
        t.deepEqual(nextType, { type: 'bytestring', start: 121 });
        parser.skip();
      }
      parser.exitDictionary();
      // second value (dictionary)
      nextType = parser.peekType();
      t.deepEqual(nextType, { type: 'dictionary', start: 123 });
      parser.skip();
      // third value (dictionary)
      nextType = parser.peekType();
      t.deepEqual(nextType, { type: 'dictionary', start: 215 });
      parser.skip();
    }
    parser.exitList();
  }
  parser.exitRecord();
});

test('seeking over a dictionary', t => {
  const parser = parseSyrup(zooBin);
  let nextType = parser.peekType();
  t.deepEqual(nextType, { type: 'record', start: 1 });
  parser.enterRecord();
  // skip the label
  parser.skip();
  // skip the string
  parser.skip();
 // enter the list
  parser.enterList();
  // inspect the first item
  nextType = parser.peekType();
  t.deepEqual(nextType, { type: 'dictionary', start: 30 });
  parser.enterDictionary();

  const entryToSchema = (entry) => Object.fromEntries(
    entry.map(({ key, value, start }) => [
      decodeSymbolName(zooBin, key, zooBin.byteLength, 'key symbol'),
      peekType(zooBin, value, zooBin.byteLength, 'value type').type,
    ]),
  );

  const firstDictEntries = Array.from(parser.seekDictionaryEntries())
  const firstDictSchema = entryToSchema(firstDictEntries);
  
  const expectedSchema = {
    age: 'integer',
    eats: 'set',
    name: 'string',
    'alive?': 'boolean',
    weight: 'float64',
    species: 'bytestring',
  };

  t.deepEqual(firstDictEntries.length, 6);

  t.deepEqual(firstDictSchema, expectedSchema);

  // second item
  nextType = parser.peekType();
  t.deepEqual(nextType, { type: 'dictionary', start: 123 });
  parser.enterDictionary();
  const secondDictEntries = Array.from(parser.seekDictionaryEntries())
  const secondDictSchema = entryToSchema(secondDictEntries);
  t.deepEqual(secondDictSchema, expectedSchema);
  
  // third item
  nextType = parser.peekType();
  t.deepEqual(nextType, { type: 'dictionary', start: 215 });
  parser.enterDictionary();
  const thirdDictEntries = Array.from(parser.seekDictionaryEntries())
  const thirdDictSchema = entryToSchema(thirdDictEntries);
  t.deepEqual(thirdDictSchema, expectedSchema);
});
