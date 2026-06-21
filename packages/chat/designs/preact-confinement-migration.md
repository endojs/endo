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
├─ inventoryComponent               LEAF (graph) — heavy (~1267 lines)
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
| icon-selector | 81 | add/edit-space modals | ☐ | Smallest; pure `renderIconSelector` |
| profile-popup | 153 | channel-component | ☐ | In default view; clean show/hide API |
| message-picker | 154 | chat-bar | ☐ | `{ $messagesContainer, onSelect }` |
| command-selector | 239 | chat-bar | ☐ | Only depends on command-registry (data) |
| heat-bar | 250 | send-form | ☐ | Visual; heat-engine is logic only |
| inline-define | 358 | inline-command-form | ☐ | No deps, no powers |

### Tier 2 — leaves, but large or input-stateful (defer)

| Component | Lines | Status | Notes |
| --- | --- | --- | --- |
| debugger-panel | 688 | ☐ | On-demand panel |
| inventory-component | 1267 | ☐ | Monolith — factor first (see below) |
| token-autocomplete | — | ☐ | Keyboard-stateful |
| petname-path-autocomplete | — | ☐ | Keyboard-stateful |
| petname-paths-autocomplete | — | ☐ | Keyboard-stateful |

### Tier 3 — composites (after their children)

`channel-component`, `chat-bar-component`, `inbox-component`,
`spaces-gutter`, `channel-header`, and the forms/modals migrate once their
leaf dependencies are converted.

## Recommended first migration

`profile-popup`: in the default `channelComponent` subtree, pure DOM,
~153 lines, no powers, no child components, with a tidy imperative
`show`/`hide` API and a single event handler (`onAssignName`).
It exercises the full path — mount, props, event handler, teardown — on a
low-risk surface.

## Inventory bar (`inventory-component.js`) decomposition

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

- **InventoryList** (container/controller) — owns the `followNameChanges()`
  subscription, the `$names` map, and recursion; renders one `PetItem` per
  name.
  This is the orchestrator that survives as the top-level component.
- **PetItem** (recursive node) — the `createItem` shell; composes:
  - **ItemDisclosure** — the triangle, expand/collapse state, and the
    recursive child-list mount (the recursion seam back into
    `InventoryList`).
  - **ItemLabel** — name (574) + type badge (749).
  - **ItemActions** — info/inspect (583, 710), cancel-pending (590, 603),
    and remove (638) buttons.
  - **ChannelItemMenu** — the per-channel context menu (786–828), only in
    `channelMode`.
  - **BookmarkList** / **BookmarkItem** — bookmarked threads rendered under
    a channel (879–950), plus the remove context menu.
- **ChannelActions** — the channel-mode header, wrapping **NewChannelForm**
  (220) and **JoinChannelForm** (297).
- **DropMenu** — the link/move context menu (461), the one visual piece of
  the tree drag-and-drop.

### Extract as hooks/utilities (behavior, not views)

- **inventory-tree-source** — `makeStaticNameIterator` +
  `makeStaticTreePowers`; the static-snapshot-vs-live-stream adapter.
- **useItemDragDrop** — row-level drag source + drop target (544–676) and
  the `acceptsDrop` type probe; pairs with `dropTargetPath` /
  `clearAllDropTargets`.
- **useChannelReorder** — list-level reorder + drop indicator (1099–1250).

### Migration order for the inventory bar

Bottom-up, mirroring the overall strategy:

1. Extract the non-visual seams first (`inventory-tree-source`,
   `useItemDragDrop`, `useChannelReorder`) — pure refactors, no Preact yet.
2. Migrate the leaf views: `ItemLabel`, `ItemActions`, `DropMenu`,
   `BookmarkItem`, `NewChannelForm` / `JoinChannelForm`.
3. Migrate `ItemDisclosure` + `BookmarkList` + `ChannelItemMenu`.
4. Compose `PetItem`, then `ChannelActions`.
5. Convert `InventoryList` last, once its children are Preact.
