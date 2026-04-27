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

test('property descent: E.get(remote).foo', async t => {
  const r = makePair(
    Far('s', {
      info: () => ({ name: 'capnweb', version: 1 }),
    }),
  );
  // E.get pipelines a getter call, returning a promise for the property.
  const info = await E(r).info();
  t.is(info.name, 'capnweb');
});

test('chained method: result of one call passed to another', async t => {
  const counter = (() => {
    let n = 0;
    return Far('counter', {
      incr: () => {
        n += 1;
        return n;
      },
      get: () => n,
    });
  })();
  const r = makePair(
    Far('s', {
      counter: () => counter,
    }),
  );
  // Get a counter, increment it twice, read it back.
  const c = await E(r).counter();
  t.is(await E(c).incr(), 1);
  t.is(await E(c).incr(), 2);
  t.is(await E(c).get(), 2);
});

test('pipelined method calls do not require awaits in between', async t => {
  // Each E() call returns a promise stub before the previous answer arrives.
  // We send two pushes back-to-back and only await the final result.
  const counter = (() => {
    let n = 0;
    return Far('counter', {
      incr: () => {
        n += 1;
        return n;
      },
    });
  })();
  const r = makePair(Far('s', { counter: () => counter }));
  const cP = E(r).counter();
  const v1P = E(cP).incr();
  const v2P = E(cP).incr();
  const v3P = E(cP).incr();
  t.is(await v1P, 1);
  t.is(await v2P, 2);
  t.is(await v3P, 3);
});

test('promise as argument', async t => {
  // We pass a promise that the server will resolve.
  const r = makePair(
    Far('s', {
      double: async x => (await x) * 2,
    }),
  );
  const p = Promise.resolve(21);
  t.is(await E(r).double(p), 42);
});

test('returning a remote object from a method', async t => {
  const greeter = Far('greeter', { hello: name => `hello ${name}` });
  const r = makePair(Far('s', { getGreeter: () => greeter }));
  const g = await E(r).getGreeter();
  t.is(await E(g).hello('world'), 'hello world');
});

test('passing a remote object back to a method', async t => {
  const helper = Far('helper', { square: x => x * x });
  const r = makePair(
    Far('s', {
      ask: async (h, x) => E(h).square(x),
    }),
  );
  // We give the server `helper` as an argument; the server then calls back
  // into our helper.  This exercises bidirectional capabilities.
  t.is(await E(r).ask(helper, 7), 49);
});
