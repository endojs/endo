// @ts-nocheck
/* eslint-disable no-restricted-globals */
/* global print */

// This is a quick and dirty benchmark to encode and decode base64, intended to
// be run manually to measure performance progress or regressions.
// This is a hand-rolled benchmark that attempts as much as possible to avoid
// incorporating the noise of function calls and the underlying
// performance.now()/Date.now() syscall, by exponentially probing for the number
// of operations that can be executed within each benchmark's deadline.

import { encodeBase64, decodeBase64 } from '../index.js';
import { jsEncodeBase64 } from '../src/encode.js';
import { jsDecodeBase64 } from '../src/decode.js';

async function main() {
  const log = (typeof console !== 'undefined' && console.log) || print;
  /** @type {typeof Date.now} */
  const now = await (async () => {
    await null;
    try {
      const { performance } = await import('perf_hooks');
      if (performance.now) {
        return performance.now.bind(performance);
      }
    } catch (_err) {
      // eslint-disable-next-line no-empty
    }
    return Date.now;
  })();

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
      const start = now();
      const deadline = start + timeout / 2;
      let operations = 0;
      for (let n = 1; now() < deadline; n *= 2) {
        for (let i = 0; i < n; i += 1) {
          result = fn(input);
        }
        operations += n;
      }
      const end = now();
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
      const start = now();
      const deadline = start + timeout / 2;
      let operations = 0;
      for (let n = 1; now() < deadline; n *= 2) {
        for (let i = 0; i < n; i += 1) {
          result = fn(input);
        }
        operations += n;
      }
      const end = now();
      const duration = end - start;
      log(
        `[pass ${pass}] ${label}`,
        (operations * input.length) / duration,
        'bytes per millisecond',
      );
    }
  }

  if (result.length < 100) throw Error(`unexpected result: ${result}`);
}

main();
