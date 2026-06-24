// @ts-check

import harden from '@endo/harden';

import { computeAllNodeContents } from '../edit-queue.js';

import {
  getEffective,
  getNodeDepth,
  getSortedVisibleChildren,
} from './tree-source.js';

/** @import { ChannelMessage } from '../channel-utils.js' */
/** @import { NodeEffectiveContent } from '../edit-queue.js' */
/** @import { TreeStore } from './tree-source.js' */
/** @import { DraftNode } from './controller-intents.js' */

// Pure render-model builder: the BRIDGE between the controller's mutable maps
// and a future confined `OutlinerRoot`. `buildTreeSnapshot` walks the same tree
// the imperative DOM walks (`buildNodeTree`/`renderFull`,
// outliner-component.js:2541/2575) but emits plain serializable data instead of
// DOM nodes. A confined component will consume exactly this shape, so it must
// stay primitive-only: no DOM, no functions, no remotables.
//
// In Phase 1 this builder is not yet wired into the imperative render path (the
// DOM still drives itself); it exists so the snapshot shape is settled and
// testable before Phase 2 replaces the DOM with `renderConfined(OutlinerRoot)`.

/**
 * The effective `{ strings, names }` content of a node, projected for a
 * confined renderer. Mirrors `LineContent` (editable-line.js) and the editable
 * island's IN contract (§3).
 *
 * @typedef {object} SnapshotEffective
 * @property {string[]} strings - Plain-text runs (one more than `names`).
 * @property {string[]} names - Pet-name token chips interleaved between runs.
 */

/**
 * A type badge to render on a node row (e.g. Pro / Con / Evidence / Fork, or a
 * custom reply type). Plain data; the confined `NodeBadge` consumes it.
 *
 * @typedef {object} SnapshotBadge
 * @property {string} label - Display text.
 * @property {string} className - CSS class describing the badge variant.
 */

/**
 * One node in the outliner render model. Primitives + nested data only — this
 * is the Phase-2 interface a confined `OutlinerNode` will receive as props, so
 * it deliberately carries NO DOM, callbacks, or object identity used as effect
 * deps.
 *
 * @typedef {object} OutlinerSnapshotNode
 * @property {string} key - Stable per-node identity (message number as string,
 *   or a `draft-*` id for drafts). Surfaced as `data-key` / `data-line-anchor`.
 * @property {number} depth - Indentation depth (0 = root).
 * @property {boolean} hasChildren - Whether any visible children exist (drives
 *   the disclosure marker).
 * @property {boolean} collapsed - Whether this node's children are collapsed.
 * @property {boolean} selected - Whether this node is in the selection set.
 * @property {boolean} focused - Whether this node is the current focus-mode root.
 * @property {string | undefined} replyType - Raw reply type (`undefined` for a
 *   plain reply / root).
 * @property {SnapshotBadge[]} badges - Type badges to render on the row.
 * @property {SnapshotEffective} effective - Projected `{ strings, names }`.
 * @property {string} author - Author member id (resolved to a display name
 *   controller-side).
 * @property {string | undefined} editedBy - Winning-edit author member id, or
 *   `undefined` when unedited.
 * @property {boolean} isDraft - Whether this is an uncommitted draft node.
 * @property {boolean} editing - Whether the user is actively editing this node.
 * @property {OutlinerSnapshotNode[]} children - Nested child nodes (empty when
 *   none or when collapsed-and-omitted is desired; see `includeCollapsed`).
 */

/**
 * Badge labels and CSS classes for reply types. Mirrors `REPLY_TYPE_BADGES`
 * (outliner-component.js:27) so the snapshot can carry badge data without the
 * confined tree needing the lookup table.
 *
 * @type {Record<string, { label: string, className: string }>}
 */
const REPLY_TYPE_BADGES = harden({
  pro: { label: 'Pro', className: 'outliner-badge-pro' },
  con: { label: 'Con', className: 'outliner-badge-con' },
  evidence: { label: 'Evidence', className: 'outliner-badge-evidence' },
  fork: { label: 'Fork', className: 'outliner-badge-fork' },
});

/**
 * Compute the badge list for a reply type. Mirrors `createBadges`
 * (outliner-component.js:1305) but returns plain data instead of DOM.
 *
 * @param {string | undefined} replyType
 * @returns {SnapshotBadge[]}
 */
const badgesForReplyType = replyType => {
  if (replyType && REPLY_TYPE_BADGES[replyType]) {
    const info = REPLY_TYPE_BADGES[replyType];
    return [harden({ label: info.label, className: info.className })];
  }
  if (replyType && replyType !== 'reply') {
    return [harden({ label: replyType, className: 'outliner-badge-custom' })];
  }
  return [];
};

/**
 * The view state the snapshot builder reads in addition to the tree
 * {@link TreeStore}. These are the controller-owned selection / collapse /
 * focus / draft / editing facts that turn the raw tree into a render model.
 *
 * @typedef {object} SnapshotViewState
 * @property {Set<string>} collapsedNodes - Collapsed committed node keys.
 * @property {Set<string>} selectedNodes - Selected committed node keys.
 * @property {string | undefined} focusedKey - Focus-mode root, if any.
 * @property {string | undefined} editingKey - Key the user is actively editing.
 * @property {Map<string, DraftNode>} drafts - Active drafts by id (appended to
 *   their parent's children, matching the imperative DOM).
 */

/**
 * Build a single committed node's snapshot (without children).
 *
 * @param {TreeStore} store
 * @param {SnapshotViewState} view
 * @param {string} key
 * @param {number} depth
 * @param {NodeEffectiveContent} effective
 * @param {boolean} hasChildren
 * @returns {OutlinerSnapshotNode}
 */
const buildCommittedNode = (
  store,
  view,
  key,
  depth,
  effective,
  hasChildren,
) => {
  const entry = store.messageIndex.get(key);
  const replyType = entry ? entry.message.replyType : undefined;
  return harden({
    key,
    depth,
    hasChildren,
    collapsed: view.collapsedNodes.has(key) && hasChildren,
    selected: view.selectedNodes.has(key),
    focused: view.focusedKey === key,
    replyType,
    badges: badgesForReplyType(replyType),
    effective: harden({
      strings: [...effective.strings],
      names: [...effective.names],
    }),
    author: effective.authorMemberId,
    editedBy: effective.editedByMemberId,
    isDraft: false,
    editing: view.editingKey === key,
    children: [],
  });
};

/**
 * Build a draft node's snapshot. Drafts carry no edit/effective metadata beyond
 * their typed-but-uncommitted text.
 *
 * @param {SnapshotViewState} view
 * @param {DraftNode} draft
 * @param {number} depth
 * @returns {OutlinerSnapshotNode}
 */
const buildDraftNode = (view, draft, depth) =>
  harden({
    key: draft.draftId,
    depth,
    hasChildren: false,
    collapsed: false,
    selected: false,
    focused: false,
    replyType: draft.replyType,
    badges: badgesForReplyType(draft.replyType),
    effective: harden({ strings: [draft.text], names: [] }),
    author: '',
    editedBy: undefined,
    isDraft: true,
    editing: view.editingKey === draft.draftId,
    children: [],
  });

/**
 * Insert draft nodes into an already-built list of committed-children snapshot
 * nodes, honoring each draft's `beforeKey` / `afterKey` (else appended at the
 * end). Mirrors the imperative `createDraft` DOM insert (outliner-component.js:
 * 2371): `beforeKey` wins over `afterKey`; an unplaceable target falls back to
 * append. Mutates `children` in place.
 *
 * @param {SnapshotViewState} view
 * @param {OutlinerSnapshotNode[]} children
 * @param {DraftNode[]} drafts
 * @param {number} depth
 */
const interleaveDrafts = (view, children, drafts, depth) => {
  for (const draft of drafts) {
    const draftNode = buildDraftNode(view, draft, depth);
    if (draft.beforeKey) {
      const at = children.findIndex(c => c.key === draft.beforeKey);
      if (at !== -1) {
        children.splice(at, 0, draftNode);
        // eslint-disable-next-line no-continue
        continue;
      }
    } else if (draft.afterKey) {
      const at = children.findIndex(c => c.key === draft.afterKey);
      if (at !== -1) {
        children.splice(at + 1, 0, draftNode);
        // eslint-disable-next-line no-continue
        continue;
      }
    }
    children.push(draftNode);
  }
};

/**
 * Recursively build the snapshot subtree rooted at `key`.
 *
 * @param {TreeStore} store
 * @param {SnapshotViewState} view
 * @param {Map<string, NodeEffectiveContent>} effectiveContents
 * @param {Map<string | undefined, DraftNode[]>} draftsByParent
 * @param {string} key
 * @param {number} depth
 * @returns {OutlinerSnapshotNode | null}
 */
const buildSubtree = (
  store,
  view,
  effectiveContents,
  draftsByParent,
  key,
  depth,
) => {
  const effective = effectiveContents.get(key) || getEffective(store, key);
  if (effective.deleted) return null;

  const visibleChildren = getSortedVisibleChildren(
    store,
    key,
    effectiveContents,
  );
  const node = buildCommittedNode(
    store,
    view,
    key,
    depth,
    effective,
    visibleChildren.length > 0,
  );

  /** @type {OutlinerSnapshotNode[]} */
  const children = [];
  for (const childKey of visibleChildren) {
    const childNode = buildSubtree(
      store,
      view,
      effectiveContents,
      draftsByParent,
      childKey,
      depth + 1,
    );
    if (childNode) children.push(childNode);
  }
  interleaveDrafts(view, children, draftsByParent.get(key) || [], depth + 1);

  return harden({ ...node, children: harden(children) });
};

/**
 * Build the full outliner render model from the tree store and view state.
 * This is the pure analogue of `renderFull` (outliner-component.js:2575): it
 * honors `focusedKey` (renders only that subtree) and otherwise renders all
 * roots, with drafts interleaved into their parents' children.
 *
 * @param {TreeStore} store
 * @param {SnapshotViewState} view
 * @returns {OutlinerSnapshotNode[]}
 */
export const buildTreeSnapshot = (store, view) => {
  const effectiveContents = computeAllNodeContents(
    store.messageIndex,
    store.replyChildren,
    store.blockedMemberIds,
  );

  // Group drafts by parent key so each subtree can append its own.
  /** @type {Map<string | undefined, DraftNode[]>} */
  const draftsByParent = new Map();
  for (const draft of view.drafts.values()) {
    const list = draftsByParent.get(draft.parentKey);
    if (list) {
      list.push(draft);
    } else {
      draftsByParent.set(draft.parentKey, [draft]);
    }
  }

  /** @type {OutlinerSnapshotNode[]} */
  const roots = [];

  if (view.focusedKey && store.messageIndex.has(view.focusedKey)) {
    const node = buildSubtree(
      store,
      view,
      effectiveContents,
      draftsByParent,
      view.focusedKey,
      0,
    );
    if (node) roots.push(node);
  } else {
    for (const rootKey of getSortedVisibleChildren(
      store,
      undefined,
      effectiveContents,
    )) {
      const node = buildSubtree(
        store,
        view,
        effectiveContents,
        draftsByParent,
        rootKey,
        0,
      );
      if (node) roots.push(node);
    }
    // Root-level drafts.
    interleaveDrafts(view, roots, draftsByParent.get(undefined) || [], 0);
  }

  return harden(roots);
};
harden(buildTreeSnapshot);

export { getNodeDepth };
