// @ts-check

import harden from '@endo/harden';

import { computeNodeContent, isVisibleReplyType } from '../edit-queue.js';

/** @import { ChannelMessage } from '../channel-utils.js' */
/** @import { NodeEffectiveContent } from '../edit-queue.js' */

// Pure tree-projection layer for the outliner. These functions were extracted
// from the `outlinerComponent` closure (outliner-component.js) where they used
// to capture `messageIndex` / `replyChildren` / `moveOverrides` /
// `parentOverrides` / `rootKeys` / `blockedMemberIds` lexically. Here they take
// an explicit {@link TreeStore} so the same logic can drive both the current
// imperative DOM (Phase 1) and a future confined Preact tree (Phase 2+).
//
// Authority-free: no `document`, no `window`. Just maps in, structured data
// out.

/**
 * The mutable maps that describe the outliner tree. This is exactly the subset
 * of controller state the projection functions read. The controller owns these
 * maps and threads the same object into every projection call.
 *
 * @typedef {object} TreeStore
 * @property {Map<string, { message: ChannelMessage, $element?: HTMLElement }>} messageIndex
 *   Committed messages by key (message number as string).
 * @property {Map<string, string[]>} replyChildren
 *   Natural reply edges: parent key → child keys.
 * @property {Map<string, number>} moveOverrides
 *   Committed node key → effective sort order (from `move` replies).
 * @property {Map<string, string | undefined>} parentOverrides
 *   Committed node key → new parent key (`undefined` = root) from `move`
 *   replies that reparent.
 * @property {string[]} rootKeys
 *   Root message keys (no `replyTo`, visible reply type).
 * @property {Set<string>} blockedMemberIds
 *   Blocked member IDs (currently always empty, threaded for completeness).
 */

/**
 * Get the effective parent key for a node, considering reparent overrides.
 * Extracted from outliner-component.js:297.
 *
 * @param {TreeStore} store
 * @param {string} key
 * @returns {string | undefined}
 */
export const getEffectiveParent = (store, key) => {
  if (store.parentOverrides.has(key)) return store.parentOverrides.get(key);
  const entry = store.messageIndex.get(key);
  return entry ? entry.message.replyTo : undefined;
};
harden(getEffectiveParent);

/**
 * Walk up the effective-parent chain to determine a committed node's depth.
 * Extracted from outliner-component.js:308.
 *
 * @param {TreeStore} store
 * @param {string} key
 * @returns {number}
 */
export const getNodeDepth = (store, key) => {
  let depth = 0;
  let current = key;
  while (current) {
    const parent = getEffectiveParent(store, current);
    if (!parent) break;
    current = parent;
    depth += 1;
  }
  return depth;
};
harden(getNodeDepth);

/**
 * Get the effective sort order for a committed node. Returns the move override
 * if present, otherwise the message number.
 * Extracted from outliner-component.js:326.
 *
 * @param {TreeStore} store
 * @param {string} key
 * @returns {number}
 */
export const getEffectiveSortOrder = (store, key) => {
  const override = store.moveOverrides.get(key);
  if (override !== undefined) return override;
  const entry = store.messageIndex.get(key);
  return entry ? Number(entry.message.number) : 0;
};
harden(getEffectiveSortOrder);

/**
 * Compute the effective content for a single node from the store.
 * Extracted from outliner-component.js:504 (`getEffective`).
 *
 * @param {TreeStore} store
 * @param {string} key
 * @returns {NodeEffectiveContent}
 */
export const getEffective = (store, key) =>
  computeNodeContent(
    key,
    store.messageIndex,
    store.replyChildren,
    store.blockedMemberIds,
  );
harden(getEffective);

/**
 * Get the sorted visible children keys for a parent. Honors reparent overrides
 * (nodes moved away are excluded; nodes moved in are included), filters
 * modifier/deleted nodes, and sorts by effective sort order.
 * Extracted from outliner-component.js:513.
 *
 * @param {TreeStore} store
 * @param {string | undefined} parentKey
 * @param {Map<string, NodeEffectiveContent>} [effectiveContents]
 *   Optional precomputed effective-content map. When omitted, each candidate's
 *   content is computed on demand via {@link getEffective}.
 * @returns {string[]}
 */
export const getSortedVisibleChildren = (
  store,
  parentKey,
  effectiveContents,
) => {
  // Start with natural children, filtering out those reparented away.
  const naturalKeys = parentKey
    ? store.replyChildren.get(parentKey) || []
    : store.rootKeys;
  const keys = naturalKeys.filter(k => {
    if (store.parentOverrides.has(k)) {
      return store.parentOverrides.get(k) === parentKey;
    }
    return true;
  });
  // Add nodes reparented INTO this parent from elsewhere.
  for (const [k, p] of store.parentOverrides.entries()) {
    if (p === parentKey && !keys.includes(k)) {
      keys.push(k);
    }
  }
  return keys
    .filter(k => {
      const entry = store.messageIndex.get(k);
      if (!entry || !isVisibleReplyType(entry.message.replyType)) {
        return false;
      }
      const eff = effectiveContents
        ? effectiveContents.get(k)
        : getEffective(store, k);
      return eff && !eff.deleted;
    })
    .sort(
      (a, b) =>
        getEffectiveSortOrder(store, a) - getEffectiveSortOrder(store, b),
    );
};
harden(getSortedVisibleChildren);

/**
 * Walk up the `replyTo` chain to build the full ancestry of a message.
 * Returns messages in root-first order. Note: this uses the *natural* reply
 * edge (`message.replyTo`), not the effective parent, matching the original
 * `getHeritageChain` used for fork/share payloads.
 * Extracted from outliner-component.js:550.
 *
 * @param {TreeStore} store
 * @param {string} key
 * @returns {ChannelMessage[]}
 */
export const getHeritageChain = (store, key) => {
  /** @type {ChannelMessage[]} */
  const chain = [];
  let current = /** @type {string | undefined} */ (key);
  while (current) {
    const entry = store.messageIndex.get(current);
    if (!entry) break;
    chain.unshift(entry.message);
    current = entry.message.replyTo;
  }
  return chain;
};
harden(getHeritageChain);

/**
 * Check whether `targetKey` is a descendant of (or equal to) any of the given
 * ancestor keys, walking effective parents.
 * Extracted from outliner-component.js:818.
 *
 * @param {TreeStore} store
 * @param {string} targetKey
 * @param {string[]} ancestorKeys
 * @returns {boolean}
 */
export const isDescendantOf = (store, targetKey, ancestorKeys) => {
  let current = targetKey;
  while (current) {
    if (ancestorKeys.includes(current)) return true;
    const parent = getEffectiveParent(store, current);
    if (!parent) break;
    current = parent;
  }
  return false;
};
harden(isDescendantOf);
