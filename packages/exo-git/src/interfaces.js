// @ts-check

import { M } from '@endo/patterns';

// #region Shape primitives

const RefArgShape = M.or(M.string(), M.recordOf(M.string(), M.any()));
const GitDirectionShape = M.or(M.eq('fetch'), M.eq('push'));

const GitIndexStatusShape = M.or(
  'clean',
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'conflicted',
);

const GitWorktreeStatusShape = M.or(
  'clean',
  'modified',
  'deleted',
  'untracked',
  'ignored',
  'conflicted',
);

const GitStatusEntryShape = M.splitRecord(
  {
    entry: M.remotable('EndoMountEntry'),
    path: M.string(),
    index: GitIndexStatusShape,
    worktree: GitWorktreeStatusShape,
  },
  {
    node: M.remotable(),
    renamedFrom: M.string(),
  },
);

const GitRefKindShape = M.or('branch', 'tag', 'commit', 'detached');

const GitRefShape = M.splitRecord(
  {
    name: M.string(),
    kind: GitRefKindShape,
  },
  {
    oid: M.string(),
  },
);

const GitCommitShape = M.splitRecord(
  {
    oid: M.string(),
    summary: M.string(),
  },
  {
    author: M.string(),
    committedAt: M.number(),
  },
);

// #endregion

export const GitInterface = M.interface('Git', {
  // `callWhen` so a read-only Git may resolve its worktree authority
  // through `mount.readOnly()` (which yields a promise of the
  // structural read-only view) before the return shape is matched; a
  // writable Git returns its mount synchronously and is unaffected.
  worktree: M.callWhen().returns(M.remotable('EndoMount')),
  status: M.callWhen().returns(M.arrayOf(GitStatusEntryShape)),
  diff: M.callWhen()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.string()),
  log: M.callWhen()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.arrayOf(GitCommitShape)),
  show: M.callWhen(RefArgShape).returns(M.string()),
  revParse: M.callWhen(RefArgShape).returns(GitRefShape),
  add: M.callWhen(M.arrayOf(M.remotable())).returns(M.undefined()),
  restore: M.callWhen(M.arrayOf(M.remotable()))
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.undefined()),
  commit: M.callWhen(M.string()).returns(GitCommitShape),
  currentBranch: M.callWhen().returns(M.or(GitRefShape, M.undefined())),
  branches: M.callWhen().returns(M.arrayOf(GitRefShape)),
  createBranch: M.callWhen(M.string())
    .optional(M.recordOf(M.string(), M.any()))
    .returns(GitRefShape),
  deleteBranch: M.callWhen(M.string())
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.undefined()),
  renameBranch: M.callWhen(M.string(), M.string()).returns(M.undefined()),
  switchBranch: M.callWhen(M.string()).returns(M.undefined()),
  detach: M.callWhen(RefArgShape).returns(M.undefined()),
  switch: M.callWhen(RefArgShape).returns(M.undefined()),
  merge: M.callWhen(RefArgShape)
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.string()),
  rebase: M.callWhen(M.recordOf(M.string(), M.any())).returns(M.string()),
  stashPush: M.callWhen()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.string()),
  stashList: M.callWhen().returns(M.arrayOf(M.string())),
  stashShow: M.callWhen().optional(M.number()).returns(M.string()),
  stashApply: M.callWhen().optional(M.number()).returns(M.undefined()),
  stashPop: M.callWhen().optional(M.number()).returns(M.undefined()),
  stashDrop: M.callWhen().optional(M.number()).returns(M.undefined()),
  tree: M.callWhen(RefArgShape).returns(M.remotable('EndoReadableTree')),
  filesystemAt: M.callWhen(RefArgShape).returns(M.remotable('Filesystem')),
  readOnly: M.call().returns(M.remotable('Git')),
});

export const GitTreeInterface = M.interface('EndoGitTree', {
  archiveTar: M.call().returns(M.remotable()),
  // `callWhen` so the settled value (not the promise) is guarded against
  // the return shape, matching the GitInterface convention above.
  archiveLossless: M.callWhen().returns(M.boolean()),
  has: M.callWhen().rest(M.arrayOf(M.string())).returns(M.boolean()),
  list: M.callWhen().rest(M.arrayOf(M.string())).returns(M.arrayOf(M.string())),
  lookup: M.callWhen(M.or(M.string(), M.arrayOf(M.string()))).returns(
    M.remotable(),
  ),
});

export const GitRemoteInterface = M.interface('GitRemote', {
  inspect: M.call().returns(M.promise()),
  fetch: M.call()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.promise()),
  pull: M.call().optional(M.recordOf(M.string(), M.any())).returns(M.promise()),
  push: M.call().optional(M.recordOf(M.string(), M.any())).returns(M.promise()),
});

export const GitRemoteControllerInterface = M.interface('GitRemoteController', {
  inspect: M.call().returns(M.promise()),
  audit: M.call().returns(M.promise()),
  setAllowedDirections: M.call(M.arrayOf(GitDirectionShape)).returns(
    M.promise(),
  ),
  setFetchRefspecs: M.call(M.arrayOf(M.string())).returns(M.promise()),
  setPushRefspecs: M.call(M.arrayOf(M.string())).returns(M.promise()),
  setAllowedBranches: M.call(M.arrayOf(M.string())).returns(M.promise()),
  setAllowForcePush: M.call(M.boolean()).returns(M.promise()),
  setAllowTags: M.call(M.boolean()).returns(M.promise()),
  setAllowDelete: M.call(M.boolean()).returns(M.promise()),
  revoke: M.call().returns(M.promise()),
});

export const GitCredentialControllerInterface = M.interface(
  'GitCredentialController',
  {
    inspect: M.call().returns(M.promise()),
    rotate: M.call(M.recordOf(M.string(), M.any())).returns(M.promise()),
    revoke: M.call().returns(M.promise()),
  },
);

export const BearerCredentialInterface = M.interface('BearerCredential', {
  audience: M.call().returns(M.string()),
});

export const BasicCredentialInterface = M.interface('BasicCredential', {
  audience: M.call().returns(M.string()),
});
