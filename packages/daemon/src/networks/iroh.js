// @ts-check
/* global globalThis, setInterval, clearInterval */

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

// ALPN identifying the Endo CapTP protocol over iroh QUIC. iroh keys its
// inbound `protocols` table by the UTF-8 string form of the ALPN bytes, so a
// plain string key here is equivalent to the byte array the native binding
// expects (see @number0/iroh test/node.mjs).
const ALPN_STRING = 'endo/captp/0';
const ALPN_BYTES = new TextEncoder().encode(ALPN_STRING);

const processEnv = /** @type {any} */ (globalThis).process?.env;
// Publish loopback/private direct addresses as dialing hints. Off by default
// (they are useless to remote dialers); enable for same-host integration
// tests where discovery has no public path to advertise.
const PUBLISH_PRIVATE = processEnv?.ENDO_IROH_PUBLISH_PRIVATE === '1';

const ADDRESS_REFRESH_MS = 15_000;

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
  const { Iroh } = await import(irohSpecifier);

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
        connection.close(0n, new TextEncoder().encode(reason.message));
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

  // --- Inbound connection handler ---
  const protocols = {
    [ALPN_STRING]: (/** @type {any} */ _err, /** @type {any} */ _endpoint) => ({
      accept: async (/** @type {any} */ err, /** @type {any} */ connection) => {
        if (err) {
          // A single failed inbound connection must not tear down the whole
          // transport; log and ignore it.
          console.error(
            `Endo daemon iroh inbound connection error: ${
              /** @type {Error} */ (err).message
            }`,
          );
          return;
        }
        await (async () => {
          const { value: connectionNumber } = connectionNumbers.next();
          console.error(
            `Endo daemon accepted iroh connection ${connectionNumber} at ${new Date().toISOString()}`,
          );
          const bi = await connection.acceptBi();
          serveStream(bi, connection, connectionNumber, true);
          await connection.closed();
        })().catch(cancelServer);
      },
    }),
  };

  const iroh = await Iroh.memory({ secretKey, protocols });
  const endpoint = iroh.node.endpoint();
  const localIrohNodeId = endpoint.nodeId();

  // `addresses()` must be synchronous but `net.nodeAddr()` is async, so we
  // cache the latest NodeAddr and refresh it on an interval.
  /** @type {{ nodeId: string, relayUrl?: string, addresses?: string[] }} */
  let cachedNodeAddr = { nodeId: localIrohNodeId };
  const refreshNodeAddr = async () => {
    try {
      const nodeAddr = await iroh.net.nodeAddr();
      cachedNodeAddr = {
        nodeId: localIrohNodeId,
        relayUrl: nodeAddr.relayUrl,
        addresses: nodeAddr.addresses,
      };
    } catch (error) {
      console.error(
        `Endo iroh: failed to refresh node address: ${
          /** @type {Error} */ (error).message
        }`,
      );
    }
  };
  await refreshNodeAddr();

  const refreshTimer = setInterval(() => {
    refreshNodeAddr().catch(() => {});
  }, ADDRESS_REFRESH_MS);
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }

  console.error(
    `Endo daemon started local iroh network device, NodeId ${localIrohNodeId}`,
  );

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
      connection = await Promise.race([
        endpoint.connect(nodeAddr, ALPN_BYTES),
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
          connection.close(0n, new TextEncoder().encode('cancelled'));
        } catch {
          // Best-effort.
        }
      }
      throw error;
    }
  };

  // --- Shutdown ---
  const stopped = cancelled.catch(async () => {
    clearInterval(refreshTimer);
    try {
      await iroh.node.shutdown();
    } catch {
      // Best-effort shutdown.
    }
    await Promise.all(Array.from(connectionClosedPromises));
  });

  E.sendOnly(context).addDisposalHook(() => stopped);

  return Far('IrohNetwork', {
    addresses: () =>
      harden([
        buildIrohAddress(cachedNodeAddr, { includePrivate: PUBLISH_PRIVATE }),
      ]),
    supports: supportsIrohAddress,
    connect,
  });
};
harden(make);
