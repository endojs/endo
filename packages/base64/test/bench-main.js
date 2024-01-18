// This is a quick and dirty benchmark to encode and decode base64, intended to
// be run manually to measure performance progress or regressions.
// This is a hand-rolled benchmark that attempts as much as possible to avoid
// incorporating the noise of function calls and the underlying Date.now()
// syscall, by exponentially probing for the number of operations that can be
// executed within each benchmark's deadline.

import { encodeBase64, decodeBase64 } from '../index.js';
import { jsEncodeBase64 } from '../src/encode.js';
import { jsDecodeBase64 } from '../src/decode.js';

// eslint-disable-next-line no-undef,no-restricted-globals
const log = (typeof console !== 'undefined' && console.log) || print;

const timeout = 1000; // ms

const shortString =
  'there once a rich man from nottingham who tried to cross the river. what a dope, he tripped on a rope. now look at him shiver.';
const string = new Array(10000).fill(shortString).join(' ');
const shortData = encodeBase64(shortString);
const data = encodeBase64(string);

/** @type {string} */
let result;

for (const [label, fn, input] of [
  ['encodes', encodeBase64, string],
  ['JS short-string encodes', jsEncodeBase64, shortString],
]) {
  for (const pass of [1, 2]) {
    const start = Date.now();
    const deadline = start + timeout / 2;
    let operations = 0;
    for (let n = 1; Date.now() < deadline; n *= 2) {
      for (let i = 0; i < n; i += 1) {
        result = fn(input);
      }
      operations += n;
    }
    const end = Date.now();
    const duration = end - start;
    log(
      `[pass ${pass}] ${label}`,
      (operations * input.length) / duration,
      'characters per millisecond',
    );
  }
}

if (result.length < 100) throw Error(`unexpected result: ${result}`);

for (const [label, fn, input] of [
  ['decodes', decodeBase64, data],
  ['JS short-string decodes', jsDecodeBase64, shortData],
]) {
  for (const pass of [1, 2]) {
    const start = Date.now();
    const deadline = start + timeout / 2;
    let operations = 0;
    for (let n = 1; Date.now() < deadline; n *= 2) {
      for (let i = 0; i < n; i += 1) {
        result = fn(input);
      }
      operations += n;
    }
    const end = Date.now();
    const duration = end - start;
    log(
      `[pass ${pass}] ${label}`,
      (operations * input.length) / duration,
      'bytes per millisecond',
    );
  }
}

if (result.length < 100) throw Error(`unexpected result: ${result}`);
