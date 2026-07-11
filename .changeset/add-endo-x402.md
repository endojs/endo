---
'@endo/x402': minor
---

Add `@endo/x402`, an ocap-style connector for the [x402][] HTTP payment
protocol on Base. It lets code **sell** an HTTP resource for USDC
(`makePaywall` — a self-hosted, account-free alternative to a donations
platform) and **pay** an x402 challenge (`makeX402Client.fetchWithPayment`)
using the v2 `exact` EVM scheme (EIP-3009 `transferWithAuthorization` signed
as EIP-712). It also provides `makeEscrowAgent` — a trust-minimized escrow
exchange over the same rail: a neutral agent holds a payer's signed
authorization and either releases it (settles) on delivery or aborts (the
payer is refunded by inaction), never taking custody of funds. Network
(`fetch`), key (`signer`), and settlement (`facilitator`) are all injected
capabilities, so the connector never holds a private key and the signer's
policy bounds what it can spend.

[x402]: https://github.com/coinbase/x402
