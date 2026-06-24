// @ts-check

import harden from '@endo/harden';

import { h } from 'preact';
import { useState } from 'preact/hooks';

import { filterSlashCommands } from './slash-commands.js';

/** @import { OutlinerSnapshotNode, SnapshotBadge, SnapshotReact } from './tree-snapshot.js' */
/** @import { SlashCommand } from './slash-commands.js' */
/** @import { EditQueueEntry } from '../edit-queue.js' */

// String-only drag-data MIME for outliner node drags, mirroring the inventory
// precedent's `ENDO_PETNAME_MIME` (space-chat/src/inventory/inventory.js). The
// payload is a comma-joined list of dragged node keys — plain strings, NEVER a
// `File` / `FileSystemEntry` / DOM node. The confined affordance reads/writes it
// over the narrow `SafeDataTransfer` facade (string-only by construction); there
// is no `.files` access anywhere in this layer.
export const OUTLINER_DRAG_MIME = 'application/x-endo-outliner-keys';
harden(OUTLINER_DRAG_MIME);

/**
 * The string-only drag-data facade a confined drag handler receives in place of
 * the real `DataTransfer` (preact-container `makeSafeDataTransfer`,
 * renderer.js:559). Declared locally so this structure module needs no
 * cross-package dependency on the host renderer; it is structurally the subset
 * of `SafeDataTransfer` this layer uses. NEVER carries `.files` — read access to
 * the user's filesystem is exactly what the facade exists to withhold.
 *
 * @typedef {object} DragData
 * @property {(format: string) => string} getData
 * @property {(format: string, data: string) => void} setData
 * @property {readonly string[]} types
 * @property {string} effectAllowed
 * @property {string} dropEffect
 */

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
 *   profile popup (real data resolved host-side; §5).
 * @property {(key: string) => void} [onShowHistory] - Open the edit-history
 *   popup for a node (edit queue resolved host-side).
 * @property {(key: string) => void} [onReply] - Reply action: the controller
 *   resolves the author name and calls `options.onReply`.
 * @property {(key: string) => void} [onReact] - Open the react picker for a
 *   node (the picker is host-side, `reactSystem.showReactPicker`).
 * @property {(key: string) => void} [onFork] - Fork action: controller computes
 *   `getHeritageChain(key)` and calls `options.onFork`.
 * @property {(key: string) => void} [onShare] - Share action: controller
 *   computes `getHeritageChain(key)` and calls `options.onShare`.
 * @property {(key: string) => void} [onBookmark] - Bookmark action: controller
 *   computes a preview and calls `options.onBookmark`.
 * @property {(key: string) => void} [onDelete] - Delete action → `postDeletion`.
 * @property {(key: string, emoji: string, mine: boolean) => void} [onToggleReact]
 *   - Toggle a react pill: `post(...,'redact-react')` when `mine`, else
 *   `post(...,'react')`.
 * @property {(key: string, action: 'up' | 'down' | 'select' | 'cancel') => void} [onSlashNav]
 *   - Slash-menu keyboard navigation routed from the island while the menu is
 *   open (move selection / apply / dismiss).
 * @property {(key: string, cmd: SlashCommand) => void} [onSlashSelect] - Apply a
 *   slash command picked by mouse (sets the draft's replyType, clears the text).
 * @property {(key: string) => void} [onSlashDismiss] - Dismiss the slash menu
 *   (backdrop click).
 * @property {(key: string, dataTransfer: DragData | undefined) => void} [onDragStart]
 *   - Begin dragging a node: the confined affordance writes the dragged keys
 *   into the string-only `SafeDataTransfer` (the inventory precedent); the
 *   controller records the dragged set (defaulting to the node itself or the
 *   whole selection). NO geometry here — see `onDragOver`.
 * @property {(key: string, clientY: number, dataTransfer: DragData | undefined) => void} [onDragOver]
 *   - Dragging over a node: the confined event carries only the cursor `clientY`
 *   (a `SafeEvent` has no rects); the controller measures the live mount
 *   geometry, runs the pure `findDropPosition`, and moves the drop indicator.
 * @property {(key: string) => void} [onDragLeave] - Pointer left a node row.
 * @property {(key: string, clientY: number, dataTransfer: DragData | undefined) => void} [onDrop]
 *   - Drop onto a node: the controller re-measures at `clientY`, computes the
 *   final drop position from the snapshot, and posts the `move`(s).
 * @property {() => void} [onDragEnd] - Drag finished (cleanup the dragging /
 *   drop-target state + indicator).
 */

/**
 * The confined slash-menu view state for the active draft, held by the
 * controller and passed down as a prop. `null` (or absent) means no menu.
 *
 * @typedef {object} SlashMenuState
 * @property {string} key - The draft key the menu is anchored to.
 * @property {string} query - The current query (text after `/`).
 * @property {number} selectedIndex - Highlighted command index (into the
 *   FILTERED list).
 */

/**
 * Profile-popup data resolved host-side (member info from `getMember` /
 * `reverseLocate`) and passed to the confined `ProfilePopup` as a prop. `null`
 * (or absent) means no popup. Mirrors the imperative `profilePopup.show(...)`
 * payload (outliner-component.js:1372).
 *
 * @typedef {object} ProfilePopupState
 * @property {string} memberId
 * @property {string} proposedName
 * @property {string[]} pedigree
 * @property {string[]} [pedigreeMemberIds]
 * @property {string | undefined} yourName - The viewer's assigned name, if any.
 */

/**
 * Edit-history popup data resolved host-side (the `editQueue` from
 * `computeNodeContent`) and passed to the confined `EditHistoryPopup`. `null`
 * (or absent) means no popup. Mirrors `showEditHistory`
 * (outliner-component.js:1241).
 *
 * @typedef {object} EditHistoryState
 * @property {string} key - The node whose history this is.
 * @property {Array<{ memberId: string, memberName: string, date: string, deleted: boolean, text: string }>} entries
 *   - One row per edit (already author-name-resolved + content-joined).
 */

/**
 * Popup callbacks the confined popups raise. Separate from `OutlinerCallbacks`
 * because they belong to the root-level popup overlay, not per-node rows.
 *
 * @typedef {object} PopupCallbacks
 * @property {() => void} [onCloseProfile] - Dismiss the profile popup.
 * @property {(memberId: string, name: string) => void} [onAssignName] - Assign a
 *   pet name to a member (host saves it + re-renders).
 * @property {() => void} [onCloseHistory] - Dismiss the edit-history popup.
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
 * (outliner-component.js:2202): a Reply button, a React button, and a three-dot
 * menu whose items (Fork / Share / Bookmark / Focus / Delete) are gated on the
 * presence of the corresponding callback exactly as the original gates them on
 * `options.onFork`/`onShare`/`onBookmark`. The menu is opened by the three-dot
 * button and dismissed via an in-tree backdrop (§7 — no `document` listeners);
 * its open/closed state is confined component state (`useState`), keyed by
 * remount on `nodeKey` so it never leaks across nodes.
 *
 * @param {object} props
 * @param {string} props.nodeKey
 * @param {OutlinerCallbacks} props.callbacks
 */
const NodeActions = ({ nodeKey, callbacks }) => {
  const {
    onReply,
    onReact,
    onFork,
    onShare,
    onBookmark,
    onFocusNode,
    onDelete,
  } = callbacks;

  const [menuOpen, setMenuOpen] = useState(false);

  /** @type {Array<{ label: string, icon: string, className: string, handler: () => void }>} */
  const menuItems = [];
  if (onFork) {
    menuItems.push({
      label: 'Fork to Channel',
      icon: '⑂',
      className: 'outliner-menu-fork',
      handler: () => onFork(nodeKey),
    });
  }
  if (onShare) {
    menuItems.push({
      label: 'Share…',
      icon: '⇗',
      className: 'outliner-menu-share',
      handler: () => onShare(nodeKey),
    });
  }
  if (onBookmark) {
    menuItems.push({
      label: 'Bookmark',
      icon: '★',
      className: 'outliner-menu-bookmark',
      handler: () => onBookmark(nodeKey),
    });
  }
  // Focus + Delete are always present (mirrors the original which pushes them
  // unconditionally), routed through the focus / delete callbacks.
  menuItems.push({
    label: 'Focus',
    icon: '⌖',
    className: 'outliner-menu-focus',
    handler: () => onFocusNode && onFocusNode(nodeKey),
  });
  menuItems.push({
    label: 'Delete',
    icon: '✗',
    className: 'outliner-menu-delete',
    handler: () => onDelete && onDelete(nodeKey),
  });

  /** @param {() => void} handler */
  const runItem = handler => {
    setMenuOpen(false);
    handler();
  };

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
    onReact
      ? h(
          'button',
          {
            class: 'react-button',
            type: 'button',
            title: 'React',
            onClick: () => onReact(nodeKey),
          },
          '😀',
        )
      : null,
    h(
      'span',
      { class: 'message-menu outliner-node-menu' },
      h(
        'button',
        {
          class: 'message-menu-button',
          type: 'button',
          title: 'More',
          onClick: () => setMenuOpen(open => !open),
        },
        '⋯',
      ),
      menuOpen
        ? h(
            'span',
            {
              class: 'outliner-node-menu-popup-wrap',
              style: 'display: contents',
            },
            // In-tree backdrop dismissal (§7): a sibling backdrop whose click
            // closes the menu, instead of an ambient `document` listener.
            h('div', {
              class: 'message-menu-backdrop',
              onClick: () => setMenuOpen(false),
            }),
            h(
              'div',
              { class: 'message-menu-dropdown' },
              menuItems.map(item =>
                h(
                  'button',
                  {
                    key: item.label,
                    class: `message-menu-item ${item.className}`,
                    type: 'button',
                    onClick: () => runItem(item.handler),
                  },
                  h('span', { class: 'message-menu-icon' }, item.icon),
                  item.label,
                ),
              ),
            ),
          )
        : null,
    ),
  );
};
harden(NodeActions);

/**
 * The slash-command menu for a draft (design §4 `SlashMenu`). Renders the
 * filtered {@link SlashCommand} list with the highlighted row, mirroring
 * `showSlashMenu` (outliner-component.js:1599): each row is an
 * `outliner-slash-item` with a type badge and a description, and the selected
 * row carries `selected`. Picking a row (mousedown, to beat the editable line's
 * blur) calls `onSlashSelect`. Dismissed via an in-tree backdrop (§7).
 *
 * Authority-free: filtering is the pure `filterSlashCommands`; the highlighted
 * index and query are primitives from the controller's `SlashMenuState`.
 *
 * @param {object} props
 * @param {string} props.nodeKey - The draft key the menu is anchored to.
 * @param {string} props.query - Text after the `/`.
 * @param {number} props.selectedIndex - Highlighted row (into the filtered list).
 * @param {(key: string, cmd: SlashCommand) => void} [props.onSelect]
 * @param {(key: string) => void} [props.onDismiss]
 */
const SlashMenu = ({ nodeKey, query, selectedIndex, onSelect, onDismiss }) => {
  const filtered = filterSlashCommands(query);
  if (filtered.length === 0) {
    return null;
  }
  const clamped = Math.max(0, Math.min(selectedIndex, filtered.length - 1));
  return h(
    'span',
    { class: 'outliner-slash-menu-wrap', style: 'display: contents' },
    h('div', {
      class: 'outliner-slash-backdrop',
      onClick: () => onDismiss && onDismiss(nodeKey),
    }),
    h(
      'div',
      { class: 'outliner-slash-menu' },
      filtered.map((cmd, i) =>
        h(
          'div',
          {
            key: cmd.command,
            class:
              i === clamped
                ? 'outliner-slash-item selected'
                : 'outliner-slash-item',
            // `mousedown` (not click) so the selection lands before the
            // editable line blurs and commits, matching the original
            // (outliner-component.js:1644).
            onMouseDown: e => {
              e.preventDefault();
              if (onSelect) onSelect(nodeKey, cmd);
            },
          },
          h(
            'span',
            { class: `outliner-badge ${cmd.badgeClassName}` },
            cmd.label,
          ),
          h('span', { class: 'outliner-slash-desc' }, cmd.description),
        ),
      ),
    ),
  );
};
harden(SlashMenu);

/**
 * React pills row (design §4 `Reacts`). Mirrors `buildReactsContainer` /
 * `buildReactPill` (react-utils.js:620/547): a `react-pills` container of
 * `react-pill` buttons, with `react-pill-own` on the viewer's own reactions and
 * a `emoji count` label when more than one member reacted. Toggling a pill
 * calls `onToggleReact`, which the controller turns into a `react` /
 * `redact-react` post. Sub-reacts and the hover member list (which need
 * `E()`/async name resolution) stay host-side and are out of scope for the
 * confined row.
 *
 * @param {object} props
 * @param {string} props.nodeKey
 * @param {SnapshotReact[]} props.reacts
 * @param {(key: string, emoji: string, mine: boolean) => void} [props.onToggleReact]
 */
const Reacts = ({ nodeKey, reacts, onToggleReact }) => {
  if (!reacts || reacts.length === 0) {
    return null;
  }
  return h(
    'span',
    { class: 'react-pills' },
    reacts.map(react =>
      h(
        'span',
        { key: react.emoji, class: 'react-pill-wrapper' },
        h(
          'button',
          {
            class: react.mine ? 'react-pill react-pill-own' : 'react-pill',
            type: 'button',
            title: `${react.emoji} (${react.count})`,
            onClick: () =>
              onToggleReact && onToggleReact(nodeKey, react.emoji, react.mine),
          },
          react.count > 1 ? `${react.emoji} ${react.count}` : react.emoji,
        ),
      ),
    ),
  );
};
harden(Reacts);

/**
 * One pedigree entry of the profile popup. Prefers the viewer's assigned name
 * (rendered `named`); falls back to the proposed name in scare quotes. Mirrors
 * `renderPedigreeName` (profile-popup.js:54) but reads names from a plain
 * `assignedNames` record (no `Map` enters the confined tree).
 *
 * @param {string} name
 * @param {number} index
 * @param {string[] | undefined} pedigreeMemberIds
 * @param {Record<string, string>} assignedNames
 */
const renderPedigreeName = (name, index, pedigreeMemberIds, assignedNames) => {
  const memberId = pedigreeMemberIds && pedigreeMemberIds[index];
  const assigned = memberId ? assignedNames[memberId] : undefined;
  if (assigned) {
    return h(
      'span',
      { class: 'pedigree-name named', title: `Proposed: “${name}”` },
      assigned,
    );
  }
  return h('span', { class: 'pedigree-name' }, `“${name}”`);
};
harden(renderPedigreeName);

/**
 * Confined author profile popup. Mirrors `profile-popup.js`'s `ProfilePopup`
 * (the migrated confined popup) but is rendered inline in the outliner tree
 * with its data supplied as a prop (resolved host-side from `getMember` /
 * `reverseLocate`, §5). Dismisses via an in-tree backdrop and an Escape handler
 * on a `display: contents` wrapper — no ambient `document` listeners (§7). The
 * assign-name field is a controlled input (confined handlers see only a frozen
 * `SafeEvent`).
 *
 * @param {object} props
 * @param {ProfilePopupState} props.data
 * @param {Record<string, string>} props.assignedNames - memberId → assigned name
 *   (plain record; the confined tree never sees the host `Map`).
 * @param {() => void} props.onClose
 * @param {(memberId: string, name: string) => void} [props.onAssignName]
 */
const ProfilePopup = ({ data, assignedNames, onClose, onAssignName }) => {
  const { memberId, proposedName, pedigree, pedigreeMemberIds, yourName } =
    data;
  const [nameValue, setNameValue] = useState(yourName || '');

  const submitName = () => {
    const name = nameValue.trim();
    if (name) {
      if (onAssignName) onAssignName(memberId, name);
      onClose();
    }
  };

  /** @type {Array<import('preact').VNode | string>} */
  const chainParts = [];
  if (pedigree.length === 0) {
    chainParts.push(
      h('span', { class: 'pedigree-creator' }, 'Channel Creator'),
    );
  } else {
    pedigree.forEach((name, index) => {
      chainParts.push(
        renderPedigreeName(name, index, pedigreeMemberIds, assignedNames),
      );
      chainParts.push(h('span', { class: 'pedigree-arrow' }, ' → '));
    });
    chainParts.push(
      h('span', { class: 'pedigree-name pedigree-self' }, `“${proposedName}”`),
    );
  }

  return h(
    'div',
    {
      style: 'display: contents',
      /** @param {{ key?: string }} e */
      onKeyDown: e => {
        if (e.key === 'Escape') onClose();
      },
    },
    h('div', { class: 'profile-popup-backdrop', onClick: onClose }),
    h(
      'div',
      { class: 'profile-popup' },
      h(
        'div',
        { class: 'profile-popup-header' },
        h('span', { class: 'profile-proposed-name' }, `“${proposedName}”`),
        h(
          'button',
          {
            type: 'button',
            class: 'profile-popup-close',
            title: 'Close',
            onClick: onClose,
          },
          '×',
        ),
      ),
      h(
        'div',
        { class: 'profile-popup-body' },
        h(
          'div',
          { class: 'profile-popup-field' },
          h('label', null, 'Your Name for Them'),
          h('input', {
            type: 'text',
            class: 'profile-assign-name',
            placeholder: 'Assign a pet name…',
            value: nameValue,
            autofocus: true,
            /** @param {{ target: { value: string } }} e */
            onInput: e => setNameValue(e.target.value),
            /** @param {{ key?: string, preventDefault: () => void }} e */
            onKeyDown: e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitName();
              }
            },
          }),
        ),
        h(
          'div',
          { class: 'profile-popup-field' },
          h('label', null, 'Invitation Chain'),
          h('div', { class: 'pedigree-chain' }, ...chainParts),
        ),
      ),
      h(
        'div',
        { class: 'profile-popup-actions' },
        h(
          'button',
          { type: 'button', class: 'profile-save-btn', onClick: submitName },
          'Save Name',
        ),
      ),
    ),
  );
};
harden(ProfilePopup);

/**
 * Confined edit-history popup. Mirrors `showEditHistory`
 * (outliner-component.js:1241): a header with the edit count + close button and
 * a list of `outliner-edit-history-entry` rows (author name + relative date +
 * a "reverted" tag for deleted edits, then the content). The entries are
 * already author-name-resolved + date-formatted host-side. Dismisses via an
 * in-tree backdrop + Escape on a `display: contents` wrapper (§7).
 *
 * @param {object} props
 * @param {EditHistoryState} props.data
 * @param {() => void} props.onClose
 */
const EditHistoryPopup = ({ data, onClose }) =>
  h(
    'div',
    {
      style: 'display: contents',
      /** @param {{ key?: string }} e */
      onKeyDown: e => {
        if (e.key === 'Escape') onClose();
      },
    },
    h('div', { class: 'outliner-edit-history-backdrop', onClick: onClose }),
    h(
      'div',
      { class: 'outliner-edit-history' },
      h(
        'div',
        { class: 'outliner-edit-history-header' },
        `Edit History (${data.entries.length})`,
        h(
          'button',
          {
            type: 'button',
            class: 'outliner-edit-history-close',
            onClick: onClose,
          },
          '×',
        ),
      ),
      h(
        'div',
        { class: 'outliner-edit-history-list' },
        data.entries.map((entry, i) =>
          h(
            'div',
            {
              key: `${i}`,
              class: entry.deleted
                ? 'outliner-edit-history-entry outliner-edit-deleted'
                : 'outliner-edit-history-entry',
            },
            h(
              'div',
              { class: 'outliner-edit-history-meta' },
              h('span', { class: 'outliner-author named' }, entry.memberName),
              ` · ${entry.date}`,
              entry.deleted
                ? h(
                    'span',
                    { class: 'outliner-edit-history-deleted-tag' },
                    'reverted',
                  )
                : null,
            ),
            h('div', { class: 'outliner-edit-history-content' }, entry.text),
          ),
        ),
      ),
    ),
  );
harden(EditHistoryPopup);

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
 * @param {SlashMenuState | null} [props.slashMenu] - The active slash-menu state
 *   (only one node at a time); the menu renders on the node whose `key` matches.
 */
const OutlinerNode = ({ node, resolveName, callbacks, slashMenu }) => {
  const nodeClass = [
    'outliner-node',
    node.isDraft && 'outliner-draft',
    node.selected && 'outliner-selected',
    node.dragging && 'outliner-dragging',
    node.dropTarget && 'outliner-drop-target',
  ]
    .filter(Boolean)
    .join(' ');

  // DnD over the string-only `SafeDataTransfer` (the inventory precedent). The
  // confined affordance only WRITES the dragged keys and reads the cursor
  // `clientY`; it never touches geometry (a `SafeEvent` has no rects), so the
  // controller measures the mount and decides the drop. Drafts are not
  // draggable / droppable (mirrors the original, which only drags committed
  // nodes).
  const dnd = node.isDraft
    ? {}
    : {
        draggable: true,
        /** @param {{ dataTransfer?: DragData }} e */
        onDragStart: e => {
          if (callbacks.onDragStart)
            callbacks.onDragStart(node.key, e.dataTransfer);
        },
        /** @param {{ preventDefault: () => void, clientY: number, dataTransfer?: DragData }} e */
        onDragOver: e => {
          if (!e.dataTransfer) return;
          if (!e.dataTransfer.types.includes(OUTLINER_DRAG_MIME)) return;
          // preventDefault marks this a valid drop target (WHATWG DnD).
          e.preventDefault();
          if (callbacks.onDragOver)
            callbacks.onDragOver(node.key, e.clientY, e.dataTransfer);
        },
        /** @param {unknown} _e */
        onDragLeave: _e => {
          if (callbacks.onDragLeave) callbacks.onDragLeave(node.key);
        },
        /** @param {{ preventDefault: () => void, clientY: number, dataTransfer?: DragData }} e */
        onDrop: e => {
          if (!e.dataTransfer) return;
          if (!e.dataTransfer.types.includes(OUTLINER_DRAG_MIME)) return;
          e.preventDefault();
          if (callbacks.onDrop)
            callbacks.onDrop(node.key, e.clientY, e.dataTransfer);
        },
        /** @param {unknown} _e */
        onDragEnd: _e => {
          if (callbacks.onDragEnd) callbacks.onDragEnd();
        },
      };

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

  // Slash menu: rendered on the draft whose key matches the controller's active
  // slash-menu state. The island owns the caret; the menu is a confined sibling.
  const slash =
    slashMenu && slashMenu.key === node.key
      ? h(SlashMenu, {
          nodeKey: node.key,
          query: slashMenu.query,
          selectedIndex: slashMenu.selectedIndex,
          onSelect: callbacks.onSlashSelect,
          onDismiss: callbacks.onSlashDismiss,
        })
      : null;

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
    // React pills sit on the row (mirrors `renderReactsOnElement`, which
    // appends `.react-pills` onto `$row`, react-utils.js:638).
    node.isDraft
      ? null
      : h(Reacts, {
          nodeKey: node.key,
          reacts: node.reacts,
          onToggleReact: callbacks.onToggleReact,
        }),
    h(NodeActions, { nodeKey: node.key, callbacks }),
    slash,
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

  // Between-rows drop line, placed by the controller on exactly one node after
  // it measured the mount geometry. `display: contents` so the indicator does
  // not perturb layout; the `above`/`below` modifier drives its CSS position.
  const indicator = node.dropIndicator
    ? h('div', {
        class: `outliner-drop-indicator outliner-drop-indicator-${node.dropIndicator}`,
      })
    : null;

  return h(
    'div',
    {
      class: nodeClass,
      'data-key': node.key,
      'data-depth': String(node.depth),
      ...dnd,
    },
    node.dropIndicator === 'above' ? indicator : null,
    meta,
    row,
    node.dropIndicator === 'below' ? indicator : null,
    h(
      'div',
      { class: childrenClass },
      node.children.map(child =>
        h(OutlinerNode, {
          key: child.key,
          node: child,
          resolveName,
          callbacks,
          slashMenu,
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
 * @param {SlashMenuState | null} [props.slashMenu] - Active slash-menu state.
 * @param {ProfilePopupState | null} [props.profilePopup] - Active profile popup.
 * @param {EditHistoryState | null} [props.editHistory] - Active edit-history popup.
 * @param {Record<string, string>} [props.assignedNames] - memberId → assigned
 *   name (plain record for the profile popup's pedigree rendering).
 * @param {PopupCallbacks} [props.popupCallbacks] - Popup dismiss / assign-name.
 */
export const OutlinerRoot = ({
  snapshot,
  focusedKey,
  breadcrumb,
  resolveName,
  callbacks,
  slashMenu,
  profilePopup,
  editHistory,
  assignedNames,
  popupCallbacks,
}) => {
  const resolve = resolveName || (memberId => `Member ${memberId}`);
  /** @type {OutlinerCallbacks} */
  const cb = callbacks || harden({});
  /** @type {PopupCallbacks} */
  const pcb = popupCallbacks || harden({});
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
        slashMenu: slashMenu || null,
      }),
    ),
    profilePopup
      ? h(ProfilePopup, {
          data: profilePopup,
          assignedNames: assignedNames || harden({}),
          onClose: () => pcb.onCloseProfile && pcb.onCloseProfile(),
          onAssignName: pcb.onAssignName,
        })
      : null,
    editHistory
      ? h(EditHistoryPopup, {
          data: editHistory,
          onClose: () => pcb.onCloseHistory && pcb.onCloseHistory(),
        })
      : null,
  );
};
harden(OutlinerRoot);
