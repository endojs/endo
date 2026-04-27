// @ts-nocheck
/* eslint-disable max-classes-per-file, class-methods-use-this,
   lines-between-class-members -- the interop suite mirrors capnweb's
   "extend RpcTarget" idiom; multiple short classes per test are idiomatic. */
// Interop test: connect an @endo/capn-web session to a real
// cloudflare/capnweb RpcSession over an in-memory transport pair.  Both
// sides should successfully exchange capabilities, calls, and results.
//
// Skipped if `capnweb` isn't installable in this environment.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

let capnweb;
try {
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
