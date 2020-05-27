import { uint32 } from "@agoric/varint";

const input = 1729;
const length = uint32.measure(input);
console.log(length);
// 2

const buffer = new Uint8Array(length);
uint32.write(buffer, input, 0);
console.log(buffer);
// Uint8Array(2) [ 193, 13 ]

const output = uint32.read(buffer, 0);
console.log(output);
// 1729
