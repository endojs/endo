// @ts-check

/** @import { FormulaNumber, NodeNumber, FormulaIdentifier } from './types.js' */

import { makeError, q } from '@endo/errors';
import { formatId, isValidNumber, parseId } from './formula-identifier.js';
import { isValidFormulaType } from './formula-type.js';

/**
 * Sentinel "null node" value for locally-stored formula keys.
 * Analogous to 0.0.0.0 in networking — a "this host" placeholder.
 * All-zeros is never a valid Ed25519 public key.
 */
export const NULL_NODE = /** @type {NodeNumber} */ ('0'.repeat(64));

/**
 * The endo locator format:
 * ```
 * endo://{nodeNumber}/?id={formulaNumber}&type={formulaType}
 * ```
 * Note that the `id` query param is just the formula number.
 */

/**
 * In addition to all valid formula types, the locator `type` query parameter
 * also supports `remote` for remote values, since their actual formula type
 * cannot be known.
 *
 * @param {string} allegedType
 */
const isValidLocatorType = allegedType =>
  isValidFormulaType(allegedType) || allegedType === 'remote';

/**
 * @param {string} allegedType
 */
const assertValidLocatorType = allegedType => {
  if (!isValidLocatorType(allegedType)) {
    throw makeError(`Unrecognized locator type ${q(allegedType)}`);
  }
};

/**
 * @param {string} allegedLocator
 * @returns {{ formulaType: string, node: NodeNumber, number: FormulaNumber }}
 */
export const parseLocator = allegedLocator => {
  const errorPrefix = `Invalid locator ${q(allegedLocator)}:`;

  if (!URL.canParse(allegedLocator)) {
    throw makeError(`${errorPrefix} Invalid URL.`);
  }
  const url = new URL(allegedLocator);

  if (!allegedLocator.startsWith('endo://')) {
    throw makeError(`${errorPrefix} Invalid protocol.`);
  }

  const node = url.host;
  if (!isValidNumber(node)) {
    throw makeError(`${errorPrefix} Invalid node identifier.`);
  }

  if (!url.searchParams.has('id') || !url.searchParams.has('type')) {
    throw makeError(`${errorPrefix} Invalid search params.`);
  }

  // Only 'id', 'type', and 'at' (connection hints) are allowed.
  for (const key of url.searchParams.keys()) {
    if (key !== 'id' && key !== 'type' && key !== 'at') {
      throw makeError(`${errorPrefix} Invalid search params.`);
    }
  }

  const number = url.searchParams.get('id');
  if (number === null || !isValidNumber(number)) {
    throw makeError(`${errorPrefix} Invalid id.`);
  }

  const formulaType = url.searchParams.get('type');
  if (formulaType === null || !isValidLocatorType(formulaType)) {
    throw makeError(`${errorPrefix} Invalid type.`);
  }

  const nodeNumber = /** @type {NodeNumber} */ (node);
  const formulaNumber = /** @type {FormulaNumber} */ (number);
  return { formulaType, node: nodeNumber, number: formulaNumber };
};

/** @param {string} allegedLocator */
export const assertValidLocator = allegedLocator => {
  parseLocator(allegedLocator);
};

/**
 * @param {string} id - The full formula identifier.
 * @param {string} formulaType - The type of the formula with the given id.
 */
export const formatLocator = (id, formulaType) => {
  const { number, node } = parseId(id);
  const url = new URL(`endo://${node}`);
  url.pathname = '/';

  // The id query param is just the number
  url.searchParams.set('id', number);

  assertValidLocatorType(formulaType);
  url.searchParams.set('type', formulaType);

  return url.toString();
};

/**
 * @param {string} locator
 */
export const idFromLocator = locator => {
  const { number, node } = parseLocator(locator);
  return formatId({ number, node });
};

/**
 * Format a locator with connection hints for sharing with remote peers.
 *
 * @param {string} id - The full formula identifier.
 * @param {string} formulaType - The type of the formula with the given id.
 * @param {string[]} addresses - Network addresses (connection hints).
 */
export const formatLocatorForSharing = (id, formulaType, addresses) => {
  const { number, node } = parseId(id);
  const url = new URL(`endo://${node}`);
  url.pathname = '/';

  url.searchParams.set('id', number);

  assertValidLocatorType(formulaType);
  url.searchParams.set('type', formulaType);

  for (const address of addresses) {
    url.searchParams.append('at', address);
  }

  return url.toString();
};

/**
 * Extract connection hint addresses from a locator, if any.
 *
 * @param {string} locator
 * @returns {string[]}
 */
export const addressesFromLocator = locator => {
  const url = new URL(locator);
  return url.searchParams.getAll('at');
};


/**
 * Convert an internal formula identifier to a locator for agent consumption.
 * Replaces NULL_NODE with the agent's public key.
 *
 * @param {FormulaIdentifier} id - Internal formula identifier.
 * @param {string} formulaType - The type of the formula.
 * @param {NodeNumber} agentNodeNumber - The agent's public key to use as peer key.
 * @returns {string} A locator string.
 */
export const externalizeId = (id, formulaType, agentNodeNumber) => {
  const { number, node } = parseId(id);
  const peerKey = node === NULL_NODE ? agentNodeNumber : node;
  return formatLocator(formatId({ number, node: peerKey }), formulaType);
};

/**
 * Convert a locator from an agent back to an internal formula identifier.
 * The node is preserved as-is (internal IDs use the real node number).
 *
 * @param {string} locator - A locator string from an agent.
 * @param {(node: NodeNumber) => boolean} _isLocalKey - Predicate for known local keys (reserved for future use).
 * @returns {{ id: FormulaIdentifier, formulaType: string, addresses: string[] }}
 */
export const internalizeLocator = (locator, _isLocalKey) => {
  const { number, node, formulaType } = parseLocator(locator);
  const addresses = addressesFromLocator(locator);
  const id = formatId({ number, node });
  return { id, formulaType, addresses };
};
