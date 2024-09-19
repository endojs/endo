// @ts-check

import test from 'ava';
import { decodeSyrup } from '../src/decode.js';
import { encodeSyrup } from '../src/encode.js';
import { XorShift } from './_xorshift.js';

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
      .fill()
      .map(() => String.fromCharCode(random() * 128))
      .join('');
  } else {
    // lower-case strings
    return Array(length)
      .fill()
      .map(() => String.fromCharCode('a'.charCodeAt(0) + random() * 26))
      .join('');
  }
}

/**
 * @param {number} budget
 * @param {() => number} random
 */
function largeFuzzySyrupable(budget, random) {
  const partition = random();
  const length = Math.floor(budget);
  if (partition < 0.25) {
    // bigint
    return BigInt(
      Array(length)
        .fill()
        .map(() => `${Math.floor(random() * 10)}`)
        .join(''),
    );
  } else if (partition < 0.5) {
    // string
    return fuzzyString(length, random);
  } else if (partition < 0.75) {
    // array
    return (
      new Array(length)
        .fill()
        // Recursion is a thing, yo.
        // eslint-disable-next-line no-use-before-define
        .map(() => fuzzySyrupable(budget / length, random))
    );
  } else {
    // object
    return Object.fromEntries(
      new Array(length).fill().map(() => [
        fuzzyString(20, random),
        // Recursion is a thing, yo.
        // eslint-disable-next-line no-use-before-define
        fuzzySyrupable(budget / length, random),
      ]),
    );
  }
}

/**
 * @param {number} budget
 * @param {() => number} random
 */
function fuzzySyrupable(budget, random) {
  const partition = budget * random();
  if (partition < 0.25) {
    return false;
  } else if (partition < 0.5) {
    return random() ** (100 * (random() - 0.5));
  } else if (partition < 1) {
    return Math.floor(100000 * random());
  } else {
    return largeFuzzySyrupable(budget, random);
  }
}

// Chris Hibbert really wanted the default i to be Bob's Coffee Façade,
// which is conveniently exactly 64 bits long.
const defaultSeed = [0xb0b5c0ff, 0xeefacade, 0xb0b5c0ff, 0xeefacade];

const prng = new XorShift(defaultSeed);
const random = () => prng.random();

for (let i = 0; i < 1000; i += 1) {
  (index => {
    const object1 = fuzzySyrupable(random() * 100, random);
    const syrup2 = encodeSyrup(object1);
    const desc = JSON.stringify(new TextDecoder().decode(syrup2));
    test(`fuzz ${index}`, t => {
      // t.log(random());
      // t.log(object1);
      const object3 = decodeSyrup(syrup2);
      const syrup4 = encodeSyrup(object3);
      t.deepEqual(object1, object3, desc);
      t.deepEqual(syrup2, syrup4, desc);
    });
  })(i);
}
