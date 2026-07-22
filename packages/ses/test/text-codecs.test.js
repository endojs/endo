/* global globalThis */

import '../index.js';
import './_lockdown-safe.js';
import test from 'ava';

const hasTextEncoder = typeof globalThis.TextEncoder === 'function';
const hasTextDecoder = typeof globalThis.TextDecoder === 'function';

test('TextEncoder is present on the start compartment when the host provides it', t => {
  if (!hasTextEncoder) {
    t.pass('host does not provide TextEncoder; nothing to permit');
    return;
  }
  t.is(typeof globalThis.TextEncoder, 'function');
  t.is(typeof globalThis.TextEncoder.prototype.encode, 'function');
  t.is(typeof globalThis.TextEncoder.prototype.encodeInto, 'function');
});

test('TextDecoder is present on the start compartment when the host provides it', t => {
  if (!hasTextDecoder) {
    t.pass('host does not provide TextDecoder; nothing to permit');
    return;
  }
  t.is(typeof globalThis.TextDecoder, 'function');
  t.is(typeof globalThis.TextDecoder.prototype.decode, 'function');
});

test('TextEncoder is identity-equal across compartments (universal)', t => {
  if (!hasTextEncoder) {
    t.pass('host does not provide TextEncoder');
    return;
  }
  const c = new Compartment();
  t.is(c.evaluate('typeof TextEncoder'), 'function');
  t.is(c.globalThis.TextEncoder, globalThis.TextEncoder);
  t.is(c.globalThis.TextEncoder.prototype, globalThis.TextEncoder.prototype);
});

test('TextDecoder is identity-equal across compartments (universal)', t => {
  if (!hasTextDecoder) {
    t.pass('host does not provide TextDecoder');
    return;
  }
  const c = new Compartment();
  t.is(c.evaluate('typeof TextDecoder'), 'function');
  t.is(c.globalThis.TextDecoder, globalThis.TextDecoder);
  t.is(c.globalThis.TextDecoder.prototype, globalThis.TextDecoder.prototype);
});

test('TextEncoder constructor and prototype are frozen', t => {
  if (!hasTextEncoder) {
    t.pass('host does not provide TextEncoder');
    return;
  }
  t.true(Object.isFrozen(globalThis.TextEncoder));
  t.true(Object.isFrozen(globalThis.TextEncoder.prototype));
});

test('TextDecoder constructor and prototype are frozen', t => {
  if (!hasTextDecoder) {
    t.pass('host does not provide TextDecoder');
    return;
  }
  t.true(Object.isFrozen(globalThis.TextDecoder));
  t.true(Object.isFrozen(globalThis.TextDecoder.prototype));
});

test('TextEncoder.prototype.encoding getter returns "utf-8"', t => {
  if (!hasTextEncoder) {
    t.pass('host does not provide TextEncoder');
    return;
  }
  // The encoding getter is a load-bearing invariant of the WHATWG Encoding
  // Standard: TextEncoder always encodes UTF-8. A permit that accidentally
  // pruned the getter would surface as a thrown TypeError here.
  t.is(new TextEncoder().encoding, 'utf-8');
  const c = new Compartment();
  t.is(c.evaluate('new TextEncoder().encoding'), 'utf-8');
});

test('TextDecoder.prototype.encoding getter returns "utf-8" by default', t => {
  if (!hasTextDecoder) {
    t.pass('host does not provide TextDecoder');
    return;
  }
  t.is(new TextDecoder().encoding, 'utf-8');
  const c = new Compartment();
  t.is(c.evaluate('new TextDecoder().encoding'), 'utf-8');
});

test('round-trip semantics preserved in the start compartment', t => {
  if (!hasTextEncoder || !hasTextDecoder) {
    t.pass('host does not provide TextEncoder/TextDecoder');
    return;
  }
  // Guards against accidental over-pruning: if the permits table cut
  // `encode` or `decode`, this would throw "encode is not a function".
  t.is(
    new TextDecoder().decode(new TextEncoder().encode('hello, world')),
    'hello, world',
  );
});

test('round-trip semantics preserved inside a compartment', t => {
  if (!hasTextEncoder || !hasTextDecoder) {
    t.pass('host does not provide TextEncoder/TextDecoder');
    return;
  }
  const c = new Compartment();
  t.is(
    c.evaluate(
      'new TextDecoder().decode(new TextEncoder().encode("hello, world"))',
    ),
    'hello, world',
  );
});

test('TextDecoder respects the fatal option', t => {
  if (!hasTextDecoder) {
    t.pass('host does not provide TextDecoder');
    return;
  }
  // Exercises the `fatal` getter on the prototype: an instance constructed
  // with `{ fatal: true }` reports the option through the getter. A
  // permits-table regression that cut `fatal` from the prototype permits
  // surfaces as the getter not existing.
  const fatal = new TextDecoder('utf-8', { fatal: true });
  t.is(fatal.fatal, true);
  const lenient = new TextDecoder();
  t.is(lenient.fatal, false);
});

test('TextEncoder.prototype.encodeInto writes into a Uint8Array', t => {
  if (!hasTextEncoder) {
    t.pass('host does not provide TextEncoder');
    return;
  }
  // Exercises the second prototype method named in the permits table.
  const encoder = new TextEncoder();
  const out = new Uint8Array(5);
  const result = encoder.encodeInto('abc', out);
  t.is(result.read, 3);
  t.is(result.written, 3);
  t.is(out[0], 0x61);
  t.is(out[1], 0x62);
  t.is(out[2], 0x63);
});

test('TextDecoder.prototype.ignoreBOM getter reflects the constructor option', t => {
  if (!hasTextDecoder) {
    t.pass('host does not provide TextDecoder');
    return;
  }
  // Exercises the `ignoreBOM` getter on the prototype: an instance constructed
  // with `{ ignoreBOM: true }` reports the option through the getter, and the
  // default is `false`. A permits-table regression that cut `ignoreBOM` from
  // the prototype permits surfaces as the getter returning `undefined` after
  // lockdown.
  const skip = new TextDecoder('utf-8', { ignoreBOM: true });
  t.is(skip.ignoreBOM, true);
  const strip = new TextDecoder();
  t.is(strip.ignoreBOM, false);
  // The observable behavior the getter selects: with `ignoreBOM: true` the
  // U+FEFF byte-order mark is preserved in the decoded string; with the
  // default it is stripped.
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x61]);
  t.is(strip.decode(bom), 'a');
  t.is(skip.decode(bom), '﻿a');
});

test('@@toStringTag is preserved on TextEncoder and TextDecoder prototypes', t => {
  if (!hasTextEncoder || !hasTextDecoder) {
    t.pass('host does not provide TextEncoder/TextDecoder');
    return;
  }
  // The permits table names `@@toStringTag` on both prototypes. A regression
  // that cuts the tag would make `Object.prototype.toString.call(instance)`
  // return `'[object Object]'` instead of the standard-mandated tags.
  t.is(new TextEncoder()[Symbol.toStringTag], 'TextEncoder');
  t.is(new TextDecoder()[Symbol.toStringTag], 'TextDecoder');
  t.is(
    Object.prototype.toString.call(new TextEncoder()),
    '[object TextEncoder]',
  );
  t.is(
    Object.prototype.toString.call(new TextDecoder()),
    '[object TextDecoder]',
  );
});

test('constructor reverse-link is preserved on both prototypes', t => {
  if (!hasTextEncoder || !hasTextDecoder) {
    t.pass('host does not provide TextEncoder/TextDecoder');
    return;
  }
  // The permits table names `constructor: 'TextEncoder'` and
  // `constructor: 'TextDecoder'` on the respective prototypes. Without those
  // entries the property would be pruned by lockdown and the reverse-link
  // would fall through to `Object.prototype.constructor`.
  t.is(TextEncoder.prototype.constructor, TextEncoder);
  t.is(TextDecoder.prototype.constructor, TextDecoder);
});

test('TextEncoder and TextDecoder inherit from Function.prototype', t => {
  if (!hasTextEncoder || !hasTextDecoder) {
    t.pass('host does not provide TextEncoder/TextDecoder');
    return;
  }
  // The permits table sets `[[Proto]]: '%FunctionPrototype%'` on both
  // constructors. A regression on that line would either fail lockdown
  // outright or relink the prototype to something else.
  t.is(Object.getPrototypeOf(TextEncoder), Function.prototype);
  t.is(Object.getPrototypeOf(TextDecoder), Function.prototype);
});
