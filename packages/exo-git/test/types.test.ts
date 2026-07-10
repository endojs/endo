import { makeGit } from '../src/git.js';
import type {
  EndoGit,
  EndoMount,
  EndoMountEntry,
  GitCommit,
  GitCommitOptions,
  GitCreateBranchOptions,
  GitDeleteBranchOptions,
  GitDiffOptions,
  GitLogOptions,
  GitMergeOptions,
  GitRebaseInput,
  GitRef,
  GitRestoreOptions,
  GitStashPushOptions,
  GitStatusEntry,
  ReadableTreeView,
} from '../src/types.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

type MakeGitReturn = ReturnType<typeof makeGit>;

type _MakeGitReturnsEndoGit = Assert<Equal<MakeGitReturn, EndoGit>>;

type ExpectedEndoGit = {
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
  commit: (message: string, options?: GitCommitOptions) => Promise<GitCommit>;
  reword: (ref: GitRef | string, message: string) => Promise<GitCommit>;
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

type _EndoGitMatchesExpectedSurface = Assert<Equal<EndoGit, ExpectedEndoGit>>;
