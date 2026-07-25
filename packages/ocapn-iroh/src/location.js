// @ts-check

// Pure helpers for the iroh netlayer's OCapN location scheme. These have
// no dependency on the native `@number0/iroh` binding so they can be unit
// tested without a live iroh endpoint.
//
// An iroh OCapN location has the form:
//
//   {
//     type: 'ocapn-peer',
//     network: 'iroh',
//     transport: 'iroh',   // legacy field; prefer `network`
//     designator: '<iroh EndpointId string>',
//     hints: false | { relay: '<relayUrl>', addrs: '<addr> <addr>' },
//   }
//
// The designator is the peer's iroh `EndpointId` — a 32-byte Ed25519
// public key in iroh's case-sensitive string encoding. It is sufficient
// on its own: iroh discovery resolves an EndpointId to live network
// paths. `relay` and `addrs` are dialing *hints* that let a dialer skip
// a discovery round-trip; direct addresses are space-separated because
// socket addresses (`1.2.3.4:5000`, `[2001:db8::1]:5000`) never contain
// spaces. Loopback and private addresses are excluded from published
// hints by default since they are useless to a remote dialer.

import harden from '@endo/harden';
import { makeError, q, X } from '@endo/errors';

/** @import { OcapnLocation } from '@endo/ocapn/components' */

export const IROH_NETWORK_ID = 'iroh';
harden(IROH_NETWORK_ID);

/**
 * Decide whether a direct socket address (host:port) is worth publishing
 * as a dialing hint. Loopback and private/link-local ranges are excluded
 * since they are not useful to a remote dialer. Mirrors the daemon iroh
 * transport's filter (`packages/daemon/src/networks/iroh-address.js`).
 *
 * @param {string} addr - An iroh direct address, e.g. "1.2.3.4:5000" or
 *   "[2001:db8::1]:5000".
 * @returns {boolean}
 */
export const isPublishableDirectAddress = addr => {
  // Strip the port. IPv6 literals are bracketed: [::1]:5000.
  let host = addr;
  const lastColon = addr.lastIndexOf(':');
  if (addr.startsWith('[')) {
    const close = addr.indexOf(']');
    host = close > 0 ? addr.slice(1, close) : addr;
  } else if (lastColon > 0) {
    host = addr.slice(0, lastColon);
  }
  host = host.toLowerCase();

  if (host === '127.0.0.1' || host.startsWith('127.')) return false;
  if (host === '0.0.0.0') return false;
  if (host === '::1' || host === '::') return false;
  if (host.startsWith('10.')) return false;
  if (host.startsWith('192.168.')) return false;
  // 172.16.0.0 – 172.31.255.255
  const m = /^172\.(\d+)\./.exec(host);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return false;
  // Link-local IPv4 169.254/16.
  if (host.startsWith('169.254.')) return false;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (host.startsWith('fc') || host.startsWith('fd')) return false;
  if (host.startsWith('fe8') || host.startsWith('fe9')) return false;
  if (host.startsWith('fea') || host.startsWith('feb')) return false;
  return true;
};
harden(isPublishableDirectAddress);

/**
 * Build the OCapN location for an iroh endpoint.
 *
 * The result is what this peer advertises in `op:start-session` and what
 * dialers must use verbatim: OCapN identifies sessions by the full
 * location URI (designator *and* hints), so the hints published here are
 * computed once, at netlayer creation, and never change for the life of
 * the netlayer.
 *
 * @param {object} nodeAddr
 * @param {string} nodeAddr.nodeId - iroh EndpointId string (case-sensitive).
 * @param {string} [nodeAddr.relayUrl] - Home relay URL hint.
 * @param {string[]} [nodeAddr.addresses] - Direct socket address hints.
 * @param {object} [options]
 * @param {boolean} [options.includePrivate] - Publish private/loopback
 *   direct addresses too (useful for same-host tests). Default false.
 * @returns {OcapnLocation}
 */
export const buildIrohLocation = (nodeAddr, options = {}) => {
  const { nodeId, relayUrl, addresses = [] } = nodeAddr;
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw makeError(X`iroh location requires a nodeId, got ${q(nodeAddr)}`);
  }
  const { includePrivate = false } = options;
  /** @type {Record<string, string>} */
  const hints = {};
  if (relayUrl) {
    hints.relay = relayUrl;
  }
  const publishable = addresses.filter(
    addr => includePrivate || isPublishableDirectAddress(addr),
  );
  if (publishable.length > 0) {
    hints.addrs = publishable.join(' ');
  }
  return harden({
    type: /** @type {'ocapn-peer'} */ ('ocapn-peer'),
    network: IROH_NETWORK_ID,
    transport: IROH_NETWORK_ID,
    designator: nodeId,
    hints: Object.keys(hints).length > 0 ? hints : false,
  });
};
harden(buildIrohLocation);

/**
 * Extract iroh dialing parameters from an OCapN location, validating
 * that the location belongs to the iroh network.
 *
 * @param {OcapnLocation} location
 * @returns {{ nodeId: string, relayUrl?: string, addresses?: string[] }}
 */
export const dialParamsFromLocation = location => {
  const networkId = location.network ?? location.transport;
  if (networkId !== IROH_NETWORK_ID) {
    throw makeError(
      X`ocapn-iroh: unsupported network ${q(networkId)}, expected ${q(IROH_NETWORK_ID)}`,
    );
  }
  const nodeId = location.designator;
  if (typeof nodeId !== 'string' || nodeId.length === 0) {
    throw makeError(X`ocapn-iroh: location requires a non-empty designator`);
  }
  /** @type {{ nodeId: string, relayUrl?: string, addresses?: string[] }} */
  const dialParams = { nodeId };
  const { hints } = location;
  if (hints && typeof hints === 'object') {
    if (typeof hints.relay === 'string' && hints.relay.length > 0) {
      dialParams.relayUrl = hints.relay;
    }
    if (typeof hints.addrs === 'string') {
      const addresses = hints.addrs.split(' ').filter(addr => addr.length > 0);
      if (addresses.length > 0) {
        dialParams.addresses = addresses;
      }
    }
  }
  return harden(dialParams);
};
harden(dialParamsFromLocation);
