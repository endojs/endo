// Standalone, dependency-free end-to-end proof of the @endo/x402
// connector, runnable under plain Node (no SES install required):
//
//   node packages/x402/demo/verify.mjs
//
// It stands up an in-memory x402 "server" (a `makePaywall` backed by a
// mock facilitator) and drives a real `makeX402Client` against it through
// a mock `fetch`, so the full handshake exercises the *real* codec,
// authorization builder, client and seller — only the network, the
// signing key, and the on-chain settlement are mocked. Because those are
// exactly the injected capabilities, what runs here is the same code path
// a production wiring takes.
//
// SES is not loaded here, so we install a no-op `harden` before importing
// the package. Under a real deployment `@endo/init` provides the genuine
// `harden`; the modules call it identically either way.

globalThis.harden ||= Object.freeze;

const { makeX402Client } = await import('../src/client.js');
const { makePaywall } = await import('../src/seller.js');
const { makeEscrowAgent } = await import('../src/escrow.js');
const { decodeHeaderObject } = await import('../src/codec.js');
const { resolveNetwork } = await import('../src/constants.js');

const assert = (cond, message) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
};

const PAY_TO = '0x1111111111111111111111111111111111111111';
const PAYER = '0x2222222222222222222222222222222222222222';
const RESOURCE = 'https://tip.example/coffee';
const PRICE = 10_000n; // 0.01 USDC (6 decimals)

// ---- Mock signing key. Records the typed data it was asked to sign so
// we can assert the client built a correct EIP-3009 authorization. ----
let lastTypedData;
const signer = {
  address: PAYER,
  signTypedData: typedData => {
    lastTypedData = typedData;
    // A real signer returns a 65-byte EIP-712 signature; a fixed stub
    // suffices to prove the payload plumbing.
    return `0x${'ab'.repeat(65)}`;
  },
};

// ---- Mock facilitator. Verifies structure and "settles" by echoing a
// fake tx hash — i.e. it stands in for x402.org/facilitator. ----
const facilitator = {
  verify: async (paymentPayload, requirements) => {
    const auth = paymentPayload.payload.authorization;
    if (auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
      return { isValid: false, invalidReason: 'wrong-recipient' };
    }
    if (BigInt(auth.value) !== BigInt(requirements.amount)) {
      return { isValid: false, invalidReason: 'wrong-amount' };
    }
    if (!paymentPayload.payload.signature) {
      return { isValid: false, invalidReason: 'missing-signature' };
    }
    return { isValid: true, payer: auth.from };
  },
  settle: async (paymentPayload, requirements) => ({
    success: true,
    payer: paymentPayload.payload.authorization.from,
    transaction: `0x${'cd'.repeat(32)}`,
    network: requirements.network,
    amount: requirements.amount,
  }),
};

const paywall = makePaywall({
  payTo: PAY_TO,
  amount: PRICE,
  facilitator,
  network: 'base-sepolia',
  resource: RESOURCE,
  description: 'A cup of coffee',
});

// ---- Mock fetch: an in-memory x402 origin backed by the paywall. ----
const makeResponse = (status, { json, headers = {} } = {}) => {
  const store = new Headers(headers);
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: store,
    json: async () => json,
    text: async () => (json === undefined ? '' : JSON.stringify(json)),
  };
};

let challengeCount = 0;
let paidCount = 0;
const fetch = async (url, init = {}) => {
  assert(url === RESOURCE, `fetch hit unexpected url ${url}`);
  const header = new Headers(init.headers || {}).get('X-PAYMENT');
  const result = await paywall.collect(header);
  if (!result.ok) {
    challengeCount += 1;
    return makeResponse(402, { json: result.challenge });
  }
  paidCount += 1;
  return makeResponse(200, {
    json: { ok: true, content: '☕ enjoy' },
    headers: { [paywall.paymentResponseHeader]: result.settlementHeader },
  });
};

// ---- Drive the client end to end. ----
const client = makeX402Client({
  fetch,
  signer,
  now: () => 1_800_000_000,
  makeNonce: () => `0x${'11'.repeat(32)}`,
});

const { response, paid, requirement, payment } = await client.fetchWithPayment(
  RESOURCE,
  {},
  { network: 'eip155:84532' },
);

// ---- Assertions: the handshake, the codec round-trip, the EIP-3009
// authorization, and the settlement all line up. ----
assert(paid === true, 'client should have paid the 402 challenge');
assert(challengeCount === 1, `expected exactly one 402, saw ${challengeCount}`);
assert(paidCount === 1, `expected exactly one paid request, saw ${paidCount}`);
assert(response.status === 200, `final status ${response.status} != 200`);

const body = await response.json();
assert(body.ok === true, 'resource body should be delivered after payment');

assert(requirement.payTo === PAY_TO, 'requirement payTo mismatch');
assert(requirement.network === 'eip155:84532', 'requirement network mismatch');
assert(BigInt(requirement.amount) === PRICE, 'requirement amount mismatch');

// The EIP-712 typed data the signer saw must be a well-formed EIP-3009
// TransferWithAuthorization to PAY_TO on Base Sepolia's USDC.
const sepolia = resolveNetwork('base-sepolia');
assert(
  lastTypedData.primaryType === 'TransferWithAuthorization',
  'primaryType should be TransferWithAuthorization',
);
assert(
  lastTypedData.domain.chainId === sepolia.chainId,
  `domain chainId ${lastTypedData.domain.chainId} != ${sepolia.chainId}`,
);
assert(
  lastTypedData.domain.verifyingContract === sepolia.usdc,
  'verifyingContract should be the Base Sepolia USDC address',
);
assert(lastTypedData.message.from === PAYER, 'authorization.from mismatch');
assert(lastTypedData.message.to === PAY_TO, 'authorization.to mismatch');
assert(
  BigInt(lastTypedData.message.value) === PRICE,
  'authorization.value mismatch',
);
assert(
  lastTypedData.message.validBefore === `${1_800_000_000 + 60}`,
  'validBefore should be now + maxTimeoutSeconds',
);

// The settlement decoded from the X-PAYMENT-RESPONSE header confirms the
// on-chain transfer to us.
assert(payment.success === true, 'settlement should report success');
assert(payment.payer === PAYER, 'settlement payer mismatch');
assert(payment.transaction.startsWith('0x'), 'settlement should carry a tx');

// A round-trip sanity check on the raw settlement header too.
const decoded = decodeHeaderObject(
  response.headers.get(paywall.paymentResponseHeader),
  'X-PAYMENT-RESPONSE',
);
assert(decoded.transaction === payment.transaction, 'header round-trip failed');

// ---- A rejection path: a caller too stingy for the paywall's price gets
// no acceptable requirement and the client refuses rather than paying. ----
let refused = false;
try {
  await client.fetchWithPayment(RESOURCE, {}, { maxValue: PRICE - 1n });
} catch (error) {
  refused = /no acceptable payment requirement/.test(error.message);
}
assert(refused, 'client should refuse when the price exceeds maxValue');

console.log('x402 connector end-to-end verify: PASS');
console.log(`  settled ${payment.amount} atomic USDC to ${PAY_TO}`);
console.log(
  `  on ${payment.network} (tx ${payment.transaction.slice(0, 12)}...)`,
);

// ---- Escrow exchange: the payer signs an authorization the escrow agent
// holds and releases only on delivery — and, in the abort case, never
// settles, so the payer is refunded by inaction. Both legs run over the
// same primitives, proving x402 is a usable escrow rail. ----
const escrowRequirement = paywall.requirement();

// (a) Happy path: deposit -> release settles to the recipient.
const escrow = makeEscrowAgent({ facilitator, now: () => 1_800_000_000 });
const escrowClient = makeX402Client({
  fetch,
  signer,
  now: () => 1_800_000_000,
  makeNonce: () => `0x${'22'.repeat(32)}`,
});
const escrowedPayment = await escrowClient.createPayment(escrowRequirement, {
  url: RESOURCE,
});
const ticket = await escrow.deposit({
  paymentPayload: escrowedPayment,
  requirements: escrowRequirement,
});
assert(ticket.payer === PAYER, 'escrow deposit payer mismatch');
assert(escrow.status(ticket.id).status === 'held', 'deposit should be held');
const released = await escrow.release(ticket.id);
assert(released.settlement.success === true, 'escrow release should settle');
assert(
  escrow.status(ticket.id).status === 'released',
  'status should be released',
);

// (b) Refund path: a second deposit is aborted; funds never move.
const abortClient = makeX402Client({
  fetch,
  signer,
  now: () => 1_800_000_000,
  makeNonce: () => `0x${'33'.repeat(32)}`,
});
const abortPayment = await abortClient.createPayment(escrowRequirement, {
  url: RESOURCE,
});
const abortTicket = await escrow.deposit({
  paymentPayload: abortPayment,
  requirements: escrowRequirement,
});
const refunded = escrow.abort(abortTicket.id);
assert(refunded.refunded === true, 'abort should refund by inaction');
let releaseAfterAbortRejected = false;
try {
  await escrow.release(abortTicket.id);
} catch (error) {
  releaseAfterAbortRejected = /already aborted/.test(error.message);
}
assert(releaseAfterAbortRejected, 'cannot release an aborted escrow');

console.log('x402 escrow exchange verify: PASS');
console.log(`  released escrow ${released.id.slice(0, 10)}... to ${PAY_TO}`);
console.log(
  `  aborted escrow ${abortTicket.id.slice(0, 10)}... — payer refunded`,
);
