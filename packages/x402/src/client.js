// The paying (client) half of the connector. `makeX402Client` wraps an
// injected `fetch` so that a `402 Payment Required` answer is transparently
// satisfied: parse the requirements, pick one we can pay, ask the injected
// `signer` to authorize an EIP-3009 transfer for exactly that amount, and
// retry with the `X-PAYMENT` header.
//
// Every source of authority is injected:
//   - `fetch`  : network authority
//   - `signer` : key authority — `{ address, signTypedData(typedData) }`
//   - `makeNonce` / `now` : the only nondeterminism, injectable for tests
//
// The client never sees a private key and cannot settle on its own; the
// signer's policy is the last word on what it will authorize.

/* global Headers */

import harden from '@endo/harden';

import { X402_VERSION, EXACT_SCHEME } from './constants.js';
import { buildExactEvmAuthorization } from './authorization.js';
import { encodeHeaderObject, decodeHeaderObject } from './codec.js';

const PAYMENT_HEADER = 'X-PAYMENT';
const PAYMENT_RESPONSE_HEADER = 'X-PAYMENT-RESPONSE';

// Default nondeterminism, used only when the caller does not inject its
// own. Real deployments can rely on these; tests inject deterministic
// substitutes so the produced payload is byte-stable.
const defaultNow = () => {
  const D = globalThis.Date;
  return D ? Math.floor(D.now() / 1000) : 0;
};

const defaultMakeNonce = () => {
  const { crypto } = globalThis;
  const bytes = new Uint8Array(32);
  if (crypto && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    throw new Error(
      'x402: no crypto.getRandomValues; inject makeNonce explicitly',
    );
  }
  let hex = '0x';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
};

/**
 * Default requirement selection: the first `exact`-scheme entry that
 * matches the caller's optional network filter and does not exceed the
 * caller's optional `maxValue` (compared as atomic-unit integers).
 *
 * @param {any[]} accepts
 * @param {{ network?: string, maxValue?: bigint | string | number }} [opts]
 * @returns {any}
 */
export const selectExactRequirement = (accepts, opts = {}) => {
  const { network, maxValue } = opts;
  const cap = maxValue === undefined ? undefined : BigInt(maxValue);
  for (const entry of accepts || []) {
    if (
      entry.scheme === EXACT_SCHEME &&
      (network === undefined || entry.network === network) &&
      (cap === undefined || BigInt(entry.amount) <= cap)
    ) {
      return entry;
    }
  }
  return undefined;
};
harden(selectExactRequirement);

/**
 * @param {object} powers
 * @param {typeof fetch} powers.fetch
 * @param {{ address: string, signTypedData: (typedData: any) => Promise<string> | string }} powers.signer
 * @param {() => string} [powers.makeNonce]
 * @param {() => number} [powers.now]
 * @param {(accepts: any[], opts: any) => any} [powers.selectRequirement]
 */
export const makeX402Client = ({
  fetch,
  signer,
  makeNonce = defaultMakeNonce,
  now = defaultNow,
  selectRequirement = selectExactRequirement,
}) => {
  if (typeof fetch !== 'function') {
    throw new Error('x402: makeX402Client requires a fetch capability');
  }
  if (!signer || typeof signer.signTypedData !== 'function') {
    throw new Error('x402: makeX402Client requires a signer capability');
  }

  /**
   * Fetch a resource, paying an x402 challenge if one is returned.
   *
   * Resolves to `{ response, requirement, payment, paid }`:
   *   - `response`   : the final `Response` (the retried, paid one if a
   *                    challenge occurred, else the original)
   *   - `paid`       : whether a payment was attached
   *   - `requirement`: the `accepts[]` entry that was satisfied (if paid)
   *   - `payment`    : the decoded `X-PAYMENT-RESPONSE` settlement (if any)
   *
   * @param {string} url
   * @param {RequestInit} [init]
   * @param {{ network?: string, maxValue?: bigint | string | number }} [opts]
   */
  /**
   * Build and sign a payment payload for one requirement, *without*
   * submitting it. This is the escrow-friendly primitive: the returned
   * payload is a signed EIP-3009 authorization that a holder can settle
   * later (release) or let expire (refund), so a neutral agent can hold
   * it in escrow while never taking custody of funds.
   *
   * @param {any} requirement the chosen `accepts[]` entry
   * @param {any} [resource] the resource descriptor to echo back
   * @returns {Promise<any>} a `PaymentPayload`
   */
  const createPayment = async (requirement, resource) => {
    const nowSeconds = now();
    const validAfter = 0;
    const validBefore =
      nowSeconds + (Number(requirement.maxTimeoutSeconds) || 60);
    const nonce = makeNonce();

    const { authorization, typedData } = buildExactEvmAuthorization({
      requirement,
      from: signer.address,
      nonce,
      validAfter,
      validBefore,
    });

    const signature = await signer.signTypedData(typedData);

    return harden({
      x402Version: X402_VERSION,
      resource,
      accepted: requirement,
      payload: { signature, authorization },
    });
  };

  const fetchWithPayment = async (url, init = {}, opts = {}) => {
    const first = await fetch(url, init);
    if (first.status !== 402) {
      // Result objects embed a live `Response`, so they are returned
      // plain rather than `harden`ed — deep-freezing a foreign Response
      // is neither meaningful nor safe.
      return { response: first, paid: false };
    }

    const challenge = await first.json();
    const accepts = challenge.accepts || [];
    const requirement = selectRequirement(accepts, opts);
    if (requirement === undefined) {
      throw new Error(
        `x402: no acceptable payment requirement among ${accepts.length} offered`,
      );
    }

    const paymentPayload = await createPayment(requirement, challenge.resource);

    const headers = new Headers(init.headers || {});
    headers.set(PAYMENT_HEADER, encodeHeaderObject(paymentPayload));

    const paid = await fetch(url, { ...init, headers });

    let payment;
    const settlementHeader = paid.headers.get(PAYMENT_RESPONSE_HEADER);
    if (settlementHeader) {
      payment = decodeHeaderObject(settlementHeader, PAYMENT_RESPONSE_HEADER);
    }

    return { response: paid, paid: true, requirement, payment };
  };

  return harden({ fetchWithPayment, createPayment });
};
harden(makeX402Client);
