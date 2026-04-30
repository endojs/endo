// @ts-nocheck
/**
 * Byte-level schema interop with the reference Cap'n Proto C++ implementation.
 *
 * For each schema fixture we:
 *   1. Encode a JS object via our `loadSchema(text).encode(struct, obj)`.
 *   2. Encode the same object via `capnp encode <schema> <Struct>`.
 *   3. Assert the two byte streams are identical.
 *   4. Decode both byte streams via our `loadSchema(text).decode(struct, b)`
 *      and assert the resulting JS objects are identical.
 *
 * Skipped if the `capnp` CLI is not available, so environments without
 * `capnproto` installed don't fail the suite.
 */

import test from '@endo/ses-ava/test.js';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadSchema } from '../src/schema/index.js';

const haveCapnp = (() => {
  const r = spawnSync('capnp', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
})();

if (!haveCapnp) {
  test('SKIP: capnp CLI not available, skipping schema interop tests', t => {
    t.pass('install `capnproto` to run schema interop tests');
  });
} else {
  /**
   * Write `schemaText` into a temp .capnp file and return the path. The
   * caller is responsible for cleaning up the parent dir.
   *
   * @param {string} dir
   * @param {string} schemaText
   */
  const writeSchemaFile = (dir, schemaText) => {
    const p = join(dir, 'schema.capnp');
    writeFileSync(p, schemaText);
    return p;
  };

  /**
   * Run `capnp encode` with the given schema + struct + value text.
   *
   * @param {string} schemaPath
   * @param {string} structName
   * @param {string} valueText
   */
  const capnpEncode = (schemaPath, structName, valueText) => {
    const r = spawnSync(
      'capnp',
      ['encode', '--no-standard-import', schemaPath, structName],
      {
        input: valueText,
      },
    );
    if (r.status !== 0) {
      throw Error(`capnp encode failed: ${r.stderr?.toString() || ''}`);
    }
    const stdout = r.stdout;
    const out = new ArrayBuffer(stdout.length);
    new Uint8Array(out).set(stdout);
    return out;
  };

  const hex = bytes =>
    Array.from(new Uint8Array(bytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

  /**
   * Run a round-trip case:
   *   - encode JS obj with us, encode value-text with capnp CLI; compare bytes
   *   - decode our bytes; assert deepEqual to expected
   *
   * @param {object} t  ava test ctx
   * @param {string} schemaText
   * @param {string} structName
   * @param {object} jsObj
   * @param {string} capnpText  textual representation for `capnp encode`
   * @param {object} expected   shape produced by our decoder
   */
  const roundTrip = (t, schemaText, structName, jsObj, capnpText, expected) => {
    const dir = mkdtempSync(join(tmpdir(), 'capnp-interop-'));
    try {
      const schemaPath = writeSchemaFile(dir, schemaText);
      const ref = capnpEncode(schemaPath, structName, capnpText);
      const schema = loadSchema(schemaText);
      const ours = schema.encode(structName, jsObj);
      t.is(hex(ref), hex(ours), `${structName} encode bytes match capnp CLI`);
      const decoded = schema.decode(structName, ref);
      t.deepEqual(decoded, expected, `${structName} decode matches`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test('schema interop: simple struct with text + primitives', t => {
    const schemaText = `
@0xabcd1234abcd1234;
struct Person @0x9999000000000001 {
  name @0 :Text;
  age @1 :UInt8;
  email @2 :Text;
  active @3 :Bool;
  scores @4 :List(Int32);
}
`;
    roundTrip(
      t,
      schemaText,
      'Person',
      {
        name: 'Alice',
        age: 30,
        email: 'a@x.com',
        active: true,
        scores: [10, 20, 30],
      },
      `( name = "Alice", age = 30, email = "a@x.com", active = true,
         scores = [10, 20, 30] )`,
      {
        name: 'Alice',
        age: 30,
        email: 'a@x.com',
        active: true,
        scores: [10, 20, 30],
      },
    );
  });

  test('schema interop: layout-tricky mixed primitive sizes', t => {
    const schemaText = `
@0xfeed1234feed1234;
struct Mixed @0x8888000000000001 {
  a @0 :Bool;
  b @1 :UInt32;
  c @2 :Bool;
  d @3 :UInt16;
  e @4 :Bool;
  f @5 :UInt64;
  g @6 :Bool;
}
`;
    roundTrip(
      t,
      schemaText,
      'Mixed',
      {
        a: true,
        b: 0xdeadbeef,
        c: true,
        d: 0xabcd,
        e: false,
        f: 0xcafef00dcafef00dn,
        g: true,
      },
      `( a = true, b = 0xdeadbeef, c = true, d = 0xabcd,
         e = false, f = 0xcafef00dcafef00d, g = true )`,
      {
        a: true,
        b: 3735928559,
        c: true,
        d: 43981,
        e: false,
        f: 14627392581776896013n,
        g: true,
      },
    );
  });

  test('schema interop: floats', t => {
    const schemaText = `
@0xfeed1234feed1235;
struct Point @0x8888000000000002 {
  x @0 :Float64;
  y @1 :Float64;
}
`;
    roundTrip(
      t,
      schemaText,
      'Point',
      { x: 3.14, y: 2.71 },
      `( x = 3.14, y = 2.71 )`,
      { x: 3.14, y: 2.71 },
    );
  });

  test('schema interop: nested struct list', t => {
    const schemaText = `
@0xfeed1234feed1236;
struct Point @0x8888000000000010 {
  x @0 :Float64;
  y @1 :Float64;
}
struct Path @0x8888000000000011 {
  name @0 :Text;
  points @1 :List(Point);
  closed @2 :Bool;
}
`;
    roundTrip(
      t,
      schemaText,
      'Path',
      {
        name: 'loop',
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 },
        ],
        closed: true,
      },
      `( name = "loop",
         points = [(x=1,y=2),(x=3,y=4),(x=5,y=6)],
         closed = true )`,
      {
        name: 'loop',
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
          { x: 5, y: 6 },
        ],
        closed: true,
      },
    );
  });

  test('schema interop: list of text and list of data', t => {
    const schemaText = `
@0xfeed1234feed1237;
struct Stuff @0x8888000000000020 {
  tags @0 :List(Text);
  blobs @1 :List(Data);
}
`;
    roundTrip(
      t,
      schemaText,
      'Stuff',
      {
        tags: ['alpha', 'beta', 'gamma'],
        blobs: [
          new Uint8Array([0xde, 0xad]),
          new Uint8Array([0xbe, 0xef, 0x00]),
        ],
      },
      `( tags = ["alpha", "beta", "gamma"],
         blobs = [0x"dead", 0x"beef00"] )`,
      {
        tags: ['alpha', 'beta', 'gamma'],
        blobs: [
          new Uint8Array([0xde, 0xad]),
          new Uint8Array([0xbe, 0xef, 0x00]),
        ],
      },
    );
  });

  test('schema interop: list of Bool packs into bits', t => {
    const schemaText = `
@0xfeed1234feed1238;
struct Bits @0x8888000000000030 {
  flags @0 :List(Bool);
}
`;
    roundTrip(
      t,
      schemaText,
      'Bits',
      { flags: [true, false, true, true, false, false, true, false, true] },
      `( flags = [true, false, true, true, false, false, true, false, true] )`,
      { flags: [true, false, true, true, false, false, true, false, true] },
    );
  });

  test('schema interop: anonymous union (data + pointer + void members)', t => {
    const schemaText = `
@0xfeedfacefacefeed;
struct M @0x9999000000000040 {
  union {
    a @0 :UInt32;
    b @1 :Text;
    c @2 :UInt8;
    d @3 :Void;
  }
}
`;
    // The decoder also includes a synthetic `_which` field naming the
    // active member, so callers can switch on it without iterating keys.
    roundTrip(t, schemaText, 'M', { a: 0xdeadbeef }, `(a = 0xdeadbeef)`, {
      a: 3735928559,
      _which: 'a',
    });
    roundTrip(t, schemaText, 'M', { b: 'hello' }, `(b = "hello")`, {
      b: 'hello',
      _which: 'b',
    });
    roundTrip(t, schemaText, 'M', { c: 7 }, `(c = 7)`, { c: 7, _which: 'c' });
    roundTrip(t, schemaText, 'M', { d: null }, `(d = void)`, {
      d: null,
      _which: 'd',
    });
  });

  test('schema interop: anonymous union mixed with regular fields', t => {
    const schemaText = `
@0xfeedfacefacefeed;
struct V @0x9999000000000041 {
  x @0 :UInt32;
  union {
    a @1 :UInt32;
    b @2 :UInt32;
  }
}
`;
    roundTrip(t, schemaText, 'V', { x: 100, a: 200 }, `(x = 100, a = 200)`, {
      x: 100,
      a: 200,
      _which: 'a',
    });
    roundTrip(t, schemaText, 'V', { x: 100, b: 300 }, `(x = 100, b = 300)`, {
      x: 100,
      b: 300,
      _which: 'b',
    });
  });
}
