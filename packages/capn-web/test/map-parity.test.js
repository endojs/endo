// @ts-nocheck
// Map parity tests, inspired by cloudflare/capnweb's "map() over RPC"
// suite.  These verify that our `recordRemap` + `replayRemap` machinery
// (used by `session.callRemap`) handles the same patterns capnweb
// supports — applied per-element on the receiver side.
//
// Our `recordRemap` emits capnweb's wire form: `["remap", subjectId,
// propertyPath, captures, instructions]` where each instruction is a
// uniform `["pipeline", subject, path, args?]` step (and the final
// instruction may be a literal primitive).  Wire interop with
// cloudflare/capnweb is exercised in `interop-capnweb.test.js`; the
// suite below targets the semantic surface (record-once-replay-N).

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import {
  makeCapnWebSession,
  makeLoopbackPair,
  recordRemap,
  replayRemap,
} from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, { localMain: bMain, gcImports: false });
  return sessionA;
};

// ---------- standalone recorder/interpreter ----------

test('map: returns input directly', async t => {
  const rec = recordRemap(x => x);
  t.is(await replayRemap(rec, 42), 42);
  t.is(await replayRemap(rec, 'hi'), 'hi');
});

test('map: property access on each element', async t => {
  const rec = recordRemap(u => u.name);
  const items = [{ name: 'alice' }, { name: 'bob' }];
  const out = await Promise.all(items.map(it => replayRemap(rec, it)));
  t.deepEqual(out, ['alice', 'bob']);
});

test('map: deep property access', async t => {
  const rec = recordRemap(u => u.account.balance);
  const items = [{ account: { balance: 100 } }, { account: { balance: 250 } }];
  const out = await Promise.all(items.map(it => replayRemap(rec, it)));
  t.deepEqual(out, [100, 250]);
});

test('map: method call on each element', async t => {
  const rec = recordRemap(u => u.greet('world'));
  const items = [
    { greet: who => `hi ${who} from A` },
    { greet: who => `hi ${who} from B` },
  ];
  const out = await Promise.all(items.map(it => replayRemap(rec, it)));
  t.deepEqual(out, ['hi world from A', 'hi world from B']);
});

test('map: chained calls (a.x().y())', async t => {
  const rec = recordRemap(u => u.account().balance());
  const item = {
    account: () => ({ balance: () => 99 }),
  };
  t.is(await replayRemap(rec, item), 99);
});

test('map: literal return ignores input', async t => {
  const rec = recordRemap(_x => 7);
  t.is(await replayRemap(rec, 'whatever'), 7);
  t.is(await replayRemap(rec, 999), 7);
});

test('map: capture from enclosing scope', async t => {
  const SUFFIX = '!';
  const rec = recordRemap(x => x.greet(SUFFIX));
  const item = { greet: s => `hello${s}` };
  t.is(await replayRemap(rec, item), 'hello!');
});

test('map: numeric index access (arr[0])', async t => {
  const rec = recordRemap(arr => arr[0]);
  t.is(await replayRemap(rec, ['a', 'b', 'c']), 'a');
});

// ---------- session integration ----------

test('callRemap over wire: property access', async t => {
  const item = Far('item', {
    name: () => 'capnweb',
    version: () => 1,
  });
  const session = makePair(Far('s', { get: () => item }));
  const r = session.getRemoteMain();
  const stub = await E(r).get();
  const result = await session.callRemap(stub, x => x.name());
  t.is(result, 'capnweb');
});

test('callRemap over wire: chained method on returned stub', async t => {
  const inner = Far('inner', { value: () => 41 });
  const outer = Far('outer', { inner: () => inner });
  const session = makePair(Far('s', { get: () => outer }));
  const r = session.getRemoteMain();
  const stub = await E(r).get();
  const result = await session.callRemap(stub, x => x.inner().value());
  t.is(result, 41);
});

test('callRemap over wire: capture is shipped', async t => {
  const item = Far('item', {
    add: (a, b) => a + b,
  });
  const session = makePair(Far('s', { get: () => item }));
  const r = session.getRemoteMain();
  const stub = await E(r).get();
  const result = await session.callRemap(stub, x => x.add(10, 20));
  t.is(result, 30);
});

test('callRemap rejects symbol property keys with a clear error', async t => {
  const item = Far('item', { x: () => 1 });
  const session = makePair(Far('s', { get: () => item }));
  const stub = await E(session.getRemoteMain()).get();
  let caught;
  try {
    // eslint-disable-next-line no-undef
    await session.callRemap(stub, x => x[Symbol('foo')]());
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.regex(caught.message, /symbol/);
});

// ---------- per-element invocation pattern (the "map() over RPC" use case) ----------

test('apply mapper per-element: shape of capnweb map() over an array', async t => {
  // Simulate the canonical use case: server has a list of items; client
  // wants a derived value from each (e.g. just one field).  Without
  // map(), the client would round-trip per item.  With recordRemap +
  // applying the recording per item, the client describes the operation
  // once and the server runs it locally per element.
  const items = [
    Far('a', { val: () => 1 }),
    Far('b', { val: () => 2 }),
    Far('c', { val: () => 3 }),
  ];
  const session = makePair(
    Far('s', {
      mapEach: async (recording, list) => {
        const results = await Promise.all(
          list.map(it => replayRemap(recording, it)),
        );
        return results;
      },
      list: () => items,
    }),
  );
  const r = session.getRemoteMain();
  const recording = recordRemap(it => it.val());
  const list = await E(r).list();
  const results = await E(r).mapEach(recording, list);
  t.deepEqual(results, [1, 2, 3]);
});
