// @ts-check

/** @import { ConnectionHint, FormulaNumber, NodeNumber, FormulaIdentifier } from './types.js' */

import { makeError, q } from '@endo/errors';
import { formatId, isValidNumber, parseId } from './formula-identifier.js';
import { isValidFormulaType } from './formula-type.js';

/**
 * Sentinel node number for locally-stored formula keys.
 * Analogous to 0.0.0.0 in networking — a "this host" placeholder.
 * All-zeros is never a valid Ed25519 public key.
 */
export const LOCAL_NODE = /** @type {NodeNumber} */ ('0'.repeat(64));

/**
 * The endo locator format:
 * ```
 * endo://{peerKey}/{formulaAddress}@{hint1}@{hint2}?type={formulaType}
 * ```
 *
 * - `peerKey` is the URL host: a 64-char hex Ed25519 public key.
 * - The URL path is a sequence of `@`-delimited components.  The first
 *   component is the formula address (a 64-char hex string).  Subsequent
 *   components are connection hints in the form
 *   `<transport-prefix>:<transport-payload>`.
 * - Each path component is URL-encoded so that `@`, `/`, and other
 *   reserved characters inside a component round-trip cleanly.
 * - The query string carries metadata.  `type={formulaType}` is required;
 *   `from={handleNumber}` and `fromNode={nodeNumber}` are used by
 *   invitation locators.
 *
 * Example (no hints):
 *
 * ```
 * endo://abcd…/ef01…?type=eval
 * ```
 *
 * Example (with hints):
 *
 * ```
 * endo://abcd…/ef01…@tcp%2Bnetstring%2Bjson%2Bcaptp0%3A%2F%2F127.0.0.1%3A54321?type=eval
 * ```
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
 * Split the `@`-delimited URL path into its decoded components.
 * The leading slash is stripped first; the empty path yields an empty
 * array.  Each component is URL-decoded so that `@`, `/`, and `?` inside
 * a hint round-trip cleanly.
 *
 * @param {string} pathname
 * @returns {string[]}
 */
const decodePathComponents = pathname => {
  const stripped = pathname.replace(/^\//, '');
  if (stripped === '') {
    return [];
  }
  return stripped.split('@').map(decodeURIComponent);
};

/**
 * Encode an array of path components into the `@`-delimited URL path
 * (with a leading slash).  Each component is URL-encoded so that `@`,
 * `/`, and `?` inside a component do not collide with the path syntax.
 *
 * @param {string[]} components
 * @returns {string}
 */
const encodePathComponents = components =>
  `/${components.map(encodeURIComponent).join('@')}`;

/**
 * @param {string} allegedLocator
 * @returns {{ formulaType: string, node: NodeNumber, number: FormulaNumber, hints: ConnectionHint[] }}
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

  const components = decodePathComponents(url.pathname);
  if (components.length === 0) {
    throw makeError(`${errorPrefix} Missing formula number.`);
  }
  const [number, ...hints] = components;
  if (!isValidNumber(number)) {
    throw makeError(`${errorPrefix} Invalid id.`);
  }

  // Only `type`, `from`, and `fromNode` are recognized query parameters.
  // `from` and `fromNode` are specific to invitation and handle locators.
  for (const key of url.searchParams.keys()) {
    if (key !== 'type' && key !== 'from' && key !== 'fromNode') {
      throw makeError(`${errorPrefix} Invalid search params.`);
    }
  }

  const formulaType = url.searchParams.get('type');
  if (formulaType === null || !isValidLocatorType(formulaType)) {
    throw makeError(`${errorPrefix} Invalid type.`);
  }

  const nodeNumber = /** @type {NodeNumber} */ (node);
  const formulaNumber = /** @type {FormulaNumber} */ (number);
  return { formulaType, node: nodeNumber, number: formulaNumber, hints };
};

/** @param {string} allegedLocator */
export const assertValidLocator = allegedLocator => {
  parseLocator(allegedLocator);
};

/**
 * Format a locator with no connection hints.
 *
 * Format: `endo://{peerKey}/{formulaAddress}?type={type}`
 *
 * @param {string} id - The full formula identifier.
 * @param {string} formulaType - The type of the formula with the given id.
 */
export const formatLocator = (id, formulaType) => {
  const { number, node } = parseId(id);
  assertValidLocatorType(formulaType);
  const url = new URL(`endo://${node}${encodePathComponents([number])}`);
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
 * Format:
 * `endo://{peerKey}/{formulaAddress}@{hint1}@{hint2}?type={type}`
 *
 * Each `<hint>` is URL-encoded so that `@`, `/`, and `?` inside a hint
 * (e.g., a hostname containing `@`) do not collide with the path syntax.
 *
 * @param {string} id - The full formula identifier.
 * @param {string} formulaType - The type of the formula with the given id.
 * @param {ConnectionHint[]} hints - Connection hints.
 */
export const formatLocatorWithHints = (id, formulaType, hints) => {
  const { number, node } = parseId(id);
  assertValidLocatorType(formulaType);
  const url = new URL(
    `endo://${node}${encodePathComponents([number, ...hints])}`,
  );
  url.searchParams.set('type', formulaType);
  return url.toString();
};

/**
 * Compatibility alias for the previous connection-hint formatter name.
 *
 * @deprecated Use formatLocatorWithHints.
 */
export const formatLocatorForSharing = formatLocatorWithHints;

/**
 * Extract connection hints from a locator, if any.
 *
 * @param {string} locator
 * @returns {ConnectionHint[]}
 */
export const hintsFromLocator = locator => {
  const url = new URL(locator);
  const [, ...hints] = decodePathComponents(url.pathname);
  return hints;
};

/**
 * Compatibility alias for the previous connection-hint extractor name.
 *
 * @deprecated Use hintsFromLocator.
 */
export const addressesFromLocator = hintsFromLocator;

/**
 * Convert an internal formula identifier to a locator for agent
 * consumption. Replaces the internal node with the agent's public key.
 *
 * @param {FormulaIdentifier} id - Internal formula identifier.
 * @param {string} formulaType - The type of the formula.
 * @param {NodeNumber} agentNodeNumber - The agent's public key.
 * @param {ConnectionHint[]} [hints] - Optional connection hints.
 * @returns {string} A locator string.
 */
export const externalizeId = (id, formulaType, agentNodeNumber, hints = []) => {
  if (hints.length > 0) {
    return formatLocatorWithHints(id, formulaType, hints);
  }
  return formatLocator(id, formulaType);
};

/**
 * Convert a locator back to an internal formula identifier.
 * The node is preserved as-is since formula identifiers carry
 * actual node numbers (no sentinel normalization needed).
 *
 * @param {string} locator - A locator string.
 * @returns {{ id: FormulaIdentifier, formulaType: string, hints: ConnectionHint[], addresses: ConnectionHint[] }}
 */
export const internalizeLocator = locator => {
  const { number, node, formulaType, hints } = parseLocator(locator);
  const id = formatId({ number, node });
  return { id, formulaType, hints, addresses: hints };
};
