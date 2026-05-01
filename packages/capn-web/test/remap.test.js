// @ts-nocheck
// Tests for the remap (record-replay) machinery used to ship `.map()` callbacks
// over the wire.  Covers both the standalone recorder/interpreter and the
// session integration via `session.callRemap(stub, mapper)`.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import {
  recordRemap,
  replayRemap,
  makeCapnWebSession,
  makeLoopbackPair,
} from '../src/index.js';

test('record + replay: identity (returning input)', async t => {
  const rec = recordRemap(x => x);
  // Capnweb wire format always emits at least one instruction for the
  // recording's answer; identity emits a single ["pipeline", 0, []].
  t.is(rec.instructions.length, 1);
  t.is(await replayRemap(rec, 7), 7);
});

test('record + replay: property access', async t => {
  const rec = recordRemap(user => user.name);
  t.is(await replayRemap(rec, { name: 'Alice' }), 'Alice');
});

test('record + replay: nested property access', async t => {
  const rec = recordRemap(user => user.profile.email);
  t.is(await replayRemap(rec, { profile: { email: 'a@b.com' } }), 'a@b.com');
});

test('record + replay: method call', async t => {
  const rec = recordRemap(obj => obj.greet('world'));
  const greeter = { greet: name => `hi ${name}` };
  t.is(await replayRemap(rec, greeter), 'hi world');
});

test('record + replay: capture is shipped along', async t => {
  // Stub captures end up in the captures array.  Primitive arguments
  // (like the string below) are inlined directly in the instruction's
  // args expression — that's how capnweb's wire form treats them.
  const suffix = '!!';
  const rec = recordRemap(obj => obj.greet(suffix));
  // Primitive captures are inlined; captures[] only holds non-primitive
  // captures (e.g. stubs).
  t.is(rec.captures.length, 0);
  const greeter = { greet: s => `hello${s}` };
  t.is(await replayRemap(rec, greeter), 'hello!!');
});

test('record + replay: chained property + call', async t => {
  const rec = recordRemap(u => u.account.balance());
  const u = { account: { balance: () => 100 } };
  t.is(await replayRemap(rec, u), 100);
});

// ---- session integration ----

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, { localMain: bMain, gcImports: false });
  return sessionA;
};

test('callRemap: peer applies a mapper', async t => {
  const item = Far('item', {
    name: () => 'hello',
    upper: function upper() {
      return this.name().toUpperCase();
    },
  });
  const session = makePair(Far('s', { get: () => item }));
  const r = session.getRemoteMain();
  const stub = await E(r).get();
  // Apply a remote mapper that calls .name() on the stub.
  const result = await session.callRemap(stub, x => x.name());
  t.is(result, 'hello');
});

test('callRemap: chained method on the remote side', async t => {
  const item = Far('item', { square: x => x * x });
  const session = makePair(Far('s', { get: () => item }));
  const r = session.getRemoteMain();
  const stub = await E(r).get();
  const result = await session.callRemap(stub, x => x.square(7));
  t.is(result, 49);
});

test('record + replay: literal (constant) return', async t => {
  const rec = recordRemap(_ => 42);
  t.is(await replayRemap(rec, 'whatever'), 42);
});

test('record + replay: works on multiple inputs', async t => {
  const rec = recordRemap(item => item.double());
  const items = [{ double: () => 2 }, { double: () => 4 }];
  const out = await Promise.all(items.map(it => replayRemap(rec, it)));
  t.deepEqual(out, [2, 4]);
});

test('non-finite numbers in mapper args go through captures, not inline', async t => {
  // JSON.stringify(NaN) is "null", so inlining NaN/Infinity as a literal
  // arg would silently corrupt the recording on the wire.  These values
  // must be routed through `captures`, where the special-value codec
  // preserves them as ["nan"] / ["inf"] / ["-inf"].
  const rec = recordRemap(item => item.scale(NaN, Infinity, -Infinity));
  // Find the call instruction (the one with args), not the get-only
  // answer-reference that follows it.
  const callExpr = rec.instructions.find(
    i => Array.isArray(i) && i[0] === 'pipeline' && i[3] !== undefined,
  );
  t.truthy(callExpr, 'expected a pipeline call instruction');
  const args = callExpr[3];
  for (const a of args) {
    t.true(
      Array.isArray(a) &&
        a[0] === 'pipeline' &&
        typeof a[1] === 'number' &&
        a[1] < 0,
    );
  }
  t.is(rec.captures.length, 3);
  t.true(Number.isNaN(rec.captures[0]));
  t.is(rec.captures[1], Infinity);
  t.is(rec.captures[2], -Infinity);
  // And the recording still replays correctly locally.
  const item = {
    scale: (a, b, c) => [a, b, c],
  };
  const out = await replayRemap(rec, item);
  t.true(Number.isNaN(out[0]));
  t.is(out[1], Infinity);
  t.is(out[2], -Infinity);
});

test('non-finite number as mapper return value also goes through captures', async t => {
  const rec = recordRemap(_ => NaN);
  // Final instruction should be a pipeline reference into captures, not
  // the raw NaN (which would JSON-stringify to null).
  const last = rec.instructions[rec.instructions.length - 1];
  t.true(
    Array.isArray(last) &&
      last[0] === 'pipeline' &&
      typeof last[1] === 'number' &&
      last[1] < 0,
  );
  t.is(rec.captures.length, 1);
  t.true(Number.isNaN(rec.captures[0]));
});
