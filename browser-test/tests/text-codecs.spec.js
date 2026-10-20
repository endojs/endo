// @ts-check
const { test, expect } = require('@playwright/test');

// endojs/endo#3369: on Chromium before version 138, the WebIDL `TextEncoder`
// and `TextDecoder` constructors carry own legacy restricted properties —
// `caller` and `arguments`, each
// `{ value: null, writable: false, configurable: false }` — which `lockdown()`
// can neither delete nor repair in place, so `lockdown()` throws. An affected
// codec is replaced by a SES-owned encapsulating constructor, so its host
// constructor object never enters the permitted intrinsics graph.

test.beforeEach(async ({ page, browser, browserName }) => {
  console.log(browserName, browser.version());
  page.on('console', msg => console.log('> Log in page:', msg.text()));
  page.on('pageerror', error => {
    console.error(`> Error in page: ${error.message}\n${error.stack}`);
  });
  await page.goto(`http://127.0.0.1:3000/`);
});

test('lockdown completes with legacy restricted properties on the text codec constructors (endojs/endo#3369)', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    'use strict';

    // Simulate the affected host shape wherever it is absent, so this test
    // exercises the same failure on every browser. On a genuinely affected
    // Chromium before version 138 already has these properties with
    // exactly this descriptor and the simulation is a no-op.
    const restricted = {
      value: null,
      writable: false,
      enumerable: false,
      configurable: false,
    };
    for (const ctor of [globalThis.TextEncoder, globalThis.TextDecoder]) {
      for (const prop of ['caller', 'arguments']) {
        if (!Object.getOwnPropertyDescriptor(ctor, prop)) {
          Object.defineProperty(ctor, prop, restricted);
        }
      }
    }

    lockdown();
    return 'Pass';
  });
  expect(result).toBe('Pass');
});

test('only affected host text codec constructors are encapsulated', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    'use strict';

    const NativeTextEncoder = globalThis.TextEncoder;
    const NativeTextDecoder = globalThis.TextDecoder;
    const textEncoderIsAffected = Boolean(
      Object.getOwnPropertyDescriptor(NativeTextEncoder, 'arguments'),
    );
    const textDecoderIsAffected = Boolean(
      Object.getOwnPropertyDescriptor(NativeTextDecoder, 'arguments'),
    );

    lockdown();

    /** @type {string[]} */
    const failures = [];
    const check = (label, ok) => {
      if (!ok) {
        failures.push(label);
      }
    };

    const { TextEncoder, TextDecoder } = globalThis;
    check(
      'TextEncoder replacement matches its descriptor',
      (TextEncoder !== NativeTextEncoder) === textEncoderIsAffected,
    );
    check(
      'TextDecoder replacement matches its descriptor',
      (TextDecoder !== NativeTextDecoder) === textDecoderIsAffected,
    );
    check(
      'TextEncoder has no own caller or arguments',
      !Object.getOwnPropertyDescriptor(TextEncoder, 'caller') &&
        !Object.getOwnPropertyDescriptor(TextEncoder, 'arguments'),
    );
    check(
      'TextDecoder has no own caller or arguments',
      !Object.getOwnPropertyDescriptor(TextDecoder, 'caller') &&
        !Object.getOwnPropertyDescriptor(TextDecoder, 'arguments'),
    );
    check(
      'prototype constructor does not leak the host constructor',
      TextEncoder.prototype.constructor === TextEncoder &&
        TextDecoder.prototype.constructor === TextDecoder &&
        new TextEncoder().constructor === TextEncoder,
    );
    check(
      'codecs are frozen',
      Object.isFrozen(TextEncoder) &&
        Object.isFrozen(TextEncoder.prototype) &&
        Object.isFrozen(TextDecoder) &&
        Object.isFrozen(TextDecoder.prototype),
    );

    const compartment = new Compartment();
    check(
      'compartments share the permitted codecs',
      compartment.evaluate('TextEncoder') === TextEncoder &&
        compartment.evaluate('TextDecoder') === TextDecoder,
    );

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    check('instanceof', encoder instanceof TextEncoder);
    check(
      'round-trip',
      decoder.decode(encoder.encode('hello')) === 'hello' &&
        decoder.decode(encoder.encode('')) === '',
    );
    check('encoding getter', encoder.encoding === 'utf-8');
    const buffer = new Uint8Array(5);
    const { read, written } = encoder.encodeInto('hello', buffer);
    check('encodeInto', read === 5 && written === 5);
    check(
      'decoder option getters',
      decoder.encoding === 'utf-8' &&
        decoder.fatal === false &&
        decoder.ignoreBOM === false &&
        new TextDecoder('utf-8', { fatal: true }).fatal === true,
    );

    return failures.length === 0 ? 'Pass' : `Fail: ${failures.join('; ')}`;
  });
  expect(result).toBe('Pass');
});
