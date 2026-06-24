/* global crypto, process, setTimeout */
/**
 * Manually verify iroh "dial keys, not IPs" discovery for the Endo iroh
 * transport.
 *
 * "Discovery working" means a peer can be dialed by its NodeId alone — with
 * no relay or direct-address hints — because iroh's default discovery
 * (`discovery_n0`) publishes each node's address to n0's DNS/pkarr service
 * and resolves NodeIds via DNS lookup.
 *
 * This script runs two checks in one process and prints a clear verdict:
 *   1. discovery ON  (both nodes use the default discovery): dial by NodeId
 *      only — expected to SUCCEED.
 *   2. discovery OFF (the server cannot publish its address): dial by NodeId
 *      only — expected to FAIL with "No addressing information for NodeId".
 * A SUCCESS in (1) and a FAIL in (2) proves discovery is what made the dial
 * work, rather than some other path (e.g. same-LAN mDNS).
 *
 * REQUIREMENTS: a real network with outbound access to iroh's relay
 * (`*.relay.iroh.network`, HTTPS + UDP/QUIC) and discovery
 * (`dns.iroh.link`, DNS + HTTPS), plus outbound UDP for QUIC/hole-punching.
 * Restricted sandboxes that block these will report FAIL for check (1);
 * that indicates a blocked environment, not a transport defect.
 *
 * Usage:
 *   cd packages/daemon
 *   node scripts/iroh-discovery-check.mjs            # default 8s publish wait
 *   IROH_DISCOVERY_WAIT_MS=20000 node scripts/iroh-discovery-check.mjs
 *
 * For a faithful cross-network result (NAT + relay + discovery), use two
 * machines instead — see designs/iroh-network-design.md
 * § "Verifying discovery".
 */

// Non-literal specifier: keeps any future type checker from resolving the
// package's malformed type declarations.
const irohSpecifier = '@number0/iroh';
const { Endpoint, EndpointAddr, EndpointId } = await import(irohSpecifier);

// The 1.0 binding takes ALPNs and byte payloads as plain `Array<number>`.
const ALPN = Array.from(new TextEncoder().encode('endo/captp/0'));
const enc = new TextEncoder();
const dec = new TextDecoder();

const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)));

const waitMs = Number(process.env.IROH_DISCOVERY_WAIT_MS || '8000');

/**
 * Run the server-side accept loop: echo a 'pong' for each inbound bi stream.
 * Replaces the 0.35 `protocols` table, which 1.0 removed in favour of an
 * explicit `acceptNext()` loop.
 *
 * @param {import('@number0/iroh').Endpoint} server
 */
const serveEcho = async server => {
  await null;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const incoming = await server.acceptNext();
    if (!incoming) return;
    (async () => {
      const accepting = await incoming.accept();
      const connection = await accepting.connect();
      const bi = await connection.acceptBi();
      await bi.recv.readToEnd(64);
      await bi.send.writeAll(Array.from(enc.encode('pong')));
      await bi.send.finish();
      await connection.closed();
    })().catch(() => {});
  }
};

/**
 * Stand up a server (with discovery on or off) and a client (discovery on),
 * then dial the server by NodeId only.
 *
 * Discovery on uses the n0 preset (relays + discovery); discovery off uses the
 * minimal preset, so the server publishes no address and cannot be reached by
 * key alone.
 *
 * @param {boolean} serverDiscovery
 * @returns {Promise<string>}
 */
const dialByKeyOnly = async serverDiscovery => {
  const serverBuilder = Endpoint.builder();
  if (serverDiscovery) {
    serverBuilder.applyN0();
  } else {
    serverBuilder.applyMinimal();
  }
  serverBuilder.secretKey(randomSecret());
  serverBuilder.alpns([ALPN]);
  const server = await serverBuilder.bind();
  const serverNodeId = server.id().toString();

  const clientBuilder = Endpoint.builder();
  clientBuilder.applyN0();
  clientBuilder.secretKey(randomSecret());
  const client = await clientBuilder.bind();

  const serving = serveEcho(server);
  serving.catch(() => {});

  // Give the server time to publish its record to n0 DNS/pkarr.
  await new Promise(resolve => setTimeout(resolve, waitMs));

  const startedAt = Date.now();
  let result;
  try {
    // KEY ONLY: an EndpointAddr carrying just the id — no relay, no direct
    // addresses. Reaching the server therefore requires discovery.
    const addr = new EndpointAddr(EndpointId.fromString(serverNodeId));
    const connection = await client.connect(addr, ALPN);
    const bi = await connection.openBi();
    await bi.send.writeAll(Array.from(enc.encode('ping')));
    await bi.send.finish();
    const out = await bi.recv.readExact(4);
    result = `SUCCESS (${dec.decode(Uint8Array.from(out))}) in ${
      Date.now() - startedAt
    }ms`;
  } catch (error) {
    result = `FAIL: ${String(error.message).split('\n')[0]}`;
  }
  await client.close();
  await server.close();
  return result;
};

console.log(`iroh discovery check (publish wait ${waitMs}ms)\n`);

const withDiscovery = await dialByKeyOnly(true);
console.log(`  discovery ON  (expect SUCCESS): ${withDiscovery}`);

const withoutDiscovery = await dialByKeyOnly(false);
console.log(`  discovery OFF (expect FAIL)   : ${withoutDiscovery}`);

const pass =
  withDiscovery.startsWith('SUCCESS') && withoutDiscovery.startsWith('FAIL');
console.log(
  `\nVerdict: ${
    pass
      ? 'PASS — dial-by-key worked only with discovery enabled.'
      : 'INCONCLUSIVE — see notes above (likely blocked egress or a slow ' +
        'publish; try a larger IROH_DISCOVERY_WAIT_MS, or the two-machine ' +
        'procedure).'
  }`,
);

process.exit(pass ? 0 : 1);
