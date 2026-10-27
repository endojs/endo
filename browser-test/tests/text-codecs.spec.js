// @ts-check
// prefer-endo-primitives-exempt: direct text codec regression fixture
const { test, expect } = require('@playwright/test');

// Covers endojs/endo#3369 in real browsers; packages/ses/src/tame-text-codecs.js
// explains the Chromium host shape.

test.beforeEach(async ({ page, browser, browserName }) => {
  console.log(browserName, browser.version());
  page.on('console', message => console.log('> Log in page:', message.text()));
  page.on('pageerror', error => {
    console.error(`> Error in page: ${error.message}\n${error.stack}`);
  });
  await page.goto('/');
});

test('lockdown completes with legacy restricted properties on the text codec constructors (endojs/endo#3369)', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    'use strict';

    // Simulate the affected host shape wherever it is absent, so this test
    // exercises the same failure on every browser. Chromium before version
    // 138 reportedly already defines these properties (endojs/endo#3369), in
    // which case the simulation changes nothing.
    const restricted = {
      value: null,
      writable: false,
      enumerable: false,
      configurable: false,
    };
    for (const constructor of [
      globalThis.TextEncoder,
      globalThis.TextDecoder,
    ]) {
      for (const property of ['caller', 'arguments']) {
        if (!Object.getOwnPropertyDescriptor(constructor, property)) {
          Object.defineProperty(constructor, property, restricted);
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
    // Give TextEncoder the affected shape on every browser. TextDecoder keeps
    // whatever shape this browser gives it.
    for (const property of ['caller', 'arguments']) {
      if (!Object.getOwnPropertyDescriptor(NativeTextEncoder, property)) {
        Object.defineProperty(NativeTextEncoder, property, {
          value: null,
          writable: false,
          enumerable: false,
          configurable: false,
        });
      }
    }
    const textDecoderAffected =
      Object.getOwnPropertyDescriptor(NativeTextDecoder, 'arguments') !==
      undefined;
    lockdown();

    /** @type {string[]} */
    const failures = [];
    const check = (label, passed) => {
      if (!passed) {
        failures.push(label);
      }
    };

    const { TextEncoder, TextDecoder } = globalThis;
    check('TextEncoder is replaced', TextEncoder !== NativeTextEncoder);
    check(
      'TextDecoder is replaced only if affected',
      (TextDecoder !== NativeTextDecoder) === textDecoderAffected,
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
