// The receiving (seller) half of the connector — the "replace Open
// Collective" primitive. A paywall is configured once with *your* Base
// address and a price; it then (a) emits the `402` challenge that tells a
// caller what to pay and to whom, and (b) validates an incoming
// `X-PAYMENT` header by asking a facilitator to verify and settle the
// USDC transfer to you.
//
// The paywall is transport-agnostic: it deals in the header string and a
// challenge object, so it drops into any HTTP framework (or an Endo
// remotable that exposes an HTTP-shaped capability). All authority — the
// facilitator, and by extension the on-chain settlement — is injected.

import harden from '@endo/harden';

import {
  X402_VERSION,
  EXACT_SCHEME,
  resolveNetwork,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
} from './constants.js';
import { encodeHeaderObject, decodeHeaderObject } from './codec.js';

const PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE';

/**
 * @param {object} config
 * @param {string} config.payTo the Base address that receives funds (you)
 * @param {string | number | bigint} config.amount price in atomic units (USDC has 6 decimals: 1 USDC = 1_000_000)
 * @param {{ verify: Function, settle: Function }} config.facilitator a facilitator client (see `makeFacilitatorClient`)
 * @param {string} [config.network] alias or CAIP-2 id; defaults to `base-mainnet`
 * @param {string} [config.asset] token address; defaults to USDC on the chosen network
 * @param {string} [config.resource] the resource URL being sold
 * @param {string} [config.description] human description shown in the challenge
 * @param {number} [config.maxTimeoutSeconds] how long an authorization stays valid
 */
export const makePaywall = ({
  payTo,
  amount,
  facilitator,
  network = 'base-mainnet',
  asset,
  resource,
  description,
  maxTimeoutSeconds = 60,
}) => {
  if (!payTo) {
    throw new Error('x402: makePaywall requires a payTo address');
  }
  if (!facilitator || typeof facilitator.settle !== 'function') {
    throw new Error('x402: makePaywall requires a facilitator client');
  }
  const descriptor = resolveNetwork(network);
  const tokenAddress = asset || descriptor.usdc;
  const atomicAmount = `${BigInt(amount)}`;

  /**
   * The single `accepts[]` entry describing how to pay this paywall.
   *
   * @returns {any}
   */
  const requirement = () =>
    harden({
      scheme: EXACT_SCHEME,
      network: descriptor.caip2,
      amount: atomicAmount,
      asset: tokenAddress,
      payTo,
      maxTimeoutSeconds,
      extra: { name: USDC_EIP712_NAME, version: USDC_EIP712_VERSION },
    });

  /**
   * The full `402` challenge body to return when payment is required.
   *
   * @param {string} [error] optional error explaining a prior rejection
   * @returns {any}
   */
  const challenge = error =>
    harden({
      x402Version: X402_VERSION,
      ...(error ? { error } : {}),
      resource: harden({
        url: resource,
        ...(description ? { description } : {}),
      }),
      accepts: [requirement()],
    });

  /**
   * Validate and settle an incoming `X-PAYMENT` header.
   *
   * Resolves to one of:
   *   - `{ ok: true,  settlement, settlementHeader, payer }`
   *   - `{ ok: false, reason, challenge }` — caller should answer `402`
   *     with `challenge` (already carries the `error`).
   *
   * @param {string | null | undefined} xPaymentHeader
   */
  const collect = async xPaymentHeader => {
    if (!xPaymentHeader) {
      return { ok: false, reason: 'payment-required', challenge: challenge() };
    }

    let paymentPayload;
    try {
      paymentPayload = decodeHeaderObject(xPaymentHeader, 'X-PAYMENT');
    } catch (_cause) {
      const reason = 'malformed-payment';
      return { ok: false, reason, challenge: challenge(reason) };
    }

    const requirements = requirement();

    const verification = await facilitator.verify(paymentPayload, requirements);
    if (!verification.isValid) {
      const reason = verification.invalidReason || 'invalid-payment';
      return { ok: false, reason, challenge: challenge(reason) };
    }

    const settlement = await facilitator.settle(paymentPayload, requirements);
    if (!settlement.success) {
      const reason = settlement.errorReason || 'settlement-failed';
      return { ok: false, reason, challenge: challenge(reason) };
    }

    return {
      ok: true,
      settlement,
      settlementHeader: encodeHeaderObject(settlement),
      payer: settlement.payer,
    };
  };

  return harden({
    requirement,
    challenge,
    collect,
    paymentResponseHeader: PAYMENT_RESPONSE_HEADER,
  });
};
harden(makePaywall);
