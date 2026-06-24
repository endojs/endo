// @ts-check

import harden from '@endo/harden';

import { h } from 'preact';

/** @import { OutlinerSnapshotNode, SnapshotBadge } from './tree-snapshot.js' */

// Phase-2 confined STRUCTURE tree for the outliner migration. This is the full
// `OutlinerRoot` of design §4: it consumes the Phase-1 `OutlinerSnapshotNode`
// shape (`buildTreeSnapshot`, tree-snapshot.js) and renders the node structure
// — breadcrumb, disclosure markers, type badges, author/edited meta, an EMPTY
// editable-line anchor slot per node, an actions placeholder, and recursive
// child nodes. It deliberately renders NO editable text: the host controller
// owns one persistent `contentEditable` line per node (editable-line.js) and
// re-parents it into the matching `[data-line-anchor]` slot after each confined
// render (the define-form anchor-slot pattern). Preact never owns the editable
// DOM, so live caret/selection survive confined re-renders.
//
// Authority-free: no `document`, no `window`, no refs, no `getSelection`. `h()`
// is the only rendering primitive; every prop is a primitive or plain data.
// Per §7, this layer is a PURE render with no `useEffect` — object props
// (`node`, `callbacks`) get fresh identity each confined render and must never
// be effect deps. The reproduced class names + `data-*` attributes mirror the
// imperative `createCommittedNode`/`createBulletEl`/`createBadges`/`createMetaEl`
// /`renderBreadcrumb` (outliner-component.js) so the existing CSS applies and
// the `outliner-enter-key.test.js` DOM assertions (`data-key`, `outliner-draft`,
// `data-depth`/`dataset.depth`) continue to hold.

/**
 * The plain callbacks the confined tree raises to the host controller. All are
 * stable host references threaded down by identity (never used as effect deps).
 * Phase 2 wires only the read-affecting handlers; the keyboard / draft / DnD
 * handlers are added in Phases 3–5 and are optional here so the tree renders
 * before they exist.
 *
 * @typedef {object} OutlinerCallbacks
 * @property {(key: string) => void} [onToggleCollapse] - Disclosure toggle.
 * @property {(key: string | undefined) => void} [onFocusNode] - Focus-mode
 *   breadcrumb navigation (`undefined` = home / all).
 * @property {(memberId: string) => void} [onAuthorClick] - Open the author
 *   profile popup (real popup is host-side; Phase 4).
 * @property {(key: string) => void} [onShowHistory] - Open the edit-history
 *   popup for a node (host-side; Phase 4).
 * @property {(key: string) => void} [onReply] - Reply action (Phase 4).
 * @property {(key: string) => void} [onReact] - React action (Phase 4).
 * @property {(key: string) => void} [onFork] - Fork action (Phase 4).
 * @property {(key: string) => void} [onShare] - Share action (Phase 4).
 * @property {(key: string) => void} [onBookmark] - Bookmark action (Phase 4).
 * @property {(key: string) => void} [onDelete] - Delete action (Phase 4).
 */

/**
 * One entry in the focus-mode breadcrumb chain. Computed controller-side from
 * `getHeritageChain` (the confined tree never walks the tree itself); mirrors
 * `renderBreadcrumb` (outliner-component.js:542).
 *
 * @typedef {object} BreadcrumbItem
 * @property {string} key - Ancestor node key.
 * @property {string} preview - Up-to-30-char text preview (or `#<key>`).
 * @property {boolean} current - Whether this is the focused node itself (a
 *   non-clickable label) vs. a clickable ancestor.
 */

/**
 * Focus-mode breadcrumb. Renders the home link plus the ancestor chain.
 * Hidden (renders nothing) when there is no focused node. Mirrors
 * `renderBreadcrumb` (outliner-component.js:542): `outliner-breadcrumb-item`
 * buttons, `outliner-breadcrumb-sep` separators, and an
 * `outliner-breadcrumb-current` label for the focused node.
 *
 * @param {object} props
 * @param {BreadcrumbItem[]} props.items - Ancestor chain (root-first).
 * @param {(key: string | undefined) => void} [props.onFocusNode]
 */
const Breadcrumb = ({ items, onFocusNode }) => {
  if (!items || items.length === 0) {
    return null;
  }
  /** @type {import('preact').ComponentChild[]} */
  const children = [
    h(
      'button',
      {
        class: 'outliner-breadcrumb-item',
        type: 'button',
        onClick: () => onFocusNode && onFocusNode(undefined),
      },
      '⌂ All',
    ),
  ];
  for (const item of items) {
    children.push(
      h(
        'span',
        { key: `sep-${item.key}`, class: 'outliner-breadcrumb-sep' },
        ' › ',
      ),
    );
    if (item.current) {
      children.push(
        h(
          'span',
          { key: item.key, class: 'outliner-breadcrumb-current' },
          item.preview,
        ),
      );
    } else {
      children.push(
        h(
          'button',
          {
            key: item.key,
            class: 'outliner-breadcrumb-item',
            type: 'button',
            onClick: () => onFocusNode && onFocusNode(item.key),
          },
          item.preview,
        ),
      );
    }
  }
  return h('div', { class: 'outliner-breadcrumb' }, children);
};
harden(Breadcrumb);

/**
 * Disclosure / bullet marker. Mirrors `createBulletEl`
 * (outliner-component.js:1148): a clickable `outliner-collapse-handle`
 * (▼ expanded / ▶ collapsed) when the node has visible children, else a plain
 * `outliner-bullet` (•).
 *
 * @param {object} props
 * @param {string} props.nodeKey
 * @param {boolean} props.hasChildren
 * @param {boolean} props.collapsed
 * @param {(key: string) => void} [props.onToggleCollapse]
 */
const NodeDisclosure = ({
  nodeKey,
  hasChildren,
  collapsed,
  onToggleCollapse,
}) => {
  if (!hasChildren) {
    return h('span', { class: 'outliner-bullet' }, '•');
  }
  return h(
    'span',
    {
      class: 'outliner-collapse-handle',
      onClick: () => onToggleCollapse && onToggleCollapse(nodeKey),
    },
    collapsed ? '▶' : '▼',
  );
};
harden(NodeDisclosure);

/**
 * One type badge. Mirrors `createBadges` (outliner-component.js:1203):
 * `outliner-badge` plus the variant class.
 *
 * @param {object} props
 * @param {SnapshotBadge} props.badge
 */
const NodeBadge = ({ badge }) =>
  h('span', { class: `outliner-badge ${badge.className}` }, badge.label);
harden(NodeBadge);

/**
 * Author + edited-by meta row. Mirrors `createMetaEl`
 * (outliner-component.js:1463): an `outliner-author` span (with the resolved
 * display name) and, when edited, an `outliner-edited-by` span. The display
 * names are resolved controller-side (powers stay out of the confined tree, §5)
 * and arrive as primitive props.
 *
 * @param {object} props
 * @param {string} props.author - Author member id.
 * @param {string} props.authorName - Resolved author display name.
 * @param {string | undefined} props.editedBy - Winning-edit author member id.
 * @param {string | undefined} props.editedByName - Resolved editor display name.
 * @param {(memberId: string) => void} [props.onAuthorClick]
 * @param {(key: string) => void} [props.onShowHistory]
 * @param {string} props.nodeKey
 */
const NodeMeta = ({
  author,
  authorName,
  editedBy,
  editedByName,
  onAuthorClick,
  onShowHistory,
  nodeKey,
}) => {
  /** @type {import('preact').ComponentChild[]} */
  const children = [
    h(
      'span',
      {
        class: authorName ? 'outliner-author named' : 'outliner-author',
        'data-member-id': author,
        onClick: onAuthorClick ? () => onAuthorClick(author) : undefined,
      },
      authorName || `Member ${author}`,
    ),
  ];
  if (editedBy) {
    children.push(
      h(
        'span',
        {
          key: 'edited',
          class: 'outliner-edited-by',
          onClick: onShowHistory ? () => onShowHistory(nodeKey) : undefined,
        },
        'Edited by ',
        h(
          'span',
          {
            class: editedByName ? 'outliner-author named' : 'outliner-author',
            'data-member-id': editedBy,
          },
          editedByName || `Member ${editedBy}`,
        ),
      ),
    );
  }
  return h('div', { class: 'outliner-meta' }, children);
};
harden(NodeMeta);

/**
 * Row action buttons (Reply / React / Fork / Share / Bookmark / Focus /
 * Delete). Mirrors the action buttons + three-dot menu of `createCommittedNode`
 * (outliner-component.js:2202). Phase 2 renders the buttons but the real
 * handlers (and the menu / heritage-chain payloads) land in Phase 4; the
 * callbacks are optional so a button without a handler simply renders inert.
 *
 * @param {object} props
 * @param {string} props.nodeKey
 * @param {OutlinerCallbacks} props.callbacks
 */
const NodeActions = ({ nodeKey, callbacks }) => {
  // Phase-2 placeholder: a single actions container. Real per-action buttons,
  // the three-dot menu, and the React pill button are Phase-4 work; this keeps
  // the row DOM shape (an `outliner-node-actions` slot) stable for the CSS and
  // for the next phase to fill in.
  const { onReply } = callbacks;
  return h(
    'span',
    { class: 'outliner-node-actions' },
    onReply
      ? h(
          'button',
          {
            class: 'outliner-reply-button',
            type: 'button',
            title: 'Reply',
            onClick: () => onReply(nodeKey),
          },
          '↩',
        )
      : null,
  );
};
harden(NodeActions);

/**
 * One outliner node and its subtree. Mirrors `createCommittedNode`
 * (outliner-component.js:2168): an `outliner-node` div carrying `data-key` /
 * `data-depth` (and `outliner-draft` for drafts, `outliner-selected` for the
 * selection set), an `outliner-meta` row, an `outliner-node-row` (disclosure +
 * badges + the editable-line ANCHOR slot + actions), and a recursive
 * `outliner-children` container. Recursion is a nested `<OutlinerNode>`, the
 * `InventoryItem` → `InventoryList` precedent.
 *
 * Pure render: no effects (§7 — `node` and `callbacks` are fresh-identity
 * object props each confined render and must never be effect deps).
 *
 * @param {object} props
 * @param {OutlinerSnapshotNode} props.node
 * @param {(memberId: string) => string} props.resolveName - Member id → display
 *   name (resolved controller-side; powers never enter the confined tree, §5).
 * @param {OutlinerCallbacks} props.callbacks
 */
const OutlinerNode = ({ node, resolveName, callbacks }) => {
  const nodeClass = [
    'outliner-node',
    node.isDraft && 'outliner-draft',
    node.selected && 'outliner-selected',
  ]
    .filter(Boolean)
    .join(' ');

  const childrenClass = [
    'outliner-children',
    node.collapsed && 'outliner-children-collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  // The editable-line anchor slot. MUST stay empty in the confined tree so
  // Preact never diffs (and clobbers) the host-owned editable DOM. The host
  // re-parents its persistent `outliner-text` line into this div after render.
  const anchor = h('div', {
    class: 'outliner-text-anchor',
    'data-line-anchor': node.key,
  });

  const row = h(
    'div',
    { class: 'outliner-node-row' },
    h(NodeDisclosure, {
      nodeKey: node.key,
      hasChildren: node.hasChildren,
      collapsed: node.collapsed,
      onToggleCollapse: callbacks.onToggleCollapse,
    }),
    node.badges.map((badge, i) => h(NodeBadge, { key: `badge-${i}`, badge })),
    anchor,
    h(NodeActions, { nodeKey: node.key, callbacks }),
  );

  // Drafts carry no author/edited meta (mirrors `createDraft`, which omits the
  // meta row, outliner-component.js:2336).
  const meta = node.isDraft
    ? null
    : h(NodeMeta, {
        nodeKey: node.key,
        author: node.author,
        authorName: resolveName(node.author),
        editedBy: node.editedBy,
        editedByName: node.editedBy ? resolveName(node.editedBy) : undefined,
        onAuthorClick: callbacks.onAuthorClick,
        onShowHistory: callbacks.onShowHistory,
      });

  return h(
    'div',
    {
      class: nodeClass,
      'data-key': node.key,
      'data-depth': String(node.depth),
    },
    meta,
    row,
    h(
      'div',
      { class: childrenClass },
      node.children.map(child =>
        h(OutlinerNode, {
          key: child.key,
          node: child,
          resolveName,
          callbacks,
        }),
      ),
    ),
  );
};
harden(OutlinerNode);

/**
 * Confined root of the outliner structure tree (design §4). Renders the
 * focus-mode breadcrumb (when focused) followed by the recursive node forest
 * from a `snapshot` array of {@link OutlinerSnapshotNode}.
 *
 * @param {object} props
 * @param {OutlinerSnapshotNode[]} props.snapshot - Top-level nodes
 *   (`buildTreeSnapshot` output).
 * @param {string | undefined} [props.focusedKey] - Current focus-mode root, if
 *   any (drives whether the breadcrumb shows; the chain itself is in `breadcrumb`).
 * @param {BreadcrumbItem[]} [props.breadcrumb] - Ancestor chain for focus mode,
 *   computed controller-side.
 * @param {(memberId: string) => string} [props.resolveName] - Member id →
 *   display name; defaults to a `Member <id>` fallback.
 * @param {OutlinerCallbacks} [props.callbacks] - Host callbacks (optional so the
 *   tree renders before Phases 3–5 wire them).
 */
export const OutlinerRoot = ({
  snapshot,
  focusedKey,
  breadcrumb,
  resolveName,
  callbacks,
}) => {
  const resolve = resolveName || (memberId => `Member ${memberId}`);
  /** @type {OutlinerCallbacks} */
  const cb = callbacks || harden({});
  return h(
    'div',
    { class: 'outliner-root' },
    focusedKey
      ? h(Breadcrumb, {
          items: breadcrumb || [],
          onFocusNode: cb.onFocusNode,
        })
      : null,
    snapshot.map(node =>
      h(OutlinerNode, {
        key: node.key,
        node,
        resolveName: resolve,
        callbacks: cb,
      }),
    ),
  );
};
harden(OutlinerRoot);
