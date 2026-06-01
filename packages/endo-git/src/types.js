// @ts-check

// Typedef host for `@endo/endo-git`.  Mirrors the git-related typedefs
// that previously lived in `@endo/daemon/src/types.d.ts`.  Daemon-only
// surface types (`EndoMount`, `EndoMountEntry`, `EndoMountFile`,
// `ReadableTreeView`) are represented as `unknown` here to keep
// `@endo/endo-git` free of a circular dependency on the daemon
// package.  The full-fidelity types continue to live in the daemon's
// `types.d.ts`; daemon-side consumers see them through that file.

/**
 * @typedef {object} GitRef
 * @property {string} name
 * @property {'branch' | 'tag' | 'commit' | 'detached'} kind
 * @property {string} [oid]
 */

/**
 * @typedef {object} GitCommit
 * @property {string} oid
 * @property {string} summary
 * @property {string} [author]
 * @property {number} [committedAt]
 */

/**
 * @typedef {'clean' | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'conflicted'} GitIndexStatus
 */

/**
 * @typedef {'clean' | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'conflicted'} GitWorktreeStatus
 */

/**
 * @typedef {object} GitStatusEntry
 * @property {unknown} entry
 * @property {string} path
 * @property {GitIndexStatus} index
 * @property {GitWorktreeStatus} worktree
 * @property {unknown} [node]
 * @property {string} [renamedFrom]
 */

/**
 * @typedef {object} GitDiffOptions
 * @property {boolean} [cached]
 * @property {GitRef | string} [base]
 * @property {GitRef | string} [head]
 * @property {unknown[]} [entries]
 * @property {string[]} [paths]
 */

/**
 * @typedef {object} GitLogOptions
 * @property {number} [maxCount]
 * @property {GitRef | string} [ref]
 * @property {string} [since]
 * @property {string} [until]
 */

/**
 * @typedef {object} GitRestoreOptions
 * @property {boolean} [staged]
 */

/**
 * @typedef {object} GitCreateBranchOptions
 * @property {string} [startPoint]
 * @property {boolean} [switchAfterCreate]
 */

/**
 * @typedef {object} GitDeleteBranchOptions
 * @property {boolean} [force]
 */

/**
 * @typedef {object} GitMergeOptions
 * @property {boolean} [fastForwardOnly]
 * @property {boolean} [noFastForward]
 */

/**
 * @typedef {object} GitRebaseInput
 * @property {'start' | 'continue' | 'abort' | 'skip'} [mode]
 * @property {string} [upstream]
 */

/**
 * @typedef {object} GitStashPushOptions
 * @property {string} [message]
 * @property {unknown[]} [entries]
 * @property {string[]} [paths]
 * @property {boolean} [includeUntracked]
 */

// Daemon-only surface types — kept as `unknown` aliases so JSDoc
// annotations still parse.  The full-fidelity definitions live in
// `@endo/daemon/src/types.d.ts`.
/** @typedef {unknown} EndoGit */
/** @typedef {unknown} EndoMount */
/** @typedef {unknown} EndoMountEntry */
/** @typedef {unknown} EndoMountFile */
/** @typedef {unknown} ReadableTreeView */

export {};
