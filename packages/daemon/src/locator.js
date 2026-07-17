// @ts-check

/** @import { ConnectionHint, FormulaNumber, NodeNumber, FormulaIdentifier } from './types.js' */

import { makeError, q } from '@endo/errors';
import { formatId, isValidNumber, parseId } from './formula-identifier.js';
import { isValidFormulaType } from './formula-type.js';

/**
 * @typedef {'blob' | 'tree'} ContentKind
 *   The two content-bearing readables a content locator can name: a
 *   readable-blob (`urn:endo-blob:`) or a readable-tree (`urn:endo-tree:`).
 */

/**
 * @typedef {object} ContentSourceHint
 *   A single data-plane acquisition hint carried by a content locator. The
 *   `plane` is the magnet source letter (`ws` / `xs` / `as` / `tr`) and the
 *   `payload` is that plane's source string (for a web seed, an HTTP URL).
 *   Source hints are ephemeral: they reflect the Gateway's current `@planes`
 *   configuration and are never stored with the content.
 * @property {ContentSourcePlane} plane
 * @property {string} payload
 */

/**
 * @typedef {'ws' | 'xs' | 'as' | 'tr'} ContentSourcePlane
 *   The registered source parameters, reusing the standard magnet letters:
 *   `ws` (web seed, a direct HTTP URL), `xs` (exact source, a P2P/verifiable
 *   source), `as` (acceptable source, a fallback web link), and `tr` (tracker).
 */

/**
 * @typedef {object} ParsedContentLocator
 * @property {string} hash - The SHA-256 content address (the `xt` identity).
 * @property {ContentKind} kind - `blob` or `tree`, from the `xt` urn namespace.
 * @property {string | undefined} displayName - The optional `dn` (descriptive).
 * @property {number | undefined} byteLength - The optional `xl` (descriptive).
 * @property {ContentSourceHint[]} sources - The data-plane hints, in order.
 */

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

// Content locators (magnet URNs).
//
// A content locator is the content-side analogue of a transport locator
// (`designs/endo-content-locators-magnet-urn.md`). Where a transport locator
// is an `endo://` URL that names a *formula* (a location: a peer to contact)
// and carries `@`-delimited transport hints from `@nets`, a content locator is
// a `magnet:` URN that names *content* (a readable-blob or readable-tree, by
// its SHA-256 content address) regardless of location, and carries data-plane
// source hints from `@planes`.
//
// This module implements Phase 1 (grammar and duality) only: the
// `magnet:` grammar, its strict `parseContentLocator` validator, and the
// `externalizeContent` / `internalizeContentLocator` duality that mirrors
// `externalizeId` / `internalizeLocator`. There is no network, no `@planes`,
// and no interface method here; those are later phases.
//
// Grammar:
//
//     magnet:?xt=urn:endo-blob:{sha256hex}&dn={displayName}&xl={byteLength}&ws={source}&xs={source}
//     magnet:?xt=urn:endo-tree:{sha256hex}&dn={displayName}&ws={source}
//
// - `xt` (exact topic, required): `urn:endo-blob:{hash}` for a readable-blob or
//   `urn:endo-tree:{hash}` for a readable-tree. The hash is the same SHA-256
//   content address the CAS keys on (`store-sha256/`), so it is a 64-char
//   lowercase-hex string — the same shape as a formula number.
// - `dn` (display name, optional, descriptive only).
// - `xl` (exact length in bytes, optional, descriptive only).
// - `ws` / `xs` / `as` / `tr` (registered source parameters): data-plane
//   connection hints, one per acquisition source, each may repeat.
//
// Unknown parameters are rejected with `parseLocator`-matching strictness. A
// content locator with only `xt` and no source parameters is the content
// analogue of a hint-free locator from an empty `NETS`.

/**
 * The registered source parameters (the standard magnet source letters this
 * grammar reuses). Phase 1 registers the vocabulary; later phases wire each
 * letter to a `ContentDataPlane` resolver and verifying fetcher.
 *
 * @type {Set<ContentSourcePlane>}
 */
const contentSourcePlanes = new Set(
  /** @type {ContentSourcePlane[]} */ (['ws', 'xs', 'as', 'tr']),
);

/**
 * @param {string} plane
 * @returns {plane is ContentSourcePlane}
 */
const isContentSourcePlane = plane =>
  contentSourcePlanes.has(/** @type {ContentSourcePlane} */ (plane));

/**
 * The scalar (non-repeating, non-source) content-locator parameters.
 */
const contentScalarParameters = new Set(['xt', 'dn', 'xl']);

/**
 * The `xt` urn grammar: `urn:endo-blob:{hash}` / `urn:endo-tree:{hash}`, where
 * the hash is the 64-char lowercase-hex SHA-256 content address.
 */
const contentTopicPattern =
  /^urn:endo-(?<kind>blob|tree):(?<hash>[0-9a-f]{64})$/;

/**
 * @param {string} allegedKind
 * @returns {allegedKind is ContentKind}
 */
const isValidContentKind = allegedKind =>
  allegedKind === 'blob' || allegedKind === 'tree';

/**
 * Parse and strictly validate a content locator (magnet URN), extracting the
 * durable content identity (`hash` + `kind`), the descriptive `dn` / `xl`, and
 * the ordered data-plane source hints. This is the content-side analogue of
 * `parseLocator`, and rejects unknown parameters with matching strictness.
 *
 * @param {string} allegedContentLocator
 * @returns {ParsedContentLocator}
 */
export const parseContentLocator = allegedContentLocator => {
  const errorPrefix = `Invalid content locator ${q(allegedContentLocator)}:`;

  if (!URL.canParse(allegedContentLocator)) {
    throw makeError(`${errorPrefix} Invalid URL.`);
  }
  const url = new URL(allegedContentLocator);

  if (url.protocol !== 'magnet:') {
    throw makeError(`${errorPrefix} Invalid protocol.`);
  }
  // A content locator is a pure URN: no authority, path, or fragment.
  if (
    url.host !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '' ||
    url.hash !== ''
  ) {
    throw makeError(`${errorPrefix} Invalid magnet URN.`);
  }

  const { searchParams } = url;

  // Reject unknown parameters, matching `parseLocator`'s strictness.
  for (const key of searchParams.keys()) {
    if (!contentScalarParameters.has(key) && !isContentSourcePlane(key)) {
      throw makeError(`${errorPrefix} Invalid search params.`);
    }
  }

  // `xt` is required and must appear exactly once.
  const xtValues = searchParams.getAll('xt');
  if (xtValues.length === 0) {
    throw makeError(`${errorPrefix} Missing xt.`);
  }
  if (xtValues.length > 1) {
    throw makeError(`${errorPrefix} Duplicate xt.`);
  }
  const xtMatch = contentTopicPattern.exec(xtValues[0]);
  if (xtMatch === null || xtMatch.groups === undefined) {
    throw makeError(`${errorPrefix} Invalid xt.`);
  }
  const kind = /** @type {ContentKind} */ (xtMatch.groups.kind);
  const { hash } = xtMatch.groups;

  // `dn` is optional and, if present, must appear exactly once.
  const dnValues = searchParams.getAll('dn');
  if (dnValues.length > 1) {
    throw makeError(`${errorPrefix} Duplicate dn.`);
  }
  const displayName = dnValues.length === 1 ? dnValues[0] : undefined;

  // `xl` is optional and, if present, must appear exactly once and be a
  // non-negative integer.
  const xlValues = searchParams.getAll('xl');
  if (xlValues.length > 1) {
    throw makeError(`${errorPrefix} Duplicate xl.`);
  }
  let byteLength;
  if (xlValues.length === 1) {
    // Trees are structural values, not byte strings. The grammar therefore
    // admits `xl` only for the readable-blob production.
    if (kind === 'tree') {
      throw makeError(`${errorPrefix} Invalid xl.`);
    }
    if (!/^(?:0|[1-9][0-9]*)$/.test(xlValues[0])) {
      throw makeError(`${errorPrefix} Invalid xl.`);
    }
    byteLength = Number(xlValues[0]);
    if (!Number.isSafeInteger(byteLength)) {
      throw makeError(`${errorPrefix} Invalid xl.`);
    }
  }

  // Source hints, preserving their order (including interleaving across the
  // different source letters), which `searchParams` iterates by insertion.
  /** @type {ContentSourceHint[]} */
  const sources = [];
  for (const [key, value] of searchParams) {
    if (isContentSourcePlane(key)) {
      sources.push({ plane: key, payload: value });
    }
  }

  return { hash, kind, displayName, byteLength, sources };
};

/**
 * Assert that a string is a valid content locator.
 *
 * @param {string} allegedContentLocator
 */
export const assertValidContentLocator = allegedContentLocator => {
  parseContentLocator(allegedContentLocator);
};

/**
 * @param {string} hash
 * @param {ContentKind} kind
 */
const assertValidContentIdentity = (hash, kind) => {
  if (!isValidNumber(hash)) {
    throw makeError(`Invalid content hash ${q(hash)}`);
  }
  if (!isValidContentKind(kind)) {
    throw makeError(`Invalid content kind ${q(kind)}`);
  }
};

/**
 * @param {ContentSourceHint} source
 */
const assertValidContentSource = source => {
  if (source === null || typeof source !== 'object') {
    throw makeError(`Invalid content source ${q(source)}`);
  }
  const { plane, payload } = source;
  if (!isContentSourcePlane(plane)) {
    throw makeError(`Invalid content source plane ${q(plane)}`);
  }
  if (typeof payload !== 'string') {
    throw makeError(`Invalid content source payload ${q(payload)}`);
  }
};

/**
 * Format a content locator (magnet URN) from a content hash, kind, and the
 * data-plane source hints resolved fresh from `@planes`. This is the
 * content-side analogue of `formatLocatorWithHints`.
 *
 * The `xt` urn keeps its colons literal (the hash and kind are URN-safe), while
 * `dn` and every source payload are URL-encoded so that reserved characters
 * (e.g. a `&` inside a source URL's query string) round-trip cleanly.
 *
 * @param {string} hash - The SHA-256 content address.
 * @param {ContentKind} kind - `blob` or `tree`.
 * @param {ContentSourceHint[]} [sources] - Data-plane source hints.
 * @param {{ displayName?: string, byteLength?: number }} [details] - Optional
 *   descriptive `dn` / `xl`.
 * @returns {string} A content-locator (magnet URN) string.
 */
export const formatContentLocator = (
  hash,
  kind,
  sources = [],
  details = {},
) => {
  assertValidContentIdentity(hash, kind);
  const { displayName, byteLength } = details;

  const parts = [`xt=urn:endo-${kind}:${hash}`];
  if (displayName !== undefined) {
    if (typeof displayName !== 'string') {
      throw makeError(`Invalid content display name ${q(displayName)}`);
    }
    parts.push(`dn=${encodeURIComponent(displayName)}`);
  }
  if (byteLength !== undefined) {
    if (
      kind !== 'blob' ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0
    ) {
      throw makeError(`Invalid content byte length ${q(byteLength)}`);
    }
    parts.push(`xl=${byteLength}`);
  }
  for (const source of sources) {
    assertValidContentSource(source);
    parts.push(`${source.plane}=${encodeURIComponent(source.payload)}`);
  }
  return `magnet:?${parts.join('&')}`;
};

/**
 * Convert a content hash, kind, and freshly-resolved source hints into a
 * content locator (magnet URN) for sharing. The content-side analogue of
 * `externalizeId`: with no source hints it produces an `xt`-only URN, the
 * content analogue of a hint-free locator from an empty `NETS`.
 *
 * @param {string} hash - The SHA-256 content address.
 * @param {ContentKind} kind - `blob` or `tree`.
 * @param {ContentSourceHint[]} [sources] - Data-plane source hints resolved
 *   fresh from `@planes` at share time.
 * @param {{ displayName?: string, byteLength?: number }} [details] - Optional
 *   descriptive `dn` / `xl`.
 * @returns {string} A content-locator (magnet URN) string.
 */
export const externalizeContent = (hash, kind, sources = [], details = {}) =>
  formatContentLocator(hash, kind, sources, details);

/**
 * Extract the data-plane source hints from a content locator, if any.
 *
 * @param {string} contentLocator
 * @returns {ContentSourceHint[]}
 */
export const sourcesFromContentLocator = contentLocator =>
  parseContentLocator(contentLocator).sources;

/**
 * Convert a content locator (magnet URN) back to its durable content identity
 * and data-plane source hints. The content-side analogue of
 * `internalizeLocator`: it extracts the content hash and kind and forwards the
 * source hints to the fetch layer (analogue of `internalizeLocator` forwarding
 * transport hints to `addPeerInfo`).
 *
 * @param {string} contentLocator - A content-locator (magnet URN) string.
 * @returns {{ hash: string, kind: ContentKind, sources: ContentSourceHint[] }}
 */
export const internalizeContentLocator = contentLocator => {
  const { hash, kind, sources } = parseContentLocator(contentLocator);
  return { hash, kind, sources };
};
