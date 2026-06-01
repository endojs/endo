/**
 * Hand-written declarations for `@endo/endo-git`.  Same pattern as
 * `packages/endo-fs/types.d.ts`: the runtime is `@ts-check`-annotated
 * JavaScript and the package does not have its own `tsc` emission
 * pipeline yet.
 *
 * Surface is intentionally narrow.  Factory return types are `any`
 * rather than `object` because daemon-side consumers immediately
 * call methods on the result (`backend.assertRepositoryRoot()`,
 * `const { remote, controller } = makeGitRemote(...)`, etc.) and a
 * narrow `object` would force a cascade of `TS2339: Property '...'
 * does not exist on type 'object'` errors at every call site.  The
 * full-fidelity types live in the source JSDoc and are recovered at
 * consumer-side runtime via `__getMethodNames__()` and the interface
 * guards.
 */

declare module '@endo/endo-git' {
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

  /** Subprocess-backed `GitBackend` over the installed `git` binary. */
  export const makeNativeGitBackend: (opts: {
    repoRoot: string;
    makeReaderRef?: (readable: any) => any;
    [key: string]: unknown;
  }) => any;

  /**
   * Test-only helpers exported from `native-git-backend.js`.
   */
  export const internalHelpers: {
    GIT_BASE_ARGS: readonly string[];
    GIT_TIMEOUT_MS: number;
    GIT_MAX_BUFFER: number;
    TOOL_OUTPUT_LIMIT: number;
    makeGitEnv: (overrides?: Record<string, string>) => Record<string, string>;
    truncateOutput: (text: string) => string;
    requireNonEmptyString: (value: unknown, name: string) => string;
    requireRevision: (value: unknown, name: string) => string;
    parseGitVersion: (text: string) => [number, number, number];
    assertSupportedGitVersion: (versionText: string) => void;
    compareVersion: (
      a: readonly [number, number, number],
      b: readonly [number, number, number],
    ) => number;
    [key: string]: unknown;
  };

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
  export const GitRemoteInterface: object;
  export const GitRemoteControllerInterface: object;
  export const GitCredentialControllerInterface: object;
  export const BasicCredentialInterface: object;
  export const BearerCredentialInterface: object;
}

declare module '@endo/endo-git/src/git.js' {
  export const makeGit: (powers: {
    mount: object;
    backend: any;
    readOnly?: boolean;
    lineageOf: (value: unknown) => object | undefined;
  }) => any;
  export const isGitReadOnly: (git: unknown) => boolean | undefined;
  export const getGitBackend: (git: unknown) => any;
  export const makeNotYetImplementedBackend: () => any;
}

declare module '@endo/endo-git/src/native-git-backend.js' {
  export const makeNativeGitBackend: (opts: {
    repoRoot: string;
    makeReaderRef?: (readable: any) => any;
    [key: string]: unknown;
  }) => any;
  export const internalHelpers: Record<string, any>;
}

declare module '@endo/endo-git/src/git-filesystem.js' {
  export const makeGitFsBackend: (args: {
    backend: any;
    treeOid: string;
  }) => any;
}

declare module '@endo/endo-git/src/git-remote.js' {
  export const makeGitRemote: (powers: any) => { remote: any; controller: any };
  export const getGitRemoteController: (remote: unknown) => any;
}

declare module '@endo/endo-git/src/git-credential.js' {
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

declare module '@endo/endo-git/src/interfaces.js' {
  export const GitInterface: object;
  export const GitRemoteInterface: object;
  export const GitRemoteControllerInterface: object;
  export const GitCredentialControllerInterface: object;
  export const BasicCredentialInterface: object;
  export const BearerCredentialInterface: object;
}
