/* global crypto, process, Buffer, setTimeout, console */
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
const { Iroh, NodeDiscoveryConfig } = await import(irohSpecifier);

const ALPN = 'endo/captp/0';
const enc = new TextEncoder();
const dec = new TextDecoder();

const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)));

const waitMs = Number(process.env.IROH_DISCOVERY_WAIT_MS || '8000');

const protocols = {
  [ALPN]: (_err, _endpoint) => ({
    accept: async (err, connection) => {
      if (err) return;
      const bi = await connection.acceptBi();
      await bi.recv.readToEnd(64);
      await bi.send.writeAll(enc.encode('pong'));
      await bi.send.finish();
      await connection.closed();
    },
  }),
};

/**
 * Stand up a server (with the given discovery mode) and a client (default
 * discovery), then dial the server by NodeId only.
 *
 * @param {string} serverDiscovery - NodeDiscoveryConfig.Default | .None
 * @returns {Promise<string>}
 */
const dialByKeyOnly = async serverDiscovery => {
  const server = await Iroh.memory({
    secretKey: randomSecret(),
    protocols,
    nodeDiscovery: serverDiscovery,
  });
  const serverNodeId = await server.net.nodeId();

  const client = await Iroh.memory({
    secretKey: randomSecret(),
    nodeDiscovery: NodeDiscoveryConfig.Default,
  });
  const endpoint = client.node.endpoint();

  // Give the server time to publish its record to n0 DNS/pkarr.
  await new Promise(resolve => setTimeout(resolve, waitMs));

  const startedAt = Date.now();
  let result;
  try {
    // KEY ONLY: a NodeAddr carrying just the nodeId — no relayUrl, no
    // addresses. Reaching the server therefore requires discovery.
    const connection = await endpoint.connect(
      { nodeId: serverNodeId },
      enc.encode(ALPN),
    );
    const bi = await connection.openBi();
    await bi.send.writeAll(enc.encode('ping'));
    await bi.send.finish();
    const out = Buffer.alloc(4);
    await bi.recv.readExact(out);
    result = `SUCCESS (${dec.decode(out)}) in ${Date.now() - startedAt}ms`;
  } catch (error) {
    result = `FAIL: ${String(error.message).split('\n')[0]}`;
  }
  await client.node.shutdown();
  await server.node.shutdown();
  return result;
};

console.log(`iroh discovery check (publish wait ${waitMs}ms)\n`);

const withDiscovery = await dialByKeyOnly(NodeDiscoveryConfig.Default);
console.log(`  discovery ON  (expect SUCCESS): ${withDiscovery}`);

const withoutDiscovery = await dialByKeyOnly(NodeDiscoveryConfig.None);
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
