# File Explorer → Preact: frozen contract

This directory (`src/preact/`) holds the **Preact rewrite** of the file explorer.
It is now the live implementation: `../file-explorer-component.js` mounts
`FileExplorerApp` through the confined renderer, and the former imperative
`../file-explorer.js` has been removed (see git history for the original). This
document is retained as the architecture reference and as the contract the view
components and the store hook are written against.

Goal: a **closely equivalent** reimplementation — same behavior, same DOM
structure, same `fx-*` CSS classes (already defined in `chat/index.css`, reused
verbatim so the UI is pixel-identical), just expressed as a Preact component
tree split across files.

## Architecture & capability discipline

- Components are **trusted host code**, bundled with the app. They
  `import { h } from 'preact'` and hooks from `preact/hooks` directly (the
  `@endo/space-whylip` package is the precedent).
- `h` and the hooks confer **no authority** — they build inert vnode data. All
  DOM power lives in the host's **sanitizing** `renderConfined`, which is the
  trust boundary (strips refs, sanitizes tags/attrs, hands handlers a frozen
  `SafeEvent`). The whole tree renders through it.
- **Real authority = the resolved endo powers and every fs/git/layer/mount
  cap.** These live ONLY in the store hook and inside `Source` objects threaded
  through `actions`. **View components receive plain data + callbacks and hold
  no powers.** Do not pass a `Cap` to a presentational component except as an
  opaque value it immediately hands to an `actions.*` call.
- Reading input/textarea values under the sanitizing renderer:
  `onInput: e => setX(/** @type {HTMLInputElement} */ (e.target).value)` — the
  renderer exposes `.value` on the event target (see `whylip/src/InputBar.js`).

## Shared contract

All shapes are in `./types.js` — `FileExplorerState`, `Source`, `DirEntry`,
`SelectedFile`, `LayerDiffView`, `GitRefs`, `Status`, `InvItem`,
`DialogOptions`, `DialogRequest`, `FileExplorerActions`, `FileExplorerFeatures`,
and the `FileExplorerStore` the hook returns. Import them with
`/** @import { Foo } from './types.js' */`. **Do not edit `types.js`** — if you
believe the contract is wrong, stop and flag it rather than diverging.

## Component tree & file layout

```
FileExplorerApp.js        root; calls useFileExplorer(), composes the shell   [INTEGRATION — owner: lead]
└─ Toolbar.js             source select, view toggle, git picker, action buttons
└─ (fx-body)
   ├─ Inventory.js        left sidebar: pet-name rows at the active profile host
   ├─ ColumnsView.js      Miller columns browser   ─┐ both render
   ├─ TreeView.js         tree browser              ─┘ EntryRow.js
   ├─ EntryRow.js         one row (file/dir/git/unknown); shared by both views
   └─ Viewer.js           right pane: file editor / layer-diff / blob preview
└─ StatusBar.js           bottom status line + busy spinner
└─ Dialog.js              modal prompt overlay (driven by state.dialog)

use-file-explorer.js      THE STORE: state + actions + watcher effects         [SPINE — owner: agent 1]
types.js                  frozen typedefs (this contract)
```

Every component file: `// @ts-check`, `import { h } from 'preact'` (+ hooks as
needed), a single named export `export function Name(props) { … }` returning a
vnode, followed by `harden(Name)`. No CSS imports (the host links the
stylesheet). No `console.log`.

## Per-component props (frozen)

Each component reads its behavior from the matching region of
`../file-explorer.js` (line ranges below) and reuses that region's exact `fx-*`
classes and DOM nesting.

- **Toolbar** `{ store }` — full `FileExplorerStore`. Source: `renderToolbar`
  (L1942–2154). Reads `state.sources/activeSourceId/viewMode`, `activeSource`
  (kind/readOnly/useCache/git/gitRef/gitRefs), `features`. Calls
  `selectSource`, `selectGitRevision`, `setViewMode`, `toggleViewCache`,
  `refreshActive`, `addMemoryFilesystem`, `openByPetName`, `saveReadOnlyView`,
  `saveLayer`, `newFolder`, `newFile`, `viewLayerDiff`, `applyActiveLayer`,
  `revertActiveLayer`.

- **Inventory** `{ items, onOpen }` — `items: Map<string, InvItem>`,
  `onOpen: (item: InvItem) => void`. Source: inventory render (L2714+). Row is
  clickable only when `status === 'ready'`; `onOpen` maps to
  `openFsCap(item.name, item.cap, item.kind, item.name)` in the parent.

- **ColumnsView** `{ columns, activePath, selectedFile, readOnly, actions }`.
  Source: `renderColumns` (L2205–2258). Renders one `fx-column` per
  `BrowserColumn`; each entry via `EntryRow`. Maps row events to
  `actions.openDirInColumn`/`openFile`/`openGitEntry`/`renameEntryAction`/
  `deleteEntryAction`/`moveEntry`.

- **TreeView** `{ activeSource, expandedDirs, treeChildren, treeLoadingDirs,
  treeCurrentDir, selectedFile, actions }`. Source: `renderTree` +
  `renderTreeNode` (L2260–2322), recursive. Maps row events to
  `actions.toggleTreeDir`/`openFile`/`openGitEntry`/mutations.

- **EntryRow** `{ entry, parentPath, selected, readOnly, depth, expanded,
  onOpen, onRename, onDelete, onMove }` — **purely presentational**, raises
  semantic callbacks; holds no actions/powers. `onOpen(entry)` = primary
  activation (parent decides drill/toggle/openFile/openGit). `onRename(entry)`,
  `onDelete(entry)`, `onMove(fromParent, name, toParent, type)` for DnD.
  `depth`/`expanded` only used in tree mode (twisty + indent). Source:
  `entryRowHtml` (L2155–2204). `entry.type` of `'git'`/`'unknown'` ⇒ no
  rename/delete/drag affordances.

- **Viewer** `{ state, activeSource, actions }`. Source: `renderViewer`
  (L2524–2661). Reads `viewerCollapsed/viewerWidth/viewerMode/layerDiff/
  viewerLoading/selectedFile/editing` and `activeSource.readOnly`. `canEdit =
  activeSource && !readOnly && !selectedFile.binary && !selectedFile.truncated`.
  Lazily `colorize(text, language)` from `@endo/monaco-wrapper` for code/diff
  highlighting (await + guard against navigation, as the original does). Calls
  `setViewerCollapsed`, `setEditing`, `saveSelectedFile`, `setViewerWidth`
  (splitter drag).

- **StatusBar** `{ status, busy }` — `status: Status`, `busy: boolean`. Source:
  `renderStatus` (L2662–2713).

- **Dialog** `{ dialog, onSubmit }` — `dialog: DialogRequest | null`,
  `onSubmit: (value: string | null) => void`. Source: `openDialog` modal markup
  (L557–660). Renders nothing when `dialog` is null. Focus + select the input on
  open; Enter confirms when an input is present; Escape / Cancel / backdrop click
  ⇒ `onSubmit(null)`. With `input`: submit trimmed value. With `choices`: submit
  the checked radio `value`. Plain confirm: submit `''`.

## The store hook (`use-file-explorer.js`) — agent 1

`export function useFileExplorer(powers, profilePath)` → `FileExplorerStore`.
Port the entire `mountFileExplorer` closure (L232–1936 of `../file-explorer.js`)
faithfully:

- State → a `useReducer` (or a `useState` snapshot object). Sets/Maps are part of
  the state; replace them immutably (new `Set`/`Map`) so Preact re-renders.
- All actions (see `FileExplorerActions` in `types.js`) — port the bodies from
  the named functions in `../file-explorer.js`; reuse the fs/git/layer helpers
  from `../file-explorer-fs.js` and `buildUnifiedDiffSection` from
  `../layer-diff.js` exactly as today. Wrap `actions` in `useCallback`/`useRef`
  so identity is stable.
- `features` from the three `ENDO_FS_*_MODULE_URL` constants.
- **Watchers** → a `useEffect` keyed on `[activeSourceId, viewMode,
  <serialized visible-dir keys>]`: subscribe newly-visible dirs via
  `subscribeChanges`, debounce a silent `liveRefresh` (200ms), return an
  unsubscribe that cancels watchers + clears the timer. (Mirror
  `reconcileWatchers`/`scheduleLiveRefresh`/`clearWatchers`/`liveRefresh`.)
- **Inventory pump** → a mount-once `useEffect`: iterate
  `host.followNameChanges()`, add/remove `InvItem`s; cleanup aborts the loop.
- **Dialog** → `openDialog(options)` sets `state.dialog = { options, resolve }`
  and returns the promise; `submitDialog(v)` calls `resolve(v)` and clears it.

This hook owns ALL authority. It is the integration point everything else codes
against — keep its public surface exactly `FileExplorerStore`.

## Testing (each component ships one test)

`test/component/<Name>.test.js`, mirroring `chat/test/component/*`:

```js
// @ts-nocheck - Component test with happy-dom
/* global globalThis */
import '@endo/init/debug.js';
import test from 'ava';
import { createDOM } from '../helpers/dom-setup.js';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';
// import the component under test
```

- `createDOM()` from `../helpers/dom-setup.js`; add a `requestAnimationFrame`
  shim (`globalThis.requestAnimationFrame ??= fn => setTimeout(() => fn(0), 0)`).
- Render `renderConfined(h(Component, props), container)`; poll with a `waitFor`
  helper (Preact effects flush async — never assert on a fixed `tick`).
- Build a **mock store / mock callbacks** (plain data + `ava` spy fns) — do NOT
  spin up real powers. Assert: (a) DOM/classes match the region, (b) clicking a
  control invokes the right `actions.*` / callback with the right args.
- **Viewer only** needs Monaco: register the `@endo/monaco-wrapper` loader stub
  exactly as `chat/test/component/define-form.test.js` does (the stub is already
  copied to `test/helpers/monaco-wrapper-stub.js`), and dynamically import the
  component AFTER `register(...)`.
- `t.teardown(() => { unmount(container); cleanup(); })`.

Run a single test: `corepack yarn workspace @endo/space-file-explorer exec ava
test/component/<Name>.test.js`.

## Hard rules

- Do **not** modify `../file-explorer.js`, `../file-explorer-component.js`,
  `./types.js`, or any other agent's file. Create only your assigned file(s) +
  test(s).
- Reuse exact `fx-*` class names from your source region.
- `harden(Name)` after every component; `// @ts-check` at the top.
- Library code is silent — no `console.log`.
