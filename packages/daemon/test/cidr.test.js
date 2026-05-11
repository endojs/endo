// @ts-check

import '@endo/init/debug.js';

import test from 'ava';

import {
  parseCIDR,
  addressMatchesCIDR,
  makeAddressChecker,
} from '../src/cidr.js';

// --- parseCIDR ---

test('parseCIDR parses IPv4 CIDR', t => {
  const result = parseCIDR('10.0.0.0/8');
  t.deepEqual(result, { type: 'ipv4', network: [10, 0, 0, 0], prefixLen: 8 });
});

test('parseCIDR parses IPv4 host address', t => {
  const result = parseCIDR('192.168.1.5');
  t.deepEqual(result, {
    type: 'ipv4',
    network: [192, 168, 1, 5],
    prefixLen: 32,
  });
});

test('parseCIDR parses IPv6 CIDR', t => {
  const result = parseCIDR('fd00::/8');
  t.not(result, undefined);
  t.is(/** @type {NonNullable<typeof result>} */ (result).type, 'ipv6');
  t.is(/** @type {NonNullable<typeof result>} */ (result).prefixLen, 8);
});

test('parseCIDR parses IPv6 loopback', t => {
  const result = parseCIDR('::1');
  t.not(result, undefined);
  t.is(/** @type {NonNullable<typeof result>} */ (result).type, 'ipv6');
  t.is(/** @type {NonNullable<typeof result>} */ (result).prefixLen, 128);
});

test('parseCIDR rejects invalid input', t => {
  t.is(parseCIDR('not-an-ip'), undefined);
  t.is(parseCIDR('10.0.0.0/33'), undefined);
  t.is(parseCIDR(''), undefined);
  t.is(parseCIDR('10.0.0.256/8'), undefined);
});

// --- addressMatchesCIDR ---

test('addressMatchesCIDR matches IPv4 within /8', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('10.0.0.0/8')
  );
  t.true(addressMatchesCIDR('10.0.0.1', cidr));
  t.true(addressMatchesCIDR('10.255.255.255', cidr));
  t.false(addressMatchesCIDR('11.0.0.1', cidr));
  t.false(addressMatchesCIDR('192.168.1.1', cidr));
});

test('addressMatchesCIDR matches IPv4 within /16', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('172.16.0.0/12')
  );
  t.true(addressMatchesCIDR('172.16.0.1', cidr));
  t.true(addressMatchesCIDR('172.31.255.255', cidr));
  t.false(addressMatchesCIDR('172.32.0.1', cidr));
});

test('addressMatchesCIDR matches exact IPv4 host', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('192.168.1.100/32')
  );
  t.true(addressMatchesCIDR('192.168.1.100', cidr));
  t.false(addressMatchesCIDR('192.168.1.101', cidr));
});

test('addressMatchesCIDR matches Tailscale CGNAT range', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('100.64.0.0/10')
  );
  t.true(addressMatchesCIDR('100.64.0.1', cidr));
  t.true(addressMatchesCIDR('100.127.255.255', cidr));
  t.false(addressMatchesCIDR('100.128.0.1', cidr));
  t.false(addressMatchesCIDR('100.63.255.255', cidr));
});

test('addressMatchesCIDR matches /0 (all IPs)', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('0.0.0.0/0')
  );
  t.true(addressMatchesCIDR('1.2.3.4', cidr));
  t.true(addressMatchesCIDR('255.255.255.255', cidr));
});

test('addressMatchesCIDR does not match IPv6 addr against IPv4 CIDR', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('10.0.0.0/8')
  );
  t.false(addressMatchesCIDR('::1', cidr));
});

test('addressMatchesCIDR matches IPv6 within prefix', t => {
  const cidr = /** @type {NonNullable<ReturnType<typeof parseCIDR>>} */ (
    parseCIDR('fd00::/8')
  );
  t.true(addressMatchesCIDR('fd12:3456:789a::', cidr));
  t.false(addressMatchesCIDR('fe80::1', cidr));
});

// --- makeAddressChecker ---

test('makeAddressChecker default allows only localhost', t => {
  const check = makeAddressChecker();
  t.true(check('127.0.0.1'));
  t.true(check('::1'));
  t.true(check('::ffff:127.0.0.1'));
  t.false(check('10.0.0.1'));
  t.false(check('192.168.1.1'));
});

test('makeAddressChecker allowRemote allows everything', t => {
  const check = makeAddressChecker({ allowRemote: true });
  t.true(check('127.0.0.1'));
  t.true(check('10.0.0.1'));
  t.true(check('203.0.113.5'));
  t.true(check('::1'));
});

test('makeAddressChecker with CIDRs allows localhost plus listed ranges', t => {
  const check = makeAddressChecker({
    allowedCIDRs: '10.0.0.0/8, 100.64.0.0/10',
  });
  t.true(check('127.0.0.1'));
  t.true(check('::1'));
  t.true(check('10.1.2.3'));
  t.true(check('100.100.50.25'));
  t.false(check('192.168.1.1'));
  t.false(check('203.0.113.5'));
});

test('makeAddressChecker normalizes IPv4-mapped IPv6 for CIDR match', t => {
  const check = makeAddressChecker({ allowedCIDRs: '10.0.0.0/8' });
  t.true(check('::ffff:10.1.2.3'));
  t.false(check('::ffff:192.168.1.1'));
});

test('makeAddressChecker ignores invalid CIDRs gracefully', t => {
  const check = makeAddressChecker({ allowedCIDRs: 'not-a-cidr, 10.0.0.0/8' });
  t.true(check('10.1.2.3'));
  t.true(check('127.0.0.1'));
  t.false(check('192.168.1.1'));
});

test('makeAddressChecker with empty CIDRs string acts as localhost-only', t => {
  const check = makeAddressChecker({ allowedCIDRs: '' });
  t.true(check('127.0.0.1'));
  t.false(check('10.0.0.1'));
});
