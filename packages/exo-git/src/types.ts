// Typedef host for `@endo/git`. Mirrors the git-related typedefs
// that previously lived in `@endo/daemon/src/types.d.ts`. Daemon-only
// surface types (`EndoMount`, `EndoMountEntry`, `EndoMountFile`,
// `ReadableTreeView`) are represented as `unknown` here to keep
// `@endo/git` free of a circular dependency on the daemon
// package. The full-fidelity types continue to live in the daemon's
// `types.d.ts`; daemon-side consumers see them through that file.

export type GitRef = {
  name: string;
  kind: 'branch' | 'tag' | 'commit' | 'detached';
  oid?: string;
};

export type GitCommit = {
  oid: string;
  summary: string;
  author?: string;
  committedAt?: number;
};

export type GitIndexStatus =
  | 'clean'
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'conflicted';

export type GitWorktreeStatus =
  | 'clean'
  | 'modified'
  | 'deleted'
  | 'untracked'
  | 'ignored'
  | 'conflicted';

export type GitStatusEntry = {
  entry: unknown;
  path: string;
  index: GitIndexStatus;
  worktree: GitWorktreeStatus;
  node?: unknown;
  renamedFrom?: string;
};

export type GitDiffOptions = {
  cached?: boolean;
  base?: GitRef | string;
  head?: GitRef | string;
  entries?: unknown[];
  paths?: string[];
};

export type GitLogOptions = {
  maxCount?: number;
  ref?: GitRef | string;
  since?: string;
  until?: string;
};

export type GitRestoreOptions = {
  staged?: boolean;
};

export type GitCreateBranchOptions = {
  startPoint?: string;
  switchAfterCreate?: boolean;
};

export type GitDeleteBranchOptions = {
  force?: boolean;
};

export type GitMergeOptions = {
  fastForwardOnly?: boolean;
  noFastForward?: boolean;
};

export type GitRebaseInput = {
  mode?: 'start' | 'continue' | 'abort' | 'skip';
  upstream?: string;
};

export type GitStashPushOptions = {
  message?: string;
  entries?: unknown[];
  paths?: string[];
  includeUntracked?: boolean;
};

// Daemon-only surface types referenced by git's JSDoc. Aliased to
// `unknown` here so `@endo/git` stays free of a circular
// dependency on `@endo/daemon`; the full-fidelity definitions live in
// `@endo/daemon/src/types.d.ts` and downstream consumers see them
// through that file.
export type EndoMount = unknown;
export type EndoMountEntry = unknown;
export type EndoMountFile = unknown;
export type ReadableTreeView = unknown;

/**
 * Public `EndoGit` capability surface. The factory lives in this
 * package (`./git.js#makeGit`); this type mirrors the runtime
 * `GitInterface` guard in `./interfaces.js` so the factory's
 * `@returns {EndoGit}` annotation carries useful fidelity inside the
 * package.
 */
export type EndoGit = {
  worktree: () => EndoMount;
  status: () => Promise<GitStatusEntry[]>;
  diff: (options?: GitDiffOptions) => Promise<string>;
  log: (options?: GitLogOptions) => Promise<GitCommit[]>;
  show: (ref: GitRef | string) => Promise<string>;
  revParse: (ref: GitRef | string) => Promise<GitRef>;
  add: (entries: EndoMountEntry[]) => Promise<void>;
  restore: (
    entries: EndoMountEntry[],
    options?: GitRestoreOptions,
  ) => Promise<void>;
  commit: (message: string) => Promise<GitCommit>;
  currentBranch: () => Promise<GitRef | undefined>;
  branches: () => Promise<GitRef[]>;
  createBranch: (
    name: string,
    options?: GitCreateBranchOptions,
  ) => Promise<GitRef>;
  deleteBranch: (
    name: string,
    options?: GitDeleteBranchOptions,
  ) => Promise<void>;
  renameBranch: (from: string, to: string) => Promise<void>;
  switchBranch: (name: string) => Promise<void>;
  detach: (ref: GitRef | string) => Promise<void>;
  switch: (ref: GitRef | string) => Promise<void>;
  merge: (ref: GitRef | string, options?: GitMergeOptions) => Promise<string>;
  rebase: (input: GitRebaseInput) => Promise<string>;
  stashPush: (options?: GitStashPushOptions) => Promise<string>;
  stashList: () => Promise<string[]>;
  stashShow: (index?: number) => Promise<string>;
  stashApply: (index?: number) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index?: number) => Promise<void>;
  tree: (ref: GitRef | string) => Promise<ReadableTreeView>;
  filesystemAt: (ref: GitRef | string) => Promise<unknown>;
  readOnly: () => EndoGit;
};
