// @ts-check

/** @import { AddressChecker, ParsedCIDR } from './types.js' */

const localhostAddresses = harden(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Strip the IPv4-mapped IPv6 prefix so `::ffff:10.1.2.3` becomes `10.1.2.3`.
 *
 * @param {string} addr
 * @returns {string}
 */
const normalizeAddress = addr => {
  const v4Prefix = '::ffff:';
  if (addr.startsWith(v4Prefix)) {
    return addr.slice(v4Prefix.length);
  }
  return addr;
};

/**
 * @param {string} addr
 * @returns {number[] | undefined} 4-element array of octets, or undefined
 */
const parseIPv4 = addr => {
  const parts = addr.split('.');
  if (parts.length !== 4) return undefined;
  /** @type {number[]} */
  const octets = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return undefined;
    octets.push(n);
  }
  return octets;
};

/**
 * Expand `::` shorthand and parse to 8 x 16-bit groups.
 *
 * @param {string} addr
 * @returns {number[] | undefined} 8-element array of 16-bit groups, or undefined
 */
const parseIPv6 = addr => {
  const halves = addr.split('::');
  if (halves.length > 2) return undefined;

  /** @type {string[]} */
  let groups;
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return undefined;
    const zeros = [];
    for (let i = 0; i < missing; i += 1) {
      zeros.push('0');
    }
    groups = [...left, ...zeros, ...right];
  } else {
    groups = addr.split(':');
  }

  if (groups.length !== 8) return undefined;

  /** @type {number[]} */
  const result = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return undefined;
    result.push(parseInt(group, 16));
  }
  return result;
};

/**
 * Compare the leading `prefixLen` bits of two addresses represented as
 * equal-length arrays of integer groups (octets for IPv4, 16-bit groups for
 * IPv6).
 *
 * @param {number[]} addr
 * @param {number[]} network
 * @param {number} prefixLen
 * @param {number} groupBits - 8 for IPv4 octets, 16 for IPv6 groups
 * @returns {boolean}
 */
const matchesPrefix = (addr, network, prefixLen, groupBits) => {
  let remaining = prefixLen;
  for (let i = 0; i < addr.length; i += 1) {
    if (remaining <= 0) return true;
    if (remaining >= groupBits) {
      if (addr[i] !== network[i]) return false;
      remaining -= groupBits;
    } else {
      const divisor = 2 ** (groupBits - remaining);
      return (
        Math.floor(addr[i] / divisor) === Math.floor(network[i] / divisor)
      );
    }
  }
  return true;
};

/**
 * Parse a CIDR string like `10.0.0.0/8` or `fd00::/8` into a structured
 * representation.  A bare address without `/` is treated as a host route
 * (`/32` for IPv4, `/128` for IPv6).
 *
 * @param {string} cidr
 * @returns {ParsedCIDR | undefined}
 */
export const parseCIDR = cidr => {
  const slashIdx = cidr.lastIndexOf('/');

  if (slashIdx === -1) {
    const v4 = parseIPv4(cidr);
    if (v4 !== undefined) {
      return harden({ type: 'ipv4', network: v4, prefixLen: 32 });
    }
    const v6 = parseIPv6(cidr);
    if (v6 !== undefined) {
      return harden({ type: 'ipv6', network: v6, prefixLen: 128 });
    }
    return undefined;
  }

  const addrPart = cidr.slice(0, slashIdx);
  const prefixStr = cidr.slice(slashIdx + 1);
  const prefixLen = Number(prefixStr);
  if (!Number.isInteger(prefixLen) || prefixLen < 0) return undefined;

  const v4 = parseIPv4(addrPart);
  if (v4 !== undefined) {
    if (prefixLen > 32) return undefined;
    return harden({ type: 'ipv4', network: v4, prefixLen });
  }

  const v6 = parseIPv6(addrPart);
  if (v6 !== undefined) {
    if (prefixLen > 128) return undefined;
    return harden({ type: 'ipv6', network: v6, prefixLen });
  }

  return undefined;
};
harden(parseCIDR);

/**
 * Test whether `addr` falls within the given parsed CIDR.
 *
 * @param {string} addr - normalized IP address
 * @param {ParsedCIDR} cidr
 * @returns {boolean}
 */
export const addressMatchesCIDR = (addr, cidr) => {
  if (cidr.type === 'ipv4') {
    const parsed = parseIPv4(addr);
    if (parsed === undefined) return false;
    return matchesPrefix(parsed, cidr.network, cidr.prefixLen, 8);
  }
  const parsed = parseIPv6(addr);
  if (parsed === undefined) return false;
  return matchesPrefix(parsed, cidr.network, cidr.prefixLen, 16);
};
harden(addressMatchesCIDR);

/**
 * Build a predicate that returns `true` when a given `remoteAddress` should be
 * allowed through the gateway.
 *
 * - No options / empty options: only localhost addresses pass.
 * - `allowRemote: true`: every address passes.
 * - `allowedCIDRs` (comma-separated): localhost plus any address in the listed
 *   CIDRs passes.
 *
 * @param {{ allowRemote?: boolean, allowedCIDRs?: string }} [options]
 * @returns {AddressChecker}
 */
export const makeAddressChecker = (options = {}) => {
  const { allowRemote = false, allowedCIDRs = '' } = options;

  if (allowRemote) {
    /** @type {AddressChecker} */
    const allowAll = _addr => true;
    return harden(allowAll);
  }

  if (!allowedCIDRs) {
    /** @type {AddressChecker} */
    const localhostOnly = addr => localhostAddresses.includes(addr);
    return harden(localhostOnly);
  }

  /** @type {ParsedCIDR[]} */
  const cidrs = [];
  for (const entry of allowedCIDRs.split(',')) {
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      const parsed = parseCIDR(trimmed);
      if (parsed !== undefined) {
        cidrs.push(parsed);
      }
    }
  }
  harden(cidrs);

  /** @type {AddressChecker} */
  const cidrChecker = addr => {
    if (localhostAddresses.includes(addr)) return true;
    const normalized = normalizeAddress(addr);
    for (const cidr of cidrs) {
      if (addressMatchesCIDR(normalized, cidr)) return true;
    }
    return false;
  };
  return harden(cidrChecker);
};
harden(makeAddressChecker);
