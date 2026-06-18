// @ts-check

// Pure helpers for the iroh transport's address scheme. These have no
// dependency on the native `@number0/iroh` binding so they can be unit
// tested without a live iroh node.
//
// An iroh address has the form:
//
//   iroh+captp0:///<nodeId>?relay=<relayUrl>&addr=<directAddr>&addr=<...>
//
// The case-sensitive NodeId is carried in the URL pathname (not the
// hostname, which URL parsing lowercases). `relay` and `addr` are dialing
// *hints*: a peer may always be dialed by NodeId alone and resolved through
// iroh discovery, but published hints let a dialer skip a discovery
// round-trip. Loopback and private addresses are excluded from hints.

import { makeError, q, X } from '@endo/errors';

export const IROH_URL_PROTOCOL = 'iroh+captp0';

/**
 * Decide whether a direct socket address (host:port) is worth publishing as
 * a dialing hint. Loopback and private/link-local ranges are excluded since
 * they are not useful to a remote dialer.
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
 * Build the published address string for an iroh node.
 *
 * @param {object} nodeAddr
 * @param {string} nodeAddr.nodeId
 * @param {string} [nodeAddr.relayUrl]
 * @param {string[]} [nodeAddr.addresses]
 * @param {object} [options]
 * @param {boolean} [options.includePrivate] - Publish private/loopback
 *   direct addresses too (useful for same-host tests). Default false.
 * @returns {string}
 */
export const buildIrohAddress = (nodeAddr, options = {}) => {
  const { nodeId, relayUrl, addresses = [] } = nodeAddr;
  if (!nodeId) {
    throw makeError(X`iroh address requires a nodeId, got ${q(nodeAddr)}`);
  }
  const { includePrivate = false } = options;
  const url = new URL(`${IROH_URL_PROTOCOL}:///`);
  url.pathname = `/${nodeId}`;
  if (relayUrl) {
    url.searchParams.set('relay', relayUrl);
  }
  for (const addr of addresses) {
    if (includePrivate || isPublishableDirectAddress(addr)) {
      url.searchParams.append('addr', addr);
    }
  }
  return url.href;
};
harden(buildIrohAddress);

/**
 * Parse an iroh address string into the fields needed to construct an
 * `EndpointAddr` (node id plus optional relay/direct-address dialing hints).
 *
 * @param {string} address
 * @returns {{ nodeId: string, relayUrl?: string, addresses?: string[] }}
 */
export const parseIrohAddress = address => {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw makeError(X`Invalid iroh address ${q(address)}`);
  }
  if (url.protocol !== `${IROH_URL_PROTOCOL}:`) {
    throw makeError(
      X`Address ${q(address)} is not an ${q(IROH_URL_PROTOCOL)} address`,
    );
  }
  const nodeId = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!nodeId) {
    throw makeError(X`iroh address ${q(address)} has no nodeId`);
  }
  const relayUrl = url.searchParams.get('relay') || undefined;
  const addresses = url.searchParams.getAll('addr');
  /** @type {{ nodeId: string, relayUrl?: string, addresses?: string[] }} */
  const nodeAddr = { nodeId };
  if (relayUrl) {
    nodeAddr.relayUrl = relayUrl;
  }
  if (addresses.length > 0) {
    nodeAddr.addresses = addresses;
  }
  return nodeAddr;
};
harden(parseIrohAddress);

/**
 * Whether the iroh transport handles the given address or protocol.
 *
 * @param {string} addressOrProtocol
 * @returns {boolean}
 */
export const supportsIrohAddress = addressOrProtocol => {
  try {
    return new URL(addressOrProtocol).protocol === `${IROH_URL_PROTOCOL}:`;
  } catch {
    return (
      addressOrProtocol === `${IROH_URL_PROTOCOL}:` ||
      addressOrProtocol === IROH_URL_PROTOCOL
    );
  }
};
harden(supportsIrohAddress);
