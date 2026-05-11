// @ts-check

import test from '@endo/ses-ava/prepare-endo.js';

import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HOST_LAN_ALLOWED_RANGES,
  HOST_LOOPBACK_ALLOWED_RANGES,
  PRIVATE_BLOCKED_RANGES,
} from '../src/net/blocked-ranges.js';

/**
 * Regression tests that keep `src/net/blocked-ranges.js` and
 * `src/net/private-egress.nft` in lockstep.  The nftables ruleset is
 * loaded inside the slice's netns; if its blocklist drifts from the
 * documented `PRIVATE_BLOCKED_RANGES` table, callers reading the
 * documented list (e.g. through slice diagnostics) would get a wrong
 * answer.
 *
 * Phase 1.5 PLAN § "Open questions" (egress filter mechanism) calls
 * out the need for portable, version-resilient verification: this
 * test enforces the documented ⇄ ruleset contract at unit-test time
 * so the operational answer is always "the documented list IS the
 * one in the nft file".
 */

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const NFT_PATH = nodePath.resolve(
  here,
  '..',
  'src',
  'net',
  'private-egress.nft',
);

/**
 * Strip nftables comments and whitespace from the ruleset and return
 * the remaining text.  Comments cannot affect ruleset semantics, so
 * dropping them avoids false positives from documentation drift.
 *
 * @param {string} text
 * @returns {string}
 */
const stripComments = text =>
  text
    .split('\n')
    .map(line => line.replace(/#.*$/, '').trim())
    .filter(line => line !== '')
    .join('\n');

test('private-egress.nft references every documented PRIVATE_BLOCKED_RANGES CIDR', t => {
  const text = stripComments(nodeFs.readFileSync(NFT_PATH, 'utf8'));
  for (const entry of PRIVATE_BLOCKED_RANGES) {
    t.true(
      text.includes(entry.cidr),
      `nft ruleset must include ${entry.cidr} (${entry.label})`,
    );
  }
});

test('PRIVATE_BLOCKED_RANGES covers the four address-family classes', t => {
  // RFC 1918 (10/8, 172.16/12, 192.168/16) + CGNAT (100.64/10) +
  // link-local (169.254/16) + loopback (127/8) + IPv6 ULA + IPv6
  // loopback + IPv6 link-local.  The shape is the contract documented
  // in PLAN/endo_posix_sandbox.md § "Network policy".
  const cidrs = PRIVATE_BLOCKED_RANGES.map(r => r.cidr);
  t.true(cidrs.includes('10.0.0.0/8'));
  t.true(cidrs.includes('172.16.0.0/12'));
  t.true(cidrs.includes('192.168.0.0/16'));
  t.true(cidrs.includes('100.64.0.0/10'));
  t.true(cidrs.includes('169.254.0.0/16'));
  t.true(cidrs.includes('127.0.0.0/8'));
  t.true(cidrs.includes('fc00::/7'));
  t.true(cidrs.includes('::1/128'));
  t.true(cidrs.includes('fe80::/10'));
});

test('HOST_LOOPBACK_ALLOWED_RANGES is restricted to loopback CIDRs', t => {
  const cidrs = HOST_LOOPBACK_ALLOWED_RANGES.map(r => r.cidr);
  t.deepEqual(cidrs.sort(), ['127.0.0.0/8', '::1/128'].sort());
});

test('HOST_LAN_ALLOWED_RANGES extends loopback with RFC 1918 / link-local', t => {
  const cidrs = HOST_LAN_ALLOWED_RANGES.map(r => r.cidr);
  // host-lan must permit loopback…
  t.true(cidrs.includes('127.0.0.0/8'));
  t.true(cidrs.includes('::1/128'));
  // …plus the LAN ranges public Internet does not use.
  t.true(cidrs.includes('10.0.0.0/8'));
  t.true(cidrs.includes('192.168.0.0/16'));
  t.true(cidrs.includes('172.16.0.0/12'));
  t.true(cidrs.includes('169.254.0.0/16'));
  t.true(cidrs.includes('fe80::/10'));
  t.true(cidrs.includes('fc00::/7'));
  // host-lan must NOT permit CGNAT — RFC 6598 is for ISP NAT, not
  // local LANs, and exposing it would defeat the profile's "drop
  // public Internet" intent.
  t.false(cidrs.includes('100.64.0.0/10'), 'host-lan should not allow CGNAT');
});
