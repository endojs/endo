import { makeGit } from '../src/git.js';
import type { GitBackend } from '../src/git.js';
import type {
  Filesystem,
  GitCommit,
  GitCommitOptions,
  GitCreateBranchOptions,
  GitDeleteBranchOptions,
  GitDiffOptions,
  GitLogOptions,
  GitMergeOptions,
  GitRebaseInput,
  GitRef,
  GitRefUpdateResult,
  GitRemote,
  GitRemoteCredential,
  GitRemoteOperationSuccessAuditEvent,
  GitRemoteRefUpdate,
  GitRestoreOptions,
  GitStashPushOptions,
  GitStatusEntry,
  PathEntry,
  PathEntryIssuer,
  ReadableTree,
  ReadOnlyEndoGit,
  ReadOnlyGitWorktree,
  WritableEndoGit,
  WritableGitWorktree,
} from '../src/types.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

type ExpectedGitRemoteCredential =
  | { kind: 'bearer'; material: { token: string } }
  | { kind: 'basic'; material: { username: string; password: string } };

type _GitRemoteCredentialMatchesExpected = Assert<
  Equal<GitRemoteCredential, ExpectedGitRemoteCredential>
>;

// The shared backend contract must carry the canonical credential type on
// both remote operations; widening to `unknown` would silently drop the
// compile-time guarantee that backends receive only supported bearer or
// basic credentials.
type _RemoteFetchCredentialStaysNarrow = Assert<
  Equal<
    Parameters<GitBackend['remoteFetch']>[0]['credential'],
    GitRemoteCredential | undefined
  >
>;
type _RemotePushCredentialStaysNarrow = Assert<
  Equal<
    Parameters<GitBackend['remotePush']>[0]['credential'],
    GitRemoteCredential | undefined
  >
>;

type ExpectedGitRefUpdateResult =
  | 'created'
  | 'updated'
  | 'up-to-date'
  | 'fast-forward'
  | 'forced'
  | 'pruned'
  | 'rejected';

type _GitRefUpdateResultMatchesExpected = Assert<
  Equal<GitRefUpdateResult, ExpectedGitRefUpdateResult>
>;

type ExpectedGitRemoteRefUpdate = {
  local?: GitRef;
  remote: string;
  result: GitRefUpdateResult;
};

type _GitRemoteRefUpdateMatchesExpected = Assert<
  Equal<GitRemoteRefUpdate, ExpectedGitRemoteRefUpdate>
>;

const bearerCredential: GitRemoteCredential = {
  kind: 'bearer',
  material: { token: 'token' },
};
const basicCredential: GitRemoteCredential = {
  kind: 'basic',
  material: { username: 'username', password: 'password' },
};

const fetchCreated: GitRemoteRefUpdate = {
  local: { name: 'refs/remotes/origin/main', kind: 'branch', oid: 'oid' },
  remote: 'refs/heads/main',
  result: 'created',
};
const fetchUpdated: GitRemoteRefUpdate = {
  local: { name: 'refs/remotes/origin/main', kind: 'branch', oid: 'oid' },
  remote: 'refs/heads/main',
  result: 'updated',
};
const fetchPruned: GitRemoteRefUpdate = {
  local: { name: 'refs/remotes/origin/old', kind: 'branch' },
  remote: 'refs/heads/old',
  result: 'pruned',
};
const pushCreated: GitRemoteRefUpdate = {
  local: { name: 'refs/heads/topic', kind: 'branch', oid: 'oid' },
  remote: 'refs/heads/topic',
  result: 'created',
};
const pushForced: GitRemoteRefUpdate = {
  local: { name: 'refs/heads/topic', kind: 'branch', oid: 'oid' },
  remote: 'refs/heads/topic',
  result: 'forced',
};
const pushRejected: GitRemoteRefUpdate = {
  local: { name: 'refs/heads/topic', kind: 'branch', oid: 'oid' },
  remote: 'refs/heads/topic',
  result: 'rejected',
};
const deletionPush: GitRemoteRefUpdate = {
  remote: 'refs/heads/topic',
  result: 'pruned',
};

type _AuditUpdatedRefsAreOwned = Assert<
  Equal<
    NonNullable<GitRemoteOperationSuccessAuditEvent['updatedRefs']>,
    GitRemoteRefUpdate[]
  >
>;
type _AuditHeadIsGitRef = Assert<
  Equal<NonNullable<GitRemoteOperationSuccessAuditEvent['head']>, GitRef>
>;
type PullOptions = NonNullable<Parameters<GitRemote['pull']>[0]>;
type _PullBranchAcceptsRefSelectors = Assert<
  Equal<NonNullable<PullOptions['branch']>, GitRef | string>
>;
type _AuditHasNoCredential = Assert<
  Equal<Extract<keyof GitRemoteOperationSuccessAuditEvent, 'credential'>, never>
>;

type ExpectedReadOnlyEndoGit = {
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
  tree: (ref: GitRef | string) => Promise<ReadableTree>;
  filesystemAt: (ref: GitRef | string) => Promise<Filesystem>;
  readOnly: () => ReadOnlyEndoGit;
};

type ExpectedWritableEndoGit = ExpectedReadOnlyEndoGit & {
  worktree: () => Promise<WritableGitWorktree>;
  add: (entries: PathEntry[]) => Promise<void>;
  restore: (entries: PathEntry[], options?: GitRestoreOptions) => Promise<void>;
  commit: (message: string, options?: GitCommitOptions) => Promise<GitCommit>;
  reword: (ref: GitRef | string, message: string) => Promise<GitCommit>;
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

type _ReadOnlyEndoGitMatchesExpectedSurface = Assert<
  Equal<ReadOnlyEndoGit, ExpectedReadOnlyEndoGit>
>;
type _WritableEndoGitMatchesExpectedSurface = Assert<
  Equal<WritableEndoGit, ExpectedWritableEndoGit>
>;

declare const powers: Parameters<typeof makeGit>[0];

const writable = makeGit(powers);
const readOnly = makeGit(powers, { readOnly: true });

type _WritableConstruction = Assert<Equal<typeof writable, WritableEndoGit>>;
type _ReadOnlyConstruction = Assert<Equal<typeof readOnly, ReadOnlyEndoGit>>;
type _ReadOnlyMethod = Assert<
  Equal<ReturnType<WritableEndoGit['readOnly']>, ReadOnlyEndoGit>
>;
type _WritableWorktree = Assert<
  Equal<Awaited<ReturnType<WritableEndoGit['worktree']>>, WritableGitWorktree>
>;
type _ReadOnlyWorktree = Assert<
  Equal<Awaited<ReturnType<ReadOnlyEndoGit['worktree']>>, ReadOnlyGitWorktree>
>;
type _WritableWorktreeIssuesEntries = Assert<
  WritableGitWorktree extends PathEntryIssuer ? true : false
>;

type Mutator =
  | 'add'
  | 'restore'
  | 'commit'
  | 'reword'
  | 'createBranch'
  | 'deleteBranch'
  | 'renameBranch'
  | 'switchBranch'
  | 'detach'
  | 'switch'
  | 'merge'
  | 'rebase'
  | 'stashPush'
  | 'stashApply'
  | 'stashPop'
  | 'stashDrop';

type _ReadOnlyOmitsMutators = Assert<
  Equal<Extract<keyof ReadOnlyEndoGit, Mutator>, never>
>;
