// @ts-check
/* global globalThis */

import harden from '@endo/harden';
import { E, Far } from '@endo/far';

import { fromHex } from '../hex.js';
import { makeNetstringCapTP } from '../connection.js';
import { adaptIrohStream } from './iroh-stream-adapter.js';
import { KEEPALIVE_TIMEOUT_MS, makeIrohHeartbeat } from './iroh-heartbeat.js';
import {
  buildIrohAddress,
  parseIrohAddress,
  supportsIrohAddress,
} from './iroh-address.js';

// ALPN identifying the Endo CapTP protocol over iroh QUIC. The native binding
// takes ALPNs as plain `Array<number>` byte arrays (napi marshals `Vec<u8>`
// from a JS Array, not a TypedArray), both when advertised at bind time and
// when dialing (see @number0/iroh test/endpoint.mjs).
const ALPN_STRING = 'endo/captp/0';
const textEncoder = new TextEncoder();
const ALPN_BYTES = textEncoder.encode(ALPN_STRING);
const ALPN_ARRAY = Array.from(ALPN_BYTES);

/**
 * Encode a string as the `Array<number>` byte form the native binding's
 * `Vec<u8>` parameters expect (close reasons, datagrams, etc.).
 *
 * @param {string} text
 * @returns {number[]}
 */
const toByteArray = text => Array.from(textEncoder.encode(text));

const processEnv = /** @type {any} */ (globalThis).process?.env;
// Publish loopback/private direct addresses as dialing hints. Off by default
// (they are useless to remote dialers); enable for same-host integration
// tests where discovery has no public path to advertise.
const PUBLISH_PRIVATE = processEnv?.ENDO_IROH_PUBLISH_PRIVATE === '1';

/**
 * Derive a deterministic 32-byte Ed25519 secret for the iroh node from the
 * daemon's NodeNumber, mirroring the libp2p transport's key derivation so
 * the iroh NodeId is stable across restarts.
 *
 * NOTE: this ties the iroh identity to the (public) NodeNumber rather than
 * the daemon's root private key. See designs/iroh-network-design.md
 * § "Identity and trust" for the security implications and the recommended
 * end-state of binding to the real root key.
 *
 * @param {string} nodeIdHex - 64-hex-character NodeNumber.
 * @returns {number[]} 32-byte secret as an array of byte values.
 */
export const deriveIrohSecretKey = nodeIdHex => {
  const seed = fromHex(nodeIdHex);
  return Array.from(seed.slice(0, 32));
};
harden(deriveIrohSecretKey);

/**
 * Endo daemon network module for iroh (https://www.iroh.computer).
 *
 * Loaded as an unconfined caplet via `endo run`. iroh provides
 * "dial keys, not IPs" reachability — peers are dialed by their Ed25519
 * NodeId and resolved through iroh discovery and relays — over mutually
 * authenticated, encrypted QUIC (TLS) connections. NAT traversal, relay
 * fallback, and hole-punching are handled by iroh itself.
 *
 * @param {any} powers - Daemon powers provided to unconfined caplets.
 * @param {any} context - Caplet lifecycle context.
 */
export const make = async (powers, context) => {
  // Imported dynamically: `@number0/iroh` is an optional native binding that
  // may be absent on unsupported platforms. The transport simply fails to
  // instantiate there rather than breaking module resolution everywhere. The
  // specifier is held in a variable so the type checker does not resolve the
  // package's (malformed) type declarations.
  const irohSpecifier = '@number0/iroh';
  const { Endpoint, EndpointAddr, EndpointId } = await import(irohSpecifier);

  const cancelled = /** @type {Promise<never>} */ (E(context).whenCancelled());
  const cancelServer = (/** @type {Error} */ error) => E(context).cancel(error);

  const { node: localNodeId } = await E(powers).getPeerInfo();
  const localGreeter = E(powers).greeter();
  const localGateway = E(powers).gateway();

  const secretKey = deriveIrohSecretKey(localNodeId);

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  /**
   * Wire one accepted or dialed iroh bidi stream up to CapTP and track it
   * until it closes.
   *
   * @param {any} bi - iroh BiStream.
   * @param {any} connection - iroh Connection.
   * @param {number} connectionNumber
   * @param {boolean} inbound
   * @returns {ReturnType<typeof makeNetstringCapTP>}
   */
  const serveStream = (bi, connection, connectionNumber, inbound) => {
    const {
      reader,
      writer,
      closed: streamClosed,
    } = adaptIrohStream(bi, connection);
    const bootstrap = inbound ? localGreeter : localGateway;
    const capTp = makeNetstringCapTP(
      'Endo',
      writer,
      reader,
      cancelled,
      bootstrap,
    );

    // Tear the session down so any objects reachable across it break.
    // Aborting CapTP rejects every outstanding question and revokes imported
    // presences with `reason`; closing the QUIC connection releases the socket
    // and, on the outbound path, lets `capTp.closed` fire the
    // connection-context cancellation that disposes the peer.
    const tearDown = (/** @type {Error} */ reason) => {
      capTp.close(reason);
      try {
        connection.close(0n, toByteArray(reason.message));
      } catch {
        // Best-effort; the connection may already be gone.
      }
    };

    // Keep the connection alive against iroh's QUIC idle timeout, and presume
    // the peer dead if it stops answering so a hung peer surfaces as broken
    // capabilities rather than a stall.
    const heartbeat = makeIrohHeartbeat(connection, {
      onTimeout: () => {
        console.error(
          `Endo daemon iroh connection ${connectionNumber} missed keep-alive (no datagram within ${KEEPALIVE_TIMEOUT_MS}ms) at ${new Date().toISOString()}`,
        );
        tearDown(
          new Error(
            `iroh keep-alive timeout: peer silent for ${KEEPALIVE_TIMEOUT_MS}ms`,
          ),
        );
      },
      log: message => console.error(`Endo daemon ${message}`),
    });

    streamClosed.then(
      () => capTp.close(new Error('iroh stream closed')),
      () => {},
    );

    const closed = Promise.race([streamClosed, capTp.closed]);
    connectionClosedPromises.add(closed);
    closed.finally(() => {
      heartbeat.stop();
      connectionClosedPromises.delete(closed);
      console.error(
        `Endo daemon closed iroh connection ${connectionNumber} at ${new Date().toISOString()}`,
      );
    });
    return capTp;
  };

  // Bind the endpoint. `Endpoint.bind` applies iroh's n0 preset (relays +
  // discovery), then our options, so the transport keeps the "dial keys, not
  // IPs" default. Advertising the CapTP ALPN here is what lets inbound dials
  // negotiate our protocol; the accept loop below pulls those connections.
  const endpoint = await Endpoint.bind({ secretKey, alpns: [ALPN_ARRAY] });
  const localIrohNodeId = endpoint.id().toString();

  // --- Inbound accept loop ---
  // 1.0 replaced the `protocols` table with an explicit accept loop:
  // `acceptNext()` yields one inbound connection attempt at a time (or null
  // once the endpoint closes), and the server-side handshake is driven by
  // hand through `Incoming -> Accepting -> Connection`.
  /** @param {any} incoming */
  const handleIncoming = async incoming => {
    const accepting = await incoming.accept();
    const connection = await accepting.connect();
    const { value: connectionNumber } = connectionNumbers.next();
    console.error(
      `Endo daemon accepted iroh connection ${connectionNumber} at ${new Date().toISOString()}`,
    );
    const bi = await connection.acceptBi();
    serveStream(bi, connection, connectionNumber, true);
    await connection.closed();
  };

  const acceptLoop = async () => {
    await null;
    for (;;) {
      // Accept connections one at a time; the work for each is dispatched
      // concurrently below, so the serial await here is intentional.
      // eslint-disable-next-line no-await-in-loop
      const incoming = await endpoint.acceptNext();
      if (!incoming) {
        // `acceptNext` resolves to null once the endpoint is closed; the loop
        // is done and the disposal path below has already torn things down.
        return;
      }
      // Handle each inbound connection independently. A single failed inbound
      // connection must not tear down the whole transport, so its errors are
      // logged and swallowed here rather than propagated to cancelServer.
      handleIncoming(incoming).catch((/** @type {Error} */ error) => {
        console.error(
          `Endo daemon iroh inbound connection error: ${error.message}`,
        );
      });
    }
  };
  // Only a fatal failure of the loop itself (not a per-connection error) tears
  // the transport down.
  acceptLoop().catch(cancelServer);

  console.error(
    `Endo daemon started local iroh network device, NodeId ${localIrohNodeId}`,
  );

  // `addresses()` is synchronous and, since 1.0, so is `endpoint.addr()`, so
  // the current NodeAddr is read on demand rather than cached on an interval.
  const currentAddress = () => {
    try {
      const addr = endpoint.addr();
      return buildIrohAddress(
        {
          nodeId: addr.id().toString(),
          relayUrl: addr.relayUrl() ?? undefined,
          addresses: addr.directAddresses(),
        },
        { includePrivate: PUBLISH_PRIVATE },
      );
    } catch (error) {
      console.error(
        `Endo iroh: failed to read node address: ${
          /** @type {Error} */ (error).message
        }`,
      );
      // Fall back to a bare-key address; the peer is still dialable by NodeId
      // through discovery.
      return buildIrohAddress({ nodeId: localIrohNodeId });
    }
  };

  // --- Outbound connect ---
  /**
   * @param {string} address
   * @param {any} connectionContext
   */
  const connect = async (address, connectionContext) => {
    const { value: connectionNumber } = connectionNumbers.next();
    const nodeAddr = parseIrohAddress(address);

    const connectionCancelled = /** @type {Promise<never>} */ (
      E(connectionContext).whenCancelled()
    );
    const cancelConnection = () => E(connectionContext).cancel();

    console.error(
      `Endo daemon connecting iroh ${connectionNumber} to ${nodeAddr.nodeId} at ${new Date().toISOString()}`,
    );

    /** @type {any} */
    let connection;
    let handedOff = false;
    try {
      // 1.0 dials an `EndpointAddr` instance (built from an `EndpointId` plus
      // optional relay/direct-address hints) rather than a plain NodeAddr
      // object. Passing no hints lets discovery resolve the NodeId.
      const endpointAddr = new EndpointAddr(
        EndpointId.fromString(nodeAddr.nodeId),
        nodeAddr.relayUrl,
        nodeAddr.addresses,
      );
      connection = await Promise.race([
        endpoint.connect(endpointAddr, ALPN_ARRAY),
        connectionCancelled,
      ]);
      const bi = await Promise.race([connection.openBi(), connectionCancelled]);

      const capTp = serveStream(bi, connection, connectionNumber, false);
      handedOff = true;

      // Cancel the connection context once CapTP closes. Consume the
      // connectionCancelled rejection so a cancelled connection does not
      // surface as an unhandled rejection during teardown.
      Promise.race([capTp.closed, connectionCancelled])
        .finally(() => {
          cancelConnection();
        })
        .catch(() => {});

      const remoteGreeter = capTp.getBootstrap();
      return await E(remoteGreeter).hello(
        localNodeId,
        localGateway,
        Far('Canceller', cancelConnection),
        connectionCancelled,
      );
    } catch (error) {
      // If we opened an iroh connection but failed or were cancelled before
      // handing it to serveStream (which owns teardown), close it so the
      // QUIC connection does not leak.
      if (connection && !handedOff) {
        try {
          connection.close(0n, toByteArray('cancelled'));
        } catch {
          // Best-effort.
        }
      }
      throw error;
    }
  };

  // --- Shutdown ---
  const stopped = cancelled.catch(async () => {
    try {
      // Closing the endpoint also ends the accept loop: `acceptNext` resolves
      // to null once the endpoint is closed.
      await endpoint.close();
    } catch {
      // Best-effort shutdown.
    }
    await Promise.all(Array.from(connectionClosedPromises));
  });

  E.sendOnly(context).addDisposalHook(() => stopped);

  return Far('IrohNetwork', {
    addresses: () => harden([currentAddress()]),
    supports: supportsIrohAddress,
    connect,
  });
};
harden(make);
