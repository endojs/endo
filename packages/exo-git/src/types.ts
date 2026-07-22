// Public type surface for `@endo/exo-git`.

export type Directory = import('@endo/platform/fs/lite/types').Directory;
export type File = import('@endo/platform/fs/lite/types').File;
export type Filesystem = import('@endo/platform/fs/extended').Filesystem;
export type PathEntry = import('@endo/platform/fs/lite/types').PathEntry;
export type PathEntryIssuer =
  import('@endo/platform/fs/lite/types').PathEntryIssuer;
export type ReadableBlob =
  import('@endo/platform/fs/lite/types').ReadableBlobRange;
export type ReadableTree = import('@endo/platform/fs/lite/types').ReadableTree;

export type WritableGitWorktree = Directory & PathEntryIssuer;
export type ReadOnlyGitWorktree = ReadableTree;
/** @deprecated Use `WritableGitWorktree` or `ReadOnlyGitWorktree`. */
export type GitWorktree = WritableGitWorktree | ReadOnlyGitWorktree;
export type GitStatusNode = Directory | File | ReadableTree | ReadableBlob;

export type GitRef = {
  name: string;
  kind: 'branch' | 'tag' | 'commit' | 'detached';
  oid?: string;
};

export type GitRefUpdateResult =
  | 'created'
  | 'updated'
  | 'up-to-date'
  | 'fast-forward'
  | 'forced'
  | 'pruned'
  | 'rejected';

export type GitRemoteRefUpdate = {
  local?: GitRef;
  remote: string;
  result: GitRefUpdateResult;
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
  entry: PathEntry;
  path: string;
  index: GitIndexStatus;
  worktree: GitWorktreeStatus;
  node?: GitStatusNode;
  renamedFrom?: string;
};

export type GitDiffOptions = {
  cached?: boolean;
  base?: GitRef | string;
  head?: GitRef | string;
  entries?: PathEntry[];
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

export type GitCommitOptions = {
  amend?: boolean;
};

export type GitCherryPickOptions = {
  noCommit?: boolean;
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

export type GitRebaseInput =
  | {
      mode: 'start';
      upstream: string;
      autosquash?: boolean;
    }
  | {
      mode: 'continue' | 'abort' | 'skip';
      upstream?: never;
      autosquash?: never;
    };

export type GitStashPushOptions = {
  message?: string;
  entries?: PathEntry[];
  paths?: string[];
  includeUntracked?: boolean;
};

export type GitDirection = 'fetch' | 'push';

export type GitRemoteCredential =
  | { kind: 'bearer'; material: { token: string } }
  | { kind: 'basic'; material: { username: string; password: string } };

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
  ensureCredentialUsable: () => GitRemoteCredential | undefined;
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
  updatedRefs?: GitRemoteRefUpdate[];
  integration?: 'up-to-date' | 'fast-forward' | 'merge' | 'rebase';
  head?: GitRef;
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
    branch?: GitRef | string;
    strategy?: 'merge' | 'rebase' | 'ff-only';
    prune?: boolean;
    tags?: boolean;
  }) => Promise<any>;
  push: (options?: {
    refspecs?: string[];
    source?: string;
    destination?: string;
    force?: boolean;
    /**
     * Force-update only if the destination still names this commit. This is
     * the capability form of git's `--force-with-lease=<destination>:<oid>`.
     */
    forceWithLease?: string;
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

/** The read-only capability surface returned by `readOnly()`. */
export type ReadOnlyEndoGit = {
  worktree: () => Promise<ReadOnlyGitWorktree>;
  status: () => Promise<GitStatusEntry[]>;
  diff: (options?: GitDiffOptions) => Promise<string>;
  log: (options?: GitLogOptions) => Promise<GitCommit[]>;
  show: (ref: GitRef | string) => Promise<string>;
  revParse: (ref: GitRef | string) => Promise<GitRef>;
  currentBranch: () => Promise<GitRef | undefined>;
  branches: () => Promise<GitRef[]>;
  stashList: () => Promise<string[]>;
  stashShow: (index?: number) => Promise<string>;
  /** @see filesystemAt, the preferred historical-read method; `tree(ref)` is its `ReadableTree` projection. */
  tree: (ref: GitRef | string) => Promise<ReadableTree>;
  filesystemAt: (ref: GitRef | string) => Promise<Filesystem>;
  readOnly: () => ReadOnlyEndoGit;
};

/** The full capability surface returned by the normal writable construction. */
export type WritableEndoGit = ReadOnlyEndoGit & {
  worktree: () => Promise<WritableGitWorktree>;
  add: (entries: PathEntry[]) => Promise<void>;
  restore: (entries: PathEntry[], options?: GitRestoreOptions) => Promise<void>;
  commit: (message: string, options?: GitCommitOptions) => Promise<GitCommit>;
  reword: (ref: GitRef | string, message: string) => Promise<GitCommit>;
  cherryPick: (
    ref: GitRef | string,
    options?: GitCherryPickOptions,
  ) => Promise<string>;
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
  stashApply: (index?: number) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashDrop: (index?: number) => Promise<void>;
  readOnly: () => ReadOnlyEndoGit;
};

/**
 * Compatibility name for callers that have not selected a mutability
 * posture yet.
 *
 * Construction, `readOnly()`, and worktree call sites use the split types
 * above so this alias does not erase the authority distinction there.
 */
export type EndoGit = WritableEndoGit;
