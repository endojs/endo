// Protocol constants and network descriptors for x402 over Base.
//
// x402 (https://github.com/coinbase/x402) revives the HTTP `402 Payment
// Required` status: a resource server answers `402` with a set of
// `PaymentRequirements`, the client retries with an `X-PAYMENT` header
// carrying a signed payment, and the server settles it through a
// facilitator and answers `2xx` with an `X-PAYMENT-RESPONSE` header.
//
// This package speaks the v2 wire format with the `exact` EVM scheme,
// whose payment authorization is an EIP-3009 `transferWithAuthorization`
// signed as EIP-712 typed data. All network authority (`fetch`) and all
// key authority (the `signer`) are injected capabilities: this module
// only knows the shapes and the well-known Base addresses.

import harden from '@endo/harden';

export const X402_VERSION = 2;

// The single settlement scheme this package implements: an exact-amount
// EIP-3009 stablecoin transfer authorization.
export const EXACT_SCHEME = 'exact';

// EIP-712 domain constants for USDC. USDC's EIP-3009 domain is
// `{ name: 'USD Coin', version: '2' }` on Base; a `PaymentRequirements`
// entry may override these under `extra`.
export const USDC_EIP712_NAME = 'USD Coin';
export const USDC_EIP712_VERSION = '2';

/**
 * A network the connector knows how to settle on, keyed by a short alias.
 * `caip2` is the CAIP-2 chain identifier carried on the wire; `usdc` is
 * the canonical USDC (6-decimal) contract on that chain.
 *
 * @typedef {object} NetworkDescriptor
 * @property {string} alias
 * @property {string} caip2
 * @property {number} chainId
 * @property {string} usdc
 */

/** @type {Record<string, NetworkDescriptor>} */
export const NETWORKS = harden({
  'base-mainnet': {
    alias: 'base-mainnet',
    caip2: 'eip155:8453',
    chainId: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  'base-sepolia': {
    alias: 'base-sepolia',
    caip2: 'eip155:84532',
    chainId: 84_532,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
});

// Index the descriptors by CAIP-2 id as well, so a requirement that
// arrives on the wire (which carries `eip155:8453`, not `base-mainnet`)
// can be resolved back to its chain id and USDC address.
const byCaip2 = new Map();
for (const descriptor of Object.values(NETWORKS)) {
  byCaip2.set(descriptor.caip2, descriptor);
}

/**
 * Resolve a network by alias (`base-mainnet`) or CAIP-2 id (`eip155:8453`).
 *
 * @param {string} nameOrCaip2
 * @returns {NetworkDescriptor}
 */
export const resolveNetwork = nameOrCaip2 => {
  const descriptor =
    NETWORKS[nameOrCaip2] || byCaip2.get(nameOrCaip2) || undefined;
  if (descriptor === undefined) {
    throw new Error(`x402: unknown network ${nameOrCaip2}`);
  }
  return descriptor;
};
