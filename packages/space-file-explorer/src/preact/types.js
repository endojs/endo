// @ts-check

// FROZEN CONTRACT for the Preact file-explorer rewrite.
//
// This module declares the shared shapes that the store hook
// (`use-file-explorer.js`) produces and every view component consumes. It is
// the single source of truth that lets the store and the views be authored
// independently: the store IMPLEMENTS `FileExplorerStore`; each view RECEIVES a
// slice of it (plus its own plain-data props) and calls back into `actions`.
//
// Capability discipline (see CONTRACT.md): real authority — the resolved endo
// powers and every filesystem/git/layer/mount cap — lives ONLY inside the store
// hook and the `Source` objects it threads through `actions`. View components
// receive plain data + callbacks and hold NO powers. Keep it that way.
//
// These typedefs are re-exported by `harden({})` below purely so the module has
// a hardened named export; the types themselves are erased at runtime.

export {};

/**
 * An opaque endo capability reference (the far side of an `E(...)` send). The
 * explorer never inspects these structurally — it only passes them to the
 * `file-explorer-fs.js` helpers, which know how to drive them.
 *
 * Typed `any` (not `unknown`) to match the original `file-explorer.js`: the
 * remote interfaces have no static CapTP types here, so `E(cap).lookup()`,
 * `.makeUnconfined()`, `.filesystemAt()`, etc. must be callable without a cast
 * at every site. Authority is still confined at runtime to the store (see the
 * capability-discipline note above) — `any` only relaxes the *type*, not the
 * object graph.
 *
 * @typedef {any} Cap
 */

/**
 * A single directory entry as returned by `listDirectory` / `listMountDirectory`
 * (re-declared here for the contract; the runtime shape comes from
 * `file-explorer-fs.js`).
 *
 * - `'directory'` / `'file'`: ordinary fs nodes.
 * - `'git'`: a clickable git workspace child (opens as a new source).
 * - `'unknown'`: a non-fs cap, rendered greyed-out and inert.
 *
 * @typedef {object} DirEntry
 * @property {string} name
 * @property {'directory' | 'file' | 'git' | 'unknown'} type
 */

/**
 * The git ref picker payload, lazily fetched once per git source.
 *
 * @typedef {object} GitRefs
 * @property {{ name: string }[]} branches
 * @property {{ oid: string, summary: string }[]} commits
 * @property {string} [current] Name of the current branch, if on one.
 */

/**
 * One opened source (filesystem / memory fs / layer composed-view / mount). The
 * mutable fields (`gitRef`, `useCache`, `viewFsCache`, `gitRefs*`, …) are
 * updated in place by the store actions.
 *
 * `filesystem` is ALWAYS the underlying, never-cache-wrapped cap; it is what
 * Save/Apply hand back. The cached wrapper, when `useCache` is on, is memoized
 * separately in `viewFsCache`.
 *
 * @typedef {object} Source
 * @property {string} id Monotonic `s${n}` identity.
 * @property {string} label Display name (also the source-select option text).
 * @property {'lookup' | 'memory' | 'layer' | 'mount'} kind
 * @property {Cap} filesystem Underlying filesystem cap (never wrapped).
 * @property {boolean} readOnly Disables every mutation when true.
 * @property {boolean} useCache Per-source CAS read-cache toggle (view-only).
 * @property {string} [petName] Inventory pet name / dotted path; Save needs it.
 * @property {Cap} [viewFsCache] Memoized cache-wrapped fs; dropped on toggle.
 * @property {Cap} [layer] Present when `kind === 'layer'`; Apply/Diff/Revert target.
 * @property {Cap} [mount] Present when `kind === 'mount'`; enumerates raw children.
 * @property {Cap} [git] Git source handle: branches()/log()/filesystemAt(ref).
 * @property {string} [gitRef] `GIT_WORKTREE` sentinel, a branch name, or a commit oid.
 * @property {GitRefs} [gitRefs] Lazily-fetched picker payload.
 * @property {boolean} [gitRefsLoaded] One-shot guard for the picker fetch.
 * @property {string} [backingSourceId] For a saved layer: id of the source it layers over.
 */

/**
 * One Miller column in `'columns'` view: a directory listing along `activePath`.
 *
 * @typedef {object} BrowserColumn
 * @property {string[]} path
 * @property {DirEntry[]} entries
 * @property {boolean} loading
 * @property {string} error
 */

/**
 * The file currently open in the viewer.
 *
 * @typedef {object} SelectedFile
 * @property {Cap} cap The file cap (for write-back on save).
 * @property {string} name
 * @property {string[]} parentPath
 * @property {string} text Decoded preview text (possibly truncated).
 * @property {boolean} binary True when bytes contained a NUL → not editable.
 * @property {number} size Byte length of the full file.
 * @property {boolean} truncated True when `text` is a prefix of a larger file.
 */

/**
 * A generated layer-diff document shown in place of a file.
 *
 * @typedef {object} LayerDiffView
 * @property {string} layerLabel Source label captured at generation time.
 * @property {string} content Concatenated unified-diff sections (`\n\n`-joined).
 */

/**
 * Status-bar line.
 *
 * @typedef {object} Status
 * @property {string} message
 * @property {'error' | 'info' | ''} kind
 */

/**
 * An inventory-sidebar row (one pet name at the active profile host).
 *
 * @typedef {object} InvItem
 * @property {string} name
 * @property {'classifying' | 'ready' | 'disabled'} status
 * @property {'filesystem' | 'layer' | 'mount' | 'git'} [kind] Resolved cap kind; set only on `'ready'` items (matches `openFsCap`).
 * @property {Cap} [cap] Present once `status === 'ready'`.
 * @property {string} title Tooltip text.
 */

/**
 * Options for a modal prompt. Resolves to a string (input value, or the chosen
 * radio `value`, or `''` for a plain confirm) or `null` when cancelled.
 *
 * @typedef {object} DialogOptions
 * @property {string} title
 * @property {string} [message]
 * @property {{ label: string, value?: string, placeholder?: string }} [input]
 * @property {{ value: string, label: string }[]} [choices]
 * @property {string} [confirmLabel] Defaults to `'OK'`.
 * @property {boolean} [danger] Red confirm button.
 */

/**
 * The live dialog request held in state while a prompt is open. `<Dialog>`
 * renders this and reports the outcome through `actions.submitDialog`.
 *
 * @typedef {object} DialogRequest
 * @property {number} id Monotonic id; the view keys `<Dialog>` on it so a new
 *   request remounts the component and re-seeds its controlled inputs.
 * @property {DialogOptions} options
 * @property {(value: string | null) => void} resolve Settles the `openDialog` promise.
 */

/**
 * The complete reactive UI state. The store hook returns this as an immutable
 * snapshot each render; actions produce the next snapshot.
 *
 * @typedef {object} FileExplorerState
 * @property {Source[]} sources
 * @property {string | null} activeSourceId
 * @property {'columns' | 'tree'} viewMode
 * @property {boolean} viewerCollapsed
 * @property {number} viewerWidth Clamped to [260, innerWidth - 320]; default 440.
 * @property {string[]} activePath Columns drill-down path.
 * @property {BrowserColumn[]} columns One per depth 0..activePath.length.
 * @property {Set<string>} expandedDirs Tree: pathKeys of open dirs.
 * @property {Map<string, DirEntry[]>} treeChildren Tree: pathKey → cached listing.
 * @property {Set<string>} treeLoadingDirs Tree: pathKeys currently fetching.
 * @property {string[]} treeCurrentDir Tree: selected directory.
 * @property {SelectedFile | null} selectedFile
 * @property {boolean} editing Viewer is in edit mode.
 * @property {boolean} viewerLoading File read in flight.
 * @property {LayerDiffView | null} layerDiff
 * @property {'file' | 'layer-diff'} viewerMode
 * @property {Status} status
 * @property {boolean} busy True while any async action is in flight (busyCount > 0).
 * @property {Map<string, InvItem>} invItems Inventory sidebar rows by pet name.
 * @property {DialogRequest | null} dialog Open modal prompt, if any.
 */

/**
 * Every async action / event handler the views invoke. Implemented by the store
 * hook. All are safe to call un-awaited from event handlers (they self-report
 * errors to the status bar); the few that views need to await (only
 * `openDialog`) return a useful promise.
 *
 * @typedef {object} FileExplorerActions
 * Source & navigation
 * @property {(id: string) => void} selectSource Switch the active source.
 * @property {(ref: string) => void} selectGitRevision Switch git ref on the active source.
 * @property {(mode: 'columns' | 'tree') => void} setViewMode
 * @property {(parentPath: string[], name: string) => void} openFile Open/select a file in the viewer.
 * @property {(columnIndex: number, name: string) => void} openDirInColumn Drill into a dir (columns).
 * @property {(path: string[]) => void} toggleTreeDir Expand/collapse a tree dir.
 * @property {(parentPath: string[], name: string) => void} openGitEntry Open a git workspace child as a new source.
 * @property {(columnIndex: number, name: string) => void} openGitEntryInColumn Continue columns into a git workspace child's worktree.
 * @property {() => void} refreshActive Manual refresh of the active source.
 * Mutations (all no-op when the active source is read-only)
 * @property {() => void} newFolder
 * @property {() => void} newFile
 * @property {(parentPath: string[], name: string, type: 'directory' | 'file') => void} renameEntryAction
 * @property {(parentPath: string[], name: string, type: 'directory' | 'file') => void} deleteEntryAction
 * @property {(fromParent: string[], name: string, toParent: string[], type?: 'directory' | 'file') => void} moveEntry
 * @property {(text?: string) => void} saveSelectedFile Write the editor buffer back to disk. The Viewer passes its controlled draft text; the store falls back to its own buffer / the file's current text.
 * Sources & inventory
 * @property {() => void} addMemoryFilesystem Mint an in-memory fs and open it.
 * @property {() => void} openByPetName Open a source by inventory pet-name path.
 * @property {(label: string, cap: Cap, kind: 'filesystem' | 'layer' | 'mount' | 'git', petName?: string) => void} openFsCap
 * Cache & layers
 * @property {() => void} toggleViewCache Toggle the active source's CAS read-cache.
 * @property {() => void} saveReadOnlyView
 * @property {() => void} saveLayer
 * @property {() => void} applyActiveLayer
 * @property {() => void} revertActiveLayer
 * @property {() => void} viewLayerDiff Generate and show the active layer's diff.
 * Viewer chrome
 * @property {(collapsed: boolean) => void} setViewerCollapsed
 * @property {(editing: boolean) => void} setEditing
 * @property {(width: number) => void} setViewerWidth
 * Dialog
 * @property {(options: DialogOptions) => Promise<string | null>} openDialog
 * @property {(value: string | null) => void} submitDialog Settle the open dialog.
 */

/**
 * Build-time capability availability, derived from the three build-injected
 * `ENDO_FS_*_MODULE_URL` constants (falsy outside the Vite dev server). The
 * toolbar uses these to disable + tooltip the actions that need a daemon-side
 * caplet module URL. Identity-stable.
 *
 * @typedef {object} FileExplorerFeatures
 * @property {boolean} canMintMemory In-memory filesystem module URL is present.
 * @property {boolean} canSaveReadOnly Read-only-view module URL is present.
 * @property {boolean} canSaveLayer Layer module URL is present.
 */

/**
 * The object returned by `useFileExplorer(powers, profilePath)`. `state` and
 * `activeSource` are fresh each render; `actions` and `features` are
 * identity-stable.
 *
 * @typedef {object} FileExplorerStore
 * @property {FileExplorerState} state
 * @property {Source | null} activeSource Derived: the source whose id is `activeSourceId`.
 * @property {FileExplorerActions} actions
 * @property {FileExplorerFeatures} features
 */
