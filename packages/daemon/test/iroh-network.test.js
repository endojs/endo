// @ts-nocheck
/* global process */
// Integration test for the iroh transport's byte path: two real iroh memory
// nodes exchange a CapTP message through the same stream adapter and
// netstring/CapTP layering the transport uses. Guarded so CI stays green
// when the optional native `@number0/iroh` binding is unavailable.
import test from '@endo/ses-ava/prepare-endo.js';

import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { adaptIrohStream } from '../src/networks/iroh-stream-adapter.js';
import { makeNetstringCapTP } from '../src/connection.js';

let Iroh;
try {
  // Non-literal specifier so the type checker does not resolve the package's
  // (malformed) type declarations.
  const irohSpecifier = '@number0/iroh';
  ({ Iroh } = await import(irohSpecifier));
} catch (error) {
  // The native binding is an optional dependency. Tolerate its absence by
  // default (the test skips), but when the integration test is explicitly
  // requested, surface the load failure rather than silently skipping.
  if (process.env.ENDO_IROH_INTEGRATION === '1') {
    throw error;
  }
}

const ALPN = 'endo/captp/0';

// Opt-in: this exercises a real iroh node pair, which reaches iroh's public
// relay/discovery network and is therefore unsuitable for unattended CI
// (network-dependent and occasionally flaky). Run it explicitly with
// ENDO_IROH_INTEGRATION=1 to validate the end-to-end byte path. The pure
// logic it covers (framing, adapter, key derivation) is also unit tested in
// iroh-stream-adapter.test.js and iroh-address.test.js.
const integrationEnabled = Iroh && process.env.ENDO_IROH_INTEGRATION === '1';
const itIroh = integrationEnabled ? test.serial : test.serial.skip;

itIroh('CapTP round-trip over two real iroh nodes', async t => {
  t.timeout(60_000);

  const { promise: cancelled } = makePromiseKit();

  const bootstrap = Far('Calculator', {
    add: async (a, b) => a + b,
    greet: async name => `hello ${name}`,
  });

  const protocols = {
    [ALPN]: (_err, _ep) => ({
      accept: async (err, connection) => {
        if (err) return;
        const bi = await connection.acceptBi();
        const { reader, writer } = adaptIrohStream(bi, connection);
        makeNetstringCapTP('server', writer, reader, cancelled, bootstrap);
        await connection.closed();
      },
    }),
  };

  const serverSecret = Array.from(new Uint8Array(32).fill(11));
  const clientSecret = Array.from(new Uint8Array(32).fill(13));

  const server = await Iroh.memory({ secretKey: serverSecret, protocols });
  const client = await Iroh.memory({ secretKey: clientSecret });
  t.teardown(async () => {
    await client.node.shutdown().catch(() => {});
    await server.node.shutdown().catch(() => {});
  });

  const serverAddr = await server.net.nodeAddr();
  const endpoint = client.node.endpoint();

  const connection = await endpoint.connect(
    serverAddr,
    new TextEncoder().encode(ALPN),
  );
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
