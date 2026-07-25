// @ts-nocheck
// Integration test: two real iroh endpoints carry an OCapN session
// end-to-end through the netlayer. Guarded so CI stays green when the
// optional native `@number0/iroh` binding is unavailable, and opt-in via
// ENDO_IROH_INTEGRATION=1 because binding a real endpoint reaches iroh's
// public relay/discovery network, which is unsuitable for unattended CI.
// The logic it covers (framing, adapter, location scheme, session flow)
// is also exercised against the in-memory mock in netlayer.test.js.

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeIrohNetLayer } from '../index.js';

let iroh;
try {
  // Non-literal specifier so the type checker does not resolve the
  // package's (malformed) type declarations.
  const irohSpecifier = '@number0/iroh';
  iroh = await import(irohSpecifier);
} catch (error) {
  // The native binding is an optional dependency. Tolerate its absence
  // by default (the test skips), but when the integration test is
  // explicitly requested, surface the load failure rather than silently
  // skipping.
  if (process.env.ENDO_IROH_INTEGRATION === '1') {
    throw error;
  }
}

const integrationEnabled = iroh && process.env.ENDO_IROH_INTEGRATION === '1';
const itIroh = integrationEnabled ? test.serial : test.serial.skip;

const makeIrohPeer = async ({ name, locator = new Map() }) => {
  const netlayerRef = {};
  const client = await makeOcapn({
    codec: syrupCodec,
    network: (handlers, logger) =>
      makeIrohNetLayer({
        handlers,
        logger,
        iroh,
        // Same-host run: publish loopback direct addresses so the dial
        // succeeds without waiting for discovery to propagate.
        publishPrivateAddresses: true,
      }).then(netlayer => {
        netlayerRef.netlayer = netlayer;
        return netlayer;
      }),
    debugLabel: name,
    locator,
    debugMode: true,
  });
  return { client, netlayer: netlayerRef.netlayer };
};

itIroh('OCapN session over two real iroh endpoints', async t => {
  t.timeout(60_000);

  const locatorA = new Map();
  locatorA.set(
    'Greeter',
    Far('Greeter', {
      hello: (who = 'world') => `hello, ${who}`,
    }),
  );

  const peerA = await makeIrohPeer({ name: 'iroh-real-A', locator: locatorA });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ name: 'iroh-real-B' });
  t.teardown(() => peerB.client.shutdown());

  const sturdyRef = peerB.client.makeSturdyRef(
    peerA.netlayer.location,
    'Greeter',
  );
  const greeter = await peerB.client.enlivenSturdyRef(sturdyRef);
  const reply = await E(greeter).hello('Alice');
  t.is(reply, 'hello, Alice');
});
