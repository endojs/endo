# @endo/x402

An [x402][] payment connector for [Base][], in the ocap idiom: **pay for**
and **sell** HTTP resources with USDC over the HTTP `402 Payment Required`
protocol, without ever handing your keys to the code that spends them.

x402 revives the dormant HTTP `402` status. A resource server answers a
request with `402` and a set of `PaymentRequirements`; the client retries
with an `X-PAYMENT` header carrying a signed stablecoin transfer
authorization; the server settles it through a facilitator and answers
`2xx` with an `X-PAYMENT-RESPONSE` header. This package speaks the v2 wire
format with the `exact` EVM scheme — an [EIP-3009][] `transferWithAuthorization`
signed as [EIP-712][] typed data — over Base mainnet (`eip155:8453`) and
Base Sepolia (`eip155:84532`).

## Why this shape

Every source of authority is an **injected capability**, never ambient:

- `fetch` — the network authority.
- `signer` — the key authority, a `{ address, signTypedData(typedData) }`
  object. The connector never sees a private key; it can only *ask* the
  signer to authorize a transfer, and the signer's own policy is the last
  word on what it will sign.
- `facilitator` — a client for the verify/settle service, so a receiver
  runs no blockchain infrastructure.

Because those are the only authorities, the same code path runs in tests
(with mocks) and in production (with a real signer and facilitator) — see
`demo/verify.mjs` for a runnable, dependency-free end-to-end proof.

## Receiving — a self-hosted alternative to Open Collective

Stand up a pay-to endpoint at *your* Base address. Every successful call
settles USDC to you; there is no platform account to provision.

```js
import { makePaywall, makeFacilitatorClient } from '@endo/x402';

const facilitator = makeFacilitatorClient({
  fetch,
  baseUrl: 'https://x402.org/facilitator', // or the CDP facilitator
});

const paywall = makePaywall({
  payTo: '0xYourBaseAddress',
  amount: 1_000_000n, // 1.00 USDC (6 decimals)
  network: 'base-mainnet',
  resource: 'https://tip.example/coffee',
  description: 'Buy me a coffee',
  facilitator,
});

// In your HTTP handler:
async function handle(request, respond) {
  const result = await paywall.collect(request.headers.get('X-PAYMENT'));
  if (!result.ok) {
    // Ask for payment. `result.challenge` is the 402 body.
    return respond(402, result.challenge);
  }
  // Paid. `result.settlement` has the on-chain tx; echo it back.
  return respond(200, deliverable(), {
    [paywall.paymentResponseHeader]: result.settlementHeader,
  });
}
```

## Paying — an agent that buys a resource

```js
import { makeX402Client } from '@endo/x402';

const client = makeX402Client({
  fetch,
  signer, // { address, signTypedData(typedData) }
});

const { paid, response, payment } = await client.fetchWithPayment(
  'https://tip.example/coffee',
  {},
  { network: 'eip155:8453', maxValue: 5_000_000n }, // never overpay
);
// `paid` — whether a 402 was satisfied
// `response` — the final (paid) Response
// `payment` — the decoded X-PAYMENT-RESPONSE settlement
```

The client refuses rather than paying when no offered requirement fits the
caller's `network`/`maxValue` constraints.

## Wiring a real signer

The `signer` is deliberately abstract so the key can live behind whatever
custody you choose. `signTypedData(typedData)` receives a ready-to-sign
EIP-712 object (`{ types, primaryType: 'TransferWithAuthorization', domain,
message }`) and must return a `0x`-prefixed 65-byte signature. Adapters:

- **[viem][]**: `account.signTypedData(typedData)`.
- **ethers**: `wallet.signTypedData(domain, { TransferWithAuthorization:
  types.TransferWithAuthorization }, message)`.
- **Coinbase CDP / a remote KMS**: forward the typed data to the signing
  service; only the signature returns.

Keeping the signer external is the ocap point: hand `makeX402Client` to
untrusted code and the worst it can do is request a signature the signer
is free to refuse.

## API

- `makeX402Client({ fetch, signer, makeNonce?, now?, selectRequirement? })`
  → `{ fetchWithPayment(url, init?, opts?) }`
- `makePaywall({ payTo, amount, facilitator, network?, asset?, resource?,
  description?, maxTimeoutSeconds? })` → `{ requirement, challenge, collect,
  paymentResponseHeader }`
- `makeFacilitatorClient({ fetch, baseUrl, headers? })` → `{ verify, settle,
  supported }`
- `buildExactEvmAuthorization({ requirement, from, nonce, validAfter,
  validBefore })` → `{ authorization, typedData }`
- `encodeHeaderObject` / `decodeHeaderObject` — the base64 header codec.
- `selectExactRequirement(accepts, { network?, maxValue? })`
- `NETWORKS`, `resolveNetwork`, `X402_VERSION`, `EXACT_SCHEME`.

## Verify

```sh
node packages/x402/demo/verify.mjs   # runnable end-to-end, no install
yarn test                            # ava suite under SES
```

[x402]: https://github.com/coinbase/x402
[Base]: https://base.org
[EIP-3009]: https://eips.ethereum.org/EIPS/eip-3009
[EIP-712]: https://eips.ethereum.org/EIPS/eip-712
[viem]: https://viem.sh
