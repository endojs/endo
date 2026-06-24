// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { ChannelMessage, ChannelRef } from '@endo/space-channel/channel-utils.js' */
/** @import { TreeStore } from '@endo/space-channel/outliner/tree-source.js' */
/** @import { SnapshotViewState, OutlinerSnapshotNode } from '@endo/space-channel/outliner/tree-snapshot.js' */
/** @import { EditableLine, LineContent } from '@endo/space-channel/outliner/editable-line.js' */
/** @import { OutlinerCallbacks, BreadcrumbItem } from '@endo/space-channel/outliner/outliner-structure.js' */

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { isVisibleReplyType } from '@endo/space-channel/edit-queue.js';
import { getHeritageChain } from '@endo/space-channel/outliner/tree-source.js';
import { buildTreeSnapshot } from '@endo/space-channel/outliner/tree-snapshot.js';
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
 * Mount the confined outliner into `$parent` (before `$end`). Returns a
 * `dispose()` that cancels the message iterator and unmounts the confined tree.
 *
 * @param {HTMLElement} $parent - The host's scroll container.
 * @param {HTMLElement | null} $end - Anchor to insert the dedicated mount before.
 * @param {unknown} channel - The channel ref (E-able; `followMessages` / member
 *   queries stay controller-side, never enter the confined tree).
 * @param {object} [options]
 * @param {ERef<EndoHost>} [options.powers] - Host powers; controller-only (§5).
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

  // ---- View state (the Phase-1 `SnapshotViewState` shape) ----
  // Phase 2 reads selection / collapse / focus but only collapse + focus are
  // mutated here (via the disclosure + breadcrumb callbacks). Selection,
  // editing, and drafts are Phase 3–5 concerns; their containers exist so the
  // snapshot builder has a stable shape and the next phase can fill them.
  /** @type {SnapshotViewState} */
  const view = {
    collapsedNodes: new Set(),
    selectedNodes: new Set(),
    focusedKey: undefined,
    editingKey: undefined,
    drafts: new Map(),
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

  // Phase-3 seam: `onInput` / `onCommit` carry STRUCTURED parsed content out of
  // the island (never DOM). Phase 2 logs the intent shape; Phase 3 routes it to
  // the `controller-intents` post layer (`postEdit` / `postDraft`).
  /** @type {(key: string, parsed: LineContent) => void} */
  const onLineInput = () => {
    // TODO(Phase 3): track editing buffer; drive slash-query detection. The
    // island already passes `(key, parsed)`; this seam ignores them for now.
  };
  /** @type {(key: string, parsed: LineContent) => void} */
  const onLineCommit = () => {
    // TODO(Phase 3): route to postEdit / postDraft via controller-intents.
  };

  /**
   * Reconcile the editable-line map against the freshly built snapshot: create a
   * line for each new node, update content on existing lines whose effective
   * content changed, and dispose lines whose node vanished. Mirrors the spike's
   * `buildLines`, generalized to add/update/remove across snapshot changes.
   *
   * @param {Map<string, OutlinerSnapshotNode>} byKey
   */
  const reconcileLines = byKey => {
    // Remove lines for nodes that no longer exist.
    for (const [key, line] of lines) {
      if (!byKey.has(key)) {
        line.dispose();
        lines.delete(key);
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
            initialContent: harden({
              strings: [...node.effective.strings],
              names: [...node.effective.names],
            }),
            onInput: onLineInput,
            onCommit: onLineCommit,
          }),
        );
      }
      // NOTE: in-place content UPDATE of an existing line (re-`renderContent`
      // when the effective content changes underneath an unedited line) is a
      // Phase-3 concern — it must not clobber a caret mid-edit, which requires
      // the `editingKey` guard that Phase 3 introduces. Phase 2 only ever
      // creates lines from committed content, so a stale-content update path is
      // intentionally deferred. (See §3.4 edit-while-incoming guard.)
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
      ingestMessage(store, /** @type {ChannelMessage} */ (message));
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
      unmount($mount);
      $mount.remove();
    },
  });
};
harden(outlinerComponentNext);
