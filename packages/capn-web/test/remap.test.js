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
  t.is(rec.instructions.length, 0);
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
  const suffix = '!!';
  const rec = recordRemap(obj => obj.greet(suffix));
  // suffix is a non-placeholder, so it's captured.
  t.is(rec.captures.length, 1);
  t.is(rec.captures[0], '!!');
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
