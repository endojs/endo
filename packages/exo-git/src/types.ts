// Public type surface for `@endo/exo-git`.
// Daemon-owned mount/readable surface types are represented as `unknown`
// here to keep `@endo/exo-git` free of a circular dependency on the daemon
// package.

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

export type GitDirection = 'fetch' | 'push';

/**
 * The reusable "authority to talk to this remote" half of a
 * GitRemote.
 *
 * `GitRemote` composes `GitRemoteEndpoint` with an existing `Git`, and
 * clone composes `GitRemoteEndpoint` with an empty destination mount.
 * This is host-private because `ensureCredentialUsable()` exposes
 * native credential material.
 */
export type GitRemoteEndpoint = {
  url: string;
  origin: string;
  protocol: string;
  requiresCredential: boolean;
  allowLocalFileTransport: boolean;
  ensureCredentialUsable: () => { kind: string; material: unknown } | undefined;
  captureCredentialVersion: () => number | undefined;
  assertCredentialUnchanged: (
    operation: string,
    version: number | undefined,
  ) => void;
  watchChange: (onChange: () => void) => (() => void) | undefined;
};

export type GitRemotePolicy = {
  /**
   * Host-controlled remote endpoint URL.
   * Guests cannot mutate this field at call time; only
   * `GitRemoteController.revoke()` or future controller methods adjust
   * the binding.
   */
  url: string;
  allowedDirections: GitDirection[];
  fetchRefspecs: string[];
  pushRefspecs: string[];
  allowedBranches?: string[];
  allowForcePush?: boolean;
  allowTags?: boolean;
  allowDelete?: boolean;
  allowLocalFileTransport?: boolean;
};

export type GitRemoteAuditEventBase = {
  sequence: number;
};

export type GitRemotePolicyAuditEvent = GitRemoteAuditEventBase & {
  type: 'create' | 'revoke' | 'policy';
  policy: GitRemotePolicy & { name: string };
  revoked: boolean;
  method?: string;
};

export type GitRemoteOperationSuccessAuditEvent = GitRemoteAuditEventBase & {
  type: 'fetch' | 'pull' | 'push';
  outcome: 'ok';
  updatedRefs?: unknown;
  integration?: 'up-to-date' | 'fast-forward' | 'merge' | 'rebase';
  head?: unknown;
};

export type GitRemoteOperationFailureAuditEvent = GitRemoteAuditEventBase & {
  type: 'fetch' | 'pull' | 'push';
  outcome: 'error';
  message: string;
  /**
   * Records that the pull's local integration step mutated HEAD before a
   * later policy, credential, or revoke event forced the operation to throw.
   */
  appliedLocally?: boolean;
};

export type GitRemoteAuditEvent =
  | GitRemotePolicyAuditEvent
  | GitRemoteOperationSuccessAuditEvent
  | GitRemoteOperationFailureAuditEvent;

export type GitRemoteSnapshot = GitRemotePolicy & { name: string };

export type GitRemote = {
  inspect: () => Promise<GitRemoteSnapshot>;
  fetch: (options?: { prune?: boolean; tags?: boolean }) => Promise<any>;
  pull: (options?: {
    branch?: unknown;
    strategy?: 'merge' | 'rebase' | 'ff-only';
    prune?: boolean;
    tags?: boolean;
  }) => Promise<any>;
  push: (options?: {
    refspecs?: string[];
    source?: string;
    destination?: string;
    force?: boolean;
    setUpstream?: boolean;
  }) => Promise<any>;
};

export type GitRemoteController = {
  inspect: () => Promise<GitRemoteSnapshot & { revoked: boolean }>;
  audit: () => Promise<any>;
  setAllowedDirections: (directions: GitDirection[]) => Promise<void>;
  setFetchRefspecs: (refspecs: string[]) => Promise<void>;
  setPushRefspecs: (refspecs: string[]) => Promise<void>;
  setAllowedBranches: (branches: string[]) => Promise<void>;
  setAllowForcePush: (flag: boolean) => Promise<void>;
  setAllowTags: (flag: boolean) => Promise<void>;
  setAllowDelete: (flag: boolean) => Promise<void>;
  revoke: () => Promise<void>;
};

export type GitRemoteKit = {
  remote: GitRemote;
  controller: GitRemoteController;
};

// Daemon-only surface types referenced by git's JSDoc. Aliased to
// `unknown` here so `@endo/exo-git` stays free of a circular
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
  worktree: () => Promise<EndoMount | ReadableTreeView>;
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
