// @ts-nocheck
/**
 * Error-path coverage for the schema runtime.
 *
 * These cases all exercise the loud-failure paths that prevent silent
 * wire corruption: layout collisions in the schema text and structurally
 * invalid input passed to the encoder. The happy paths live in
 * test/schema-interop.test.js (byte-equal vs `capnp encode`) and
 * test/schema-rpc.test.js (end-to-end RPC).
 */

import test from '@endo/ses-ava/test.js';
import { loadSchema } from '../src/index.js';

test('parse error: duplicate field ordinal in a struct', t => {
  const text = `@0xfeed1111feed1111;
struct Bad @0x111100000000aaaa {
  a @0 :Int32;
  b @0 :Int32;
}`;
  t.throws(() => loadSchema(text), {
    message: /duplicate field ordinal 0/,
  });
});

test('parse error: duplicate ordinal across a regular field and a union member', t => {
  // The union member's `@N` lives in the same ordinal namespace as the
  // surrounding struct's regular fields; the parser must catch this.
  const text = `@0xfeed1111feed1112;
struct Bad @0x111100000000aaab {
  a @0 :Int32;
  union { b @0 :Int32; c @1 :Text; }
}`;
  t.throws(() => loadSchema(text), {
    message: /duplicate field ordinal 0/,
  });
});

test('parse error: reference to a type name that was never declared', t => {
  // Parser used to silently accept unknown identifiers as struct refs;
  // the failure only surfaced deep inside encode/decode with a confusing
  // "unknown struct" message. Now the load fails up front with the
  // offending type name.
  const text = `@0xfeed1111feed1113;
struct Container @0x111100000000aaac {
  inner @0 :NoSuchThing;
}`;
  t.throws(() => loadSchema(text), {
    message: /unknown type reference.*NoSuchThing/,
  });
});

test('parse error: List(UnknownType) is rejected at load time', t => {
  // The list element type goes through the same rewrite pass; verify it
  // doesn't escape validation just because it's nested.
  const text = `@0xfeed1111feed1114;
struct Container @0x111100000000aaad {
  items @0 :List(NoSuchThing);
}`;
  t.throws(() => loadSchema(text), {
    message: /unknown type reference.*NoSuchThing/,
  });
});

test('encode error: more than one anonymous-union member set in input', t => {
  // The codec writes a single discriminator value, so giving it two
  // candidate active members is ambiguous. We Fail rather than silently
  // pick one (which would silently corrupt the wire format).
  const text = `@0xfeed1111feed1115;
struct U @0x111100000000aaae {
  union {
    add @0 :UInt32;
    sub @1 :UInt32;
    name @2 :Text;
  }
}`;
  const schema = loadSchema(text);
  t.throws(() => schema.encode('U', { add: 1, sub: 2 }), {
    message: /both set/,
  });
  t.throws(() => schema.encode('U', { add: 1, name: 'x' }), {
    message: /both set/,
  });
  // A single member is fine.
  t.notThrows(() => schema.encode('U', { sub: 7 }));
});
