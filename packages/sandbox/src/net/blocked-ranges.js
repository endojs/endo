// @ts-check

/**
 * Documented blocklist for the `network: 'private'` egress filter and
 * the `network: 'host-loopback'` / `'host-lan'` profiles.
 *
 * Kept as a module-level export so:
 *   1. The bwrap driver uses it to assemble nftables include files
 *      and to surface the blocklist via slice diagnostics.
 *   2. The egress regression test
 *      (`test/blocked-ranges.test.js`) verifies the documented list
 *      matches the one compiled into `src/net/private-egress.nft`.
 *   3. Documentation in `README.md` and `TODO/14_*.md` references a
 *      single source of truth.
 *
 * Each entry pairs a CIDR with the RFC / scope it describes so
 * diagnostic output can explain *why* a range is blocked.
 */

/**
 * @typedef {object} BlockedRange
 * @property {string} cidr   CIDR notation, e.g. `'10.0.0.0/8'`.
 * @property {'v4'|'v6'} family
 * @property {string} label  Short human label (RFC reference / scope).
 */

/** @type {readonly BlockedRange[]} */
export const PRIVATE_BLOCKED_RANGES = harden([
  harden({ cidr: '10.0.0.0/8', family: 'v4', label: 'RFC 1918 private' }),
  harden({ cidr: '172.16.0.0/12', family: 'v4', label: 'RFC 1918 private' }),
  harden({ cidr: '192.168.0.0/16', family: 'v4', label: 'RFC 1918 private' }),
  harden({ cidr: '100.64.0.0/10', family: 'v4', label: 'RFC 6598 CGNAT' }),
  harden({
    cidr: '169.254.0.0/16',
    family: 'v4',
    label: 'RFC 3927 link-local',
  }),
  harden({ cidr: '127.0.0.0/8', family: 'v4', label: 'IPv4 loopback' }),
  harden({ cidr: 'fc00::/7', family: 'v6', label: 'IPv6 ULA (incl fd00::/8)' }),
  harden({ cidr: '::1/128', family: 'v6', label: 'IPv6 loopback' }),
  harden({ cidr: 'fe80::/10', family: 'v6', label: 'IPv6 link-local' }),
]);
harden(PRIVATE_BLOCKED_RANGES);

/**
 * Ranges allowed by `host-loopback` (everything else is blocked).
 *
 * @type {readonly BlockedRange[]}
 */
export const HOST_LOOPBACK_ALLOWED_RANGES = harden([
  harden({ cidr: '127.0.0.0/8', family: 'v4', label: 'IPv4 loopback' }),
  harden({ cidr: '::1/128', family: 'v6', label: 'IPv6 loopback' }),
]);
harden(HOST_LOOPBACK_ALLOWED_RANGES);

/**
 * Ranges that `host-lan` permits in addition to loopback.  The
 * profile drops public Internet but allows local-network traffic,
 * matching the "offline LAN build" use case in
 * `PLAN/endo_posix_sandbox.md` § "Network policy".
 *
 * @type {readonly BlockedRange[]}
 */
export const HOST_LAN_ALLOWED_RANGES = harden([
  harden({ cidr: '127.0.0.0/8', family: 'v4', label: 'IPv4 loopback' }),
  harden({ cidr: '10.0.0.0/8', family: 'v4', label: 'RFC 1918 private' }),
  harden({ cidr: '172.16.0.0/12', family: 'v4', label: 'RFC 1918 private' }),
  harden({ cidr: '192.168.0.0/16', family: 'v4', label: 'RFC 1918 private' }),
  harden({
    cidr: '169.254.0.0/16',
    family: 'v4',
    label: 'RFC 3927 link-local',
  }),
  harden({ cidr: '::1/128', family: 'v6', label: 'IPv6 loopback' }),
  harden({ cidr: 'fc00::/7', family: 'v6', label: 'IPv6 ULA' }),
  harden({ cidr: 'fe80::/10', family: 'v6', label: 'IPv6 link-local' }),
]);
harden(HOST_LAN_ALLOWED_RANGES);
