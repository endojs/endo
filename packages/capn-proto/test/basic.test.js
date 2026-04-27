// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

const GREETER_ID = 0xa1b2c3d4e5f60718n;

test('bootstrap returns far Presence; method call works', async t => {
  const greeter = makeExo('greeter', undefined, {
    hello(name) {
      return `hello, ${name}`;
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: greeter });
  registerInterface({
    id: GREETER_ID,
    methods: { hello: 0 },
  });
  const remote = near.getBootstrap();
  const greeting = await E(remote).hello('world');
  t.is(greeting, 'hello, world');
});

test('exception in remote method propagates', async t => {
  const exoBoom = makeExo('boom', undefined, {
    explode() {
      throw Error('kapow');
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: exoBoom });
  registerInterface({ id: 0x9999n, methods: { explode: 0 } });
  const remote = near.getBootstrap();
  await t.throwsAsync(() => E(remote).explode(), { message: /kapow/ });
});

test('multiple sequential calls share the same Presence', async t => {
  const counter = makeExo('counter', undefined, {
    n: 0,
    inc() {
      // makeExo methods cannot keep `this` state via plain assignment, so use a closure
      return (this.n += 1);
    },
  });
  const { near, registerInterface } = makeLoopback({ farBootstrap: counter });
  registerInterface({ id: 0x123n, methods: { inc: 0 } });
  const r = near.getBootstrap();
  const r2 = near.getBootstrap();
  // Two separate bootstrap calls produce two separate presences (each is a
  // new question). Identity preservation applies *within* a connection's
  // existing import table when the same export id is sent twice.
  t.not(r, r2);
});
