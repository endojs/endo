// @ts-nocheck

// Use a package self-reference to go through the "exports" resolution and
// install the hardened environment exactly the way an `@endo/init` consumer
// would see it.
import '@endo/init';
import test from 'ava';

// Regression tests for https://github.com/endojs/endo/issues/2813.
// Recent Node.js releases store private "fast path" flags on each TextDecoder
// instance as own data properties keyed by symbols (e.g. `kUTF8FastPath`,
// `kWindows1252FastPath`). The `decode()` method mutates these flags via
// `&&=`, so once a TextDecoder instance is hardened the subsequent decode
// call would throw. The patch in `@endo/lockdown/post.js` migrates these flags
// to accessor properties on the prototype that are backed by a WeakMap.

const bytes = (...values) => Uint8Array.of(...values);
const HELLO = bytes(72, 101, 108, 108, 111);

for (const encoding of [
  'utf-8',
  'ascii',
  'latin1',
  'iso-8859-1',
  'windows-1252',
]) {
  test(`hardened TextDecoder('${encoding}') decodes`, t => {
    const decoder = harden(new TextDecoder(encoding, { fatal: true }));
    t.is(decoder.decode(HELLO), 'Hello');
    // Decoding twice exercises the fast-path branch a second time.
    t.is(decoder.decode(HELLO), 'Hello');
  });
}

test('hardened TextDecoder decodes with stream option', t => {
  // The `stream: true` path is the case that toggles the fast-path flag from
  // `true` to `false`, which is precisely the assignment that used to throw on
  // a hardened instance.
  const decoder = harden(new TextDecoder('utf-8'));
  const part1 = decoder.decode(bytes(0xe2, 0x82), { stream: true });
  const part2 = decoder.decode(bytes(0xac));
  t.is(part1 + part2, '€');
});

test('hardened TextDecoder for an encoding without a fast path still works', t => {
  const decoder = harden(new TextDecoder('utf-16le'));
  t.is(decoder.decode(bytes(72, 0, 105, 0)), 'Hi');
});

test('non-hardened TextDecoder still decodes normally', t => {
  const decoder = new TextDecoder('utf-8');
  t.is(decoder.decode(HELLO), 'Hello');
});

test('TextDecoder subclass instances can be hardened and decoded', t => {
  class MyDecoder extends TextDecoder {}
  const decoder = harden(new MyDecoder('ascii'));
  t.true(decoder instanceof MyDecoder);
  t.true(decoder instanceof TextDecoder);
  t.is(decoder.decode(HELLO), 'Hello');
});

test('calling TextDecoder without `new` still throws', t => {
  t.throws(() => TextDecoder('utf-8'), { instanceOf: TypeError });
});
