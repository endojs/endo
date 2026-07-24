// Escrow exchange over the x402 rail.
//
// x402's `exact` scheme is, by construction, an escrow primitive. The
// payer signs an EIP-3009 `transferWithAuthorization` — a *deferred*
// instrument: it moves no funds until someone submits it for settlement,
// and it becomes void once its `validBefore` deadline passes. A neutral
// agent can therefore hold the signed authorization and:
//
//   - RELEASE it (settle on-chain) once the counter-obligation is met, or
//   - ABORT / let it EXPIRE, in which case no funds ever move — the payer
//     is refunded by inaction.
//
// Crucially the escrow agent never takes custody of funds; it only holds
// a signed authorization. The worst a malicious agent can do is settle a
// transfer the payer already authorized (bounded by amount and deadline)
// or refuse to settle (the payer keeps the money). That trust-minimized
// fair-exchange is what "an escrow exchange backed by x402" buys you.
//
// This models a one-legged escrow (buyer -> seller, released on delivery
// confirmation). A two-legged atomic swap layers two of these, each side
// depositing an authorization and a coordinator releasing both only when
// both are held — see the README.

import harden from '@endo/harden';

const defaultNow = () => {
  const D = globalThis.Date;
  return D ? Math.floor(D.now() / 1000) : 0;
};

/**
 * @param {object} powers
 * @param {{ verify: Function, settle: Function }} powers.facilitator
 * @param {() => number} [powers.now] unix-seconds clock (injectable for tests)
 */
export const makeEscrowAgent = ({ facilitator, now = defaultNow }) => {
  if (!facilitator || typeof facilitator.settle !== 'function') {
    throw new Error('x402 escrow: requires a facilitator client');
  }

  // id (the authorization nonce, unique per payment) -> record.
  /**
   * @typedef {{
   *   paymentPayload: any,
   *   requirements: any,
   *   status: 'held' | 'released' | 'aborted' | 'expired',
   *   expiresAt: number,
   * }} EscrowRecord
   */
  /** @type {Map<string, EscrowRecord>} */
  const held = new Map();

  /**
   * Accept a signed payment authorization into escrow. The facilitator
   * verifies the authorization is well-formed and funded *without*
   * settling it, so nothing moves on-chain yet.
   *
   * @param {object} args
   * @param {any} args.paymentPayload a signed `PaymentPayload` (see `createPayment`)
   * @param {any} args.requirements the `PaymentRequirements` entry it satisfies
   * @returns {Promise<{ id: string, payer: string, amount: string, expiresAt: number }>}
   */
  const deposit = async ({ paymentPayload, requirements }) => {
    const verification = await facilitator.verify(paymentPayload, requirements);
    if (!verification.isValid) {
      throw new Error(
        `x402 escrow: authorization rejected: ${verification.invalidReason || 'invalid'}`,
      );
    }
    const { authorization } = paymentPayload.payload;
    const id = authorization.nonce;
    if (held.has(id)) {
      throw new Error(`x402 escrow: duplicate authorization ${id}`);
    }
    const expiresAt = Number(authorization.validBefore);
    held.set(id, {
      paymentPayload,
      requirements,
      status: 'held',
      expiresAt,
    });
    return harden({
      id,
      payer: verification.payer || authorization.from,
      amount: `${requirements.amount}`,
      expiresAt,
    });
  };

  const mustGet = id => {
    const record = held.get(id);
    if (record === undefined) {
      throw new Error(`x402 escrow: no such escrow ${id}`);
    }
    return record;
  };

  /**
   * Release escrowed funds — settle the transfer to the recipient. Call
   * this once the counter-obligation is confirmed.
   *
   * @param {string} id
   * @returns {Promise<{ id: string, settlement: any }>}
   */
  const release = async id => {
    const record = mustGet(id);
    if (record.status !== 'held') {
      throw new Error(`x402 escrow: ${id} already ${record.status}`);
    }
    if (now() >= record.expiresAt) {
      record.status = 'expired';
      throw new Error(
        `x402 escrow: authorization ${id} expired at ${record.expiresAt}`,
      );
    }
    const settlement = await facilitator.settle(
      record.paymentPayload,
      record.requirements,
    );
    if (!settlement.success) {
      throw new Error(
        `x402 escrow: settlement failed: ${settlement.errorReason || 'unknown'}`,
      );
    }
    record.status = 'released';
    return harden({ id, settlement });
  };

  /**
   * Abort an escrow — the authorization is never settled and voids at its
   * deadline, so the payer keeps their funds (refund by inaction).
   *
   * @param {string} id
   * @returns {{ id: string, refunded: true, expiresAt: number }}
   */
  const abort = id => {
    const record = mustGet(id);
    if (record.status !== 'held') {
      throw new Error(`x402 escrow: ${id} already ${record.status}`);
    }
    record.status = 'aborted';
    return harden({ id, refunded: true, expiresAt: record.expiresAt });
  };

  /**
   * Inspect an escrow's state.
   *
   * @param {string} id
   * @returns {{ id: string, status: string, expiresAt: number } | undefined}
   */
  const status = id => {
    const record = held.get(id);
    return record === undefined
      ? undefined
      : harden({ id, status: record.status, expiresAt: record.expiresAt });
  };

  return harden({ deposit, release, abort, status });
};
harden(makeEscrowAgent);
