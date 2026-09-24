// @ts-nocheck
/**
 * Integration tests modeled on scenarios from the upstream Cap'n Proto C++
 * `c++/src/capnp/rpc-test.c++` test suite. Each test exercises a common
 * pattern that protocol consumers rely on: capabilities flowing through
 * call args and return payloads, multi-hop pipelining, eventual-promise
 * resolution after pipelined dispatch, etc.
 *
 * These complement the more focused unit tests by exercising end-to-end
 * behaviour against the loopback transport.
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';
import { withJsonCodecs } from './fixtures/json-codec.js';

const IFACE = 0x49n;

const setup = methods => {
  const lb = makeLoopback({ farBootstrap: undefined });
  lb.registerInterface(withJsonCodecs({ id: IFACE, methods }));
  return lb;
};

// ---------------------------------------------------------------------------
// Multi-stage pipelining: E(remote).getMid().getInner().say('hi')
// ---------------------------------------------------------------------------

test('multi-stage pipelining: 3 chained method calls without intermediate await', async t => {
  const inner = makeExo('inner', undefined, {
    say(word) {
      return `inner says ${word}`;
    },
  });
  const mid = makeExo('mid', undefined, {
    getInner() {
      return inner;
    },
  });
  const outer = makeExo('outer', undefined, {
    getMid() {
      return mid;
    },
  });

  const lb = makeLoopback({ farBootstrap: outer });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { getMid: 0, getInner: 1, say: 2 } }),
  );
  const remote = lb.near.getBootstrap();

  // Issue all three calls without awaiting any.
  const result = await E(E(E(remote).getMid()).getInner()).say('hello');
  t.is(result, 'inner says hello');
});

// ---------------------------------------------------------------------------
// Capability passed as argument: A → B carrying a cap to C
// ---------------------------------------------------------------------------

test('passing a cap as a method argument lets the receiver invoke it', async t => {
  const observedAtAlice = [];
  // Alice lives on the near side; Bob lives on the far side. Alice passes
  // a cap to Bob, Bob invokes a method on it. (Both halves are exposed
  // through their respective bootstraps so each side has a reference.)
  const alice = makeExo('alice', undefined, {
    note(msg) {
      observedAtAlice.push(msg);
    },
  });
  const bob = makeExo('bob', undefined, {
    bumpThrough(target) {
      // Far side calls a method on the cap it received as an argument.
      return E(target).note('bumped');
    },
  });
  const lb = setup({ note: 0, bumpThrough: 1 });
  lb.near.setBootstrap(alice);
  lb.far.setBootstrap(bob);

  const remoteBob = lb.near.getBootstrap();
  await E(remoteBob).bumpThrough(alice);
  t.deepEqual(observedAtAlice, ['bumped']);
});

// ---------------------------------------------------------------------------
// Method returns a record containing multiple capabilities
// ---------------------------------------------------------------------------

test('a method returning multiple caps in a record yields working presences for each', async t => {
  const a = makeExo('a', undefined, {
    label() {
      return 'a';
    },
  });
  const b = makeExo('b', undefined, {
    label() {
      return 'b';
    },
  });
  const c = makeExo('c', undefined, {
    label() {
      return 'c';
    },
  });
  const root = makeExo('root', undefined, {
    getThree() {
      return { a, b, c };
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { getThree: 0, label: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  const trio = await E(remote).getThree();
  const [na, nb, nc] = await Promise.all([
    E(trio.a).label(),
    E(trio.b).label(),
    E(trio.c).label(),
  ]);
  t.deepEqual([na, nb, nc], ['a', 'b', 'c']);
});

// ---------------------------------------------------------------------------
// Round-trip cap identity: A passes cap → B → returned to A → A recognizes it
// ---------------------------------------------------------------------------

test('cap round-tripped through a remote method retains origin identity', async t => {
  const sentinel = makeExo('sentinel', undefined, { tag: () => 'sentinel' });
  const farRoot = makeExo('farRoot', undefined, {
    echo(cap) {
      return cap;
    },
  });
  const lb = makeLoopback({ farBootstrap: farRoot });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { echo: 0, tag: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  const back = await E(remote).echo(sentinel);
  t.is(back, sentinel, 'the cap returned by far is === the original near cap');
});

// ---------------------------------------------------------------------------
// Promise-of-cap as argument: far awaits, then uses
// ---------------------------------------------------------------------------

test('passing an unresolved promise as an argument: far awaits, then uses', async t => {
  let observedTag;
  const inner = makeExo('inner', undefined, { tag: () => 'inner-tag' });

  const root = makeExo('root', undefined, {
    async useEventually(p) {
      // Far side awaits the promised cap, then invokes a method on it.
      const cap = await p;
      observedTag = await E(cap).tag();
      return observedTag;
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { useEventually: 0, tag: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  let resolveCap;
  const capPromise = new Promise(r => {
    resolveCap = r;
  });
  const useP = E(remote).useEventually(capPromise);
  // The far side has the call but is awaiting the promise's resolution.
  // Resolve it now.
  resolveCap(inner);
  const result = await useP;
  t.is(result, 'inner-tag');
  t.is(observedTag, 'inner-tag');
});

// ---------------------------------------------------------------------------
// Pipelining a method on a returned cap that doesn't exist yet
// ---------------------------------------------------------------------------

test('pipelining a call on a method whose answer is still in flight', async t => {
  let resolveSlow;
  const slowInner = new Promise(r => {
    resolveSlow = r;
  });
  const inner = makeExo('inner', undefined, {
    say(word) {
      return `inner says ${word}`;
    },
  });
  const root = makeExo('root', undefined, {
    getSlowInner() {
      return slowInner;
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { getSlowInner: 0, say: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  // Issue the pipelined call before far has even resolved getSlowInner.
  const sayP = E(E(remote).getSlowInner()).say('hi');
  // Far hasn't resolved getSlowInner yet; sayP is queued. Now resolve.
  resolveSlow(inner);
  const said = await sayP;
  t.is(said, 'inner says hi');
});

// ---------------------------------------------------------------------------
// Bidirectional cap exchange: A holds a Bob from B, passes it back to B,
// B returns a wrapper around it
// ---------------------------------------------------------------------------

test('bidirectional cap exchange: pass back receiverHosted and call methods', async t => {
  const orig = makeExo('orig', undefined, {
    label: () => 'orig',
  });
  const root = makeExo('root', undefined, {
    getOrig() {
      return orig;
    },
    same(cap) {
      // Far compares the cap it received from near to its own export. The
      // near side's encoder should have used `receiverHosted` so far gets
      // back its own value.
      return cap === orig;
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { getOrig: 0, same: 1, label: 2 } }),
  );
  const remote = lb.near.getBootstrap();

  const remoteOrig = await E(remote).getOrig();
  const isSame = await E(remote).same(remoteOrig);
  t.true(isSame, 'far recognised its own cap on the round trip');
  // And methods on the imported cap still work.
  t.is(await E(remoteOrig).label(), 'orig');
});

// ---------------------------------------------------------------------------
// Many concurrent pipelined calls on the same unresolved promise
// ---------------------------------------------------------------------------

test('100 concurrent pipelined calls on the same unresolved promise', async t => {
  let resolveBob;
  const bobP = new Promise(r => {
    resolveBob = r;
  });
  const counts = [];
  const bob = makeExo('bob', undefined, {
    note(seq) {
      counts.push(seq);
      return seq;
    },
  });
  const root = makeExo('root', undefined, {
    getBob() {
      return bobP;
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { getBob: 0, note: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  const bobRemote = E(remote).getBob();
  const calls = [];
  for (let i = 0; i < 100; i += 1) calls.push(E(bobRemote).note(i));
  resolveBob(bob);
  const results = await Promise.all(calls);
  for (let i = 0; i < 100; i += 1) t.is(results[i], i);
  t.is(counts.length, 100);
  // E-order: bob saw the calls in the order issued.
  for (let i = 0; i < 100; i += 1) t.is(counts[i], i);
});

// ---------------------------------------------------------------------------
// Method that returns its first argument unchanged (cap → cap echo)
// ---------------------------------------------------------------------------

test('echoing a cap through a far method preserves its handler so subsequent calls work', async t => {
  const widget = makeExo('widget', undefined, {
    poke: () => 'poked',
  });
  const root = makeExo('root', undefined, {
    pass(cap) {
      return cap;
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { pass: 0, poke: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  const echoed = await E(remote).pass(widget);
  // `echoed` should === widget (origin identity preserved through round-trip).
  t.is(echoed, widget);
  t.is(await E(echoed).poke(), 'poked');
});

// ---------------------------------------------------------------------------
// Exception in a remote call carrying caps in its arguments still
// releases them
// ---------------------------------------------------------------------------

test('exception in a remote call still propagates and does not leak exports', async t => {
  const tag = makeExo('tag', undefined, { name: () => 'tag' });
  const root = makeExo('root', undefined, {
    fail(_capArg) {
      throw Error('boom');
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { fail: 0, name: 1 } }),
  );
  const remote = lb.near.getBootstrap();

  await t.throwsAsync(() => E(remote).fail(tag), { message: /boom/ });
  // After settle + microtask drains, no answers should be outstanding on
  // far's side (Finish was sent for the failed question).
  await Promise.resolve();
  await Promise.resolve();
  t.is(lb.far.stats().answers, 0, 'no outstanding answers after exception');
});

// ---------------------------------------------------------------------------
// Bootstrap returns an object whose method returns the bootstrap's own caps
// (recursive bootstrap-style references)
// ---------------------------------------------------------------------------

test('a method that returns the bootstrap itself round-trips with identity', async t => {
  let rootRef;
  const root = makeExo('root', undefined, {
    self() {
      return rootRef;
    },
    label: () => 'root',
  });
  rootRef = root;

  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(
    withJsonCodecs({ id: IFACE, methods: { self: 0, label: 1 } }),
  );
  // `getBootstrap()` returns a HandledPromise that resolves to the Presence;
  // we await it first so we can compare presence-to-presence below.
  const remote = await lb.near.getBootstrap();

  const selfFromMethod = await E(remote).self();
  // Both calls (bootstrap + self()) should yield the same Presence.
  t.is(remote, selfFromMethod);
  t.is(await E(selfFromMethod).label(), 'root');
});

// ---------------------------------------------------------------------------
// SendOnly: fire-and-forget calls work and don't allocate visible questions
// ---------------------------------------------------------------------------

test('applyMethodSendOnly calls are observed by the receiver but the caller waits for nothing', async t => {
  const observed = [];
  const root = makeExo('root', undefined, {
    log(msg) {
      observed.push(msg);
    },
  });
  const lb = makeLoopback({ farBootstrap: root });
  lb.registerInterface(withJsonCodecs({ id: IFACE, methods: { log: 0 } }));
  // Await the bootstrap so we have a resolved Presence before sendOnly
  // (otherwise the framework's send-only path queues the operation against
  // the still-unresolved bootstrap promise rather than dispatching it).
  const remote = await lb.near.getBootstrap();

  // E.sendOnly variant: caller doesn't await, far side still receives.
  E.sendOnly(remote).log('one');
  E.sendOnly(remote).log('two');
  // Drain the loopback's microtask queue. The send-only path makes the
  // outgoing Call traverse two microtask boundaries before the receiver's
  // method body runs (one for the loopback flush schedule, one for the
  // resultP.then chain inside handleCall), so a few more ticks are needed
  // than for an awaited call where the caller's await naturally drains.
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
  t.deepEqual(observed, ['one', 'two']);
});
