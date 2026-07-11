---
'@endo/x402': minor
---

Add `@endo/x402`, an ocap-style connector for the [x402][] HTTP payment
protocol on Base. It lets code **sell** an HTTP resource for USDC
(`makePaywall` — a self-hosted, account-free alternative to a donations
platform) and **pay** an x402 challenge (`makeX402Client.fetchWithPayment`)
using the v2 `exact` EVM scheme (EIP-3009 `transferWithAuthorization` signed
as EIP-712). Network (`fetch`), key (`signer`), and settlement
(`facilitator`) are all injected capabilities, so the connector never holds
a private key and the signer's policy bounds what it can spend.

[x402]: https://github.com/coinbase/x402
