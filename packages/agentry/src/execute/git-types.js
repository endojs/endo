// @ts-check
/// <reference types="ses"/>

/**
 * GENERATED FILE - do not edit by hand.
 *
 * Regenerate with: yarn workspace agentry gen:code-mode-types
 *
 * Source of truth:
 *   - git / gitReadOnly: packages/exo-git/src/types.ts (the `EndoGit`
 *     type alias), printed by the typescript compiler API
 *     (TypeScript-canonical).
 *
 * The generic extraction and rendering live in
 * scripts/code-mode-type-extract.js; this exo's source configuration lives in
 * its scripts/code-mode-*-extract.js extractor. The divergence gate in
 * test/code-mode-types.test.js keeps this artifact fresh.
 *
 * Each entry is consumed by formatGlobalDeclarations in execute/globals.js via
 * the per-exo descriptor in execute/git.js:
 * `aux` is the supporting `type` aliases, `body` is the object type spliced
 * after the dynamic `declare const <name>:`.
 */

export const gitCodeModeTypeDeclarations = harden({
  git: {
    aux: `type EndoGit = {
  worktree: () => Promise<EndoMount | ReadableTreeView>;
  status: () => Promise<GitStatusEntry[]>;
  diff: (options?: GitDiffOptions) => Promise<string>;
  log: (options?: GitLogOptions) => Promise<GitCommit[]>;
  show: (ref: GitRef | string) => Promise<string>;
  revParse: (ref: GitRef | string) => Promise<GitRef>;
  add: (entries: EndoMountEntry[]) => Promise<void>;
  restore: (entries: EndoMountEntry[], options?: GitRestoreOptions) => Promise<void>;
  commit: (message: string) => Promise<GitCommit>;
  currentBranch: () => Promise<GitRef | undefined>;
  branches: () => Promise<GitRef[]>;
  createBranch: (name: string, options?: GitCreateBranchOptions) => Promise<GitRef>;
  deleteBranch: (name: string, options?: GitDeleteBranchOptions) => Promise<void>;
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
type EndoMount = unknown;
type EndoMountEntry = unknown;
type GitCommit = {
    oid: string;
    summary: string;
    author?: string;
    committedAt?: number;
};
type GitCreateBranchOptions = {
    startPoint?: string;
    switchAfterCreate?: boolean;
};
type GitDeleteBranchOptions = {
    force?: boolean;
};
type GitDiffOptions = {
    cached?: boolean;
    base?: GitRef | string;
    head?: GitRef | string;
    entries?: unknown[];
    paths?: string[];
};
type GitIndexStatus = 'clean' | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'conflicted';
type GitLogOptions = {
    maxCount?: number;
    ref?: GitRef | string;
    since?: string;
    until?: string;
};
type GitMergeOptions = {
    fastForwardOnly?: boolean;
    noFastForward?: boolean;
};
type GitRebaseInput = {
    mode?: 'start' | 'continue' | 'abort' | 'skip';
    upstream?: string;
};
type GitRef = {
    name: string;
    kind: 'branch' | 'tag' | 'commit' | 'detached';
    oid?: string;
};
type GitRestoreOptions = {
    staged?: boolean;
};
type GitStashPushOptions = {
    message?: string;
    entries?: unknown[];
    paths?: string[];
    includeUntracked?: boolean;
};
type GitStatusEntry = {
    entry: unknown;
    path: string;
    index: GitIndexStatus;
    worktree: GitWorktreeStatus;
    node?: unknown;
    renamedFrom?: string;
};
type GitWorktreeStatus = 'clean' | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'conflicted';
type ReadableTreeView = unknown;`,
    body: `EndoGit`,
  },
  gitReadOnly: {
    aux: `type EndoGit = {
  worktree: () => Promise<EndoMount | ReadableTreeView>;
  status: () => Promise<GitStatusEntry[]>;
  diff: (options?: GitDiffOptions) => Promise<string>;
  log: (options?: GitLogOptions) => Promise<GitCommit[]>;
  show: (ref: GitRef | string) => Promise<string>;
  revParse: (ref: GitRef | string) => Promise<GitRef>;
  currentBranch: () => Promise<GitRef | undefined>;
  branches: () => Promise<GitRef[]>;
  stashList: () => Promise<string[]>;
  stashShow: (index?: number) => Promise<string>;
  tree: (ref: GitRef | string) => Promise<ReadableTreeView>;
  filesystemAt: (ref: GitRef | string) => Promise<unknown>;
  readOnly: () => EndoGit;
};
type EndoMount = unknown;
type GitCommit = {
    oid: string;
    summary: string;
    author?: string;
    committedAt?: number;
};
type GitDiffOptions = {
    cached?: boolean;
    base?: GitRef | string;
    head?: GitRef | string;
    entries?: unknown[];
    paths?: string[];
};
type GitIndexStatus = 'clean' | 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'conflicted';
type GitLogOptions = {
    maxCount?: number;
    ref?: GitRef | string;
    since?: string;
    until?: string;
};
type GitRef = {
    name: string;
    kind: 'branch' | 'tag' | 'commit' | 'detached';
    oid?: string;
};
type GitStatusEntry = {
    entry: unknown;
    path: string;
    index: GitIndexStatus;
    worktree: GitWorktreeStatus;
    node?: unknown;
    renamedFrom?: string;
};
type GitWorktreeStatus = 'clean' | 'modified' | 'deleted' | 'untracked' | 'ignored' | 'conflicted';
type ReadableTreeView = unknown;`,
    body: `EndoGit`,
  },
});
harden(gitCodeModeTypeDeclarations);
