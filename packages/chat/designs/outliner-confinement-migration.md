# Outliner Confinement Migration — Decomposition Contract

Engineering contract for migrating
[`packages/space-channel/src/outliner-component.js`](../../space-channel/src/outliner-component.js)
(3003 lines; one `export const outlinerComponent = async ($parent, $end,
channel, options) => {…}`) from imperative DOM to **confined Preact** rendered
through `@endo/preact-container`'s `renderConfined`, with the editable text
lines kept as **host-owned islands**.

This is the hardest body in the broader
[Preact confinement migration](./preact-confinement-migration.md): a
tree-structured discussion outliner with `contentEditable` lines, inline
pet-name token chips, multi-node selection, a draft system, keyboard
tree-manipulation, and drag-and-drop.

Unqualified `file:line` refer to `space-channel/src/outliner-component.js`.

## Editable surface: anchor-slot, not raw HostPassthrough

`HostPassthrough` (`preact-container/src/renderer.js:660`) is the primitive that
disables sanitization for a subtree (real refs/events).
But the codebase's **proven** mechanism for a live editable surface inside a
confined tree is define-form's **anchor-slot host-node re-parenting**
(`chat/define-form.js:214-241`): the confined `<OutlinerNode>` renders an empty
`<div data-line-anchor={key}>`; the controller owns one persistent `$lineHost`
(`contentEditable` div) per node and re-parents it into the matching anchor
after each confined render.
The editable DOM survives confined re-renders because Preact never owns it — a
raw `HostPassthrough` vnode would be diffed by Preact and clobber the
caret/selection on re-render.
**Anchor-slot is primary; `HostPassthrough` is the conceptual fallback.**
Phase 0 validates this empirically.

## 1. Node / data model

The ingestion loop `for await (const message of messageIterator)` (2951-3016) is
the single source of truth, where `messageIterator = iterateReader(await
E(channel).followMessages())` (2909, 2922).
Per message it updates `messageIndex` / `replyChildren` / `nameMap` /
`memberCache` (from `createChannelState`, 140-155; typedef
`channel-utils.js:29-42`), maintains `rootKeys`, applies `move` overrides
eagerly into `moveOverrides`/`parentOverrides` (2974-2985), and routes
`react`/`redact-react` to `reactSystem`.
A 200ms `batchTimer` coalesces the backlog into one `renderFull()`; after
`initialLoadComplete`, each message goes through `handleIncremental` (2633).

A node is the tuple `(msgKey, message, effectiveContent)` — there is no single
node object. Tree edges are `replyTo` + `replyType`:

- **Structural children**: `undefined`/`reply`/`pro`/`con`/`evidence`/`fork`
  (`isVisibleReplyType`, `edit-queue.js:49`).
- **Modifier replies mutate their target** (`MODIFIER_REPLY_TYPES`,
  `edit-queue.js:34`): `edit` → `computeNodeContent` (last-undeleted-edit-wins,
  `edit-queue.js:113`); `deletion` → `isEffectivelyDeleted` (recursive,
  `edit-queue.js:68`); `move` → `strings[0]` new sort order, `strings[1]` new
  parent (mirrored optimistically before echo); `react`/`redact-react` →
  `react-utils`.

Controller-owned state: `messageIndex`/`replyChildren`/`nameMap`/`memberCache`
(146), `rootKeys` (161), `collapsedNodes` (158), `moveOverrides` (274),
`parentOverrides` (277), `drafts` (209), `dirtyNodes` (211), `selectedNodes`
(268)/`lastSelectedKey` (271), `focusedKey` (183), `draggedKeys` (280).

Pure tree functions (substrate, no DOM — become the controller's projection
layer): `getEffectiveParent` (297), `getNodeDepth` (308),
`getEffectiveSortOrder` (326), `getSortedVisibleChildren` (513),
`getHeritageChain` (550), `isDescendantOf` (818), `getEffective` (504).

The `nodeEls`/`draftEls` shadow-tree (197, 206) maintained by `buildNodeTree`
(2541) / `renderFull` (2575) / `handleIncremental` (2633) and the
keyboard/DnD surgical mutations (`reorderChildren` 960, `updateNodeDepths` 1084)
are **what Preact replaces** — the bulk of the deletable code.

## 2. Inventory — STRUCTURE (confined Preact) / HOST (editable island) / CONTROLLER

- **Render/build** (the ~42 `createElement` sites): `createBulletEl`/disclosure
  (1250) → `NodeDisclosure` (S); `createBadges` (1305) → `NodeBadge` (S);
  `renderBreadcrumb` (570) → `Breadcrumb` (S); `createMetaEl` (1565) →
  `NodeMeta` (S) with author name resolved controller-side;
  `createCommittedNode` (2293) → `OutlinerNode`, its `$text` (2320) is the **H**
  island; `createDraft` (2463) → draft `OutlinerNode editing`, `$text` is **H**;
  `buildNodeTree`/`renderFull` → recursive `<OutlinerNode>` + `treeSnapshot`;
  `handleIncremental` → merge-into-snapshot + setState (C).
- **Selection** (638-728): state is **C** (`selectedNodes`); the
  `outliner-selected` class becomes a `selected` prop (S). `getAllVisibleTextNodes`
  (355)/`getVisibleCommittedKeys` (667) must be reimplemented from the snapshot,
  not `querySelectorAll` — coordination risk (§3.4). Rubber-band (2796-2880)
  needs real geometry → host-side.
- **contentEditable parse/serialize**: `parseNodeContent` (422, DOM→structured)
  and `renderNodeContent` (471, structured→text + `span.chat-token`) are **H**
  (run inside the island over the real node); `focusTextNode` (381) /
  `getCursorPosition` (397, `getSelection`/`createRange`) are **H**. Delegated
  `.chat-token` click (1521) is a **C** callback (`onTokenClick`).
- **Keyboard** (committed 1849-2064, draft 2093-2278): the island raises
  structured intent; the controller executes tree mutations + `E(channel).post`.
  Cross-node arrow/backspace caret (1916, 2258) is **H↔C coordination** (§3.4).
- **Draft system** (209, 2463, 1164, 1177, 2611): **C** state + `post`; the
  draft's editable line is an **H** island.
- **Drag-and-drop** (737-1093): drop decisions pure (`findDropPosition` needs
  rects → host-measured); indicator/`dragging` classes become props;
  `handleDrop`'s `post(...,'move')` is **C**. Use `SafeDataTransfer` (inventory
  precedent).
- **Slash menu** (47, 1651-1820): menu vnode (S) + state (C); trigger detection
  runs island-side (`onInput` → `onSlashQuery`). Token autocomplete
  (`@endo/spaces-util/token-autocomplete.js`, attached 1596-1637) is itself a
  `contentEditable` host controller — mounts onto the island's real `$text`.
- **Actions** (2327-2416, Reply/React/Fork/Share/Bookmark/Focus/Delete): menu
  vnode (S); handlers are **C** callbacks. `channelAPI`
  (`closeThread`/`focusOnNode`/`dispose`, 2891) is returned by the host wrapper.

## 3. The editable-line island seam (the hard part)

A confined component receives `SafeEvent`s (frozen, no DOM nodes,
`renderer.d.ts:68`), refs stripped, attrs sanitized — so live
`contentEditable`, `getSelection`/`createRange` caret control, real
`KeyboardEvent`, token-chip `dataset`, IME/composition, and paste **cannot**
survive confinement. Hence the editable line is a host-owned island
(anchor-slot, §top).

**IN (confined tree → island):** `{ key, isDraft, isEditing, effective:{strings,
names}, onInput, onCommit, onCaretArrow, onEnter, onBackspaceEmpty, onIndent,
onDedent, onSelectAll, onSlashQuery, onTokenClick }`. `effective` from
`getEffective(key)` (504).

**OUT (island → controller, structured intent only, never DOM):**
`onInput(key, parsed)` (1837, 2076); `onCommit(key, parsed)` (blur, 1841, 2084
→ `post …'edit'`/replyType); `onEnter(key, {atStart, parsed})` (1866, 2116);
`onBackspaceEmpty(key)` (1892, 2246); `onCaretArrow(key, dir, atEdge)` (1916,
2258); `onIndent`/`onDedent(key)` (Tab/Shift-Tab → overrides + `post …'move'`);
`onSlashQuery(draftId, query)` (1811). Controller→island imperative handle:
`requestFocus(key, atEnd)` (replaces `focusTextNode`, 381).

**Cross-node coordination — every global-selection reach to eliminate (§3.4):**
the controller is the only authority on document order.
1. `getAllVisibleTextNodes` (355) + `focusTextNode(idx±1)` (1916/2258/…) →
   island reports `onCaretArrow(key, dir, atEdge)`; controller computes
   prev/next visible key from the snapshot and calls `requestFocus` on that
   node's island handle. No island reaches another's DOM.
2. Global `getSelection`/`createRange` (381, 397, 1856, 2103) stays inside the
   island; `atStart`/`atEnd` computed island-side, passed out as booleans.
3. Focusing a line (`clearSelection` on `$text` focus, 1833) → island `onFocus(key)`
   → controller clears `selectedNodes` → re-render drops `selected`.
4. `document.activeElement` "is user editing?" checks (1843, 2086, 2700) →
   controller-tracked `editingKey`; `handleIncremental`'s edit-while-incoming
   guard (2700) becomes a snapshot guard.

## 4. Proposed confined tree + host wrapper

```
OutlinerRoot({ snapshot, focusedKey, selectedKeys, drafts, callbacks })
├─ Breadcrumb            (focusedKey ? chain + onFocus : null)
├─ OutlinerNode (recursive, key=msgKey)
│   ├─ NodeDisclosure    (hasChildren, collapsed, onToggle)
│   ├─ NodeBadge[]       (replyType)
│   ├─ NodeMeta          (authorName, editedByName, onAuthorClick, onShowHistory)
│   ├─ EditableLine      ← anchor-slot host island  (createCommittedNode $text)
│   ├─ NodeActions       (onReply/onReact/onFork/onShare/onBookmark/onFocus/onDelete)
│   ├─ SlashMenu         (when this draft is the active slash target)
│   └─ OutlinerNode[]    (visibleChildren — recursion, cf. InventoryItem→InventoryList)
```

`OutlinerNode` props are **primitives + plain callbacks only** (no object
identity as effect deps — §7).

Host wrapper / controller mirrors `chat/inbox-component.js`: new thin
`chat/outliner-component.js` (resolves mount, `renderConfined`, owns scroll
geometry as callbacks, injects `reportError`/`writeClipboard`, returns
`{ dispose }` and keeps `$parent.channelAPI` for `chat.js` compat) +
`space-channel/src/outliner/controller.js` (subscription, tree projection,
draft store, all `E(channel).post`, overrides, `selectedNodes`, `editingKey`,
the per-node `$lineHost` map). `@endo/space-channel` exports `OutlinerRoot`
(pure); `@endo/chat` owns `renderConfined` — the `InboxRoot` split.

## 5. External contract

`options` (94-112): `showValue` → confined callback; `personaId`/`ownMemberId` →
controller; `powers` → **controller only** (never enters confined tree —
`followNameChanges` 234, `identify` 1119/1195, `lookup` 1552); `onReply`/`onFork`/
`onShare`/`onBookmark` → `NodeActions` callbacks; `onMentionNotify` →
controller post-commit hook; `chatBarAPI` → controller. Fork/share payloads:
`getHeritageChain(key)` computed controller-side; confined passes only `key`.

`channel` `E()` methods stay controller-side: `followMessages()` (2909) and the
single mutation primitive `post(strings, edgeNames, petNames, replyTo, ids,
replyType)` — called for `'edit'` (1129), draft commit (1206), `'deletion'`
(1901/2407), `'move'` (1056/1957/2027).

## 6. Phased plan

- **Phase 0 — anchor-slot spike (smallest end-to-end slice; DO FIRST, HIGH
  risk).** One committed `<OutlinerNode>` + a working anchor-slot `EditableLine`
  inside a `renderConfined` root, rendering chips, accepting input, committing an
  edit, with **caret survival across a forced re-render** and one cross-node
  arrow demonstrated. New `outliner/editable-line.js` + a harness test. Proves
  the single highest-risk item before any decomposition.
- **Phase 1 — pure refactor, no Preact (MED).** Extract the tree-projection
  (§1) + a `treeSnapshot` builder + the draft store + `post`-intent functions
  (taking `(key, parsed)` instead of reading `$text`), still driving the current
  imperative DOM. `outliner/controller.js`, `outliner/tree-source.js`. Existing
  `outliner-enter-key.test.js` stays green.
- **Phase 2 — confined structure shell (MED).** `OutlinerRoot` + `OutlinerNode`
  + `NodeDisclosure`/`NodeBadge`/`NodeMeta`/`Breadcrumb` from `treeSnapshot`;
  the Phase-0 island per node; selection as a prop. Host wrapper
  `chat/outliner-component.js`.
- **Phase 3 — keyboard + draft intent over the seam (HIGH).** Wire
  `onEnter`/`onBackspaceEmpty`/`onIndent`/`onDedent`/`onCaretArrow`/`onCommit`;
  cross-node caret via `requestFocus` (§3.4).
- **Phase 4 — slash menu + token autocomplete + actions + reacts (MED).**
  Confined `SlashMenu`/`NodeActions`; `tokenAutocompleteComponent` onto the
  island's `$text`; profile/edit-history popups confined with in-tree dismissal.
- **Phase 5 — DnD + rubber-band + focus mode + dispose (MED-HIGH).** DnD over
  `SafeDataTransfer`; drop decision pure, geometry host-measured; `dispose()`
  cancels the iterator + batch timer + unmounts.

**Single highest-risk item:** editable-line caret/selection survival across
confined re-renders **combined with** cross-node caret movement (§3.1 + §3.4).
Phase 0 is the smallest slice that de-risks it.

## 7. Gotchas

- **Object props can't be `useEffect` deps in a confined component** —
  `renderConfined` reissues object identity every render. Key `OutlinerNode`
  effects on primitives (`key`, `isEditing`); pass callbacks as stable host
  references; seed content via `key`-based remount, not an effect.
- **`SafeEvent` has no DOM nodes** — confined keyboard handlers can't read
  `target`/selection; that's why the line is an island.
- **`renderConfined` is synchronous** — no `setTimeout` render-settle hacks; the
  150ms blur-commit debounce (1842, 2085) and `requestAnimationFrame(focusTextNode)`
  (1878) belong island-side.
- **Iterator `.return()` on dispose** (current `channelAPI.dispose` 2895 already
  does — preserve it). **Don't push the host scroll node into a confined
  component** (scroll stays in the controller).
- **Outliner-specific:** cross-node caret (only the controller knows document
  order); IME/composition handled on the real node, never commit/parse
  mid-composition; paste intercepted island-side and normalized (the island is
  un-sanitized); optimistic-vs-echo `move` dedup must be idempotent;
  `matchPendingDraft` (2611) string match must survive the projection.
- The regression test `chat/test/component/outliner-enter-key.test.js` asserts
  DOM `[data-key]`/`outliner-draft`/`dataset.depth` and mocks
  `getSelection`/cursor — Phases 2-3 must keep those data attributes or rewrite
  the test in lockstep.
