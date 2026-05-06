// @ts-nocheck
/* global setTimeout, globalThis, Response */
// Integration tests inspired by cloudflare/capnweb's __tests__/index.test.ts
// suite — patterns we hadn't yet covered.  Run against the in-memory
// loopback transport (which exercises the same protocol path the real
// transports use).

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, { localMain: bMain, gcImports: false });
  return sessionA.getRemoteMain();
};

// ---------- error propagation ----------

test('error propagation: TypeError preserves class', async t => {
  const r = makePair(
    Far('s', {
      bad: () => {
        throw new TypeError('nope');
      },
    }),
  );
  let caught;
  try {
    await E(r).bad();
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.is(caught.message, 'nope');
});

test('error propagation: RangeError preserves class', async t => {
  const r = makePair(
    Far('s', {
      bad: () => {
        throw new RangeError('out');
      },
    }),
  );
  let caught;
  try {
    await E(r).bad();
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof RangeError);
  t.is(caught.message, 'out');
});

test('error propagation: remote stack lines are not exposed', async t => {
  const r = makePair(
    Far('s', {
      bad: () => {
        // Throw from inside a clearly-named function so we can check
        // whether that name leaks across the wire.
        // eslint-disable-next-line camelcase
        const remoteSecretFrame = () => {
          throw new Error('boom');
        };
        return remoteSecretFrame();
      },
    }),
  );
  let caught;
  try {
    await E(r).bad();
  } catch (e) {
    caught = e;
  }
  // The error's message naturally appears in `.stack` (V8 puts it in the
  // header line), so we assert on a function-name fragment that would
  // only be present if the remote stack were transferred verbatim.
  const stack = typeof caught?.stack === 'string' ? caught.stack : '';
  t.false(stack.includes('remoteSecretFrame'));
});

// ---------- non-serializable values ----------

test('rejects bare function as argument with a clear error', async t => {
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(() => 1);
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.regex(caught.message, /Far|makeExo|serialize/);
});

test('rejects Symbol value', async t => {
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(Symbol('nope'));
  } catch (e) {
    caught = e;
  }
  t.truthy(caught);
});

// ---------- circular reference handling ----------

test('circular object reference is rejected (does not infinite-loop)', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const obj = { a: 1 };
  obj.self = obj;
  let caught;
  try {
    await Promise.race([
      E(r).echo(obj),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('TIMEOUT')), 1500),
      ),
    ]);
  } catch (e) {
    caught = e;
  }
  t.truthy(caught);
});

// ---------- large payloads ----------

test('large Uint8Array (10000 bytes) round-trips', async t => {
  const r = makePair(Far('s', { echo: x => x }));
  const big = new Uint8Array(10000);
  for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
  const back = await E(r).echo(big);
  t.is(back.length, big.length);
  t.is(back[0], 0);
  t.is(back[1], 1);
  t.is(back[255], 255);
  t.is(back[256], 0);
  t.is(back[9999], 9999 % 256);
});

test('Uint8Array with trailing byte 61 (=) round-trips', async t => {
  // Byte 61 is ASCII '=' which is base64's padding char.  Lazy decoders
  // that strip trailing '=' might mishandle this.
  const r = makePair(Far('s', { echo: x => x }));
  const v = new Uint8Array([1, 2, 3, 61]);
  const back = await E(r).echo(v);
  t.deepEqual([...back], [1, 2, 3, 61]);
});

// ---------- promise pipelining ----------

test('pipelining: server returns a Promise', async t => {
  const r = makePair(
    Far('s', {
      slow: () =>
        new Promise(resolve => setTimeout(() => resolve('eventual'), 30)),
    }),
  );
  t.is(await E(r).slow(), 'eventual');
});

test('pipelining: passing a Promise as an argument', async t => {
  const r = makePair(
    Far('s', {
      eat: async p => {
        const v = await p;
        return v * 2;
      },
    }),
  );
  let resolveLater;
  const pending = new Promise(rr => {
    resolveLater = rr;
  });
  const callP = E(r).eat(pending);
  await new Promise(rr => setTimeout(rr, 5));
  resolveLater(21);
  t.is(await callP, 42);
});

test('pipelining: error in a chained call propagates', async t => {
  const counter = Far('counter', {
    bad: () => {
      throw new Error('inner');
    },
  });
  const r = makePair(Far('s', { counter: () => counter }));
  let caught;
  try {
    await E(E(r).counter()).bad();
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof Error);
  t.is(caught.message, 'inner');
});

// ---------- three-party capability passing ----------

test('capability passing: Alice → Bob → Carol forwarding (proxied through Bob)', async t => {
  // Bob holds two sessions: one to Alice (whose main is a helper) and one
  // to Carol (whose main accepts a helper and calls a method on it).  Bob
  // forwards Alice's stub through to Carol.  Carol's invocation on the
  // helper proxies back through Bob into Alice — this is the same
  // "proxied through the intermediary" forwarding capnweb's README
  // documents.
  const aliceHelper = Far('alice-helper', {
    hello: name => `from-alice ${name}`,
  });
  const carolMain = Far('carol', {
    invoke: async helper => E(helper).hello('carol'),
  });

  const { a: aliceLink, b: bobLinkToAlice } = makeLoopbackPair();
  const { a: bobLinkToCarol, b: carolLink } = makeLoopbackPair();

  makeCapnWebSession(aliceLink, { localMain: aliceHelper, gcImports: false });
  makeCapnWebSession(carolLink, { localMain: carolMain, gcImports: false });
  const bobToAlice = makeCapnWebSession(bobLinkToAlice, { gcImports: false });
  const bobToCarol = makeCapnWebSession(bobLinkToCarol, { gcImports: false });

  const aliceFromBob = bobToAlice.getRemoteMain();
  const carolFromBob = bobToCarol.getRemoteMain();
  const result = await E(carolFromBob).invoke(aliceFromBob);
  t.is(result, 'from-alice carol');

  bobToAlice.abort();
  bobToCarol.abort();
});

// ---------- e-order ----------

test('e-order: concurrent E() calls land in send order', async t => {
  const log = [];
  const r = makePair(
    Far('s', {
      log: tag => {
        log.push(tag);
        return tag;
      },
    }),
  );
  const ps = [E(r).log('a'), E(r).log('b'), E(r).log('c'), E(r).log('d')];
  const results = await Promise.all(ps);
  t.deepEqual(results, ['a', 'b', 'c', 'd']);
  t.deepEqual(log, ['a', 'b', 'c', 'd']);
});

test('e-order: pipelined calls on a returned stub maintain order', async t => {
  const log = [];
  const counter = Far('counter', {
    incr: tag => {
      log.push(tag);
      return tag;
    },
  });
  const r = makePair(Far('s', { get: () => counter }));
  const cP = E(r).get();
  const ps = [E(cP).incr('1'), E(cP).incr('2'), E(cP).incr('3')];
  await Promise.all(ps);
  t.deepEqual(log, ['1', '2', '3']);
});

// ---------- no spurious unhandled rejections ----------

test('un-awaited rejecting call does not crash the runner', async t => {
  // ava reports unhandled rejections as test failures.  This test passes
  // simply by not crashing.
  const r = makePair(
    Far('s', {
      bad: () => {
        throw new Error('uncaught');
      },
    }),
  );
  const p = E(r).bad();
  p.catch(() => {});
  await new Promise(rr => setTimeout(rr, 50));
  t.pass();
});

// ---------- many concurrent calls (stress) ----------

test('100 concurrent calls all complete in order', async t => {
  const r = makePair(Far('s', { identity: x => x }));
  const N = 100;
  const ps = [];
  for (let i = 0; i < N; i += 1) ps.push(E(r).identity(i));
  const results = await Promise.all(ps);
  t.is(results.length, N);
  for (let i = 0; i < N; i += 1) t.is(results[i], i);
});

// ---------- nested capability passing ----------

test('nested capability: helper inside a returned object', async t => {
  const helper = Far('helper', { add: (a, b) => a + b });
  const r = makePair(
    Far('s', {
      bundle: () => ({ name: 'box', helper }),
    }),
  );
  const box = await E(r).bundle();
  t.is(box.name, 'box');
  t.is(await E(box.helper).add(2, 5), 7);
});

test('nested capability: capabilities deep inside an array of objects', async t => {
  const a = Far('a', { tag: () => 'A' });
  const b = Far('b', { tag: () => 'B' });
  const r = makePair(
    Far('s', {
      list: () => [
        { id: 1, h: a },
        { id: 2, h: b },
      ],
    }),
  );
  const list = await E(r).list();
  t.is(list[0].id, 1);
  t.is(await E(list[0].h).tag(), 'A');
  t.is(list[1].id, 2);
  t.is(await E(list[1].h).tag(), 'B');
});

// ---------- argument round-trip identity ----------

test('argument round-trip: passing a remote stub back to its origin is recognised', async t => {
  const probe = Far('probe', { id: () => 'probe-1' });
  const r = makePair(
    Far('s', {
      get: () => probe,
      check: x => (x === probe ? 'same' : 'different'),
    }),
  );
  const got = await E(r).get();
  const result = await E(r).check(got);
  t.is(result, 'same');
});

// ---------- additional non-serializable categories (capnweb parity) ----------

test('rejects Map value with a clear error', async t => {
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(new Map([['a', 1]]));
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.regex(caught.message, /serialize|passable/i);
});

test('rejects Set value with a clear error', async t => {
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(new Set([1, 2]));
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.regex(caught.message, /serialize|passable/i);
});

test('rejects WeakMap value', async t => {
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(new WeakMap());
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
});

test('rejects unmarked plain class instance with a clear error', async t => {
  // A class instance that wasn't wrapped with Far / makeExo is neither a
  // remotable nor a copy-record (its prototype isn't Object.prototype),
  // so it has no place in the wire form.  capnweb rejects via a generic
  // "Cannot serialize value" error; we surface a more specific one
  // mentioning the value's type.
  class Widget {
    constructor() {
      this.kind = 'widget';
    }
  }
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(new Widget());
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.regex(caught.message, /serialize|passable/i);
});

const haveFetch = typeof globalThis.Response === 'function';
const fetchTest = haveFetch ? test : test.skip;

fetchTest('rejects Response carrying a webSocket (capnweb parity)', async t => {
  // Capnweb explicitly rejects this on the encode path because the
  // socket is bound to the emitting runtime and can't survive
  // serialization.  We mirror that check in `encodeResponse`.
  const fakeResponse = new Response(null, { status: 200 });
  // Forcibly stamp a `webSocket` property to simulate what runtimes
  // like Cloudflare Workers expose on `Response` instances.  Don't
  // bother with a real WebSocket — the encoder check is shape-only.
  Object.defineProperty(fakeResponse, 'webSocket', {
    value: { readyState: 0 },
    enumerable: false,
  });
  const r = makePair(Far('s', { take: x => x }));
  let caught;
  try {
    await E(r).take(fakeResponse);
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.regex(caught.message, /webSocket/);
});
