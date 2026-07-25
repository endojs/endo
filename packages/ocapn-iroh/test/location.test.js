// @ts-check

import test from '@endo/ses-ava/test.js';

import {
  IROH_NETWORK_ID,
  buildIrohLocation,
  dialParamsFromLocation,
  isPublishableDirectAddress,
} from '../src/location.js';

test('isPublishableDirectAddress filters loopback and private ranges', t => {
  t.false(isPublishableDirectAddress('127.0.0.1:5000'));
  t.false(isPublishableDirectAddress('10.1.2.3:5000'));
  t.false(isPublishableDirectAddress('192.168.0.7:5000'));
  t.false(isPublishableDirectAddress('172.16.0.1:5000'));
  t.false(isPublishableDirectAddress('172.31.255.255:5000'));
  t.false(isPublishableDirectAddress('169.254.1.1:5000'));
  t.false(isPublishableDirectAddress('[::1]:5000'));
  t.false(isPublishableDirectAddress('[fe80::1]:5000'));
  t.false(isPublishableDirectAddress('[fd00::1]:5000'));
  t.true(isPublishableDirectAddress('172.32.0.1:5000'));
  t.true(isPublishableDirectAddress('1.2.3.4:5000'));
  t.true(isPublishableDirectAddress('[2001:db8::1]:5000'));
});

test('buildIrohLocation publishes relay and public direct addresses', t => {
  const location = buildIrohLocation({
    nodeId: 'NodeAbc',
    relayUrl: 'https://relay.example/',
    addresses: ['1.2.3.4:5000', '127.0.0.1:5001'],
  });
  t.is(location.type, 'ocapn-peer');
  t.is(location.network, IROH_NETWORK_ID);
  t.is(location.transport, IROH_NETWORK_ID);
  t.is(location.designator, 'NodeAbc');
  t.deepEqual(location.hints, {
    relay: 'https://relay.example/',
    addrs: '1.2.3.4:5000',
  });
});

test('buildIrohLocation with no publishable hints yields hints: false', t => {
  const location = buildIrohLocation({
    nodeId: 'NodeAbc',
    addresses: ['127.0.0.1:5001'],
  });
  t.is(location.hints, false);
});

test('buildIrohLocation can include private addresses on request', t => {
  const location = buildIrohLocation(
    { nodeId: 'NodeAbc', addresses: ['127.0.0.1:5001'] },
    { includePrivate: true },
  );
  t.deepEqual(location.hints, { addrs: '127.0.0.1:5001' });
});

test('buildIrohLocation requires a nodeId', t => {
  t.throws(() => buildIrohLocation({ nodeId: '' }), {
    message: /requires a nodeId/,
  });
});

test('dialParamsFromLocation round-trips a built location', t => {
  const location = buildIrohLocation({
    nodeId: 'NodeAbc',
    relayUrl: 'https://relay.example/',
    addresses: ['1.2.3.4:5000', '[2001:db8::1]:5001'],
  });
  t.deepEqual(dialParamsFromLocation(location), {
    nodeId: 'NodeAbc',
    relayUrl: 'https://relay.example/',
    addresses: ['1.2.3.4:5000', '[2001:db8::1]:5001'],
  });
});

test('dialParamsFromLocation accepts a bare designator', t => {
  const location = buildIrohLocation({ nodeId: 'NodeAbc' });
  t.deepEqual(dialParamsFromLocation(location), { nodeId: 'NodeAbc' });
});

test('dialParamsFromLocation rejects other networks', t => {
  t.throws(
    () =>
      dialParamsFromLocation(
        /** @type {any} */ ({
          type: 'ocapn-peer',
          network: 'tcp-testing-only',
          transport: 'tcp-testing-only',
          designator: 'NodeAbc',
          hints: false,
        }),
      ),
    { message: /unsupported network/ },
  );
});

test('dialParamsFromLocation rejects an empty designator', t => {
  t.throws(
    () =>
      dialParamsFromLocation(
        /** @type {any} */ ({
          type: 'ocapn-peer',
          network: IROH_NETWORK_ID,
          transport: IROH_NETWORK_ID,
          designator: '',
          hints: false,
        }),
      ),
    { message: /non-empty designator/ },
  );
});
