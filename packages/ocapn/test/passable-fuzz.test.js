// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';
import { Buffer } from 'buffer';
import { XorShift } from './_xorshift.js';
import { OCapNPassableUnionCodec } from '../src/codecs/passable.js';
import { makeSyrupWriter } from '../src/syrup/encode.js';
import { makeSyrupReader } from '../src/syrup/decode.js';

/**
 * @param {number} budget
 * @param {() => number} random
 */
function fuzzyString(budget, random) {
  const length = Math.floor(budget * random());
  const partition = random();
  // Evidently, not every combination of UTF-16 values can survive a
  // round-trip through encode/decode unaltered.
  // if (partition < 0.125) {
  //   // string with lots of unicode
  //   return Array(length)
  //     .fill()
  //     .map(() => String.fromCharCode(random() * random() * 65536))
  //     .join('');
  if (partition < 0.25) {
    // Force common prefix case to be somewhat common.
    return '';
  } else if (partition < 0.5) {
    // string mostly printable
    return Array(length)
      .fill(undefined)
      .map(() => String.fromCharCode(random() * 128))
      .join('');
  } else {
    // lower-case strings
    return Array(length)
      .fill(undefined)
      .map(() => String.fromCharCode('a'.charCodeAt(0) + random() * 26))
      .join('');
  }
}

/**
 * @param {Array<() => any>} array
 * @param {() => number} random
 */
const runRandomFrom = (array, random) => {
  const fn = array[Math.floor(random() * array.length)];
  return fn();
};

/**
 * @param {number} budget
 * @param {() => number} random
 */
function largeFuzzyPassable(budget, random) {
  const length = Math.floor(budget);
  return runRandomFrom(
    [
      // Integer
      () =>
        BigInt(
          Array(length)
            .fill(undefined)
            .map(() => `${Math.floor(random() * 10)}`)
            .join(''),
        ),
      // String
      () => fuzzyString(length, random),
      // List
      () =>
        new Array(length)
          .fill(undefined)
          // eslint-disable-next-line no-use-before-define
          .map(() => fuzzyPassable(budget / length, random)),
      // Struct
      () =>
        Object.fromEntries(
          new Array(length).fill(undefined).map(() => [
            fuzzyString(20, random),
            // eslint-disable-next-line no-use-before-define
            fuzzyPassable(budget / length, random),
          ]),
        ),
      // Tagged
      () => ({
        [Symbol.for('passStyle')]: 'tagged',
        [Symbol.toStringTag]: fuzzyString(10, random),
        // eslint-disable-next-line no-use-before-define
        value: fuzzyPassable(budget / 2, random),
      }),
      // TODO: OCapNReference
      // TODO: OCapNError
    ],
    random,
  );
}

/**
 * @param {number} budget
 * @param {() => number} random
 */
function fuzzyPassable(budget, random) {
  const partition = budget * random();
  if (partition < 0.25) {
    // Boolean
    return random() < 0.5;
  } else if (partition < 0.5) {
    // Float64
    return Math.floor(100000 * random());
  } else if (partition < 1) {
    // Null or Undefined
    return random() < 0.5 ? null : undefined;
  } else {
    // Passable
    return largeFuzzyPassable(budget, random);
  }
}

// Chris Hibbert really wanted the default i to be Bob's Coffee Façade,
// which is conveniently exactly 64 bits long.
const defaultSeed = [0xb0b5c0ff, 0xeefacade, 0xb0b5c0ff, 0xeefacade];

const prng = new XorShift(defaultSeed);
const random = () => prng.random();

/**
 * @param {any} passable
 * @returns {Uint8Array}
 */
const encodePassable = passable => {
  const syrupWriter = makeSyrupWriter();
  OCapNPassableUnionCodec.write(passable, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {Uint8Array} syrupBytes
 * @returns {any}
 */
const decodePassable = syrupBytes => {
  const syrupReader = makeSyrupReader(syrupBytes);
  return OCapNPassableUnionCodec.read(syrupReader);
};

test('fuzz', t => {
  // This TextDecoder is only used for the fuzz test descriptor so we can allow invalid utf-8
  const descDecoder = new TextDecoder('utf-8', { fatal: false });
  for (let i = 0; i < 1000; i += 1) {
    (index => {
      const object1 = fuzzyPassable(random() * 100, random);
      const syrupBytes2 = encodePassable(object1);
      const syrupString2 = descDecoder.decode(syrupBytes2);
      const desc = JSON.stringify(syrupString2);
      const hexString = Buffer.from(syrupBytes2).toString('hex');
      let object3;
      let syrup4;
      t.notThrows(() => {
        object3 = decodePassable(syrupBytes2);
      }, `fuzz decode ${index} for ${desc} on ${object1}\n${hexString}`);
      t.notThrows(() => {
        syrup4 = encodePassable(object3);
      }, `fuzz encode ${index} for ${desc} on ${object3}\n${hexString}`);
      t.deepEqual(object1, object3, desc);
      t.deepEqual(syrupBytes2, syrup4, desc);
    })(i);
  }
});
