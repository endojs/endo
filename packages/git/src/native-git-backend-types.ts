import type { GitIndexStatus, GitWorktreeStatus } from '@endo/exo-git';

export type NativeGitCredential =
  | { kind: 'bearer'; material: { token: string } }
  | { kind: 'basic'; material: { username: string; password: string } };

export type GitTreeEntry = {
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  oid: string;
  size: number | undefined;
  name: string;
};

export type GitRefUpdateResult =
  | 'created'
  | 'updated'
  | 'up-to-date'
  | 'fast-forward'
  | 'forced'
  | 'pruned'
  | 'rejected';

export type RemoteRefspec = {
  force: boolean;
  src: string;
  dst: string;
};

export type RepositoryIdentity = {
  commonDir: string;
  configHash: string;
  rootCommit: string;
};

export type RawStatusEntry = {
  /** Repository-relative path with forward slashes. */
  path: string;
  index: GitIndexStatus;
  worktree: GitWorktreeStatus;
  /** When the index is 'renamed' or 'copied'. */
  renamedFrom?: string;
};
