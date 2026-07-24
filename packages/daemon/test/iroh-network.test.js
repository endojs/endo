// @ts-nocheck
// Integration test for the iroh transport's byte path: two real iroh
// endpoints exchange a CapTP message through the same stream adapter and
// netstring/CapTP layering the transport uses. Guarded so CI stays green
// when the optional native `@number0/iroh` binding is unavailable.
import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makePromiseKit } from '@endo/promise-kit';

import { adaptIrohStream } from '../src/networks/iroh-stream-adapter.js';
import { makeNetstringCapTP } from '../src/connection.js';

let Endpoint;
try {
  // Non-literal specifier so the type checker does not resolve the package's
  // (malformed) type declarations.
  const irohSpecifier = '@number0/iroh';
  ({ Endpoint } = await import(irohSpecifier));
} catch (error) {
  // The native binding is an optional dependency. Tolerate its absence by
  // default (the test skips), but when the integration test is explicitly
  // requested, surface the load failure rather than silently skipping.
  if (process.env.ENDO_IROH_INTEGRATION === '1') {
    throw error;
  }
}

// The 1.0 binding takes ALPNs as plain `Array<number>` byte arrays.
const ALPN = Array.from(new TextEncoder().encode('endo/captp/0'));

// Opt-in: this exercises a real iroh node pair, which reaches iroh's public
// relay/discovery network and is therefore unsuitable for unattended CI
// (network-dependent and occasionally flaky). Run it explicitly with
// ENDO_IROH_INTEGRATION=1 to validate the end-to-end byte path. The pure
// logic it covers (framing, adapter, key derivation) is also unit tested in
// iroh-stream-adapter.test.js (and the address scheme in iroh-address.test.js).
const integrationEnabled =
  Endpoint && process.env.ENDO_IROH_INTEGRATION === '1';
const itIroh = integrationEnabled ? test.serial : test.serial.skip;

itIroh('CapTP round-trip over two real iroh nodes', async t => {
  t.timeout(60_000);

  const { promise: cancelled } = makePromiseKit();

  const bootstrap = Far('Calculator', {
    add: async (a, b) => a + b,
    greet: async name => `hello ${name}`,
  });

  const serverSecret = Array.from(new Uint8Array(32).fill(11));
  const clientSecret = Array.from(new Uint8Array(32).fill(13));

  // The server advertises the CapTP ALPN; the client supplies it when dialing.
  const server = await Endpoint.bind({
    secretKey: serverSecret,
    alpns: [ALPN],
  });
  const client = await Endpoint.bind({ secretKey: clientSecret });
  t.teardown(async () => {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  });

  // 1.0 replaced the `protocols` table with an explicit accept loop. Drive one
  // inbound connection through the server-side handshake in the background.
  const serving = (async () => {
    const incoming = await server.acceptNext();
    const accepting = await incoming.accept();
    const connection = await accepting.connect();
    const bi = await connection.acceptBi();
    const { reader, writer } = adaptIrohStream(bi, connection);
    makeNetstringCapTP('server', writer, reader, cancelled, bootstrap);
    await connection.closed();
  })();
  serving.catch(() => {});

  // `addr()` is synchronous in 1.0 and returns an EndpointAddr that can be
  // dialed directly.
  const serverAddr = server.addr();

  const connection = await client.connect(serverAddr, ALPN);
  const bi = await connection.openBi();
  const { reader, writer } = adaptIrohStream(bi, connection);
  const { getBootstrap } = makeNetstringCapTP(
    'client',
    writer,
    reader,
    cancelled,
    Far('ClientBootstrap', {}),
  );

  const remote = getBootstrap();
  t.is(await E(remote).add(2, 3), 5);
  t.is(await E(remote).greet('iroh'), 'hello iroh');
});
