// @ts-nocheck
// prefer-endo-primitives-exempt: direct text codec regression fixture
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
const nativeTextDecoderInstance = new NativeTextDecoder();

const restricted = {
  value: null,
  writable: false,
  enumerable: false,
  configurable: false,
};
for (const constructor of [NativeTextEncoder, NativeTextDecoder]) {
  Object.defineProperty(constructor, 'caller', restricted);
  Object.defineProperty(constructor, 'arguments', restricted);
}

lockdown();

const visitReachable = roots => {
  const seen = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const value = pending.pop();
    const shouldVisit =
      (typeof value === 'object' || typeof value === 'function') &&
      value !== null &&
      !seen.has(value);
    if (shouldVisit) {
      seen.add(value);
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== null) {
        pending.push(prototype);
      }
      for (const descriptor of Object.values(
        Object.getOwnPropertyDescriptors(value),
      )) {
        pending.push(descriptor.value, descriptor.get, descriptor.set);
      }
    }
  }
  return seen;
};

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
  const compartment = new Compartment();
  t.is(compartment.evaluate('TextEncoder'), TextEncoder);
  t.is(compartment.evaluate('TextDecoder'), TextDecoder);
  t.is(compartment.evaluate('new TextEncoder().constructor'), TextEncoder);

  const compartmentGlobalDescriptors = Object.values(
    Object.getOwnPropertyDescriptors(compartment.globalThis),
  );
  const roots = [TextEncoder, TextDecoder];
  for (const descriptor of compartmentGlobalDescriptors) {
    roots.push(descriptor.value, descriptor.get, descriptor.set);
  }
  const reachable = visitReachable(roots);
  t.false(reachable.has(NativeTextEncoder));
  t.false(reachable.has(NativeTextDecoder));
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
  t.throws(() => TextEncoder(), {
    instanceOf: TypeError,
    message: 'Calling TextEncoder constructor as a function throws',
  });
  t.throws(() => TextDecoder(), {
    instanceOf: TypeError,
    message: 'Calling TextDecoder constructor as a function throws',
  });
});

test('the encapsulated constructors preserve identity surface and subclassing', t => {
  class DerivedTextDecoder extends TextDecoder {}
  const derived = new DerivedTextDecoder();
  t.true(derived instanceof DerivedTextDecoder);
  t.true(derived instanceof TextDecoder);
  t.true(derived instanceof NativeTextDecoder);
  t.is(derived.decode(new TextEncoder().encode('hello')), 'hello');

  t.true(new TextDecoder() instanceof NativeTextDecoder);
  t.true(new NativeTextDecoder() instanceof TextDecoder);
  t.not(NativeTextDecoder, TextDecoder);
  t.is(nativeTextDecoderInstance.constructor, TextDecoder);
  t.is(TextEncoder.name, NativeTextEncoder.name);
  t.is(TextDecoder.name, NativeTextDecoder.name);
  t.is(TextEncoder.length, NativeTextEncoder.length);
  t.is(TextDecoder.length, NativeTextDecoder.length);
  t.deepEqual(Reflect.ownKeys(TextEncoder), ['length', 'name', 'prototype']);
  t.deepEqual(Reflect.ownKeys(TextDecoder), ['length', 'name', 'prototype']);

  const HostError = t.throws(() => new NativeTextDecoder('bogus'));
  const EncapsulatedError = t.throws(() => new TextDecoder('bogus'));
  t.is(EncapsulatedError.constructor, HostError.constructor);
});

test('Reflect.construct preserves an arbitrary new target', t => {
  function AlternateConstructor() {}
  const instance = Reflect.construct(TextDecoder, [], AlternateConstructor);
  t.is(Object.getPrototypeOf(instance), AlternateConstructor.prototype);
  const reachable = visitReachable([instance, AlternateConstructor]);
  t.false(reachable.has(NativeTextDecoder));

  let observedReceiver;
  let observedProperty;
  const prototype = {};
  const NewTarget = new Proxy(function NewTarget() {}, {
    get(target, property, receiver) {
      observedReceiver = receiver;
      observedProperty = property;
      if (property === 'prototype') {
        return prototype;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const proxyInstance = Reflect.construct(TextDecoder, [], NewTarget);
  t.is(Object.getPrototypeOf(proxyInstance), prototype);
  t.is(observedReceiver, NewTarget);
  t.is(observedProperty, 'prototype');
  t.false(visitReachable([proxyInstance, NewTarget]).has(NativeTextDecoder));
});
