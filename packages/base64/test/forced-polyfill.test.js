// @ts-check

// Exercises the pure-JavaScript polyfill directly, regardless of whether
// the current runtime provides the native TC39 `Uint8Array.fromBase64` /
// `Uint8Array.prototype.toBase64` intrinsics.
// This ensures the polyfill path in src/encode.js and src/decode.js
// stays exercised by CI even on Node versions that ship the native
// intrinsic.

import test from 'ava';
import { jsEncodeBase64, encodeBase64 } from '../src/encode.js';
import { jsDecodeBase64, decodeBase64 } from '../src/decode.js';

/** @param {string} asciiString */
const asciiStringToUint8Array = asciiString => {
  const data = new Uint8Array(asciiString.length);
  for (let i = 0; i < asciiString.length; i += 1) {
    data[i] = asciiString.charCodeAt(i);
  }
  return data;
};

/** @param {Uint8Array} data */
const uint8ArrayToAsciiString = data => String.fromCharCode(...data);

test('jsEncodeBase64 round-trips through jsDecodeBase64', t => {
  const inputs = [
    '',
    'f',
    'fo',
    'foo',
    'foob',
    'fooba',
    'foobar',
    'Hello, world!',
    '\x00\x01\x02\xff\xfe\xfd',
  ];
  for (const input of inputs) {
    const bytes = asciiStringToUint8Array(input);
    const encoded = jsEncodeBase64(bytes);
    const decoded = jsDecodeBase64(encoded);
    t.is(
      uint8ArrayToAsciiString(decoded),
      input,
      `${JSON.stringify(input)} round-trips via js* path`,
    );
  }
});

test('native-available: dispatched functions match polyfill on clean inputs', t => {
  const inputs = [
    '',
    'f',
    'fo',
    'foo',
    'foob',
    'fooba',
    'foobar',
    '\x00\x01\x02\xff\xfe\xfd',
  ];
  for (const input of inputs) {
    const bytes = asciiStringToUint8Array(input);
    t.is(
      encodeBase64(bytes),
      jsEncodeBase64(bytes),
      `encode(${JSON.stringify(input)}) matches polyfill`,
    );
    const encoded = jsEncodeBase64(bytes);
    t.is(
      uint8ArrayToAsciiString(decodeBase64(encoded)),
      uint8ArrayToAsciiString(jsDecodeBase64(encoded)),
      `decode(${JSON.stringify(encoded)}) matches polyfill`,
    );
  }
});

test('jsDecodeBase64 rejects malformed inputs with polyfill-specific messages', t => {
  t.throws(() => jsDecodeBase64('%'), {
    message: /Invalid base64 character %/,
  });
  t.throws(() => jsDecodeBase64('Z'), {
    message: /Missing padding at offset 1/,
  });
  t.throws(() => jsDecodeBase64('Zg==%'), {
    message: /trailing garbage %/,
  });
});

test('jsDecodeBase64 preserves the optional name parameter in error messages', t => {
  t.throws(() => jsDecodeBase64('%', 'my-input'), {
    message: /in string my-input/,
  });
  t.throws(() => jsDecodeBase64('Z', 'other'), {
    message: /of string other/,
  });
});
