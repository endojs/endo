// @ts-nocheck
/* global setTimeout */
/* eslint-disable max-classes-per-file, class-methods-use-this,
   lines-between-class-members -- the interop suite mirrors capnweb's
   "extend RpcTarget" idiom; multiple short classes per test are idiomatic. */
// Interop test: connect an @endo/capn-web session to a real
// cloudflare/capnweb RpcSession over an in-memory transport pair.  Both
// sides should successfully exchange capabilities, calls, and results.
//
// `capnweb` is a tracked devDependency of this package.  Its shipped
// TypeScript declarations contain TS2574 errors, so the root tsconfig
// sets `skipLibCheck: true` to keep the docs build green.  The dynamic
// `await import('capnweb')` below still falls back to skipping every
// test in this file if the dependency is somehow unavailable at runtime
// (e.g. a partial install) — this isn't expected on a fresh `yarn`.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

// Try to load capnweb at module top.  If it's not installed, every
// test in the file becomes test.skip rather than failing.
let capnweb;
try {
  // eslint-disable-next-line import/no-unresolved
  capnweb = await import('capnweb');
} catch (_e) {
  capnweb = null;
}

const interop = capnweb ? test : test.skip;

// Adapt our loopback queue to the capnweb RpcTransport interface, which
// expects `receive()` to return a Promise<string> (rejecting on disconnect)
// rather than Promise<string|null>.
const adaptForCapnweb = transport => ({
  send: m => Promise.resolve(transport.send(m)),
  receive: async () => {
    const m = await transport.receive();
    if (m === null || m === undefined) {
      throw new Error('disconnected');
    }
    return m;
  },
  abort: transport.abort,
});

interop('endo client → capnweb server: simple call', async t => {
  const { a, b } = makeLoopbackPair();
  // Capnweb side serves a main with hello().
  class Main extends capnweb.RpcTarget {
    hello(name) {
      return `Hello, ${name}!`;
    }
  }
  // eslint-disable-next-line no-new
  new capnweb.RpcSession(adaptForCapnweb(b), new Main());

  const endoClient = makeCapnWebSession(a, { gcImports: false });
  const r = endoClient.getRemoteMain();
  t.is(await E(r).hello('capnweb'), 'Hello, capnweb!');
  endoClient.abort();
});

interop('capnweb client → endo server: simple call', async t => {
  const { a, b } = makeLoopbackPair();
  // Endo side serves a main with hello().
  makeCapnWebSession(b, {
    localMain: Far('main', { hello: name => `Hello, ${name}!` }),
    gcImports: false,
  });

  const capnwebSession = new capnweb.RpcSession(adaptForCapnweb(a));
  const remoteMain = capnwebSession.getRemoteMain();
  t.is(await remoteMain.hello('endo'), 'Hello, endo!');
});

interop('endo client → capnweb server: special values round-trip', async t => {
  const { a, b } = makeLoopbackPair();
  class Main extends capnweb.RpcTarget {
    echo(x) {
      return x;
    }
  }
  // eslint-disable-next-line no-new
  new capnweb.RpcSession(adaptForCapnweb(b), new Main());

  const endoClient = makeCapnWebSession(a, { gcImports: false });
  const r = endoClient.getRemoteMain();
  t.is(await E(r).echo(42n), 42n);
  const d = new Date(123456789);
  const dBack = await E(r).echo(d);
  t.is(dBack.getTime(), d.getTime());
  const back = await E(r).echo(undefined);
  t.is(back, undefined);
  const bytesBack = await E(r).echo(new Uint8Array([1, 2, 3]));
  t.is(bytesBack[0], 1);
  t.is(bytesBack[2], 3);
  endoClient.abort();
});

interop('endo client → capnweb server: arguments and pipelining', async t => {
  const { a, b } = makeLoopbackPair();
  class Main extends capnweb.RpcTarget {
    add(x, y) {
      return x + y;
    }
    getCounter() {
      // eslint-disable-next-line no-use-before-define
      return new Counter();
    }
  }
  class Counter extends capnweb.RpcTarget {
    constructor() {
      super();
      this.n = 0;
    }
    incr() {
      this.n += 1;
      return this.n;
    }
  }
  // eslint-disable-next-line no-new
  new capnweb.RpcSession(adaptForCapnweb(b), new Main());

  const endoClient = makeCapnWebSession(a, { gcImports: false });
  const r = endoClient.getRemoteMain();
  t.is(await E(r).add(20, 22), 42);
  const c = await E(r).getCounter();
  t.is(await E(c).incr(), 1);
  t.is(await E(c).incr(), 2);
  endoClient.abort();
});

interop('capnweb client → endo server: special values round-trip', async t => {
  const { a, b } = makeLoopbackPair();
  makeCapnWebSession(b, {
    localMain: Far('main', { echo: x => x }),
    gcImports: false,
  });

  const capnwebSession = new capnweb.RpcSession(adaptForCapnweb(a));
  const remoteMain = capnwebSession.getRemoteMain();
  t.is(await remoteMain.echo(123n), 123n);
  const dBack = await remoteMain.echo(new Date(7));
  t.is(dBack.getTime(), 7);
  t.is(await remoteMain.echo(undefined), undefined);
});

interop(
  'endo client → capnweb server: capability passed both ways',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      async use(helper, x) {
        // helper is an Endo Far on the wire.  Calling .square(x) on it sends
        // a method call back to the Endo side.
        return helper.square(x);
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());

    const helper = Far('helper', { square: x => x * x });
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    const r = endoClient.getRemoteMain();
    t.is(await E(r).use(helper, 9), 81);
    endoClient.abort();
  },
);

// ---------- map() interop ----------

interop(
  'endo callRemap → capnweb server: peer applies recorded mapper',
  async t => {
    // Endo client uses session.callRemap to ship a recorded mapper.  The
    // capnweb server receives a `["remap", id, path, captures, instructions]`
    // expression and applies it via its built-in map machinery.
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      getItems() {
        return [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());

    const endoClient = makeCapnWebSession(a, { gcImports: false });
    const r = endoClient.getRemoteMain();
    // Use the path-based callRemap form: target is `r.getItems()`, the
    // mapper applies to each element of the resulting array.  capnweb
    // returns each result as its own promise stub, so we await the
    // returned array of stubs to materialise the values.
    const namePromises = await endoClient.callRemap(
      { stub: r, path: ['getItems'], args: [] },
      x => x.name,
    );
    const names = await Promise.all(namePromises);
    t.deepEqual(names, ['a', 'b', 'c']);
    endoClient.abort();
  },
);

interop('endo callRemap → capnweb server: method call per element', async t => {
  const { a, b } = makeLoopbackPair();
  class Counter extends capnweb.RpcTarget {
    constructor(start) {
      super();
      this.n = start;
    }
    next() {
      const v = this.n;
      this.n += 1;
      return v;
    }
  }
  class Main extends capnweb.RpcTarget {
    getCounters() {
      return [new Counter(10), new Counter(100), new Counter(1000)];
    }
  }
  // eslint-disable-next-line no-new
  new capnweb.RpcSession(adaptForCapnweb(b), new Main());

  const endoClient = makeCapnWebSession(a, { gcImports: false });
  const r = endoClient.getRemoteMain();
  const firstPromises = await endoClient.callRemap(
    { stub: r, path: ['getCounters'], args: [] },
    c => c.next(),
  );
  const firsts = await Promise.all(firstPromises);
  t.deepEqual(firsts, [10, 100, 1000]);
  endoClient.abort();
});

// ---------- non-finite numbers and additional special values ----------

interop(
  'endo client → capnweb server: NaN / +Infinity / -Infinity round-trip',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      echo(x) {
        return x;
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    const r = endoClient.getRemoteMain();
    t.true(Number.isNaN(await E(r).echo(NaN)));
    t.is(await E(r).echo(Infinity), Infinity);
    t.is(await E(r).echo(-Infinity), -Infinity);
    endoClient.abort();
  },
);

interop(
  'capnweb client → endo server: NaN / +Infinity / -Infinity round-trip',
  async t => {
    const { a, b } = makeLoopbackPair();
    makeCapnWebSession(b, {
      localMain: Far('main', { echo: x => x }),
      gcImports: false,
    });
    const cw = new capnweb.RpcSession(adaptForCapnweb(a));
    const r = cw.getRemoteMain();
    t.true(Number.isNaN(await r.echo(NaN)));
    t.is(await r.echo(Infinity), Infinity);
    t.is(await r.echo(-Infinity), -Infinity);
  },
);

// ---------- error propagation ----------

interop(
  'endo client → capnweb server: server throws preserves error message',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      bad() {
        throw new TypeError('boom from capnweb');
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    let caught;
    try {
      await E(endoClient.getRemoteMain()).bad();
    } catch (e) {
      caught = e;
    }
    t.true(caught instanceof Error);
    t.regex(caught.message, /boom from capnweb/);
    endoClient.abort();
  },
);

interop(
  'capnweb client → endo server: server throws preserves error message',
  async t => {
    const { a, b } = makeLoopbackPair();
    makeCapnWebSession(b, {
      localMain: Far('main', {
        bad: () => {
          throw new TypeError('boom from endo');
        },
      }),
      gcImports: false,
    });
    const cw = new capnweb.RpcSession(adaptForCapnweb(a));
    let caught;
    try {
      await cw.getRemoteMain().bad();
    } catch (e) {
      caught = e;
    }
    t.true(caught instanceof Error);
    t.regex(caught.message, /boom from endo/);
  },
);

interop(
  'endo client → capnweb server: Error object as a value round-trips',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      echo(x) {
        return x;
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    const back = await E(endoClient.getRemoteMain()).echo(
      new RangeError('out of bounds'),
    );
    t.true(back instanceof RangeError);
    t.regex(back.message, /out of bounds/);
    endoClient.abort();
  },
);

// ---------- compound argument shapes ----------

interop(
  'endo client → capnweb server: array of stubs as a single argument',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      async sumTags(stubs) {
        // Each stub is one of our Far'd helpers; invoke .tag() on each
        // and concatenate.  Pipelining lets us issue all .tag() calls
        // at once and await them together.
        const tags = await Promise.all(stubs.map(s => s.tag()));
        return tags.join('+');
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    const helpers = [
      Far('a', { tag: () => 'a' }),
      Far('b', { tag: () => 'b' }),
      Far('c', { tag: () => 'c' }),
    ];
    t.is(await E(endoClient.getRemoteMain()).sumTags(helpers), 'a+b+c');
    endoClient.abort();
  },
);

interop(
  'endo client → capnweb server: nested record carrying a stub',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      async unwrap(env) {
        return env.payload.helper.tag();
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    const env = {
      kind: 'wrap',
      payload: {
        seq: 7,
        helper: Far('h', { tag: () => 'inner' }),
      },
    };
    t.is(await E(endoClient.getRemoteMain()).unwrap(env), 'inner');
    endoClient.abort();
  },
);

// ---------- promise as argument ----------

interop(
  'endo client → capnweb server: passing an unresolved Promise as arg',
  async t => {
    const { a, b } = makeLoopbackPair();
    class Main extends capnweb.RpcTarget {
      async eat(p) {
        const v = await p;
        return v * 2;
      }
    }
    // eslint-disable-next-line no-new
    new capnweb.RpcSession(adaptForCapnweb(b), new Main());
    const endoClient = makeCapnWebSession(a, { gcImports: false });
    let resolveLater;
    const pending = new Promise(rr => {
      resolveLater = rr;
    });
    const callP = E(endoClient.getRemoteMain()).eat(pending);
    setTimeout(() => resolveLater(21), 5);
    t.is(await callP, 42);
    endoClient.abort();
  },
);

// ---------- map() in the reverse direction (capnweb client → endo server) ----------

interop(
  'capnweb client → endo server: capnweb .map() against endo Far list',
  async t => {
    const { a, b } = makeLoopbackPair();
    makeCapnWebSession(b, {
      localMain: Far('main', {
        getItems: () => [
          Far('i1', { name: () => 'one' }),
          Far('i2', { name: () => 'two' }),
          Far('i3', { name: () => 'three' }),
        ],
      }),
      gcImports: false,
    });
    const cw = new capnweb.RpcSession(adaptForCapnweb(a));
    const r = cw.getRemoteMain();
    // capnweb's map() on an array result returns an array of result
    // promises; await all to materialise them.
    const namePromises = await r.getItems().map(it => it.name());
    const names = await Promise.all(namePromises);
    t.deepEqual(names, ['one', 'two', 'three']);
  },
);

// NOTE on three-party / cross-call forwarding through capnweb:
// capnweb's client implementation auto-disposes method-call payloads
// after the call returns (RpcPayload.deliverCall's `finally` at
// dist/index.js:715-717), so a Far stashed in `this.cap = arg` becomes
// a disposed RpcImportHook before any later method on the same target
// can reach it.  This is a capnweb client-side retention policy, not
// a wire-protocol requirement — the protocol only defines
// `["release", id, count]` as the mechanism, leaving retention up to
// each peer.  Our package's `FinalizingMap` approach is wire-compatible
// (we just emit releases on GC reachability instead of on call exit).
// In-call callbacks are covered by "capability passed both ways"
// above; same-side three-party stub identity across two endo sessions
// is in coverage-gaps-2.test.js T7.
