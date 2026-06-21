# Preact Confinement Migration

Tracking document for migrating the Chat UI onto `@endo/preact-container`.

## Goal

The Chat UI is currently built from imperative, plain-DOM component
functions (`document.createElement`, `$container.innerHTML`, `appendChild`).
We are migrating it onto Preact, rendered through
[`@endo/preact-container`](../../preact-container/README.md), so that:

1. Host-authored views become Preact components rendered with the
   sanitizing `renderConfined`.
2. Untrusted, guest-supplied component code (a widget the host evaluated in
   a SES `Compartment`) can be mounted with `confineComponent` inside the
   same tree without being handed the live DOM.

The single import surface for the confine/render helpers is
[`setup-preact-container.js`](../setup-preact-container.js).

## Status — what has landed

- **Confined event security.** Drag events in a confined tree expose a
  string-only `SafeDataTransfer` facade (never the real `DataTransfer` with its
  `.files` / `webkitGetAsEntry` filesystem capability). Adversarially audited
  and documented in
  [`@endo/preact-container`](../../preact-container/README.md).
- **The inventory pet-name tree is fully migrated.** `inventory.js` is one
  confined Preact tree — `InventoryList` (container) + `InventoryItem`
  (recursive node), composing `ItemDisclosure`, `ItemLabel`, `ItemActions`, and
  `DropMenu`. Link/move drag-and-drop is Preact event handlers over
  `SafeDataTransfer`. The imperative `inventory/dnd.js` factories and the
  `test/inventory-dnd` browser probe are deleted; no `display: contents` mount
  hosts remain.
- **Channels left the inventory entirely** (see the revised section below). They
  are now a standalone Preact component, [`channel-list.js`](../channel-list.js),
  with their own CSS ([`channel.css`](../channel.css)); creation lives in the New
  Space modal. This **supersedes** the original "channels are a `sidebar` of
  hooks on `inventory.js`" plan recorded in earlier revisions of this document.
- **All six Tier 1 leaf views have landed** as confined Preact components:
  `profile-popup`, `message-picker`, `command-selector`, `heat-bar`, and
  `inline-define` (each rendered through `renderConfined` from
  [`setup-preact-container.js`](../setup-preact-container.js)). Only
  `icon-selector` is intentionally deferred — it is coupled to the still-DOM
  add/edit-space modals and will land with them.
- **The 1:1 inbox view is fully migrated.**
  [`inbox-component.js`](../inbox-component.js) is one confined Preact tree
  (entry signature unchanged, so `chat.js` was untouched), landed in three
  stages: the message-list shell + all five message types (request, package,
  definition, form, value); markdown bodies as vnodes with interactive
  pet-name/token chips ([`markdown-vnodes.js`](../markdown-vnodes.js)); and
  value bodies as vnodes ([`value-vnodes.js`](../value-vnodes.js)). The one
  documented limitation is Monaco syntax-coloring of code fences, which stays
  plain `<pre>` under confinement (`colorize` returns an HTML string the
  sanitizing renderer strips; tokenization-to-vnodes is a follow-up). Dan's
  multiuser `channelComponent` stays imperative DOM for now.

What remains is the rest of the bottom-up plan: the Tier 2 leaves
(`debugger-panel` and the keyboard-stateful autocompletes), `icon-selector` with
the space modals, then the Tier 3 composites that compose all of these (see the
tracker).

## Preconditions (done)

- `@endo/preact-container` + `preact` are dependencies of `@endo/chat`.
- The realm is locked down at startup with `overrideTaming: 'severe'`
  (`pre-lockdown.js` + `@endo/init`, wired in `main.js`).
  `'severe'` is required because Preact assigns
  `component.constructor = type`, which hits the SES override mistake under
  `'min'`/`'moderate'`.
- Monaco — the presumed blocker — is verified compatible with that taming
  level at load and under runtime interaction
  (`test/monaco-lockdown`).

## Strategy: bottom-up

Migrate leaves first.
A leaf composes no other UI component, so converting it does not require any
other component to be converted first.
Each migration replaces a component's imperative DOM construction with a
Preact component rendered through `renderConfined` (and eventually exposes a
seam where a confined guest component could be substituted).

## Authoring conventions

### File layout

- `setup-preact-container.js` — the app barrel: re-exports
  `@endo/preact-container` (`h`, `Fragment`, `renderConfined`, `unmount`,
  `confineComponent`) plus the Preact hooks, under the app's severe lockdown.
  Every component imports from here, never from `preact` directly.
- `components/` — reusable, app-wide Preact components. A piece moves here
  once a second caller wants it. See `components/README.md` for the format.
- `inventory/` — the inventory feature: its Preact components
  (`inventory.js` = `InventoryList` + `InventoryItem`, plus `drop-menu.js`,
  `item-disclosure.js`, `item-label.js`, `item-actions.js`) and the
  `tree-source.js` data adapter. The channel list is **not** here — it is the
  top-level [`channel-list.js`](../channel-list.js) (see below).

### `inventory.js` is the pet-name tree; channels are their own space

`inventory.js` was overloaded: a `channelMode` flag switched it between the
pet-name tree and the channels sidebar (New/Join forms, per-channel menu,
bookmarks, reordering). Those channel concerns are **not** inventory and have
been removed from it **entirely**.

An interim revision split them into an `inventory/channel-sidebar.js` that
decorated the inventory's rows through a `sidebar` of hooks
(`decorateItem`, `setupHeader`, …). That seam is now gone too: channels are a
**standalone Preact component**, [`channel-list.js`](../channel-list.js), with
their own markup and CSS ([`channel.css`](../channel.css)). It probes pet names
itself, keeps only `type === 'channel'`, and renders them independently of the
inventory (no `.pet-item-*` reuse). Channel creation is a New Space option in
`add-space-modal.js` — a channel is a first-class space. `inventory.js` now
knows nothing about channels.

So **the pet-name tree migration is complete**: `ItemLabel`, `ItemActions`,
`DropMenu`, `ItemDisclosure`, `InventoryItem` (the recursive node), and
`InventoryList` (the container) are all Preact, rendered through one
`renderConfined`.

Feature-specific components live with their feature; only genuinely reusable
ones go in `components/`. Both follow the one common component format
documented in `components/README.md`.

### No JSX — `h()` only

Components are plain `.js` authored with the `h` (and `Fragment`) helper
imported from [`setup-preact-container.js`](../setup-preact-container.js),
rendered via `renderConfined`.
We do not use JSX.

Rationale:

- Avoids a JSX build/transform step and the `@vitejs/plugin-react` pragma
  juggling; the source runs as-is.
- Keeps the confined-render path explicit — `h` and `renderConfined` come
  from the same controlled surface that confined guest code will use.
- Matches `@endo/preact-container`'s own suite, which dropped JSX in favour
  of `h()` + plain `.js`.

### Two-phase rule: refactor-then-convert vs convert-in-place

Split each migration by what survives the Preact conversion:

- **Phase 1 — refactor in the current style (do first).** Extract the
  substrate-agnostic parts — data adapters, drag-and-drop and other
  behavior, type rules, and the controller↔child prop/callback boundaries —
  as pure, behavior-preserving refactors with no Preact yet.
  These are reused unchanged by the Preact version, and a regression here is
  attributable to the extraction, not the rendering change.
- **Convert-in-place — rewrite markup directly in `h()`.** Do **not**
  pre-factor the visual DOM construction into imperative sub-functions
  (`$container`-passing, manual event wiring, `cleanup()` returns) only to
  delete that plumbing on conversion.
  Child composition is exactly what Preact makes cheap, so leaf views go
  straight from monolith markup to `h()` components.

## Default Chat view component graph

The default view renders when a space's `viewMode` falls through to
`channelComponent` (the `'chat'` type).
`forum` / `outliner` / `microblog` are the alternate `viewMode`s;
file-explorer / whylip / peers / inventory-graph are special space types.
`*` marks on-demand surfaces (modals/panels) that are not on the initial
paint.

```
chat.js make()                      root orchestrator (plain DOM)
├─ createSpacesGutter               left gutter
│   ├─ add-space-modal*             → icon-selector, scheme-picker,
│   │                                 petname-paths-autocomplete
│   └─ edit-space-modal*            → icon-selector, scheme-picker
├─ inventoryComponent               pet-name tree — Preact ☑ (InventoryList)
├─ createChannelHeader
│   └─ heat-simulation → heat-engine   (heat-engine = logic, not a view)
├─ channelComponent                 main message list — the default body
│   ├─ channel-utils                state logic
│   ├─ profile-popup                LEAF — pure DOM
│   ├─ react-utils                  emoji-reaction state (logic, not a view)
│   ├─ markdown-render              → HTML string (util)
│   ├─ monaco-wrapper               Monaco seam (external editor)
│   └─ time-formatters              util
├─ chatBarComponent                 command bar
│   ├─ message-picker               LEAF — pure DOM
│   ├─ command-selector             near-leaf (→ command-registry data)
│   ├─ define-form / eval-form / endow-modal / counter-proposal-form
│   │                                → monaco-wrapper, *-autocomplete
│   ├─ inline-command-form          → inline-define, inline-eval,
│   │                                 *-autocomplete
│   ├─ send-form                    → heat-bar, token-autocomplete,
│   │                                 composite-heat-engine
│   ├─ blob-viewer                  → monaco-wrapper, markdown-preview
│   ├─ debugger-panel*              LEAF — heavy (~688 lines)
│   └─ help-modal* / form-builder / command-executor (→ browser-tree)
└─ inboxComponent                   sidebar inbox
    └─ chime, markdown-render, monaco-wrapper, time-formatters, value-render
```

## Composition edges (full UI module graph)

Each entry lists the other UI/render modules a module imports.
`(none)` means it is a graph leaf.

| Module | Composes |
| --- | --- |
| spaces-gutter | add-space-modal, edit-space-modal |
| add-space-modal | icon-selector, scheme-picker, petname-paths-autocomplete, spaces-gutter |
| edit-space-modal | icon-selector, scheme-picker, spaces-gutter |
| inventory-component | (none) |
| channel-header | heat-engine, heat-simulation |
| channel-component | channel-utils, markdown-render, monaco-wrapper, profile-popup, react-utils, time-formatters |
| channel-utils | markdown-render, monaco-wrapper, profile-popup, time-formatters |
| chat-bar-component | blob-viewer, command-executor, command-registry, command-selector, debugger-panel, define-form, endow-modal, eval-form, form-builder, help-modal, inline-command-form, message-picker, send-form |
| inbox-component | chime, markdown-render, monaco-wrapper, time-formatters, value-render |
| command-executor | browser-tree |
| command-selector | command-registry |
| define-form | monaco-wrapper |
| endow-modal | petname-path-autocomplete |
| eval-form | monaco-wrapper, petname-path-autocomplete |
| form-builder | petname-path-autocomplete |
| help-modal | command-registry |
| inline-command-form | command-registry, inline-define, inline-eval, petname-path-autocomplete, petname-paths-autocomplete, token-autocomplete |
| send-form | composite-heat-engine, heat-bar, heat-engine, token-autocomplete |
| blob-viewer | language-detect, markdown-preview, monaco-wrapper |
| heat-simulation | heat-engine |
| heat-bar | heat-engine |
| value-component | language-detect, markdown-preview, monaco-wrapper, value-render |
| value-render | time-formatters |
| scheme-picker | spaces-gutter |
| share-modal | channel-utils |
| counter-proposal-form | monaco-wrapper, petname-path-autocomplete |
| inline-eval | petname-path-autocomplete |
| markdown-preview | monaco-wrapper |
| profile-popup | (none) |
| message-picker | (none) |
| icon-selector | (none) |
| inline-define | (none) |
| debugger-panel | (none) |
| command-registry | (none) |
| react-utils | (none) |
| heat-engine | (none) |
| markdown-render | (none) |
| monaco-wrapper | (none) |
| time-formatters | (none) |
| chime | (none) |
| token-autocomplete | (none) |
| petname-path-autocomplete | (none) |
| petname-paths-autocomplete | (none) |
| language-detect | (none) |
| message-parse | (none) |

## Not migration targets

These are graph leaves but are utilities, state logic, or external seams —
not views to re-author in Preact:
`markdown-render`, `value-render`, `time-formatters`, `language-detect`,
`message-parse`, `chime`, `heat-engine`, `command-registry`,
`channel-utils`, `react-utils`, and `monaco-wrapper` (the external-editor
seam).

## Migration tracker

Status: ☐ not started · ◐ in progress · ☑ done

### Tier 1 — leaf views, pure DOM, no `E()`/powers (do first)

| Component | Lines | Reached from | Status | Notes |
| --- | --- | --- | --- | --- |
| icon-selector | 81 | add/edit-space modals | ☐ | Deferred — lands with the still-DOM space modals |
| profile-popup | 153 | channel-component | ☑ | Done — confined Preact component |
| message-picker | 154 | chat-bar | ☑ | Done — confined Preact component |
| command-selector | 239 | chat-bar | ☑ | Done — confined Preact component |
| heat-bar | 250 | send-form | ☑ | Done — confined Preact component |
| inline-define | 358 | inline-command-form | ☑ | Done — confined Preact component |

### Tier 2 — leaves, but large or input-stateful (defer)

| Component | Lines | Status | Notes |
| --- | --- | --- | --- |
| debugger-panel | 688 | ☑ | Done — confined Preact, on-demand panel |
| inventory-component | 1267 | ☑ | Done — `InventoryList` + `InventoryItem`; see below |
| token-autocomplete | — | ☑ | Done — confined dropdown |
| petname-path-autocomplete | — | ☑ | Done — confined dropdown (pendingState bridge) |
| petname-paths-autocomplete | — | ☑ | Done — confined dropdown (pendingState bridge) |

### Channel list (left the inventory)

| Component | Status | Notes |
| --- | --- | --- |
| channel-list | ☑ | Done — standalone Preact component (`channel-list.js`), own CSS (`channel.css`); reorder over `SafeDataTransfer`. Creation moved to the New Space modal. |

### Tier 3 — composites (after their children)

| Component | Status | Notes |
| --- | --- | --- |
| inbox-component | ☑ | Done — the 1:1 recipient-filtered view; confined Preact in three stages (shell + 5 message types, markdown-vnodes + token chips, value-vnodes). Monaco colorize of code fences deferred. |
| edit-space-modal | ☑ | Done — confined Preact + reusable `IconSelector` (Batch B stage 1); scheme picker still host-embedded |
| send-form | ☑ | Done — reply-context bar confined; composes heat-bar ☑ + token-autocomplete ☑ as host-node controllers |
| help-modal | ☑ | Done — confined Preact leaf modal |
| share-modal | ☑ | Done — confined Preact leaf modal |
| scheme-picker | ☑ | Done — confined; keeps the `#scheme-picker-slot` embedding contract |
| inline-eval | ☑ | Done — confined; endowment rows compose autocomplete as host-node controllers |
| endow-modal | ☑ | Done — confined; definition-slot autocompletes host-embedded |
| form-builder | ☑ | Done — confined; recipient autocomplete host-embedded |
| inline-command-form | ◐ | In progress — composite; all children now converted |
| define-form | ◐ | In progress — first Monaco-embedding form (establishes the host-node editor pattern) |
| add-space-modal | ☐ | Batch B stage 2 — ~2000 lines; switch to `IconSelector`, then drop string `renderIconSelector` |
| chat-bar-component | ☐ | Blocked — still composes unconverted `eval-form`, `blob-viewer`, `command-executor` |
| channel-component | ☐ | Dan's multiuser channel view; stays imperative DOM for now |
| spaces-gutter / channel-header | ☐ | Larger composites, later |
| other Monaco forms | ☐ | `eval-form`, `blob-viewer`, `counter-proposal-form` — follow `define-form`'s host-node editor embedding once it lands |

### Whylip Space (separate `@endo/whylip` package)

| Component | Status | Notes |
| --- | --- | --- |
| whylip package | ◐ | In progress — porting React 19 + JSX → Preact `h()` (no JSX). New architecture: the package emits pure components (`WhylipApp`, no rendering), and chat's `whylip-component.js` mounts it through the **confined** renderer, so `SceneCanvas`'s untrusted model HTML is sanitized by `renderConfined`. |

## Recommended next migration

The Tier 1 leaves, the 1:1 inbox view, the inventory tree, and the channel list
have all landed (see Status). In progress: the Tier 2 leaves (`debugger-panel`
and the three keyboard-stateful autocompletes). After those, the bottom-up
order is:

- `icon-selector` together with the add/edit-space modals (it is the last
  Tier 1 leaf, deferred only because it is mounted by those still-DOM modals).
- the Tier 3 composites whose leaf dependencies are now converted —
  `chat-bar-component` (message-picker + command-selector are done) and
  `send-form` (heat-bar is done) are the lowest-risk.
- a follow-up to render Monaco-colorized code fences as vnodes (tokenization
  rather than the `colorize` HTML string) in the inbox and definition bodies.
- `icon-selector`: the smallest leaf (~81 lines), pure
  `renderIconSelector`, shared by the add/edit-space modals — unblocks that
  modal family.

Either exercises the full path — mount, props, event handler, teardown — on a
low-risk surface.

## Inventory bar (`inventory-component.js`) decomposition

> **Historical record.** This section captured the decomposition plan for the
> then-1267-line `inventoryComponent` monolith. The migration has since landed
> (see Status); the actual result and final step statuses are in "Migration
> order for the inventory bar" below. The plan named the recursive node
> `PetItem` (shipped as `InventoryItem`) and proposed `make*` drag-and-drop
> factories in `inventory/dnd.js` as a refactor step; the final `InventoryList`
> instead reimplemented drag-and-drop as Preact handlers over `SafeDataTransfer`,
> so `dnd.js` was removed. The channel pieces were lifted out of the inventory
> entirely (`channel-list.js`), not migrated as a sidebar. Line numbers are
> anchors from the original monolith, not current contracts.

The inventory bar is recorded above as a single graph leaf, but
`inventoryComponent` is a ~1267-line monolith that conflates a list
controller, a recursive tree node, several drag-and-drop systems,
channel-mode chrome, and a data adapter.
It must be factored into subcomponents before (or as) it is migrated; a
direct port would just move the monolith onto Preact.
Line numbers below are anchors at time of writing, not contracts.

### Current responsibilities (one function does all of this)

| Region | Lines | Responsibility |
| --- | --- | --- |
| `makeStaticNameIterator`, `makeStaticTreePowers` | 66, 103 | Adapt a static `ReadableTree.list()` snapshot to the live `followNameChanges()` streaming interface |
| `CONVERSABLE_TYPES` / `NON_EXPANDABLE_TYPES` / `HUB_TYPES` | 38–60 | Formula-type classification (selectable, expandable, drop-accepting) |
| `inventoryComponent` shell + `for await` consumer | 142–178, 1252–1266 | Subscribe to name changes, maintain the `$names` map, mount/cleanup rows, recurse into subtrees |
| Channel-mode header + `showNewForm` / `showJoinForm` | 178–410 | "Channels" title, New-channel and Join-channel inline forms |
| `dropTargetPath` / `clearAllDropTargets` / `showDropMenu` | 412–518 | Tree drag-and-drop: link/move an item between directories; the "Link here / Move here" menu |
| `createItem` | 519–1097 | The recursive pet-name **row** — wrapper, disclosure, name, type badge, action buttons, children, row-level drag-and-drop, channel menu, bookmarks |
| Channel-list reordering | 1099–1250 | List-level drag reorder with a drop indicator; persists via `onChannelReorder` |

### Proposed subcomponents

Visual pieces become Preact components; cross-cutting drag-and-drop and the
data adapter become hooks/utilities rather than views.

The channel-mode pieces have since been split out of the inventory entirely
(into `inventory/channel-sidebar.js`); they are listed separately below and
are not part of the inventory migration.

**Pet-name tree (this migration):**

- **InventoryList** (container/controller) — owns the `followNameChanges()`
  subscription, the `$names` map, and recursion; renders one `PetItem` per
  name.
  This is the orchestrator that survives as the top-level component.
- **PetItem** (recursive node) — the `createItem` shell; composes:
  - **ItemDisclosure** ☑ — the triangle, expand/collapse state, and the
    recursive child-list mount (the recursion seam back into
    `InventoryList`).
  - **ItemLabel** ☑ — the pet name + type badge (`inventory/item-label.js`).
  - **ItemActions** ☑ — info/inspect, cancel-pending, and remove buttons
    (`inventory/item-actions.js`).
- **DropMenu** ☑ — the link/move context menu, the one visual piece of the
  tree drag-and-drop (`inventory/drop-menu.js`).

**Channel sidebar (`inventory/channel-sidebar.js`; separate later migration):**

- **NewChannelForm** / **JoinChannelForm** — the channel-mode header forms.
- **ChannelItemMenu** — the per-channel `⋮` context menu (view-mode switch).
- **BookmarkList** / **BookmarkItem** — bookmarked threads under a channel,
  plus the remove context menu.
- Channel reordering already lives in `inventory/dnd.js` (`makeChannelReorder`).
- A shared **PopupMenu** in `components/` should fall out of `ChannelItemMenu`
  + `DropMenu`.

### Extract as framework-agnostic factories (behavior, not views)

These are **not** Preact hooks.
A `use*` hook only runs inside a component render, so it could not be called
from the current imperative `inventoryComponent` — naming them `use*` would
break the phase-1 premise (refactor with no Preact).
Each is a `make*` factory (repo idiom) that takes the DOM node(s) plus
callbacks, wires the listeners imperatively, and returns a `dispose()`.
That is callable from the current imperative code now, and during
convert-in-place it is invoked from
`useEffect(() => makeX(node, opts).dispose, deps)`.
A thin `useItemDragDrop` wrapper hook may be added at that point, but the
reusable core is always the agnostic factory.
Where practical, also split out the genuinely pure decision logic (e.g.
drop-target path, insertion-index hit-test, `acceptsDrop` type rule) as pure
functions the factory and any future hook both call.

- **inventory-tree-source** — `makeStaticNameIterator` +
  `makeStaticTreePowers`; the static-snapshot-vs-live-stream adapter.
- **makeItemDragDrop** — row-level drag source + drop target (544–676) and
  the `acceptsDrop` type probe; pairs with `dropTargetPath` /
  `clearAllDropTargets`.
- **makeChannelReorder** — list-level reorder + drop indicator (1099–1250).

### Phase 1 (refactor now) vs convert-in-place

Applying the two-phase rule to the pieces above:

| Piece | Treatment |
| --- | --- |
| `inventory-tree-source` (static/live adapter + type rules) | Phase 1 — extract now |
| `makeItemDragDrop` (row drag source/target, `acceptsDrop`, drop-target paths) | Phase 1 — extract now |
| `makeChannelReorder` (list reorder + indicator) | Phase 1 — extract now |
| controller↔row prop/callback boundary | Phase 1 — define now |
| `ItemLabel`, `ItemActions`, `DropMenu` | Convert-in-place |
| `ItemDisclosure` | Convert-in-place |
| `PetItem`, `InventoryList` shell | Convert-in-place |
| channel sidebar (`NewChannelForm` / `JoinChannelForm`, `BookmarkItem` / `BookmarkList`, `ChannelItemMenu`, reorder) | Split to `channel-sidebar.js`; separate later migration |

### Migration order for the inventory bar

Bottom-up, mirroring the overall strategy.
Steps 1 are Phase-1 refactors (no Preact); steps 2–5 convert markup in place.

1. Extract the non-visual seams first — pure refactors, no Preact yet:
   1. `inventory-tree-source` (`makeStaticNameIterator`,
      `makeStaticTreePowers`, type-classification constants). ☑ done
   2. `makeItemDragDrop` (row drag source + drop target + `acceptsDrop`). ☑ done
   3. `makeChannelReorder` (list reorder + drop indicator). ☑ done

   These dnd factories were behavior-tested in a real browser by
   `test/inventory-dnd` at the time. They have since been **removed**: when
   `InventoryList` was converted (step 5) the drag-and-drop was reimplemented as
   Preact event handlers over `SafeDataTransfer`, so `inventory/dnd.js` and the
   `test/inventory-dnd` probe were deleted.
2. Migrate the leaf views to `h()` components rendered through
   `renderConfined`:
   - `DropMenu` (inventory/drop-menu.js). ☑ done — the first Preact `h()`
     component. It is now rendered in-tree by `InventoryList`.
   - `ItemActions` (inventory/item-actions.js). ☑ done — info/cancel/remove
     buttons; owns the cancel two-click confirm state via hooks. Covered by
     `test/inventory-item-actions` (`yarn test:item-actions`) under severe
     lockdown. The `setup-preact-container.js` barrel also re-exports the Preact
     hooks for host components. (It originally mounted into a `display: contents`
     sub-host; that host is gone now that the whole row is one Preact tree.)
   - `ItemLabel` (inventory/item-label.js). ☑ done — pet name + type badge.
3. Migrate `ItemDisclosure` (inventory/item-disclosure.js). ☑ done — the
   triangle view; the expand/collapse behavior (async lookup + recursive
   mount) lives in `InventoryItem`.
4. Compose `InventoryItem` (the recursive node, was "PetItem"). ☑ done.
5. Convert `InventoryList`. ☑ done — one `renderConfined` owns the whole tree;
   link/move drag-and-drop is Preact handlers over `SafeDataTransfer`.

The channel pieces (`NewChannelForm` / `JoinChannelForm`, `BookmarkItem` /
`BookmarkList`, `ChannelItemMenu`, channel reorder) were **out of scope** for the
inventory migration. Rather than a later `channel-sidebar.js` migration, channels
were lifted out of the inventory entirely into the standalone
[`channel-list.js`](../channel-list.js) Preact component, and the New/Join forms
moved to the New Space modal. See the Status section.
