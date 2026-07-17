// A client for an x402 *facilitator* — the service that verifies a
// payment authorization and settles it on-chain so a receiver never has
// to run blockchain infrastructure. Coinbase hosts one at
// `https://x402.org/facilitator` (and CDP a production one); any
// conforming `/verify` + `/settle` + `/supported` endpoint works.
//
// This is again pure plumbing over an injected `fetch`: it holds no keys
// and settles nothing itself, it only relays to the facilitator.

import harden from '@endo/harden';
import { X402_VERSION } from './constants.js';

/**
 * @param {object} powers
 * @param {typeof fetch} powers.fetch
 * @param {string} powers.baseUrl facilitator origin, e.g. `https://x402.org/facilitator`
 * @param {Record<string, string>} [powers.headers] extra headers (e.g. CDP auth)
 */
export const makeFacilitatorClient = ({ fetch, baseUrl, headers = {} }) => {
  if (typeof fetch !== 'function') {
    throw new Error('x402: makeFacilitatorClient requires a fetch capability');
  }
  const origin = baseUrl.replace(/\/+$/, '');

  const post = async (path, body) => {
    const response = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `x402: facilitator ${path} failed ${response.status}: ${text}`,
      );
    }
    return response.json();
  };

  /**
   * Ask the facilitator whether a payment authorization is valid for a
   * requirement, without settling it.
   *
   * @param {any} paymentPayload
   * @param {any} paymentRequirements
   * @returns {Promise<{ isValid: boolean, invalidReason?: string, payer?: string }>}
   */
  const verify = (paymentPayload, paymentRequirements) =>
    post('/verify', {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });

  /**
   * Ask the facilitator to settle a payment on-chain.
   *
   * @param {any} paymentPayload
   * @param {any} paymentRequirements
   * @returns {Promise<{ success: boolean, errorReason?: string, payer?: string, transaction: string, network: string, amount?: string }>}
   */
  const settle = (paymentPayload, paymentRequirements) =>
    post('/settle', {
      x402Version: X402_VERSION,
      paymentPayload,
      paymentRequirements,
    });

  /**
   * List the `{ scheme, network }` kinds the facilitator supports.
   *
   * @returns {Promise<any>}
   */
  const supported = async () => {
    const response = await fetch(`${origin}/supported`, { headers });
    if (!response.ok) {
      throw new Error(`x402: facilitator /supported failed ${response.status}`);
    }
    return response.json();
  };

  return harden({ verify, settle, supported });
};
harden(makeFacilitatorClient);
