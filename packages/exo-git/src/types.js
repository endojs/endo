// @ts-check

// Typedef host for `@endo/git`.  Mirrors the git-related typedefs
// that previously lived in `@endo/daemon/src/types.d.ts`.  Daemon-only
// surface types (`EndoMount`, `EndoMountEntry`, `EndoMountFile`,
// `ReadableTreeView`) are represented as `unknown` here to keep
// `@endo/git` free of a circular dependency on the daemon
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

// Daemon-only surface types referenced by git's JSDoc.  Aliased to
// `unknown` here so `@endo/git` stays free of a circular
// dependency on `@endo/daemon`; the full-fidelity definitions live in
// `@endo/daemon/src/types.d.ts` and downstream consumers see them
// through that file.
/** @typedef {unknown} EndoMount */
/** @typedef {unknown} EndoMountEntry */
/** @typedef {unknown} EndoMountFile */
/** @typedef {unknown} ReadableTreeView */

/**
 * Public `EndoGit` capability surface.  The factory lives in this
 * package (`./git.js#makeGit`); this typedef mirrors the runtime
 * `GitInterface` guard in `./interfaces.js` so the factory's
 * `@returns {EndoGit}` annotation carries useful fidelity inside the
 * package.
 *
 * @typedef {object} EndoGit
 * @property {() => EndoMount} worktree
 * @property {() => Promise<GitStatusEntry[]>} status
 * @property {(options?: GitDiffOptions) => Promise<string>} diff
 * @property {(options?: GitLogOptions) => Promise<GitCommit[]>} log
 * @property {(ref: GitRef | string) => Promise<string>} show
 * @property {(ref: GitRef | string) => Promise<GitRef>} revParse
 * @property {(entries: EndoMountEntry[]) => Promise<void>} add
 * @property {(entries: EndoMountEntry[], options?: GitRestoreOptions) => Promise<void>} restore
 * @property {(message: string) => Promise<GitCommit>} commit
 * @property {() => Promise<GitRef | undefined>} currentBranch
 * @property {() => Promise<GitRef[]>} branches
 * @property {(name: string, options?: GitCreateBranchOptions) => Promise<GitRef>} createBranch
 * @property {(name: string, options?: GitDeleteBranchOptions) => Promise<void>} deleteBranch
 * @property {(from: string, to: string) => Promise<void>} renameBranch
 * @property {(name: string) => Promise<void>} switchBranch
 * @property {(ref: GitRef | string) => Promise<void>} detach
 * @property {(ref: GitRef | string) => Promise<void>} switch
 * @property {(ref: GitRef | string, options?: GitMergeOptions) => Promise<string>} merge
 * @property {(input: GitRebaseInput) => Promise<string>} rebase
 * @property {(options?: GitStashPushOptions) => Promise<string>} stashPush
 * @property {() => Promise<string[]>} stashList
 * @property {(index?: number) => Promise<string>} stashShow
 * @property {(index?: number) => Promise<void>} stashApply
 * @property {(index?: number) => Promise<void>} stashPop
 * @property {(index?: number) => Promise<void>} stashDrop
 * @property {(ref: GitRef | string) => Promise<ReadableTreeView>} tree
 * @property {(ref: GitRef | string) => Promise<unknown>} filesystemAt
 * @property {() => EndoGit} readOnly
 */

export {};
