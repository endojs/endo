/* eslint no-bitwise: [0] */

import tape from "tape";
import { uint32 } from "../src/main.js";

const { test } = tape;

const examples = {
  0: [0x00],
  1: [0x01],
  127: [0x7f],
  128: [0x80, 0x01],
  255: [0xff, 0x01],
  256: [0x80, 0x02],
  0x7fffffff: [0xff, 0xff, 0xff, 0xff, 0x07],
  0x80000000: [0x80, 0x80, 0x80, 0x80, 0x08],
  0xffffffff: [0xff, 0xff, 0xff, 0xff, 0x0f]
};

Object.entries(examples).forEach(([input, array]) => {
  test(`${input}`, t => {
    input >>>= 0;
    const length = uint32.measure(input);
    t.equal(length, array.length, "length should match");
    const buffer = new Uint8Array(length);
    uint32.write(buffer, input, 0);
    t.deepEqual(Array.from(buffer), array, "buffer should match");
    const output = uint32.read(buffer, 0);
    t.equal(output, input, `number survives round trip`);
    t.end();
  });
});

test("fuzz", t => {
  let random = 2147483647; // largest 32 bit prime
  for (let width = 1; width < 32; width += 1) {
    for (let i = 0; i < 32 - width; i += 1) {
      const input = random & (0x7fffffff >> width);
      const length = uint32.measure(input);
      const buffer = new Uint8Array(length);
      uint32.write(buffer, input, 0);
      const output = uint32.read(buffer, 0);
      t.equal(output, input, `${input} survives round trip`);

      // xorshift 32
      random ^= random << 13;
      random ^= random >> 17;
      random ^= random << 5;
    }
  }
  t.end();
});
