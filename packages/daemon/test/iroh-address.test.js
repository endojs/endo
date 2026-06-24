// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

import {
  buildIrohAddress,
  parseIrohAddress,
  supportsIrohAddress,
  isPublishableDirectAddress,
  IROH_URL_PROTOCOL,
} from '../src/networks/iroh-address.js';

const nodeId =
  'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c';

test('buildIrohAddress places nodeId in the pathname', t => {
  const address = buildIrohAddress({ nodeId });
  t.is(address, `${IROH_URL_PROTOCOL}:///${nodeId}`);
});

test('buildIrohAddress includes relay and public direct address hints', t => {
  const address = buildIrohAddress({
    nodeId,
    relayUrl: 'https://use1-1.relay.iroh.network./',
    addresses: ['203.0.113.5:7000', '127.0.0.1:7000', '192.168.1.2:7000'],
  });
  const parsed = parseIrohAddress(address);
  t.is(parsed.nodeId, nodeId);
  t.is(parsed.relayUrl, 'https://use1-1.relay.iroh.network./');
  // Private/loopback addresses are excluded by default.
  t.deepEqual(parsed.addresses, ['203.0.113.5:7000']);
});

test('buildIrohAddress can include private hints when asked', t => {
  const address = buildIrohAddress(
    { nodeId, addresses: ['127.0.0.1:7000'] },
    { includePrivate: true },
  );
  const parsed = parseIrohAddress(address);
  t.deepEqual(parsed.addresses, ['127.0.0.1:7000']);
});

test('build/parse round-trips', t => {
  const original = {
    nodeId,
    relayUrl: 'https://relay.example/',
    addresses: ['203.0.113.5:7000', '198.51.100.9:8001'],
  };
  const parsed = parseIrohAddress(buildIrohAddress(original));
  t.deepEqual(parsed, original);
});

test('buildIrohAddress requires a nodeId', t => {
  t.throws(() => buildIrohAddress({}), { message: /requires a nodeId/ });
});

test('parseIrohAddress rejects foreign protocols', t => {
  t.throws(() => parseIrohAddress(`tcp+netstring+json+captp0://1.2.3.4:8920`), {
    message: /not an .*iroh/,
  });
});

test('parseIrohAddress rejects an address with no nodeId', t => {
  t.throws(() => parseIrohAddress(`${IROH_URL_PROTOCOL}:///`), {
    message: /no nodeId/,
  });
});

test('supportsIrohAddress recognizes addresses and protocol forms', t => {
  t.true(supportsIrohAddress(`${IROH_URL_PROTOCOL}:///${nodeId}`));
  t.true(supportsIrohAddress(`${IROH_URL_PROTOCOL}:`));
  t.true(supportsIrohAddress(IROH_URL_PROTOCOL));
  t.false(supportsIrohAddress('tcp+netstring+json+captp0://1.2.3.4:8920'));
  t.false(supportsIrohAddress('loop:'));
});

test('isPublishableDirectAddress filters loopback and private ranges', t => {
  // Public.
  t.true(isPublishableDirectAddress('203.0.113.5:7000'));
  t.true(isPublishableDirectAddress('198.51.100.9:1'));
  t.true(isPublishableDirectAddress('[2001:db8::1]:7000'));
  // Loopback / unspecified.
  t.false(isPublishableDirectAddress('127.0.0.1:7000'));
  t.false(isPublishableDirectAddress('0.0.0.0:7000'));
  t.false(isPublishableDirectAddress('[::1]:7000'));
  // Private IPv4.
  t.false(isPublishableDirectAddress('10.1.2.3:7000'));
  t.false(isPublishableDirectAddress('192.168.0.1:7000'));
  t.false(isPublishableDirectAddress('172.16.0.1:7000'));
  t.false(isPublishableDirectAddress('172.31.255.255:7000'));
  // 172.32 is public.
  t.true(isPublishableDirectAddress('172.32.0.1:7000'));
  // Link-local IPv4 and IPv6.
  t.false(isPublishableDirectAddress('169.254.1.1:7000'));
  t.false(isPublishableDirectAddress('[fe80::1]:7000'));
  // Unique-local IPv6.
  t.false(isPublishableDirectAddress('[fd00::1]:7000'));
});
