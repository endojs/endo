// @ts-check

/**
 * @import { SyrupCodec } from '../../src/syrup/codec.js'
 * @import { SyrupReader } from '../../src/syrup/decode.js'
 * @import { SyrupWriter } from '../../src/syrup/encode.js'
 * @import { CodecTestEntry } from './_codecs_util.js'
 * @import { Settler } from '@endo/eventual-send'
 */

import test from '@endo/ses-ava/test.js';

import { makeSyrupReader } from '../../src/syrup/decode.js';
import { makeTagged, makeSelector } from '../../src/pass-style-helpers.js';
import { sel, str, bts, bool, int, list, btsStr } from './_syrup_util.js';
import { makeCodecTestKit, testBidirectionally } from './_codecs_util.js';
import { throws } from '../_util.js';

const textEncoder = new TextEncoder();

const { PassableCodec } = makeCodecTestKit();

/** @type {CodecTestEntry[]} */
const table = [
  { syrup: `<${sel('void')}>`, value: undefined },
  { syrup: `<${sel('null')}>`, value: null },
  { syrup: `${bool(true)}`, value: true },
  { syrup: `${bool(false)}`, value: false },
  { syrup: `${int(123)}`, value: 123n },
  { syrup: `${str('hello')}`, value: 'hello' },
  {
    syrup: btsStr('hello'),
    value: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
  },
  {
    syrup: bts(new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f])),
    value: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]),
  },
  {
    syrup: `${sel('hello')}`,
    value: makeSelector('hello'),
  },
  { syrup: `${list([str('hello'), str('world')])}`, value: ['hello', 'world'] },
  {
    syrup: `{${str('abc')}${int(123)}${str('xyz')}${bool(true)}}`,
    value: harden({ abc: 123n, xyz: true }),
  },
  {
    syrup: `<${sel('desc:tagged')}${sel('hello')}${list([str('world')])}>`,
    value: makeTagged('hello', ['world']),
  },
  // order canonicalization
  { syrup: '{0"10+1"i20+}', value: harden({ '': 10n, i: 20n }) },
];

test('affirmative passable cases', t => {
  for (const [index, entry] of table.entries()) {
    const { name = `test-${index}` } = entry;
    testBidirectionally(t, {
      ...entry,
      name,
      getCodec: testKit => testKit.PassableCodec,
    });
  }
});

test('error on unknown record type in passable', t => {
  const codec = PassableCodec;
  const syrup = `<${sel('unknown-record-type')}>`;
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'unknown record type',
  });
  throws(t, () => codec.read(syrupReader), {
    message: 'OcapnPassable: read failed at index 0 of unknown record type',
    cause: {
      message:
        'OcapnPassableRecordUnion: read failed at index 0 of unknown record type',
      cause: {
        message:
          'OcapnPassableRecordUnion: Unexpected record type: "unknown-record-type"',
      },
    },
  });
});

test('passable fails with unordered keys', t => {
  const codec = PassableCodec;
  const syrup = '{3"dog20+3"cat10+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with unordered keys',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OcapnPassable: read failed at index 0 of passable with unordered keys',
    cause: {
      message:
        'OcapnStruct: read failed at index 0 of passable with unordered keys',
      cause: {
        message:
          'OcapnStruct keys must be in bytewise sorted order, got "cat" immediately after "dog" at index 9 of passable with unordered keys',
      },
    },
  });
});

test('passable fails with repeated keys', t => {
  const codec = PassableCodec;
  const syrup = '{3"cat10+3"cat20+}';
  const syrupBytes = textEncoder.encode(syrup);
  const syrupReader = makeSyrupReader(syrupBytes, {
    name: 'passable with repeated keys',
  });
  throws(t, () => codec.read(syrupReader), {
    message:
      'OcapnPassable: read failed at index 0 of passable with repeated keys',
    cause: {
      message:
        'OcapnStruct: read failed at index 0 of passable with repeated keys',
      cause: {
        message:
          'OcapnStruct must have unique keys, got repeated "cat" at index 9 of passable with repeated keys',
      },
    },
  });
});
