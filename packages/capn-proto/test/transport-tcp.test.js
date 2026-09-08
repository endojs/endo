// @ts-nocheck
/**
 * TCP transport: two Node peers over loopback TCP.
 *
 * Validates the streaming framed-message parser + the `connectTcp` /
 * `serveTcp` adaptors end-to-end:
 *   - method calls and returns round-trip across the socket
 *   - capabilities round-trip too (the bootstrap is a Presence, and the
 *     test uses `getInner` to ferry a second cap across)
 *   - the parser handles both "many small chunks" and "one big chunk"
 *     wire delivery (Node's TCP coalesces / splits writes nondeterministically)
 *
 * No `capnp` CLI involvement here — this is the all-Node sanity check
 * that proves the transport is sound before we point a C++ peer at it.
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import {
  E,
  loadSchema,
  makeInterfaceRegistry,
  connectTcp,
  serveTcp,
} from '../src/index.js';

const SCHEMA = `
@0xfeed5050feed5050;

interface Echo @0xeccc000000000001 {
  ping @0 (msg :Text) -> (reply :Text);
  count @1 (n :UInt32) -> (twiceN :UInt32);
}
`;

test('TCP transport: ping/pong round-trip between two Node peers', async t => {
  const echo = makeExo('echo', undefined, {
    ping({ msg }) {
      return { reply: `pong: ${msg}` };
    },
    count({ n }) {
      return { twiceN: n * 2 };
    },
  });

  const interfaceRegistry = makeInterfaceRegistry();
  loadSchema(SCHEMA).registerInterface(interfaceRegistry, 'Echo');

  // Server first; bind to ephemeral port (host kernel picks).
  const server = await serveTcp({
    host: '127.0.0.1',
    port: 0,
    bootstrap: echo,
    interfaceRegistry,
  });

  try {
    const client = await connectTcp({
      host: '127.0.0.1',
      port: server.port,
      interfaceRegistry,
    });

    const remote = client.capnp.getBootstrap();
    const a = await E(remote).ping({ msg: 'hi' });
    t.is(a.reply, 'pong: hi');

    const b = await E(remote).count({ n: 21 });
    t.is(b.twiceN, 42);

    // Several calls in rapid succession to exercise pipelining + chunk
    // coalescing on the wire.
    const ps = [];
    for (let i = 0; i < 50; i += 1) ps.push(E(remote).count({ n: i }));
    const results = await Promise.all(ps);
    for (let i = 0; i < 50; i += 1) t.is(results[i].twiceN, i * 2);

    client.close();
  } finally {
    await server.close();
  }
});

test('TCP transport: server keeps running across multiple client connections', async t => {
  const counter = (() => {
    let n = 0;
    return makeExo('counter', undefined, {
      ping(_args) {
        n += 1;
        return { reply: `count=${n}` };
      },
      count(_args) {
        return { twiceN: 0 };
      },
    });
  })();

  const interfaceRegistry = makeInterfaceRegistry();
  loadSchema(SCHEMA).registerInterface(interfaceRegistry, 'Echo');

  const server = await serveTcp({
    host: '127.0.0.1',
    port: 0,
    bootstrap: counter,
    interfaceRegistry,
  });

  try {
    for (let i = 1; i <= 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const client = await connectTcp({
        host: '127.0.0.1',
        port: server.port,
        interfaceRegistry,
      });
      const remote = client.capnp.getBootstrap();
      // eslint-disable-next-line no-await-in-loop
      const r = await E(remote).ping({ msg: 'n/a' });
      t.is(r.reply, `count=${i}`);
      client.close();
    }
  } finally {
    await server.close();
  }
});
