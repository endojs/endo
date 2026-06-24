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
- **The inventory pet-name tree is fully migrated, and now lives in
  `@endo/space-chat`.** It is one confined Preact tree — `InventoryList`
  (container) + `InventoryItem` (recursive node), composing `ItemDisclosure`,
  `ItemLabel`, `ItemActions`, and `DropMenu`. Link/move drag-and-drop is Preact
  event handlers over `SafeDataTransfer`. The imperative `inventory/dnd.js`
  factories and the `test/inventory-dnd` browser probe are deleted; no
  `display: contents` mount hosts remain. Inventory is the conversation/sender
  picker for the default chat space (shown only in inbox mode, driving the
  inbox's recipient filter via `onSelectConversation`), so it belongs with
  `InboxRoot`: the pure tree moved into `@endo/space-chat/src/inventory/` and a
  thin host wrapper, [`inventory-component.js`](../inventory-component.js),
  stays in `@endo/chat` to own `renderConfined` — exactly the `InboxRoot` split.
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

- **Every leaf and near-leaf view has landed**, including the last stragglers:
  the Monaco-embedding forms `eval-form`, `blob-viewer`, and
  `counter-proposal-form` (copying `define-form`'s host-node editor pattern;
  `blob-viewer` also moved its markdown preview to `markdownToVnodes`), and
  `icon-selector` (the reusable `IconSelector`, no longer deferred).
- **The Whylip Space is fully ported** to confined Preact in the separate
  `@endo/space-whylip` package (`WhylipApp` + children authored in `h()`), mounted
  through the confined renderer by `whylip-component.js`.
- **The File Explorer Space is fully migrated** to confined Preact in its own
  `@endo/space-file-explorer` package (`FileExplorerApp` + store hook + view
  components; the imperative `file-explorer.js` was removed). `chat.js` is
  unchanged — `file-explorer-component.js` keeps the same mount signature.

What remains are the **outliner body** and the `inventory-graph` SVG view
(pending the renderer's SVG-tag support). `chat.js`'s discrete chrome regions
have since landed as confined Preact ([`chat-chrome.js`](../chat-chrome.js)); its
space-mode dispatch and top-level layout template stay imperative **by design**
(the trusted root that calls `renderConfined`). `spaces-gutter` and
`add-space-modal` have landed (the floot imperative-Space PR lifted their
freeze). A separate axis — extracting the in-chat bodies into standalone exported
**component packages** — is tracked under "Blockers to every space being an
exported component package" below. See the "Still on the DOM API" table and the
tracker below.

## Still on the DOM API (remaining migration targets)

Audited against the current tree. These view modules still build their UI with
`document.createElement` / `.innerHTML` / `addEventListener` and have **not**
been converted to confined Preact:

| Module                | Lines | Role                                                                                                                        |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- |
| outliner-component    | 3003  | `outliner` viewMode body — held for the decompose-into-contract approach                                                    |
| spaces-gutter         | —     | left space gutter — **☑ done** (confined `SpacesGutterView`; the floot imperative-Space PR landed, lifting the freeze)      |
| heat-simulation       | 225   | heat animation; still imperative but host-node-bridged by the converted `channel-header` (not a primary target)             |
| inventory-graph (pkg) | ~     | `@endo/space-inventory-graph/src/graph.js` SVG view — needs the renderer's `allowedTags`/`allowedAttrs` SVG extension first |

Newly **done** (confined Preact, verified + tests, mount signatures unchanged so
`chat.js` was untouched): **forum**, **value-component**, **channel-component**
(+ a follow-up so reply fires synchronously), **channel-header** (host-node-
bridges the imperative heat-simulation), and **chat-bar-component** (its two
`.innerHTML` view regions — the modeline and command popover — are confined;
the rest is irreducible imperative orchestration over the shared `#messages`
DOM).
| inventory-graph (pkg) | ~ | `@endo/space-inventory-graph/src/graph.js` SVG view (see below) |

### Deferred — frozen for an incoming imperative-Space PR

A separate PR adds a new Space defined the **legacy imperative way via a
package**, and will rebase on top of this work. To let it land without being
forced to convert to Preact during the rebase, two files are **deliberately left
imperative** until that PR lands — they are the only conflict surface for an
"add an imperative Space" change:

| Module          | Lines | Why frozen                                                                                                                                               |
| --------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| chat.js         | 1846  | the space-mode dispatch (`if (mode === 'x') return xComponent(...)`); stays the imperative trusted root that calls `renderConfined` on the Preact bodies |
| add-space-modal | 1979  | the creatable-space-type registration (scheme-picker entry)                                                                                              |

Converting a body/chrome view **in place** never edits these (same mount
signature in, same API out), so all other conversions can proceed without
conflicting with that PR. Resume `chat.js` / `add-space-modal` after it lands.

Two of the special-space views live in separate packages reached through a thin
chat wrapper; they are **in scope**, just tracked in their own package:

- `peers-component` → `@endo/space-peers/src/peers.js` — **done** (already
  confined Preact); the chat wrapper is a thin confined mount.
- `inventory-graph-component` → `@endo/space-inventory-graph/src/graph.js` —
  **still DOM** (~28 `createElement`/SVG calls); a remaining migration target in
  that package. The chat wrapper just resolves powers and delegates.

Also still DOM but **not** view-migration targets (render helpers consumed via
`.innerHTML`; the plan migrates their _callers_ to vnodes, not these): the
string-returning `value-render` / `markdown-render` / `markdown-preview`, and the
`channel-utils` / `react-utils` state logic. Preact-vnode replacements already
exist for the inbox path (`markdown-vnodes`, `value-vnodes`).

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
│   ├─ profile-popup                LEAF — Preact ☑
│   ├─ react-utils                  emoji-reaction state (logic, not a view)
│   ├─ markdown-render              → HTML string (util)
│   ├─ monaco-wrapper               Monaco seam (external editor)
│   └─ time-formatters              util
├─ chatBarComponent                 command bar
│   ├─ message-picker               LEAF — Preact ☑
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

| Module                     | Composes                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| spaces-gutter              | add-space-modal, edit-space-modal                                                                                                                                                                |
| add-space-modal            | icon-selector, scheme-picker, petname-paths-autocomplete, spaces-gutter                                                                                                                          |
| edit-space-modal           | icon-selector, scheme-picker, spaces-gutter                                                                                                                                                      |
| inventory-component        | (none)                                                                                                                                                                                           |
| channel-header             | heat-engine, heat-simulation                                                                                                                                                                     |
| channel-component          | channel-utils, markdown-render, monaco-wrapper, profile-popup, react-utils, time-formatters                                                                                                      |
| channel-utils              | markdown-render, monaco-wrapper, profile-popup, time-formatters                                                                                                                                  |
| chat-bar-component         | blob-viewer, command-executor, command-registry, command-selector, debugger-panel, define-form, endow-modal, eval-form, form-builder, help-modal, inline-command-form, message-picker, send-form |
| inbox-component            | chime, markdown-render, monaco-wrapper, time-formatters, value-render                                                                                                                            |
| command-executor           | browser-tree                                                                                                                                                                                     |
| command-selector           | command-registry                                                                                                                                                                                 |
| define-form                | monaco-wrapper                                                                                                                                                                                   |
| endow-modal                | petname-path-autocomplete                                                                                                                                                                        |
| eval-form                  | monaco-wrapper, petname-path-autocomplete                                                                                                                                                        |
| form-builder               | petname-path-autocomplete                                                                                                                                                                        |
| help-modal                 | command-registry                                                                                                                                                                                 |
| inline-command-form        | command-registry, inline-define, inline-eval, petname-path-autocomplete, petname-paths-autocomplete, token-autocomplete                                                                          |
| send-form                  | composite-heat-engine, heat-bar, heat-engine, token-autocomplete                                                                                                                                 |
| blob-viewer                | language-detect, markdown-preview, monaco-wrapper                                                                                                                                                |
| heat-simulation            | heat-engine                                                                                                                                                                                      |
| heat-bar                   | heat-engine                                                                                                                                                                                      |
| value-component            | language-detect, markdown-preview, monaco-wrapper, value-render                                                                                                                                  |
| value-render               | time-formatters                                                                                                                                                                                  |
| scheme-picker              | spaces-gutter                                                                                                                                                                                    |
| share-modal                | channel-utils                                                                                                                                                                                    |
| counter-proposal-form      | monaco-wrapper, petname-path-autocomplete                                                                                                                                                        |
| inline-eval                | petname-path-autocomplete                                                                                                                                                                        |
| markdown-preview           | monaco-wrapper                                                                                                                                                                                   |
| profile-popup              | (none)                                                                                                                                                                                           |
| message-picker             | (none)                                                                                                                                                                                           |
| icon-selector              | (none)                                                                                                                                                                                           |
| inline-define              | (none)                                                                                                                                                                                           |
| debugger-panel             | (none)                                                                                                                                                                                           |
| command-registry           | (none)                                                                                                                                                                                           |
| react-utils                | (none)                                                                                                                                                                                           |
| heat-engine                | (none)                                                                                                                                                                                           |
| markdown-render            | (none)                                                                                                                                                                                           |
| monaco-wrapper             | (none)                                                                                                                                                                                           |
| time-formatters            | (none)                                                                                                                                                                                           |
| chime                      | (none)                                                                                                                                                                                           |
| token-autocomplete         | (none)                                                                                                                                                                                           |
| petname-path-autocomplete  | (none)                                                                                                                                                                                           |
| petname-paths-autocomplete | (none)                                                                                                                                                                                           |
| language-detect            | (none)                                                                                                                                                                                           |
| message-parse              | (none)                                                                                                                                                                                           |

## Not migration targets

These are graph leaves but are utilities, state logic, or external seams —
not views to re-author in Preact:
`markdown-render`, `markdown-preview` (both return HTML strings; consumed via
`.innerHTML` by view modules — migrate those callers to `markdownToVnodes`
instead), `value-render`, `time-formatters`, `language-detect`,
`message-parse`, `chime`, `heat-engine`, `command-registry`,
`channel-utils`, `react-utils`, `layer-diff` (pure string-diff helpers),
`browser-tree` (a filesystem tree data structure + `checkoutToDirectory`, no
DOM), `command-executor` (command orchestration, no DOM), and `monaco-wrapper`
(the external-editor seam).
`peers-component` and `inventory-graph-component` are thin chat wrappers that
delegate to the separate `@endo/space-peers` and `@endo/space-inventory-graph`
packages; the real views live there and are **in scope** (tracked in those
packages). `chat-network-view`'s `peers.js` is already confined Preact (done);
`inventory-graph`'s `graph.js` is still on the DOM API (remaining).

## Migration tracker

Status: ☐ not started · ◐ in progress · ☑ done · ⊘ deferred (frozen imperative
for the incoming imperative-Space PR — see "Deferred" above)

### Tier 1 — leaf views, pure DOM, no `E()`/powers (do first)

| Component        | Lines | Reached from          | Status | Notes                                                    |
| ---------------- | ----- | --------------------- | ------ | -------------------------------------------------------- |
| icon-selector    | 81    | add/edit-space modals | ☑      | Done — reusable `IconSelector` confined Preact component |
| profile-popup    | 153   | channel-component     | ☑      | Done — confined Preact component                         |
| message-picker   | 154   | chat-bar              | ☑      | Done — confined Preact component                         |
| command-selector | 239   | chat-bar              | ☑      | Done — confined Preact component                         |
| heat-bar         | 250   | send-form             | ☑      | Done — confined Preact component                         |
| inline-define    | 358   | inline-command-form   | ☑      | Done — confined Preact component                         |

### Tier 2 — leaves, but large or input-stateful (defer)

| Component                  | Lines | Status | Notes                                               |
| -------------------------- | ----- | ------ | --------------------------------------------------- |
| debugger-panel             | 688   | ☑      | Done — confined Preact, on-demand panel             |
| inventory-component        | 1267  | ☑      | Done — `InventoryList` + `InventoryItem`; see below |
| token-autocomplete         | —     | ☑      | Done — confined dropdown                            |
| petname-path-autocomplete  | —     | ☑      | Done — confined dropdown (pendingState bridge)      |
| petname-paths-autocomplete | —     | ☑      | Done — confined dropdown (pendingState bridge)      |

### Channel list (left the inventory)

| Component    | Status | Notes                                                                                                                                                    |
| ------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| channel-list | ☑      | Done — standalone Preact component (`channel-list.js`), own CSS (`channel.css`); reorder over `SafeDataTransfer`. Creation moved to the New Space modal. |

### Tier 3 — composites (after their children)

| Component                                       | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inbox-component                                 | ☑      | Done — the 1:1 recipient-filtered view; confined Preact in three stages (shell + 5 message types, markdown-vnodes + token chips, value-vnodes). Monaco colorize of code fences deferred.                                                                                                                                                                                                                                                                                                                                                                                    |
| edit-space-modal                                | ☑      | Done — confined Preact + reusable `IconSelector` (Batch B stage 1); scheme picker still host-embedded                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| send-form                                       | ☑      | Done — reply-context bar confined; composes heat-bar ☑ + token-autocomplete ☑ as host-node controllers                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| help-modal                                      | ☑      | Done — confined Preact leaf modal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| share-modal                                     | ☑      | Done — confined Preact leaf modal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| scheme-picker                                   | ☑      | Done — confined; keeps the `#scheme-picker-slot` embedding contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| inline-eval                                     | ☑      | Done — confined; endowment rows compose autocomplete as host-node controllers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| endow-modal                                     | ☑      | Done — confined; definition-slot autocompletes host-embedded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| form-builder                                    | ☑      | Done — confined; recipient autocomplete host-embedded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| inline-command-form                             | ☑      | Done — composite; confines its chrome, composes its converted children as host-node controllers                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| define-form                                     | ☑      | Done — first Monaco-embedding form; established the host-node editor pattern + the Monaco test stub                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| eval-form / blob-viewer / counter-proposal-form | ☑      | Done — Monaco forms on define-form's host-node editor pattern; blob-viewer moved its markdown preview to `markdownToVnodes`                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| microblog                                       | ☑      | Done — `microblog` viewMode body; confined Preact via `renderConfined`, `markdownToVnodes` bodies, host-node-bridged author/react chips                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| value-component                                 | ☑      | Done — value content via `valueToVnodes`, blob preview as a confined `BlobContent`; modal chrome stays host DOM                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| chat-bar-component                              | ☑      | Done (view regions) — modeline + command popover confined; the rest is irreducible imperative orchestration over shared `#messages` DOM                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| channel-component                               | ☑      | Done — Dan's body; host-node-controller pattern for `react-utils`/`channel-utils`/`profile-popup`; +sync-reply follow-up                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| channel-header                                  | ☑      | Done — menu/invite/members/attenuator confined; host-node-bridges the imperative `heat-simulation`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| forum                                           | ☑      | Done — `forum` viewMode body; same pattern as microblog (a first attempt that only landed a test was reverted, then redone for real)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| spaces-gutter                                   | ☑      | Done — the floot imperative-Space PR has landed, lifting the freeze. The space icons, add-space button, and per-space context menu are one confined Preact tree (`SpacesGutterView`) driven by a host controller (`GutterViewState` snapshots + select/edit/delete/add callbacks); the menu dismisses via an in-tree focusable backdrop. All the stateful host work (pet-store load, watcher, modals, scheme, Cmd+1..9) is unchanged.                                                                                                                                       |
| outliner                                        | ☐      | ~3003 lines — largest body; needs the file-explorer-style decompose-into-contract approach, not a one-shot                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| add-space-modal                                 | ☑      | Done — the whole wizard (chooser + all nine forms) is confined Preact via `renderConfined`, closing the unescaped-interpolation (`value="${userTyped}"`) injection surface that was the one open HIGH finding. Wizard state + the nine daemon submit handlers stay host-side; the scheme picker and pet-name autocompletes still mount into the slot/anchor elements the view renders (synchronous `renderConfined`). The per-render Escape-listener leak is fixed (registered once). Covered by `test/component/add-space-modal.test.js` (incl. an injection-safety case). |
| chat.js (root orchestrator)                     | ◐      | Chrome confined — the profile breadcrumbs, the channel-invitations inbox, and the mention-notify prompts/toasts are confined Preact in `chat-chrome.js` (closing the `@${petName}` → `innerHTML` interpolation; tested). The space-mode dispatch and top-level layout template stay imperative **by design** — the trusted root that calls `renderConfined`, never itself a confined component.                                                                                                                                                                             |

### Whylip Space (separate `@endo/space-whylip` package)

| Component      | Status | Notes                                                                                                                                                                                                                                                                        |
| -------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| whylip package | ☑      | Done — ported React 19 + JSX → Preact `h()` (no JSX). The package emits pure components (`WhylipApp`, no rendering), and chat's `whylip-component.js` mounts it through the **confined** renderer, so `SceneCanvas`'s untrusted model HTML is sanitized by `renderConfined`. |

### File Explorer Space (separate `@endo/space-file-explorer` package)

| Component           | Status | Notes                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| space-file-explorer | ☑      | Done — confined Preact: `FileExplorerApp` + the `useFileExplorer` store hook + view components (Toolbar, Columns/Tree/EntryRow, Viewer, Status, Dialog, Inventory). `file-explorer-component.js` mounts it through `renderConfined`; the imperative `file-explorer.js` (~2827 lines) was removed. Same mount signature, so `chat.js` is untouched. |

## Recommended next migration

Every leaf and near-leaf is converted, along with the 1:1 inbox, the inventory
tree, the channel list, the Whylip + File Explorer spaces, the microblog/forum/
value/channel/channel-header/chat-bar bodies, and — now that the floot
imperative-Space PR has landed and lifted their freeze — the **spaces gutter**
and the **add-space modal** (the latter closing the one open HIGH XSS finding).

Three migration targets remain, each its own focused effort:

- `@endo/space-inventory-graph`'s `graph.js` (~28 SVG `createElement`s) — **blocked
  first** on teaching the confined renderer to admit SVG tags/attributes (a
  `@endo/preact-container` feature addition with its own tests), then the graph
  view converts. Smallest and fully verifiable in-container.
- `outliner` (~3003) — the largest body and the hardest: it is a `contentEditable`
  collaborative editor with cursor/selection/range management and drag-and-drop,
  which fights the refs-stripped confined renderer. Decompose into a contract +
  parallel agents (the file-explorer approach), with the host owning the editable
  DOM and the confined view rendering structure; **not** a one-shot.
- `chat.js` (~1860) — stays the imperative trusted dispatch root by design (it
  calls `renderConfined` on the Preact bodies). Its discrete chrome regions
  (the profile breadcrumbs, the channel-invitations inbox section, and the
  mention-notify prompts/toasts) **have now been confined in place** in
  [`chat-chrome.js`](../chat-chrome.js), closing the unescaped `@${petName}` →
  `innerHTML` interpolation in the mention-notify path (covered by
  `test/component/chat-chrome.test.js`). The space-mode dispatch and top-level
  layout template remain imperative by design.
- a standing follow-up: render Monaco-colorized code fences as vnodes
  (tokenization rather than the `colorize` HTML string) in the inbox and
  definition bodies.

### Type-checking the extracted UI packages (tracked debt)

A third axis, distinct from view migration and packaging: whether a package's
source survives the repo-wide `tsc`/typedoc pass.
The `docs` job type-checks `packages/**/*.js` through the root
[`tsconfig.json`](../../../tsconfig.json), filtered only by that file's
`exclude` list; the same packages are excluded from
[`typedoc.json`](../../../typedoc.json) so they are not type-checked or
documented.

Status by extracted package:

| Package             | In typecheck? | Why                                                                                                       |
| ------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| `@endo/chat-kit`    | ☑ yes         | shared primitives, authored type-clean                                                                    |
| `@endo/space-chat`  | ☑ yes         | `InboxRoot` plus the inventory tree — both confined Preact and type-clean (inventory was type-checked for the first time when it moved here, and passed with no fixes) |
| `@endo/space-channel` | ☑ yes       | re-admitted after a JSDoc/cast pass fixed its 51 checkJs errors (see below) |

`space-channel` is now in both `tsconfig.json` and `typedoc.json`.
Re-admitting it turned out to be **independent of the `outliner` view
migration**, correcting an earlier assumption recorded here: the "~307 errors"
figure was a typedoc grand-total artifact; under the real (root-equivalent)
config the package had only **51** checkJs errors (23 in `outliner-component`),
and they were ordinary typing gaps — untyped `E(ref).method()` calls
(`EMethods<Required<unknown>>`), `setTimeout`→`Timeout`-vs-`number`,
`iterateReader` arg casts, optional-callback guards, and `string | undefined`
narrowings — not artifacts of imperative DOM.
A types/JSDoc/casts-only pass (a shared `ChannelRef` typedef plus the codebase's
existing inline-cast idioms) drove them to zero with no behavioral change except
one genuine latent bug it surfaced: `E(powers).lookup(...name.split('/'))`
spread a multi-segment token path as varargs into a single-arg `lookup`,
silently dropping all but the first segment — now passed as an array.
So the imperative→confined-Preact conversion of `outliner` is **no longer
gated by, nor gating, the typecheck**; it is a pure architectural cleanup that
can proceed on its own schedule.

## Blockers to every space being an exported component package

There are **three independent axes** in this migration that are easy to conflate:

- **View migration** — replace a body's imperative DOM construction with confined
  Preact rendered through `renderConfined`. This is what the tracker above is
  about, and it is nearly complete.
- **Packaging** — make each space body a standalone workspace package that
  **exports a component**, like `@endo/space-file-explorer` / `-whylip` /
  `-peers` / `-inventory-graph`, reached through a thin chat wrapper.
- **Type-checking** — whether the package's source is admitted to the repo-wide
  `tsc`/typedoc pass (see "Type-checking the extracted UI packages" above). A
  body can be packaged but still typecheck-excluded if its view is unconverted;
  `@endo/space-channel` is exactly that case today.

A body can be fully confined Preact (view done) and still **not** be extractable
as a package. Most bodies are in exactly that state today: their views are
migrated, but they remain modules _inside_ `@endo/chat` that `chat.js` imports
and calls directly (`channel-component`, `forum-component`, `outliner-component`,
`microblog-component`, `inbox-component`, `value-component`, `chat-bar-component`).

The blockers to the packaging axis, in rough order of how much they bite:

1. **Entry-contract divergence.** Extracted packages use a uniform _pure_
   contract — `component(props) → cleanup` — and touch nothing beyond their own
   mount node. The in-chat bodies use an imperative mount-and-mutate signature
   that varies per body (`channelComponent($parent, $end, channel, options)`,
   `valueComponent($parent, powers, options)`, …) and **stashes a control API
   back onto the host node** — e.g. it assigns `$parent.channelAPI` a
   `{ closeThread, dispose, focusOnNode }` object that `chat.js` then reads back.
   Host and body communicate through DOM-node mutation and heterogeneous argument
   lists rather than props, so the body cannot be `export`ed as a component
   as-is. (Refs: `channel-component.js` signature + the `$parent`-stashed API;
   the dispatch in `chat.js` ~620–930.)

2. **Shared-module coupling (would-be circular dependency).** The bodies import
   chat-internal helpers that live in `@endo/chat`: `channel-utils`
   (channel/forum/outliner/microblog), `edit-queue` (outliner/microblog/forum),
   `react-utils`, `token-autocomplete`, `send-form`, `profile-popup`. A
   body-as-package importing `../chat/channel-utils.js` is backwards — it would
   make a leaf package depend on the app. Until those shared helpers are reachable
   from outside `@endo/chat`, every coupled body is pinned in place. This is the
   gating blocker: the bodies with **no** such coupling are the only ones close to
   extractable.

3. **CSS packaging.** Extracted packages ship their own stylesheet (e.g.
   `space-peers`, and `channel.css` for the channel list, exposed via the package
   `exports` field); the in-chat bodies render against the app's global
   stylesheet. Extraction has to carry each body's styles into its package rather
   than leave them in the shared sheet.

4. **`contentEditable` / cursor ownership (outliner and chat-bar only).** These
   two own a live editable surface with selection / range / caret state that
   fights the refs-stripped confined renderer. On top of the contract and coupling
   issues, they need the host to retain the editable DOM while the confined view
   renders structure — the decompose-into-contract approach already noted for the
   outliner.

### Per-body extractability

| Body                | Extractable today? | Specific blocker                                                                                                                                                                                                   |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| inbox-component     | ☑ extracted        | now `@endo/space-chat` (pure `InboxRoot`) + a thin host wrapper; the first body to leave the app                                                                                                                   |
| value-component     | closest ◐          | now owns its frame DOM + visibility + `dispose` (no longer queries chat's template); remaining: own CSS (+ drop the internal element IDs for multi-instance safety)                                                |
| microblog-component | ☑ extracted        | now in `@endo/space-channel`                                                                                                                                                                                       |
| forum-component     | ☑ extracted        | now in `@endo/space-channel`                                                                                                                                                                                       |
| channel-component   | ☑ extracted        | now in `@endo/space-channel`                                                                                                                                                                                       |
| outliner-component  | ☑ extracted        | now in `@endo/space-channel` (still imperative-DOM internally; view-migration is a separate axis)                                                                                                                  |
| chat-bar-component  | no (hardest) ◐     | `dispose` now complete (the leaked global listeners are removed); remaining: queries `#chat-*` template DOM, observes the shared `#messages` container, owns a `contentEditable` input, composes the command forms |

The already-packaged spaces (`space-file-explorer`, `-whylip`, `-peers`,
`-inventory-graph`) cleared all four because they were authored against the pure
contract from the start (or rewritten into it) and carry their own helpers and
CSS. `chat.js` itself is **not** on this axis — it is the trusted dispatch root
that mounts the packages, not a space body.

**In-place progress (no new package).** Three bodies were moved toward the
uniform `component(props) -> cleanup` contract without extracting them:
`inbox-component` no longer threads the host scroll node into its confined
`InboxRoot` (scroll is two host callbacks) and returns a `dispose()`;
`value-component` now **builds and owns its own modal frame** (visibility +
teardown included) instead of querying chat's `#value-*` template — chat.js's
`controlsComponent` and the `#value-frame` template block are gone, and the value
body is created early, dissolving the old `focusValue`/`blurValue` forward-
reference dance; and `chat-bar-component`'s `dispose()` now removes its three
leaked global `document`/`window` listeners. `chat.js` captures and disposes the
inbox and value bodies at its teardown point. The remaining blockers above
(per-package CSS, the `contentEditable` bodies, shared-module coupling) are the
larger efforts still outstanding.

## Chat / channel family split — `@endo/space-chat` + `@endo/space-channel`

> **Contract (agreed, not yet built).** The boundary for separating the
> single-sender "default chat" from the multiuser "channel" family. Captured here
> before any files move; supersedes nothing yet.

### Goal

Today `@endo/chat` mixes two unrelated messaging families plus the shared shell
that hosts them:

- **Default chat** — the 1:1, recipient-filtered mailbox (`inbox-component`) and
  its single-sender message rendering.
- **Channel family** — the multiuser `channel` / `forum` / `outliner` /
  `microblog` bodies and their features (threads, reactions, collaborative
  edits, member chips).

The seam is already real: `inbox-component` imports **none** of the channel
substrate (`channel-utils`, `react-utils`, `edit-queue`, `profile-popup`,
`token-autocomplete`) — only leaf rendering utils (`markdown-render`,
`markdown-vnodes`, `value-vnodes`, `time-formatters`, `chime`, `locator`). So the
two families can become separate packages. The catch is that this is **three
buckets, not two** — a few things are shared by both and belong to neither.

### The three buckets + the host shell

| Bucket                          | Contents                                                                                                                                                                                                                | Rationale                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@endo/space-chat`** (new)    | `inbox-component` (the 1:1 mailbox body)                                                                                                                                                                                | Touches zero channel modules; standalone today.                                                                                                                             |
| **`@endo/space-channel`** (new) | `channel` / `forum` / `outliner` / `microblog` bodies **+** `channel-utils`, `react-utils`, `edit-queue`, `profile-popup` (likely `channel-header` too)                                                                 | The 4 bodies and their 4 substrate modules relocate **as one unit**, so the circular-dep blocker dissolves: a body imports `channel-utils` from _within its own package_.   |
| **Shared base** (the enabler)   | `markdown-render`, `markdown-vnodes`, `value-vnodes`, `value-render`, `time-formatters`, `language-detect`, `message-parse`, `chime`, `locator`, `token-autocomplete`, `heat-engine`/`composite-heat-engine`/`heat-bar` | Both packages and the shell import these. Confinement primitives already live in `@endo/preact-container`; these chat-specific leaf utils have no home outside the app yet. |
| **Host shell** (`@endo/chat`)   | `chat.js` dispatch root, `spaces-gutter`, `inventory`, `channel-list`, **`chat-bar` + `send-form`** (the shared compose box), **`value-component`** (the shared value viewer), the modals                               | Mounts whichever space; the compose box and value viewer are persistent chrome used in **both** families.                                                                   |

### The two decisions this contract fixes

1. **A shared base package is the prerequisite, not optional.** Without it,
   `space-chat` → `@endo/chat` (for `markdown-vnodes` etc.) is circular — the same
   "shared-module coupling" blocker, now narrowed from the whole channel substrate
   down to a handful of genuinely-shared leaf utils. Name TBD (e.g.
   `@endo/chat-kit`). Let its surface **emerge from real demand** (start with
   exactly what `inbox` needs) rather than designing it up front.

2. **The compose box and value viewer stay shell-side and shared.**
   `chat-bar`/`send-form` already takes channel behavior through injected
   callbacks (`getChannelRef`, `onMentionNotify`), so `chat.js` keeps injecting the
   channel-specific bits (reply types, mention-notify, `channelReply`) from the
   active space. `value-component` (the value overlay) is reached by every body via
   `showValue`. Both remain shell chrome. Fully decoupling the compose box (the
   space body supplies a "compose adapter") is a **later tightening**, explicitly
   out of scope for the initial split.

### Open interface questions (deferred)

- **Compose adapter.** Long-term, `space-channel` should provide its reply-type /
  mention-notify behavior to the shell's compose box through a typed adapter
  rather than the current ad-hoc callbacks. Deferred — the callbacks work.
- **`channel-header` placement.** It is channel-only chrome but is mounted by the
  dispatch root; it can sit in `space-channel` or stay in the shell. Decide when
  channel moves.
- **`token-autocomplete` ownership.** Needed by both the shell's `send-form` and
  `space-channel`'s `outliner`, so it lands in the shared base — but it is a large
  `contentEditable` host controller, the heaviest thing in the base.

### Recommended sequence

1. **This contract** (done — agreed boundary).
2. **Shared base `@endo/chat-kit`** — ☑ **done**. The six leaf utils
   (`markdown-render`, `markdown-vnodes`, `value-vnodes`, `time-formatters`,
   `chime`, `locator`) moved into the package; they author vnodes with plain
   `preact` (the host applies `renderConfined`). All in-app importers repoint to
   `@endo/chat-kit/*`.
3. **`@endo/space-chat`** — ☑ **done**. `inbox` extracted: the package exports the
   pure `InboxRoot` component; `@endo/chat/inbox-component.js` is now the thin host
   wrapper (`renderConfined` + scroll + `dispose`), entry signature unchanged so
   `chat.js` and the inbox tests were untouched.

   **Lesson recorded for the next packages:** a private app (`@endo/chat`) is
   exempt from the workspace-wide `typedoc` and `SECURITY.md` checks, but an
   extracted package is **not**. Latent issues the app tolerated (a too-narrow
   `VNode[]` body type) became hard CI failures once moved. New packages must
   ship a `SECURITY.md` and a `LICENSE`. As for type-cleanliness: the app
   packages (chat + every `space-*`) are **excluded from the workspace typedoc**
   (`typedoc.json`), so an extracted UI package is not docs-gated — `chat-kit`,
   `space-chat`, and `space-channel` were added to that exclude list. (`space-chat`
   was the case that taught this: it briefly failed the docs build only because it
   was the one app package missing from the exclude list.)

4. **`@endo/space-channel`** — ☑ **done**. The four bodies (`channel`, `forum`,
   `microblog`, `outliner`) + their substrate (`channel-utils`, `react-utils`,
   `edit-queue`, `profile-popup`) moved as a unit, so the substrate coupling
   resolves (a body imports `channel-utils` from within its own package). Done in
   phases: (A) `token-autocomplete` → `chat-kit` (the shared `contentEditable`
   controller outliner + send-form both need); (B/C) the 8 family files moved
   together (intra-family imports stay relative); `channel-header` stays in the
   shell (needs `heat-*`, not the moved substrate); `send-form` stays in the shell
   (the bodies referenced only its `SendFormAPI` _type_, loosened to `object`);
   `channel.css` ships via the package's `./channel.css` export. The 106
   channel-family tests pass through `@endo/space-channel`.

This front-loaded the cheap, high-confidence win (`inbox`) and deferred the heavy
channel move until the base and the pattern were proven. It was the first work to
**create packages and move files across them** — which is why the boundary was
written down first.

**The chat/channel split is complete:** `@endo/chat-kit` (shared base),
`@endo/space-chat` (1:1 inbox), and `@endo/space-channel` (the channel family) all
exist; `@endo/chat` is the host shell that mounts them and keeps the dispatch root,
the compose box (`chat-bar`/`send-form`), `channel-header`, and the value viewer.

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

| Region                                                     | Lines              | Responsibility                                                                                                                                     |
| ---------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `makeStaticNameIterator`, `makeStaticTreePowers`           | 66, 103            | Adapt a static `ReadableTree.list()` snapshot to the live `followNameChanges()` streaming interface                                                |
| `CONVERSABLE_TYPES` / `NON_EXPANDABLE_TYPES` / `HUB_TYPES` | 38–60              | Formula-type classification (selectable, expandable, drop-accepting)                                                                               |
| `inventoryComponent` shell + `for await` consumer          | 142–178, 1252–1266 | Subscribe to name changes, maintain the `$names` map, mount/cleanup rows, recurse into subtrees                                                    |
| Channel-mode header + `showNewForm` / `showJoinForm`       | 178–410            | "Channels" title, New-channel and Join-channel inline forms                                                                                        |
| `dropTargetPath` / `clearAllDropTargets` / `showDropMenu`  | 412–518            | Tree drag-and-drop: link/move an item between directories; the "Link here / Move here" menu                                                        |
| `createItem`                                               | 519–1097           | The recursive pet-name **row** — wrapper, disclosure, name, type badge, action buttons, children, row-level drag-and-drop, channel menu, bookmarks |
| Channel-list reordering                                    | 1099–1250          | List-level drag reorder with a drop indicator; persists via `onChannelReorder`                                                                     |

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
  - `DropMenu`.

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

| Piece                                                                                                               | Treatment                                               |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `inventory-tree-source` (static/live adapter + type rules)                                                          | Phase 1 — extract now                                   |
| `makeItemDragDrop` (row drag source/target, `acceptsDrop`, drop-target paths)                                       | Phase 1 — extract now                                   |
| `makeChannelReorder` (list reorder + indicator)                                                                     | Phase 1 — extract now                                   |
| controller↔row prop/callback boundary                                                                               | Phase 1 — define now                                    |
| `ItemLabel`, `ItemActions`, `DropMenu`                                                                              | Convert-in-place                                        |
| `ItemDisclosure`                                                                                                    | Convert-in-place                                        |
| `PetItem`, `InventoryList` shell                                                                                    | Convert-in-place                                        |
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

## Test stability — fixed-tick follow-ups (deferred)

The component tests under [`test/component`](../test/component) wait for
confined renders to settle with `await tick(ms)`, where
[`tick`](../test/helpers/dom-setup.js) is a fixed `setTimeout`. A fixed delay
races the render on a loaded CI runner: the macOS job has intermittently failed
because the assertion ran before the async render/strip it depended on
completed.

Fixed so far (the flakes actually observed in CI):

- `inline-eval.test.js` — the leading-`@` strip is asserted only after polling
  for the stripped value, not on the tick that mounts the code-name sub-mount.
- `inline-command-form.test.js` — the 19 tests were serialized; they shared
  `document.body` with a global `afterEach` wipe, so parallel runs let one
  test's teardown clear another's DOM mid-assertion.
- `forum.test.js` — not a fixed-tick race (the assertions already poll with
  `waitFor`) but a teardown leak. The flake surfaced two ways across identical
  runs: the `a root message renders as a forum node` / dispose assertions
  failing, and the run reporting "N uncaught exceptions". Both traced to the
  test's detached `.catch` **re-throwing** the consumer-loop rejection — an
  unhandled rejection AVA then attributes to whichever test is running — and to
  the mounted component never being disposed, so its parked `for await` loop,
  its reader prefetch, and the initial-batch `setTimeout` leaked across tests
  and could fire against a torn-down DOM. Fixed by (a) dropping the re-throw
  (the `.catch` only logs; tests assert on observable DOM/spy state), (b)
  disposing every mounted component in `afterEach` before the shared DOM is
  cleared, and (c) hardening `forumComponent`'s `dispose()` to cancel the
  pending batch timer, with a `disposed` guard in the batch-render callbacks so
  an already-queued timer cannot render post-dispose.

**Done — the full sweep landed.** Every component test under
[`test/component`](../test/component) that used a fixed `await tick(ms)` to wait
for a render/async update before an assertion now polls the asserted condition
with `waitFor(predicate)` instead. The conversion is condition-driven: each
former settle-wait now polls exactly what the following assertion checks (the
rendered node/class, the spy-call count, the controller flag), so the assertion
can never run before the state it depends on exists.

A small set of `tick` calls is intentionally KEPT, each with a comment, because
they are deliberate timing devices rather than settle-waits:

- race / async-latency simulations that intentionally interleave work (e.g.
  `channel-thread.test.js`'s generation-counter and queued-re-render tests),
- microtask flushes (`await tick(0)` / `await null`) used to let an iterator's
  `return()` settle before teardown,
- settle delays that precede a NEGATIVE assertion (asserting something did
  _not_ render / stays absent), where there is no positive condition to poll,
- the short `tick(80)` setup warmups in a few files whose confined controller
  setter is wired by an unobservable mount effect (`heat-bar`, `command-selector`,
  `inline-define`, `inventory-component`, …): there is no DOM signal proving the
  setter is wired, and the subsequent per-assertion `waitFor` already absorbs the
  render race. Where the component instead **buffers** host-pushed state until
  its mount effect flushes it (`controller.pendingState`), the warmup is
  unnecessary and was removed outright — the two `petname-*-autocomplete-confined`
  tests now rely on that buffer plus each test's own `waitFor`. Where a re-arm
  was possible (`message-picker.test.js`) the warmup was removed by re-issuing
  `enable()` inside the poll instead. `token-autocomplete-confined.test.js` keeps
  a deliberate settle because its name list loads from an async `followNameChanges`
  stream that is not re-filtered when names arrive (no buffer, no observable).
  The misleading `await waitFor(() => true, { timeout })` no-ops that fronted
  these warmups were deleted.

While sweeping, `channel-thread.test.js` and `outliner-enter-key.test.js` also
gained component disposal in `afterEach` (the same teardown-leak class as
`forum.test.js` above).

### `inline-eval.test.js` skipped on Node 24 and macOS (partly diagnosed)

`inline-eval.test.js` is gated off on Node major >= 24 (ubuntu) and on the
macOS runner (Node 22): the file times out with the endowment-row confined
sub-mount renders never completing, so a `waitFor` poll never resolves and the
remaining tests are left "pending". It passes on Node-22 ubuntu, which keeps
full coverage.

What has been diagnosed and **fixed** (on this branch):

- **Render/effect feedback loop.** The confined controllers wired their setter
  in `useEffect(..., [controller])`. Under `renderConfined` the sanitizer
  reissues a prop's identity every render, so the effect re-ran every render
  and re-applied `setState(controller.pendingState)` (whose identity is also
  reissued), defeating Preact's `Object.is` bail. The loop is throttled by
  Preact's rAF-backed scheduler so it never trips the in-render re-render cap —
  it just never settles. Fixed by making those effects mount-only (`[]`):
  inline-eval, inline-define, inline-command-form, petname-path-autocomplete,
  petname-paths-autocomplete. Reproduced on Node 22 under CPU load (~50% of
  runs → ~0 after the fix).
- **Leaked confined Preact root.** `petNamePathAutocomplete` never unmounted
  its dropdown tree (`$menu`) on `dispose`, so every torn-down endowment row
  leaked a live root. Fixed by `unmount($menu)` in its `dispose`.

What **remains** (still under investigation): on the slow macOS runner the
worker's event loop stalls after ~600 sibling tests — timers stop firing, so
the current confined render never flushes and the file times out. Because the
stall freezes the very timers a poll ceiling relies on, **no in-process ceiling
(poll-count or wall-clock) can catch it** — confirmed: with the ceiling in
place the failure is AVA's global timeout with the tests "pending", never the
ceiling's own error. This looks like residual resource accumulation across the
file's ~40 tests on a contended runner, not a single missing cleanup. Next
steps: bisect which test/resource accumulates (active-handle dump via
`process._getActiveHandles()` / `why-is-node-running` at end-of-file), or split
the file so per-worker accumulation stays under the threshold.

The `waitFor` helper now bounds the poll with a generous wall-clock ceiling
(`Date.now` survives this package's lockdown options), so the _non-stall_
flavor of this hang — a render that never completes while timers still fire —
fails fast with a pointed error instead of wedging CI until AVA's global
timeout. The ceiling is generous (20s, ~100× a real flush) so it never
false-fails a legitimate wait.

## Review follow-ups from the readiness pass (deferred)

The PR readiness review (kumavis UA comment plus the subagent/kriscendobot
panel) surfaced items beyond the confinement migration itself. The ones fixed in
this PR: the edit-space modal container collision, the cold-cache author names
in the channel and forum bodies, the own-peer border, the dead DOM-era fields,
and the two-tags-per-line JSDoc. The remainder are deferred and tracked here.

- **UA #3 — buffered streaming of inventory/messages.** _Done._ The inventory,
  channel-list, inbox, and channel/forum/microblog subscriptions pass
  `{ buffer: 64 }` to `iterateReader`, raising the exo-stream prefetch window
  above the default 0 (fully synchronized) so up to 64 values flow before
  waiting on acknowledgements — the initial backlog streams in without a
  round-trip ack per value.
- **UA #4 — per-mailbox streaming.** _Blocked on the daemon._ `followMessages()`
  takes no filter argument (`interfaces.js`) and each agent exposes a single
  aggregate mailbox that is the complete conversation log (sent **and**
  received). There is no server-side per-conversation/per-sender stream to
  subscribe to. Following the conversation party's own agent mailbox instead
  would only carry one direction of the conversation, so it cannot replace the
  client-side filter without losing messages. Server-side per-mailbox streaming
  needs a new daemon API (a filtered `followMessages({ from })` or a
  per-conversation mailbox cap); deferred until that exists.
- **UA #5 — file-explorer git-tree column continuation.** _Done._ Selecting a
  git workspace child in columns mode now mounts its worktree and continues the
  Miller columns from where the entry sits, rather than reopening it as a new
  source at the top. A per-source git-mount registry redirects path resolution
  (listing, the dir-cap cache, file reads) under the mount point through the
  worktree; see `openGitEntryInColumn` in `@endo/space-file-explorer`.
- **UA #6 — always-present Spaces bar + removing the back buttons.** A layout
  change to `chat.js`/`spaces-gutter`, both frozen for the incoming imperative
  -Space PR. Resume after that PR lands (see "Deferred — frozen" above).
- **Review MEDIUMs.** Code-fence placeholder counting in the markdown-to-vnodes
  path is now fixed (chip placeholders inside fenced code are substituted and
  counted, keeping later chips aligned). Watcher churn (the inventory/space
  watchers re-subscribe more than necessary) remains deferred — correctness
  -adjacent polish, not a migration blocker.

## Cross-package Preact-pattern review (deferred follow-ups)

A read-only audit of every Preact-consuming package (`@endo/chat`,
`@endo/space-file-explorer`, `@endo/space-peers`, `@endo/space-whylip`) for
pattern violations and non-idiomatic imperative code.
No HIGH-severity violations exist in the migrated confined views — no
Rules-of-Hooks breakage, no hook-bearing function called as a plain function,
no ref misuse (refs are stripped by `renderConfined`), no state mutated outside
`setState`, and no capability leaks into leaf components.
The findings cluster into recurring patterns plus two standouts; all are
deferred and recorded here.

### Recurring patterns (fix as a class)

1. **Host node pushed into a hook-using component + imperative scroll.**
   A confined component takes a host DOM node as a prop and drives scroll
   geometry inside its own `useEffect`, instead of leaving that to the trusted
   controller.
   - `inbox-component.js:1070-1180` (`InboxRoot`) — takes `$parent`, and at
     `:1119-1127` measures scroll stickiness **per message** with
     `await requestAnimationFrame` instead of a `scroll`-listener flag.
   - `debugger-panel.js:354-361` (`DebuggerRoot`) — takes `$container`, then
     `querySelector('.debugger-console-output')` + writes `scrollTop` in an
     effect.
   - Fix: follow the `channel`/`forum`/`microblog` reference — keep `$parent`
     and scroll in the imperative controller with one `scroll` listener
     maintaining an `isNearBottom` flag; the confined component stays
     authority-free. Reading the host node is forced (refs stripped); doing it
     inside the component is the avoidable part.

2. **Subscription `for await` loops that only flip a disposed flag, never
   `.return()` the remote iterator.** _Done._ The loop noticed teardown on the
   next emission only, so an idle stream leaked until something arrived.
   - `space-whylip/src/hooks/useConversation.js` — **fixed, and was worse than a
     leak.** The hand-rolled async-iterator wrapper called `E(reader).next()`,
     but `followMessages()` returns an exo-stream PassableReader whose interface
     exposes only `stream()`, not `next()` — so the live loop threw on its first
     pull and was swallowed by the init try/catch: only the `listMessages()`
     backlog rendered and no new agent responses streamed in. Now consumed via
     `iterateReader`, with the iterator held and `return()`-ed on cleanup.
   - `space-peers/src/peers.js` — fixed; the iterator is held and `return()`-ed
     on cleanup (it already consumed via `iterateReader`).
   - Reference: `channel-component.js` calls `activeIterator.return()` on
     dispose. `iterateReader`'s `return()` is idempotent, so a loop break plus a
     cleanup `return()` is safe.

3. **Reaching outside the component's own subtree with document-wide DOM ops**
   where local Preact state already exists.
   - `inventory/inventory.js` (`clearAllDropTargets` swept
     `document.querySelectorAll('.drop-target')` from an event handler) —
     **done.** The inventory moved into `@endo/space-chat`; the sweep is now an
     injected `clearDropHighlights` callback supplied by the host wrapper
     (`chat/inventory-component.js`), so the confined tree holds no `document`.
   - `petname-path-autocomplete.js:291-302` (document-wide focusable scan to
     advance focus).

4. **Uncontrolled inputs read back via `document.querySelector`** instead of a
   controlled `onInput -> setState` value.
   - `space-file-explorer/src/preact/Dialog.js` — **done.** The text input and
     radios are now controlled; the value/radio queries are gone (only the
     forced focus query remains). This surfaced a confined-component gotcha
     worth recording: **an object prop cannot be a `useEffect` dependency in a
     confined component** — the sanitizing renderer reissues object props a
     fresh identity on every render, so an effect keyed on one re-runs every
     render. The reset-on-open is instead handled by keying the component on a
     monotonic request id so it remounts per request (and `useState` re-seeds);
     the focus effect is mount-only. Key confined-component effects on
     primitives, never object references.

5. **Timer/listener leaks (no cleanup).** `setTimeout` "wait for render" focus
   hacks (unnecessary — `renderConfined` is synchronous) and `document` click
   listeners never removed: `inline-command-form.js`, `endow-modal.js`,
   `command-selector.js:381`, `token-autocomplete.js:1003`,
   `space-peers/src/peers.js:126` (copy-flash timer).

### Removing ambient DOM/host APIs from confined components

A focused pass to get DOM/host-API calls out of the confined Preact
_components_ themselves (the imperative controllers are out of scope — they are
the sanctioned host-node bridge). Note these components are not sandboxed from
ambient globals: `renderConfined` is a vnode/DOM trust boundary, not an
execution sandbox, so host-authored components run in the app realm where
`navigator`/`document`/`window` are reachable. This is a capability-discipline
cleanup (authority-free leaves), not a sandbox fix. Two classes, both **done**:

- **`navigator.clipboard` in leaf `CopyButton`s.** The capability is now
  injected. `value-component` threads a `copy` callback from the trusted
  controller (one hop). `peers` reaches its CopyButton through ~7 components, so
  it uses a `ClipboardContext` (verified to propagate through `renderConfined`)
  defaulting to the platform clipboard at module scope; the component consumes
  it via `useContext`. The peers effect's `window.reportError` sinks became
  `console.error`. The inbox CopyButtons (`TimestampLine`/`FormFieldRow`) now do
  the same: `InboxRoot` installs a `ClipboardContext.Provider` with a
  host-supplied `writeClipboard`, and the context default is an ambient-free
  fallback (no `navigator`). Its background-error and scroll-deferral reaches
  were likewise threaded as host props (`reportError`, `afterPaint`), so
  `@endo/space-chat`'s confined tree holds no ambient host globals.
- **`document` click/keydown dismiss listeners.** Replaced with declarative,
  in-tree dismissal: a full-screen backdrop element (`onClick` closes) for
  outside-click, made focusable (`tabindex`/`autofocus`, both sanitizer
  -permitted) with an `onKeyDown` for Escape; the profile popup uses a
  `display: contents` wrapper carrying the Escape handler (the key bubbles from
  its autofocused input). Covers `inventory` drop-menu, the two `channel-list`
  menus, and `profile-popup`. No component touches `document` anymore.

Useful facts established for future confined work: Preact **context propagates
through `renderConfined`**; `tabindex`/`autofocus`/`onKeyDown` are permitted by
the sanitizer; and (from the Dialog fix) **object props can't be effect deps**
in a confined component.

Still **forced-by-renderer** (need a `@endo/preact-container` "narrow ref"
affordance, not a rewrite): scroll geometry in `inbox`/`debugger-panel`, the
Dialog focus query, and the `Viewer` splitter pointer-drag. (The inventory
drag-highlight sweep is no longer in this class — it became a host-injected
`clearDropHighlights` callback when inventory moved to `@endo/space-chat`.)

### Standouts

- **`add-space-modal.js` (HIGH — now fixed).** It used to render via
  `$container.innerHTML = html` with **unescaped interpolation of user-typed
  values** (e.g. `value="${handleName}"`), an injection surface that bypassed
  the sanitizer, plus a per-render keydown-listener leak. It is now confined
  Preact (`renderConfined`), so Preact escapes every attribute/text value and
  the injection surface is closed; the Escape listener is registered once. The
  legacy `renderIconSelector` string path is no longer called from here (the
  forms compose the confined `IconSelector` component); its remaining call sites,
  if any, can be retired separately.
- **`space-whylip/src/hooks/useConversation.js`** is the one store hook with
  real lifecycle problems: the un-cancellable stream (above) plus a single
  mega-effect doing `locate('@self')` + backlog replay + live subscription,
  keyed on `[powers, refreshNodes]` so a `refreshNodes` identity change restarts
  the whole thing. Split backfill from the live subscription and key init on
  `[powers]` alone.

### Severity roll-up

| Package             | HIGH                   | MED | LOW |
| ------------------- | ---------------------- | --- | --- |
| chat                | 0 (add-space-modal ✅) | 6   | ~10 |
| space-file-explorer | 0                      | 3   | 4   |
| space-peers         | 0                      | 2   | 3   |
| space-whylip        | 1 (stream cancel)      | 3   | 4   |

Suggested fix order when picked up: (1) the subscription-cancellation class
across whylip/peers (correctness); (2) the inbox + debugger-panel
scroll-into-controller refactor; (3) the Dialog controlled-input and inventory
drop-target cleanups.
