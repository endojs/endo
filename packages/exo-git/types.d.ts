/**
 * Hand-written declarations for `@endo/exo-git`.  Same shim pattern
 * as `packages/endo-fs/types.d.ts` and `packages/git/types.d.ts`.
 *
 * Factory return types are `any` because daemon-side consumers
 * immediately call methods on the result (`git.worktree()`,
 * `const { remote, controller } = makeGitRemote(...)`); a narrower
 * `object` would cascade TS2339 errors at every call site.
 */

declare module '@endo/exo-git' {
  /** Build the `EndoGit` exo over a `Mount` and a `GitBackend`. */
  export const makeGit: (powers: {
    mount: object;
    backend: any;
    readOnly?: boolean;
    lineageOf: (value: unknown) => object | undefined;
  }) => any;

  /**
   * Host-private accessor: returns whether a daemon-minted Git exo is
   * read-only, or undefined for caps not minted in this vat.
   */
  export const isGitReadOnly: (git: unknown) => boolean | undefined;

  /**
   * Host-private accessor: returns the GitBackend bound to a daemon-
   * minted Git exo, or undefined for caps not minted in this vat.
   */
  export const getGitBackend: (git: unknown) => any;

  /**
   * Test-only GitBackend whose methods throw "not yet implemented".
   * Used by daemon-side tests to exercise the `makeGit` exo surface
   * without a real worktree.
   */
  export const makeNotYetImplementedBackend: () => any;

  /** `FsBackend` adapter for an immutable git tree. */
  export const makeGitFsBackend: (args: {
    backend: any;
    treeOid: string;
  }) => any;

  /** Build a remote-git companion (fetch/pull/push) over an `EndoGit`. */
  export const makeGitRemote: (powers: {
    git: any;
    credential?: object;
    name: string;
    policy?: object;
    revoked?: boolean;
    onStateChange?: (state: any) => void;
  }) => { remote: any; controller: any };

  /**
   * Host-private accessor: returns the controller facet for a daemon-
   * minted GitRemote, or undefined for caps not minted in this vat.
   */
  export const getGitRemoteController: (remote: unknown) => any;

  export const makeBasicCredential: (args: {
    audience: string;
    username: string;
    password: string;
    onRotate?: (material: any) => void;
    onRevoke?: () => void;
  }) => any;

  export const makeBearerCredential: (args: {
    audience: string;
    token: string;
    onRotate?: (material: any) => void;
    onRevoke?: () => void;
  }) => any;

  export const makeUnavailableGitCredential: (args: {
    kind: 'bearer' | 'basic';
    audience: string;
    onRotate?: (material: any) => void;
    onRevoke?: () => void;
  }) => any;

  /**
   * Host-private accessor: returns the controller facet for a daemon-
   * minted git credential cap, or undefined otherwise.
   */
  export const getGitCredentialController: (credential: unknown) => any;

  /**
   * Trusted validator used by `makeGitRemote` and tests to verify a
   * credential cap matches the expected audience and is not revoked.
   */
  export const assertGitCredentialForUrl: (
    credential: unknown,
    expectedAudience: string,
    options?: { allowRevoked?: boolean },
  ) => any;

  /**
   * Host-private revocation helper for tests and low-level call sites.
   * The public host surface normally uses GitCredentialController.revoke().
   */
  export const revokeGitCredential: (credential: unknown) => void;

  export const GitInterface: object;
  export const GitTreeInterface: typeof import('./src/interfaces.js').GitTreeInterface;
  export const GitRemoteInterface: object;
  export const GitRemoteControllerInterface: object;
  export const GitCredentialControllerInterface: object;
  export const BasicCredentialInterface: object;
  export const BearerCredentialInterface: object;
}

declare module '@endo/exo-git/src/git.js' {
  export const makeGit: (powers: {
    mount: object;
    backend: any;
    readOnly?: boolean;
    lineageOf: (value: unknown) => object | undefined;
  }) => any;
  export const isGitReadOnly: (git: unknown) => boolean | undefined;
  export const getGitBackend: (git: unknown) => any;
  export const makeNotYetImplementedBackend: () => any;
  export type GitBackend = any;
  export type GitTreeEntryRecord = any;
  export type GitBackendDiffOptions = {
    cached?: boolean;
    base?: unknown;
    head?: unknown;
    paths?: string[];
  };
  export type GitBackendLogOptions = {
    maxCount?: number;
    ref?: unknown;
    since?: string;
    until?: string;
  };
  export type GitBackendStashPushOptions = {
    message?: string;
    paths?: string[];
    includeUntracked?: boolean;
  };
}

declare module '@endo/exo-git/src/types.js' {
  export type GitRef = { name: string; kind: string; oid?: string };
  export type GitCommit = {
    oid: string;
    summary: string;
    author?: string;
    committedAt?: number;
  };
  export type GitIndexStatus = string;
  export type GitWorktreeStatus = string;
  export type GitStatusEntry = any;
  export type GitDiffOptions = any;
  export type GitLogOptions = any;
  export type GitRestoreOptions = any;
  export type GitCreateBranchOptions = any;
  export type GitDeleteBranchOptions = any;
  export type GitMergeOptions = any;
  export type GitRebaseInput = any;
  export type GitStashPushOptions = any;
}

declare module '@endo/exo-git/src/git-filesystem.js' {
  export const makeGitFsBackend: (args: {
    backend: any;
    treeOid: string;
  }) => any;
}

declare module '@endo/exo-git/src/git-remote.js' {
  export const makeGitRemote: (powers: any) => { remote: any; controller: any };
  export const getGitRemoteController: (remote: unknown) => any;
}

declare module '@endo/exo-git/src/git-credential.js' {
  export const makeBasicCredential: (args: any) => any;
  export const makeBearerCredential: (args: any) => any;
  export const makeUnavailableGitCredential: (args: any) => any;
  export const getGitCredentialController: (credential: unknown) => any;
  export const assertGitCredentialForUrl: (
    credential: unknown,
    expectedAudience: string,
    options?: { allowRevoked?: boolean },
  ) => any;
  export const revokeGitCredential: (credential: unknown) => void;
}

declare module '@endo/exo-git/src/interfaces.js' {
  export const GitInterface: object;
  export const GitTreeInterface: object;
  export const GitRemoteInterface: object;
  export const GitRemoteControllerInterface: object;
  export const GitCredentialControllerInterface: object;
  export const BasicCredentialInterface: object;
  export const BearerCredentialInterface: object;
}
