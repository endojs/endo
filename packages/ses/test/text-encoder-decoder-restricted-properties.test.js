// @ts-nocheck
/* global globalThis */

// Reproduces endojs/endo#3369: on Chromium before version 138, the WebIDL
// `TextEncoder` and `TextDecoder` constructors carry own legacy restricted
// properties — `caller` and `arguments`, each
// `{ value: null, writable: false, configurable: false }` — which `lockdown()`
// can neither delete nor repair in place. This file simulates that host shape
// before `lockdown()` (the synthetic reproduction from the issue), and asserts
// that lockdown completes because the permitted codecs are SES-owned
// encapsulating constructors that keep the host constructor objects out of
// the permitted intrinsics graph.
//
// This must live in its own test file (AVA runs each file in its own worker)
// because the host shape has to be established *before* `lockdown()` samples
// the host intrinsics.

import '../index.js';
import test from 'ava';

const NativeTextEncoder = globalThis.TextEncoder;
const NativeTextDecoder = globalThis.TextDecoder;

const restricted = {
  value: null,
  writable: false,
  enumerable: false,
  configurable: false,
};
for (const ctor of [NativeTextEncoder, NativeTextDecoder]) {
  Object.defineProperty(ctor, 'caller', restricted);
  Object.defineProperty(ctor, 'arguments', restricted);
}

lockdown();

test('lockdown completes despite undeletable caller/arguments on the host codec constructors', t => {
  t.is(typeof TextEncoder, 'function');
  t.is(typeof TextDecoder, 'function');
});

test('the permitted codec constructors are SES-owned, not the host constructors', t => {
  t.not(TextEncoder, NativeTextEncoder);
  t.not(TextDecoder, NativeTextDecoder);
  t.false(Object.hasOwn(TextEncoder, 'caller'));
  t.false(Object.hasOwn(TextEncoder, 'arguments'));
  t.false(Object.hasOwn(TextDecoder, 'caller'));
  t.false(Object.hasOwn(TextDecoder, 'arguments'));
});

test('the host constructors are unreachable from the permitted intrinsics', t => {
  t.is(TextEncoder.prototype.constructor, TextEncoder);
  t.is(TextDecoder.prototype.constructor, TextDecoder);
  t.is(new TextEncoder().constructor, TextEncoder);
  t.is(new TextDecoder().constructor, TextDecoder);
  const c = new Compartment();
  t.is(c.evaluate('TextEncoder'), TextEncoder);
  t.is(c.evaluate('TextDecoder'), TextDecoder);
  t.is(c.evaluate('new TextEncoder().constructor'), TextEncoder);
});

test('the encapsulated codecs preserve host behavior', t => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  t.true(encoder instanceof TextEncoder);
  t.true(decoder instanceof TextDecoder);
  t.is(decoder.decode(encoder.encode('hello')), 'hello');
  t.is(encoder.encoding, 'utf-8');
  const buffer = new Uint8Array(5);
  const { read, written } = encoder.encodeInto('hello', buffer);
  t.is(read, 5);
  t.is(written, 5);
  t.is(decoder.encoding, 'utf-8');
  t.false(decoder.fatal);
  t.false(decoder.ignoreBOM);
  const fatalDecoder = new TextDecoder('utf-8', { fatal: true });
  t.true(fatalDecoder.fatal);
  t.throws(() => fatalDecoder.decode(new Uint8Array([0xff])), {
    instanceOf: TypeError,
  });
});

test('the encapsulated constructors require new', t => {
  t.throws(() => TextEncoder(), { instanceOf: TypeError });
  t.throws(() => TextDecoder(), { instanceOf: TypeError });
});
