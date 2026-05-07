// @ts-check

import rawNet from 'node:net';

import baseTest from '@endo/ses-ava/test.js';

import { cborCodec } from '@endo/ocapn/cbor';
import { makeOcapnNoiseNetwork } from '../index.js';
import { makeTcpTransport } from '../src/transports/tcp.js';
import { netListenAllowed } from './_net-permission.js';

// `test.serial` because every test in this file binds an OS port via
// `makeTcpTransport()` and shares filesystem and socket state. A
// failure mid-test would otherwise leak the listener into the next
// concurrent test.
const test = netListenAllowed ? baseTest.serial : baseTest.serial.skip;

/**
 * @param {ReturnType<typeof makeOcapnNoiseNetwork>} network
 */
const addFreshKey = network => {
  const signingKeys = network.generateSigningKeys();
  const keyId = network.addSigningKeys(signingKeys);
  return { keyId, ...signingKeys };
};

test('two noise peers exchange encrypted messages over TCP', async t => {
  const netA = makeOcapnNoiseNetwork({ codec: cborCodec });
  const netB = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netA.shutdown());
  t.teardown(() => netB.shutdown());
  const { keyId: keyA } = addFreshKey(netA);
  const { keyId: keyB } = addFreshKey(netB);
  await netA.addTransport(makeTcpTransport());
  await netB.addTransport(makeTcpTransport());

  const [sessionA, sessionB] = await Promise.all([
    netA.provideSession(netB.locationFor(keyB)),
    netB.waitForInboundSession(keyA),
  ]);

  t.is(sessionA.remoteLocation.designator, keyB);
  t.is(sessionB.remoteLocation.designator, keyA);

  await sessionA.writer.next(new TextEncoder().encode('hello-tcp-A'));
  await sessionB.writer.next(new TextEncoder().encode('hello-tcp-B'));
  const a = await sessionA.reader.next(undefined);
  const b = await sessionB.reader.next(undefined);
  t.false(a.done);
  t.false(b.done);
  if (!a.done && !b.done) {
    t.is(new TextDecoder().decode(a.value), 'hello-tcp-B');
    t.is(new TextDecoder().decode(b.value), 'hello-tcp-A');
  }

  sessionA.close();
  sessionB.close();
});

test('noise network rejects a tcp-testing-only location that has no tcp-scheme hints', async t => {
  const network = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => network.shutdown());
  addFreshKey(network);
  await network.addTransport(makeTcpTransport());
  await t.throwsAsync(
    async () =>
      network.provideSession({
        type: 'ocapn-peer',
        network: 'tcp-testing-only',
        transport: 'tcp-testing-only',
        designator: '00'.repeat(32),
        hints: { host: '127.0.0.1', port: '1' },
      }),
    { message: /no registered transport matches hints/ },
  );
});

test('tcp transport with framing:none delivers raw socket bytes', async t => {
  const transport = makeTcpTransport({ framing: 'none' });
  t.teardown(() => transport.shutdown());
  /** @type {(s: import('../src/types.js').ByteStream) => void} */
  let resolveStream = () => {};
  /** @type {Promise<import('../src/types.js').ByteStream>} */
  const serverStreamPromise = new Promise(resolve => {
    resolveStream = resolve;
  });
  /* eslint-disable-next-line no-use-before-define -- we capture the listen handler into a promise */
  const { listen } = transport;
  if (!listen) throw Error('tcp transport must expose listen');
  const listener = await listen(stream => {
    resolveStream(stream);
  });

  // Connect a raw Node socket (not through the transport) so we
  // control bytes on the wire exactly.
  const sock = rawNet.createConnection({
    host: listener.hints.host,
    port: Number.parseInt(listener.hints.port, 10),
  });
  await new Promise((resolve, reject) => {
    sock.once('connect', resolve);
    sock.once('error', reject);
  });
  sock.write(Uint8Array.of(0x48, 0x49)); // raw 'HI', not a netstring

  const serverStream = await serverStreamPromise;
  const first = await serverStream.reader.next(undefined);
  t.false(first.done);
  if (!first.done) {
    t.deepEqual(Array.from(first.value), [0x48, 0x49]);
  }

  sock.destroy();
});

// `makeTcpTransport` validates options synchronously, so this case
// doesn't actually need the listen permission gate that wraps the
// rest of this file, but keeping it under the same `test` keeps the
// file uniform.
test('tcp transport rejects an invalid framing option', t => {
  t.throws(
    () =>
      makeTcpTransport(
        /** @type {any} */ ({ framing: 'definitely-not-a-thing' }),
      ),
    { message: /framing.*must be 'netstring' or 'none'/ },
  );
});
