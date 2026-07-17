// Build the EIP-3009 `TransferWithAuthorization` message and its EIP-712
// typed-data envelope for the `exact` EVM scheme. This module computes no
// hashes and touches no keys: it assembles the *typed data* that a
// separately-injected `signer` turns into a signature. Keeping the key
// authority out of this module is the whole point — the connector can be
// handed to untrusted code, and the most it can do is *ask* the signer to
// authorize a transfer whose amount and recipient it cannot forge past
// the signer's own policy.

import harden from '@endo/harden';

import {
  resolveNetwork,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
} from './constants.js';

// The EIP-712 struct types for EIP-3009. `EIP712Domain` is listed
// explicitly so the typed data is self-describing for signers that do not
// synthesize it.
const TRANSFER_WITH_AUTHORIZATION_TYPES = harden({
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
});

/**
 * The authorization tuple carried inside a payment payload.
 *
 * @typedef {object} Authorization
 * @property {string} from payer address
 * @property {string} to recipient address (the requirement's `payTo`)
 * @property {string} value atomic-unit amount
 * @property {string} validAfter unix seconds, inclusive lower bound
 * @property {string} validBefore unix seconds, exclusive upper bound
 * @property {string} nonce 32-byte hex, replay protection
 */

/**
 * Assemble the authorization and the EIP-712 typed data to be signed for
 * one accepted `PaymentRequirements` entry.
 *
 * @param {object} args
 * @param {any} args.requirement the chosen `accepts[]` entry
 * @param {string} args.from payer address
 * @param {string} args.nonce 32-byte hex nonce
 * @param {number} args.validAfter unix seconds
 * @param {number} args.validBefore unix seconds
 * @returns {{ authorization: Authorization, typedData: any }}
 */
export const buildExactEvmAuthorization = ({
  requirement,
  from,
  nonce,
  validAfter,
  validBefore,
}) => {
  const network = resolveNetwork(requirement.network);
  const extra = requirement.extra || {};
  const domain = harden({
    name: extra.name || USDC_EIP712_NAME,
    version: extra.version || USDC_EIP712_VERSION,
    chainId: network.chainId,
    verifyingContract: requirement.asset,
  });

  const authorization = harden({
    from,
    to: requirement.payTo,
    value: `${requirement.amount}`,
    validAfter: `${validAfter}`,
    validBefore: `${validBefore}`,
    nonce,
  });

  const typedData = harden({
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    domain,
    message: authorization,
  });

  return harden({ authorization, typedData });
};
harden(buildExactEvmAuthorization);
