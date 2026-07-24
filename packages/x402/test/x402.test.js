// End-to-end and unit coverage for the x402 connector. Run under SES via
// ses-ava's prepare-endo, so `harden` is the genuine one.

import test from '@endo/ses-ava/prepare-endo.js';

import {
  encodeHeaderObject,
  decodeHeaderObject,
  buildExactEvmAuthorization,
  selectExactRequirement,
  makeX402Client,
  makePaywall,
  makeEscrowAgent,
  resolveNetwork,
} from '../index.js';

const PAY_TO = '0x1111111111111111111111111111111111111111';
const PAYER = '0x2222222222222222222222222222222222222222';
const RESOURCE = 'https://tip.example/coffee';
const PRICE = 10_000n;

// A deterministic signer that records what it was asked to sign.
const makeMockSigner = () => {
  const seen = [];
  return {
    seen,
    signer: {
      address: PAYER,
      signTypedData: typedData => {
        seen.push(typedData);
        return `0x${'ab'.repeat(65)}`;
      },
    },
  };
};

// A facilitator that verifies structure and "settles" with a fake tx.
const mockFacilitator = {
  verify: async (payload, requirements) => {
    const auth = payload.payload.authorization;
    if (auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
      return { isValid: false, invalidReason: 'wrong-recipient' };
    }
    if (BigInt(auth.value) !== BigInt(requirements.amount)) {
      return { isValid: false, invalidReason: 'wrong-amount' };
    }
    return { isValid: true, payer: auth.from };
  },
  settle: async (payload, requirements) => ({
    success: true,
    payer: payload.payload.authorization.from,
    transaction: `0x${'cd'.repeat(32)}`,
    network: requirements.network,
    amount: requirements.amount,
  }),
};

/**
 * @param {number} status
 * @param {{ json?: any, headers?: Record<string, string> }} [options]
 */
const makeResponse = (status, { json, headers = {} } = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: new Headers(headers),
  json: async () => json,
  text: async () => (json === undefined ? '' : JSON.stringify(json)),
});

// A fetch backed by a paywall: 402 until a valid X-PAYMENT arrives.
const makePaywallFetch =
  paywall =>
  async (url, init = {}) => {
    const header = new Headers(init.headers || {}).get('X-PAYMENT');
    const result = await paywall.collect(header);
    if (!result.ok) {
      return makeResponse(402, { json: result.challenge });
    }
    return makeResponse(200, {
      json: { ok: true },
      headers: { [paywall.paymentResponseHeader]: result.settlementHeader },
    });
  };

test('header codec round-trips JSON', t => {
  const value = { a: 1, b: 'two', c: [3, { d: true }] };
  const encoded = encodeHeaderObject(value);
  t.is(typeof encoded, 'string');
  t.deepEqual(decodeHeaderObject(encoded), value);
});

test('decodeHeaderObject rejects empty input', t => {
  t.throws(() => decodeHeaderObject(''), { message: /non-empty/ });
});

test('buildExactEvmAuthorization produces an EIP-3009 typed data', t => {
  const requirement = {
    scheme: 'exact',
    network: 'eip155:8453',
    amount: '1000000',
    asset: resolveNetwork('base-mainnet').usdc,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
  };
  const { authorization, typedData } = buildExactEvmAuthorization({
    requirement,
    from: PAYER,
    nonce: `0x${'11'.repeat(32)}`,
    validAfter: 0,
    validBefore: 60,
  });
  t.is(typedData.primaryType, 'TransferWithAuthorization');
  t.is(typedData.domain.chainId, 8453);
  t.is(typedData.domain.verifyingContract, requirement.asset);
  t.is(authorization.from, PAYER);
  t.is(authorization.to, PAY_TO);
  t.is(authorization.value, '1000000');
});

test('selectExactRequirement honors network filter and maxValue cap', t => {
  const accepts = [
    { scheme: 'exact', network: 'eip155:8453', amount: '5000' },
    { scheme: 'exact', network: 'eip155:84532', amount: '10000' },
  ];
  t.is(
    selectExactRequirement(accepts, { network: 'eip155:84532' }).amount,
    '10000',
  );
  t.is(selectExactRequirement(accepts, { maxValue: 6000n }).amount, '5000');
  t.is(selectExactRequirement(accepts, { maxValue: 100n }), undefined);
});

test('client pays a paywall challenge end to end', async t => {
  const paywall = makePaywall({
    payTo: PAY_TO,
    amount: PRICE,
    facilitator: mockFacilitator,
    network: 'base-sepolia',
    resource: RESOURCE,
  });
  const { seen, signer } = makeMockSigner();
  const client = makeX402Client({
    fetch: /** @type {typeof fetch} */ (makePaywallFetch(paywall)),
    signer,
    now: () => 1_800_000_000,
    makeNonce: () => `0x${'11'.repeat(32)}`,
  });

  const { paid, response, requirement, payment } =
    await client.fetchWithPayment(RESOURCE, {}, { network: 'eip155:84532' });

  t.true(paid);
  t.is(response.status, 200);
  t.is(requirement.payTo, PAY_TO);
  t.is(payment.success, true);
  t.is(payment.payer, PAYER);
  t.is(BigInt(payment.amount), PRICE);

  // The signer saw a correct authorization on Base Sepolia's USDC.
  t.is(seen.length, 1);
  const sepolia = resolveNetwork('base-sepolia');
  t.is(seen[0].domain.chainId, sepolia.chainId);
  t.is(seen[0].domain.verifyingContract, sepolia.usdc);
  t.is(seen[0].message.to, PAY_TO);
  t.is(seen[0].message.validBefore, `${1_800_000_000 + 60}`);
});

test('client refuses when price exceeds maxValue', async t => {
  const paywall = makePaywall({
    payTo: PAY_TO,
    amount: PRICE,
    facilitator: mockFacilitator,
    network: 'base-sepolia',
    resource: RESOURCE,
  });
  const { signer } = makeMockSigner();
  const client = makeX402Client({
    fetch: /** @type {typeof fetch} */ (makePaywallFetch(paywall)),
    signer,
    now: () => 1_800_000_000,
    makeNonce: () => `0x${'11'.repeat(32)}`,
  });
  await t.throwsAsync(
    () => client.fetchWithPayment(RESOURCE, {}, { maxValue: PRICE - 1n }),
    { message: /no acceptable payment requirement/ },
  );
});

test('paywall.collect challenges when no payment is present', async t => {
  const paywall = makePaywall({
    payTo: PAY_TO,
    amount: PRICE,
    facilitator: mockFacilitator,
    network: 'base-sepolia',
    resource: RESOURCE,
  });
  const result = await paywall.collect(undefined);
  t.false(result.ok);
  t.is(result.reason, 'payment-required');
  t.is(result.challenge.accepts[0].payTo, PAY_TO);
  t.is(result.challenge.accepts[0].network, 'eip155:84532');
});

test('paywall.collect rejects a malformed payment header', async t => {
  const paywall = makePaywall({
    payTo: PAY_TO,
    amount: PRICE,
    facilitator: mockFacilitator,
    network: 'base-sepolia',
    resource: RESOURCE,
  });
  const result = await paywall.collect('!!!not-base64-json!!!');
  t.false(result.ok);
  t.is(result.reason, 'malformed-payment');
});

// A requirement usable directly, without a live 402 round-trip.
const escrowRequirement = () => ({
  scheme: 'exact',
  network: resolveNetwork('base-sepolia').caip2,
  amount: `${PRICE}`,
  asset: resolveNetwork('base-sepolia').usdc,
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  extra: { name: 'USD Coin', version: '2' },
});

const makeEscrowClient = nonceByte =>
  makeX402Client({
    fetch: async () => {
      throw new Error('unused');
    },
    signer: makeMockSigner().signer,
    now: () => 1_800_000_000,
    makeNonce: () => `0x${nonceByte.repeat(32)}`,
  });

test('escrow deposit + release settles the held authorization', async t => {
  const escrow = makeEscrowAgent({
    facilitator: mockFacilitator,
    now: () => 1_800_000_000,
  });
  const requirements = escrowRequirement();
  const paymentPayload = await makeEscrowClient('22').createPayment(
    requirements,
    { url: RESOURCE },
  );
  const ticket = await escrow.deposit({ paymentPayload, requirements });
  t.is(ticket.payer, PAYER);
  t.is(escrow.status(ticket.id)?.status, 'held');

  const released = await escrow.release(ticket.id);
  t.is(released.settlement.success, true);
  t.is(escrow.status(ticket.id)?.status, 'released');
});

test('escrow abort refunds by inaction and blocks later release', async t => {
  const escrow = makeEscrowAgent({
    facilitator: mockFacilitator,
    now: () => 1_800_000_000,
  });
  const requirements = escrowRequirement();
  const paymentPayload = await makeEscrowClient('33').createPayment(
    requirements,
    { url: RESOURCE },
  );
  const ticket = await escrow.deposit({ paymentPayload, requirements });

  const refunded = escrow.abort(ticket.id);
  t.true(refunded.refunded);
  t.is(escrow.status(ticket.id)?.status, 'aborted');
  await t.throwsAsync(() => escrow.release(ticket.id), {
    message: /already aborted/,
  });
});

test('escrow refuses to release an expired authorization', async t => {
  const requirements = escrowRequirement();
  const paymentPayload = await makeEscrowClient('44').createPayment(
    requirements,
    { url: RESOURCE },
  );
  // Deposit under a clock inside the window, then release past validBefore.
  const escrow = makeEscrowAgent({
    facilitator: mockFacilitator,
    now: () => 1_800_000_000 + 120,
  });
  const ticket = await escrow.deposit({ paymentPayload, requirements });
  await t.throwsAsync(() => escrow.release(ticket.id), { message: /expired/ });
});
