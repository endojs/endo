// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { ChannelMessage, ChannelRef } from '@endo/space-channel/channel-utils.js' */
/** @import { TreeStore } from '@endo/space-channel/outliner/tree-source.js' */
/** @import { SnapshotViewState, OutlinerSnapshotNode } from '@endo/space-channel/outliner/tree-snapshot.js' */
/** @import { EditableLine, LineContent, EnterIntent } from '@endo/space-channel/outliner/editable-line.js' */
/** @import { DraftStore, DraftNode, ParsedContent } from '@endo/space-channel/outliner/controller-intents.js' */
/** @import { OutlinerCallbacks, BreadcrumbItem } from '@endo/space-channel/outliner/outliner-structure.js' */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { isVisibleReplyType } from '@endo/space-channel/edit-queue.js';
import {
  getEffectiveParent,
  getEffectiveSortOrder,
  getHeritageChain,
  getSortedVisibleChildren,
} from '@endo/space-channel/outliner/tree-source.js';
import { buildTreeSnapshot } from '@endo/space-channel/outliner/tree-snapshot.js';
import {
  makeDraftStore,
  postDeletion,
  postDraft,
  postEdit,
  postMove,
} from '@endo/space-channel/outliner/controller-intents.js';
import { makeEditableLine } from '@endo/space-channel/outliner/editable-line.js';
import { OutlinerRoot } from '@endo/space-channel/outliner/outliner-structure.js';

import { h, renderConfined, unmount } from './setup-preact-container.js';

// Phase-2 host wrapper / controller for the outliner-confinement migration. It
// coexists with the imperative `space-channel/src/outliner-component.js` under a
// NEW name; Phase 5 renames/swaps it. Mirrors `inbox-component.js`: it resolves
// a dedicated mount, owns the `followMessages` subscription, builds the live
// tree `store` + view state, calls `buildTreeSnapshot`, and renders the CONFINED
// `OutlinerRoot` through `renderConfined`. The editable text of each node is a
// HOST-OWNED island (`makeEditableLine`): the controller keeps one persistent
// `contentEditable` line per node and re-parents it into its
// `[data-line-anchor]` slot after every confined render (the define-form /
// outliner-spike anchor-slot pattern), so Preact never owns the editable DOM and
// the live caret survives re-renders.
//
// SCOPE — Phase 2 wires the READ path end to end (messages → store → snapshot →
// confined render → re-parented editable lines with content + chips +
// selection). The editable lines accept input and call `onInput`/`onCommit`, but
// keyboard tree-manipulation, draft creation, slash menu, actions, and DnD are
// Phases 3–5: they are left as clean callback seams on `callbacks` (see the
// TODO-tagged stubs below), not implemented here.

/**
 * Resolve the absolute source of truth for the outliner tree from the channel
 * message stream. This mirrors the ingestion bookkeeping of the imperative
 * `for await (const message of messageIterator)` loop
 * (outliner-component.js:2813): per message it updates `messageIndex` /
 * `replyChildren` / `rootKeys` and applies `move` overrides eagerly into
 * `moveOverrides` / `parentOverrides`. It does NOT touch the DOM — the snapshot
 * builder and confined render do.
 *
 * @param {TreeStore} store
 * @param {ChannelMessage} message
 */
const ingestMessage = (store, message) => {
  const msgKey = String(message.number);
  store.messageIndex.set(msgKey, { message });

  if (message.replyTo) {
    const parentKey = message.replyTo;
    const siblings = store.replyChildren.get(parentKey);
    if (siblings) {
      siblings.push(msgKey);
    } else {
      store.replyChildren.set(parentKey, [msgKey]);
    }
  } else if (isVisibleReplyType(message.replyType)) {
    store.rootKeys.push(msgKey);
  }

  if (message.replyType === 'move' && message.replyTo) {
    const sortOrder = parseFloat(message.strings[0]);
    if (!Number.isNaN(sortOrder)) {
      store.moveOverrides.set(message.replyTo, sortOrder);
    }
    if (message.strings.length > 1) {
      const newParent =
        message.strings[1] === '' ? undefined : message.strings[1];
      store.parentOverrides.set(message.replyTo, newParent);
    }
  }
};
harden(ingestMessage);

/**
 * Flatten a snapshot forest into a key → node map, so the controller can drive
 * its editable-line `Map` (create / update / remove) without re-walking the
 * tree at each call site.
 *
 * @param {OutlinerSnapshotNode[]} snapshot
 * @param {Map<string, OutlinerSnapshotNode>} [into]
 * @returns {Map<string, OutlinerSnapshotNode>}
 */
const flattenSnapshot = (snapshot, into = new Map()) => {
  for (const node of snapshot) {
    into.set(node.key, node);
    flattenSnapshot(node.children, into);
  }
  return into;
};
harden(flattenSnapshot);

/**
 * Flatten a snapshot forest into the VISIBLE document-order list of keys — the
 * controller-side replacement for `getAllVisibleTextNodes`
 * (outliner-component.js:365) and its `querySelectorAll('.outliner-text')`. This
 * is the ONLY authority on document order; islands never scrape sibling DOM
 * (§3.4). Children of a collapsed node are omitted, exactly as the original
 * skipped `.outliner-children-collapsed` subtrees.
 *
 * @param {OutlinerSnapshotNode[]} snapshot
 * @param {string[]} [into]
 * @returns {string[]}
 */
const flattenVisibleOrder = (snapshot, into = []) => {
  for (const node of snapshot) {
    into.push(node.key);
    if (!node.collapsed) {
      flattenVisibleOrder(node.children, into);
    }
  }
  return into;
};
harden(flattenVisibleOrder);

/**
 * Convert the island's `{ strings, names }` line content into the intent
 * layer's `{ strings, petNames, edgeNames }`. The chip carries one name used for
 * both the pet-name path and the edge name (the island's `renderContent` sets
 * `dataset.petName === dataset.edgeName`), so both columns are the name list.
 *
 * @param {LineContent} content
 * @returns {ParsedContent}
 */
const lineContentToParsed = content =>
  harden({
    strings: [...content.strings],
    petNames: [...content.names],
    edgeNames: [...content.names],
  });
harden(lineContentToParsed);

/**
 * Mount the confined outliner into `$parent` (before `$end`). Returns a
 * `dispose()` that cancels the message iterator and unmounts the confined tree.
 *
 * @param {HTMLElement} $parent - The host's scroll container.
 * @param {HTMLElement | null} $end - Anchor to insert the dedicated mount before.
 * @param {unknown} channel - The channel ref (E-able; `followMessages` / member
 *   queries stay controller-side, never enter the confined tree).
 * @param {object} [options]
 * @param {ERef<EndoHost>} [options.powers] - Host powers; controller-only (§5).
 * @param {(info: import('@endo/space-channel/outliner/controller-intents.js').MentionNotify) => void} [options.onMentionNotify]
 *   Post-commit hook fired when a posted edit/draft carries at-mentions (§5).
 * @returns {Promise<{ dispose: () => void }>}
 */
export const outlinerComponentNext = async (
  $parent,
  $end,
  channel,
  options = {},
) => {
  // Dedicated child mount so `renderConfined` (which reconciles against ALL
  // children of its mount) never clobbers the scroll anchor or sibling status
  // nodes, exactly as inbox-component.js does.
  const $mount = document.createElement('div');
  $parent.insertBefore($mount, $end);
  const isLive = () => $mount.isConnected;

  // ---- Tree store (the Phase-1 `TreeStore` shape) ----
  /** @type {TreeStore} */
  const store = {
    messageIndex: new Map(),
    replyChildren: new Map(),
    moveOverrides: new Map(),
    parentOverrides: new Map(),
    rootKeys: [],
    blockedMemberIds: new Set(),
  };

  // ---- Draft store (Phase-1 `makeDraftStore`) ----
  // Owns the uncommitted-draft map + the `draft-N` id counter. The view's
  // `drafts` map IS this store's map, so `buildTreeSnapshot` renders drafts as
  // `isDraft` confined nodes with their own editable lines.
  const draftStore = makeDraftStore();

  // Drafts that have been posted but whose echo has not yet arrived. The
  // controller keeps them visible (the imperative `outliner-draft-pending`
  // class) so `matchPendingDraft` can dedup the echo. Lives controller-side
  // because "pending" is controller bookkeeping (§7 / outliner-component.js:2476).
  /** @type {Set<string>} */
  const pendingDrafts = new Set();

  // ---- View state (the Phase-1 `SnapshotViewState` shape) ----
  // `editingKey` is the key of the line the user is actively editing (tracked
  // via island focus/blur). It guards re-render from clobbering that line's
  // content mid-edit (§3.4) and feeds the snapshot's `editing` flag. `drafts`
  // is the draft store's own map so drafts render.
  /** @type {SnapshotViewState} */
  const view = {
    collapsedNodes: new Set(),
    selectedNodes: new Set(),
    focusedKey: undefined,
    editingKey: undefined,
    drafts: draftStore.drafts,
  };

  // ---- Author-name resolution (controller-side; powers never enter the tree) ----
  // A synchronous cache the confined `resolveName` reads; member info is fetched
  // lazily and a resolved name triggers a re-render so the meta row updates.
  /** @type {Map<string, string>} */
  const nameMap = new Map();
  /** @type {Set<string>} */
  const pendingNames = new Set();

  /** @param {string} memberId */
  const resolveName = memberId => nameMap.get(memberId) || '';

  /** @param {string} memberId */
  const requestName = memberId => {
    if (!memberId || nameMap.has(memberId) || pendingNames.has(memberId)) {
      return;
    }
    pendingNames.add(memberId);
    Promise.resolve(E(/** @type {ChannelRef} */ (channel)).getMember(memberId))
      .then(info => {
        pendingNames.delete(memberId);
        const proposedName = info ? info.proposedName : undefined;
        if (proposedName) {
          nameMap.set(memberId, proposedName);
          if (isLive()) scheduleRender();
        }
      })
      .catch(() => {
        pendingNames.delete(memberId);
      });
  };

  // ---- Editable-line island map (one persistent host line per node) ----
  /** @type {Map<string, EditableLine>} */
  const lines = new Map();

  // The live edit buffer per editing line, mirroring the imperative
  // `dirtyNodes` + each draft's `text`. For committed nodes we remember the
  // latest parsed content so a blur commit can compare against the effective
  // content; for drafts we update the draft's `text` so `matchPendingDraft`
  // works against the echo.
  /** @type {Map<string, LineContent>} */
  const editBuffers = new Map();
  /** @type {Set<string>} */
  const dirtyNodes = new Set();
  // Serialized effective content last pushed into each committed line, so the
  // in-place content-update path only re-renders when the projection actually
  // changed (and never on the line being edited — the `editingKey` guard).
  /** @type {Map<string, string>} */
  const renderedContent = new Map();

  /** @param {string} key */
  const isDraftKey = key => draftStore.getDraft(key) !== undefined;

  // ---- Editable-line OUT-callback handlers (island → controller intents) ----

  /** @type {(key: string, parsed: LineContent) => void} */
  const onLineInput = (key, parsed) => {
    editBuffers.set(key, parsed);
    const draft = draftStore.getDraft(key);
    if (draft) {
      // Keep the draft's text current so its echo can be matched/deduped.
      draft.text = parsed.strings.join('').trim();
    } else {
      dirtyNodes.add(key);
    }
  };

  /**
   * Commit a committed node's edit. Mirrors `commitNodeEdit`
   * (outliner-component.js:1068): only post when the node is dirty AND the text
   * actually changed (or names were added).
   *
   * @param {string} key
   * @param {LineContent} parsed
   */
  const commitEdit = (key, parsed) => {
    if (!dirtyNodes.has(key)) return;
    dirtyNodes.delete(key);
    const entry = store.messageIndex.get(key);
    if (!entry) return;
    const effective = getEffectiveFor(key);
    const oldText = effective.strings.join('');
    const newText = parsed.strings.join('');
    if (newText === oldText && parsed.names.length === 0) return;
    postEdit({
      channel,
      powers: options.powers,
      replyTo: String(entry.message.number),
      parsed: lineContentToParsed(parsed),
      onMentionNotify: options.onMentionNotify,
    });
  };

  /**
   * Commit a draft to the channel. Mirrors `commitDraft`
   * (outliner-component.js:1109): an empty draft is removed; a non-empty draft
   * is posted, then marked pending (kept visible) until its echo arrives.
   *
   * @param {string} draftId
   * @param {LineContent} [parsedOverride] - The freshly parsed content (from a
   *   blur/Enter); falls back to the draft's tracked text.
   */
  const commitDraft = (draftId, parsedOverride) => {
    const draft = draftStore.getDraft(draftId);
    if (!draft) return;
    const parsed =
      parsedOverride ||
      /** @type {LineContent} */ ({ strings: [draft.text], names: [] });
    const plainText = parsed.strings.join('').trim();
    draft.text = plainText;
    if (!plainText) {
      removeDraftAndBuffers(draftId);
      return;
    }
    if (pendingDrafts.has(draftId)) return;
    postDraft({
      channel,
      powers: options.powers,
      parentKey: draft.parentKey,
      replyType: draft.replyType,
      parsed: lineContentToParsed(parsed),
      onMentionNotify: options.onMentionNotify,
    });
    pendingDrafts.add(draftId);
  };

  /** @type {(key: string, parsed: LineContent) => void} */
  const onLineCommit = (key, parsed) => {
    // Blur ends editing; the snapshot's `editing` flag clears on the next render.
    if (view.editingKey === key) view.editingKey = undefined;
    if (isDraftKey(key)) {
      commitDraft(key, parsed);
    } else {
      commitEdit(key, parsed);
    }
    scheduleRender();
  };

  /**
   * Remove a draft from the store + the controller's per-line bookkeeping.
   *
   * @param {string} draftId
   */
  const removeDraftAndBuffers = draftId => {
    draftStore.removeDraft(draftId);
    pendingDrafts.delete(draftId);
    editBuffers.delete(draftId);
    if (view.editingKey === draftId) view.editingKey = undefined;
  };

  /**
   * Focus the line for `key` after the next render, placing the caret per
   * `arg`. The line may not exist yet (a brand-new draft), so defer to a
   * microtask after `scheduleRender` has run.
   *
   * @param {string} key
   * @param {boolean | { atEnd?: boolean, column?: number }} [arg]
   */
  const requestFocusLine = (key, arg) => {
    Promise.resolve().then(() => {
      const line = lines.get(key);
      if (line) line.requestFocus(arg);
    });
  };

  /**
   * Enter: create a draft. Mirrors the committed (1764) and draft (1991)
   * handlers. At-start → before-sibling draft; at-end/middle → child draft. A
   * committed node also commits its own edit first.
   *
   * @param {string} key
   * @param {EnterIntent} intent
   */
  const onLineEnter = (key, intent) => {
    const { atStart, parsed } = intent;
    if (isDraftKey(key)) {
      const draft = /** @type {DraftNode} */ (draftStore.getDraft(key));
      const text = parsed.strings.join('').trim();
      // Empty draft with a parent: dedent (reparent to grandparent), matching
      // the original (1996). Mutate in place so its line keeps identity.
      if (!text && draft.parentKey) {
        const grandparentKey = getEffectiveParent(store, draft.parentKey);
        draft.parentKey = grandparentKey;
        draft.afterKey = undefined;
        scheduleRender();
        requestFocusLine(key, true);
        return;
      }
      // Cursor at start of a non-empty draft: create a peer BEFORE this one.
      if (text && atStart) {
        const newDraft = draftStore.createDraft(
          draft.parentKey,
          undefined,
          key,
        );
        scheduleRender();
        requestFocusLine(newDraft.draftId, true);
        return;
      }
      // Commit current draft, create a new sibling after it.
      commitDraft(key, parsed);
      const newDraft = draftStore.createDraft(draft.parentKey, key);
      scheduleRender();
      requestFocusLine(newDraft.draftId, true);
      return;
    }

    // Committed node: commit the edit, then create the draft.
    commitEdit(key, parsed);
    const entry = store.messageIndex.get(key);
    const parentKey = entry ? entry.message.replyTo : undefined;
    if (atStart) {
      // Before this node: draft as a sibling placed before `key`.
      const newDraft = draftStore.createDraft(parentKey, undefined, key);
      scheduleRender();
      requestFocusLine(newDraft.draftId, true);
    } else {
      // At end/middle: child draft (a reply to this node).
      const newDraft = draftStore.createDraft(key, undefined);
      scheduleRender();
      requestFocusLine(newDraft.draftId, true);
    }
  };

  /**
   * Backspace on an empty line. Committed → post a deletion; draft → remove it.
   * Then focus the previous VISIBLE line computed from the snapshot order (the
   * controller is the only document-order authority, §3.4). Mirrors committed
   * (1790) and draft (2121) handlers.
   *
   * @param {string} key
   */
  const onLineBackspaceEmpty = key => {
    const prevKey = neighborKey(key, 'up');
    if (isDraftKey(key)) {
      removeDraftAndBuffers(key);
    } else {
      const entry = store.messageIndex.get(key);
      if (entry) {
        postDeletion({ channel, replyTo: String(entry.message.number) });
      }
    }
    scheduleRender();
    if (prevKey) requestFocusLine(prevKey, true);
  };

  /**
   * Compute the previous/next VISIBLE key from the current snapshot order. The
   * single source of document order; no island reaches another's DOM (§3.4).
   *
   * @param {string} key
   * @param {'up' | 'down'} dir
   * @returns {string | undefined}
   */
  const neighborKey = (key, dir) => {
    const order = flattenVisibleOrder(buildTreeSnapshot(store, view));
    const idx = order.indexOf(key);
    if (idx === -1) return undefined;
    const nextIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= order.length) return undefined;
    return order[nextIdx];
  };

  /**
   * Cross-node caret: route the caret to the neighbor the controller computes
   * from the snapshot. Up lands at the end (caret returns from below); down
   * lands at the column it left (matching the original's `focusTextNode` which
   * placed Up→end, Down→start). We pass the column so a real browser can land
   * near the same horizontal position.
   *
   * @param {string} key
   * @param {'up' | 'down'} dir
   * @param {{ column: number }} info
   */
  const onLineCaretArrow = (key, dir, info) => {
    const target = neighborKey(key, dir);
    if (!target) return;
    requestFocusLine(target, {
      atEnd: dir === 'up',
      column: info.column,
    });
  };

  /**
   * Indent (Tab): reparent under the previous sibling, computing the new sort
   * order from the snapshot. Committed nodes post a `move`; drafts mutate in
   * place. Mirrors committed (1829) and draft (2050) handlers.
   *
   * @param {string} key
   */
  const onLineIndent = key => {
    if (isDraftKey(key)) {
      const draft = /** @type {DraftNode} */ (draftStore.getDraft(key));
      const siblings = visibleSiblingKeys(draft.parentKey, draft.afterKey, key);
      const idx = siblings.indexOf(key);
      if (idx <= 0) return;
      const prevKey = siblings[idx - 1];
      draft.parentKey = prevKey;
      draft.afterKey = undefined;
      view.collapsedNodes.delete(prevKey);
      scheduleRender();
      requestFocusLine(key, true);
      return;
    }
    const currentParent = getEffectiveParent(store, key);
    const siblings = getSortedVisibleChildren(store, currentParent, undefined);
    const idx = siblings.indexOf(key);
    if (idx <= 0) return; // no previous sibling to nest under
    const prevKey = siblings[idx - 1];
    const prevChildren = getSortedVisibleChildren(store, prevKey, undefined);
    const newOrder =
      prevChildren.length > 0
        ? getEffectiveSortOrder(store, prevChildren[prevChildren.length - 1]) +
          1
        : 1;
    store.moveOverrides.set(key, newOrder);
    store.parentOverrides.set(key, prevKey);
    view.collapsedNodes.delete(prevKey);
    const entry = store.messageIndex.get(key);
    if (entry) {
      postMove({
        channel,
        replyTo: String(entry.message.number),
        sortOrder: newOrder,
        newParent: prevKey,
      });
    }
    scheduleRender();
    requestFocusLine(key, { column: caretColumnOf(key) });
  };

  /**
   * Dedent (Shift+Tab): reparent to the grandparent level. Committed nodes post
   * a `move`; drafts mutate in place. Mirrors committed (1883) and draft (2090).
   *
   * @param {string} key
   */
  const onLineDedent = key => {
    if (isDraftKey(key)) {
      const draft = /** @type {DraftNode} */ (draftStore.getDraft(key));
      if (!draft.parentKey) return;
      const grandparentKey = getEffectiveParent(store, draft.parentKey);
      draft.afterKey = draft.parentKey;
      draft.parentKey = grandparentKey;
      scheduleRender();
      requestFocusLine(key, true);
      return;
    }
    const currentParent = getEffectiveParent(store, key);
    if (!currentParent) return; // already at root
    const grandparent = getEffectiveParent(store, currentParent);
    const gpChildren = getSortedVisibleChildren(store, grandparent, undefined);
    const parentIdx = gpChildren.indexOf(currentParent);
    let newOrder;
    if (parentIdx < gpChildren.length - 1) {
      const parentOrder = getEffectiveSortOrder(store, currentParent);
      const nextOrder = getEffectiveSortOrder(store, gpChildren[parentIdx + 1]);
      newOrder = (parentOrder + nextOrder) / 2;
    } else {
      newOrder = getEffectiveSortOrder(store, currentParent) + 1;
    }
    store.moveOverrides.set(key, newOrder);
    store.parentOverrides.set(key, grandparent);
    const entry = store.messageIndex.get(key);
    if (entry) {
      postMove({
        channel,
        replyTo: String(entry.message.number),
        sortOrder: newOrder,
        newParent: grandparent === undefined ? '' : grandparent,
      });
    }
    scheduleRender();
    requestFocusLine(key, { column: caretColumnOf(key) });
  };

  /** @param {string} key */
  const caretColumnOf = key => {
    const buffer = editBuffers.get(key);
    return buffer ? buffer.strings.join('').length : 0;
  };

  /**
   * The visible sibling keys for a draft's parent, with the draft slotted in
   * (drafts are not in the store's tree, so `getSortedVisibleChildren` does not
   * see them). Honors `afterKey`/append, matching where the snapshot builder
   * places the draft.
   *
   * @param {string | undefined} parentKey
   * @param {string | undefined} afterKey
   * @param {string} draftKey
   * @returns {string[]}
   */
  const visibleSiblingKeys = (parentKey, afterKey, draftKey) => {
    const committed = getSortedVisibleChildren(store, parentKey, undefined);
    if (afterKey) {
      const at = committed.indexOf(afterKey);
      if (at !== -1) {
        return [
          ...committed.slice(0, at + 1),
          draftKey,
          ...committed.slice(at + 1),
        ];
      }
    }
    // Default: drafts render after committed children (snapshot builder order).
    return [...committed, draftKey];
  };

  /**
   * Resolve the effective content for a committed key, tolerating a missing
   * entry. Used by `commitEdit` to decide whether the text changed.
   *
   * @param {string} key
   */
  const getEffectiveFor = key => {
    const entry = store.messageIndex.get(key);
    if (!entry) return { strings: [''], names: [] };
    // The snapshot already projects effective content; read it from there to
    // avoid recomputing, falling back to the raw message.
    const node = lastSnapshotByKey.get(key);
    if (node) return node.effective;
    return { strings: entry.message.strings, names: entry.message.names || [] };
  };

  // The most recent flattened snapshot, so intent handlers can read effective
  // content / order without rebuilding. Refreshed at the end of every render.
  /** @type {Map<string, OutlinerSnapshotNode>} */
  let lastSnapshotByKey = new Map();

  /**
   * Focus a line: the controller marks it the `editingKey` and clears the
   * selection (§3.4.3). Re-render reflects the cleared `selected` props and the
   * `editing` flag; the `editingKey` guard then protects the focused line.
   *
   * @param {string} key
   */
  const onLineFocus = key => {
    view.editingKey = key;
    if (view.selectedNodes.size > 0) {
      view.selectedNodes.clear();
      scheduleRender();
    }
  };

  /**
   * Whether the user is actively editing `key` (focused or has unsent edits) —
   * the §3.4 edit-while-incoming guard predicate.
   *
   * @param {string} key
   */
  const isEditingLine = key => view.editingKey === key || dirtyNodes.has(key);

  /**
   * Re-render an unedited committed line's content only when the projection
   * actually changed (so we never clobber the host node needlessly).
   *
   * @param {EditableLine} line
   * @param {string} key
   * @param {OutlinerSnapshotNode} node
   */
  const updateLineContent = (line, key, node) => {
    const next = JSON.stringify([node.effective.strings, node.effective.names]);
    if (renderedContent.get(key) !== next) {
      line.update({
        strings: [...node.effective.strings],
        names: [...node.effective.names],
      });
      renderedContent.set(key, next);
    }
  };

  /**
   * Reconcile the editable-line map against the freshly built snapshot: create a
   * line for each new node, update content on existing lines whose effective
   * content changed, and dispose lines whose node vanished.
   *
   * The `editingKey` guard (§3.4 / the imperative edit-while-incoming guard at
   * outliner-component.js:2700) is the trickiest correctness point: an existing
   * line's content is re-rendered ONLY when the node is NOT the one being edited
   * AND the user is not mid-edit on it (no dirty buffer). This keeps a re-render
   * triggered by an incoming sibling message from clobbering the caret/content
   * of the line the user is typing into. The host-owned node also keeps its
   * identity across re-render (Preact never owns it), so even the guarded path
   * never re-creates the focused line.
   *
   * @param {Map<string, OutlinerSnapshotNode>} byKey
   */
  const reconcileLines = byKey => {
    // Remove lines for nodes that no longer exist (and forget their buffers).
    for (const [key, line] of lines) {
      if (!byKey.has(key)) {
        line.dispose();
        lines.delete(key);
        editBuffers.delete(key);
        dirtyNodes.delete(key);
      }
    }
    // Create / update lines for current nodes.
    for (const [key, node] of byKey) {
      const existing = lines.get(key);
      if (!existing) {
        lines.set(
          key,
          makeEditableLine({
            key,
            isDraft: node.isDraft,
            initialContent: harden({
              strings: [...node.effective.strings],
              names: [...node.effective.names],
            }),
            onFocus: onLineFocus,
            onInput: onLineInput,
            onCommit: onLineCommit,
            onEnter: onLineEnter,
            onBackspaceEmpty: onLineBackspaceEmpty,
            onIndent: onLineIndent,
            onDedent: onLineDedent,
            onCaretArrow: onLineCaretArrow,
          }),
        );
      } else if (!node.isDraft && !isEditingLine(key)) {
        // In-place content update of an existing committed line. Guard: never
        // touch the line the user is editing (focused / dirty) — that would
        // clobber the live caret and the unsent edit (§3.4). Drafts are never
        // re-rendered from here (their content is the user's own buffer).
        updateLineContent(existing, key, node);
      }
    }
  };

  // Re-parent each persistent editable line into its freshly rendered anchor.
  // `renderConfined` is synchronous, so the anchors exist by the time this runs.
  const reattachLines = () => {
    for (const [key, line] of lines) {
      const $anchor = /** @type {HTMLElement | null} */ (
        $mount.querySelector(`[data-line-anchor="${key}"]`)
      );
      if ($anchor && line.$node.parentElement !== $anchor) {
        $anchor.appendChild(line.$node);
      }
    }
  };

  // ---- Confined callbacks (the §4 seam) ----
  // Read-affecting handlers are wired now; keyboard / draft / action / DnD
  // handlers are Phases 3–5 and intentionally absent (the confined tree treats
  // an absent callback as inert).
  /** @type {OutlinerCallbacks} */
  const callbacks = harden({
    onToggleCollapse: key => {
      if (view.collapsedNodes.has(key)) {
        view.collapsedNodes.delete(key);
      } else {
        view.collapsedNodes.add(key);
      }
      scheduleRender();
    },
    onFocusNode: key => {
      view.focusedKey = key;
      scheduleRender();
      $parent.scrollTo(0, 0);
    },
    // TODO(Phase 4): onAuthorClick (profile popup), onShowHistory (edit
    // history), onReply/onReact/onFork/onShare/onBookmark/onDelete (actions).
  });

  /**
   * Compute the focus-mode breadcrumb chain controller-side (the confined tree
   * never walks the tree). Mirrors `renderBreadcrumb` (outliner-component.js:542)
   * using the pure `getHeritageChain`.
   *
   * @returns {BreadcrumbItem[]}
   */
  const computeBreadcrumb = () => {
    if (!view.focusedKey) return [];
    const chain = getHeritageChain(store, view.focusedKey);
    return chain.map((msg, i) => {
      const key = String(msg.number);
      const preview = msg.strings.join('').slice(0, 30) || `#${key}`;
      return { key, preview, current: i === chain.length - 1 };
    });
  };

  // ---- Render ----
  // Coalesce bursts of `scheduleRender` calls (initial backlog, name
  // resolution) into one synchronous render on the next microtask, the confined
  // analogue of the imperative 50–200ms batch timer — but microtask-scoped,
  // since `renderConfined` is synchronous and needs no settle delay (§7).
  // Declared before `render` so the helpers `render` invokes (`requestName`,
  // the callbacks) can reference it without a temporal-dead-zone hazard.
  let renderScheduled = false;
  const scheduleRender = () => {
    if (renderScheduled) return;
    renderScheduled = true;
    // eslint-disable-next-line no-use-before-define
    Promise.resolve().then(() => {
      renderScheduled = false;
      render();
    });
  };

  const render = () => {
    if (!isLive()) return;
    const snapshot = buildTreeSnapshot(store, view);

    // Prime author-name resolution for every visible node before render so the
    // meta row fills in (a resolved name re-renders).
    const byKey = flattenSnapshot(snapshot);
    for (const node of byKey.values()) {
      if (!node.isDraft) {
        requestName(node.author);
        if (node.editedBy) requestName(node.editedBy);
      }
    }

    // Keep the snapshot-by-key cache fresh so intent handlers can read effective
    // content / order without rebuilding the whole tree.
    lastSnapshotByKey = byKey;

    reconcileLines(byKey);
    renderConfined(
      h(OutlinerRoot, {
        snapshot,
        focusedKey: view.focusedKey,
        breadcrumb: computeBreadcrumb(),
        resolveName,
        callbacks,
      }),
      $mount,
    );
    reattachLines();
  };

  // First (empty) render so the mount has a confined tree immediately.
  render();

  // ---- Subscription ----
  let disposed = false;
  /** @type {{ return?: () => unknown } | undefined} */
  let activeIterator;

  const run = async () => {
    /** @type {unknown} */
    const messagesRef = await E(
      /** @type {ChannelRef} */ (channel),
    ).followMessages();
    const messageIterator = iterateReader(
      /** @type {Parameters<typeof iterateReader>[0]} */ (
        /** @type {unknown} */ (messagesRef)
      ),
    );
    activeIterator = messageIterator;
    for await (const message of messageIterator) {
      if (disposed) break;
      const msg = /** @type {ChannelMessage} */ (message);
      ingestMessage(store, msg);
      // Dedup an echoed draft: a visible message that matches a pending draft's
      // parent + text removes that draft so it does not double-render alongside
      // its committed echo. Mirrors `matchPendingDraft` (outliner-component.js:
      // 2475); "pending" lives in the controller's `pendingDrafts` set.
      if (isVisibleReplyType(msg.replyType)) {
        const matchedId = draftStore.matchPendingDraft(
          { replyTo: msg.replyTo, strings: msg.strings },
          draft => pendingDrafts.has(draft.draftId),
        );
        if (matchedId !== undefined) {
          removeDraftAndBuffers(matchedId);
        }
      }
      scheduleRender();
    }
  };

  run().catch(err => {
    if (!disposed) {
      console.error('[outliner-next] subscription failed:', err);
    }
  });

  return harden({
    dispose: () => {
      disposed = true;
      // Cancel the message iterator (preserve the imperative dispose's
      // `iterator.return()`, outliner-component.js:2760).
      if (activeIterator && activeIterator.return) {
        activeIterator.return();
      }
      for (const line of lines.values()) {
        line.dispose();
      }
      lines.clear();
      editBuffers.clear();
      dirtyNodes.clear();
      renderedContent.clear();
      unmount($mount);
      $mount.remove();
    },
  });
};
harden(outlinerComponentNext);
