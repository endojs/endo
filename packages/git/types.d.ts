/**
 * Hand-written declarations for `@endo/git`.  The package is
 * intentionally tiny — it contains only the Node-side
 * `NativeGitBackend` (subprocess wrapper over the installed `git`
 * binary).  The remotable exo glue, interface guards, and
 * `GitBackend` typedef live in `@endo/exo-git`.
 *
 * Same shim pattern as `packages/endo-fs/types.d.ts`: factory return
 * types are `any` because daemon-side consumers immediately call
 * methods on the result (`backend.assertRepositoryRoot()`); a narrower
 * `object` would cascade TS2339 errors at every call site.
 */

declare module '@endo/git' {
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
    requireAskpassLine: (value: unknown, fieldName: string) => string;
    requireRevision: (value: unknown, name: string) => string;
    parseGitVersion: (text: string) => [number, number, number];
    assertSupportedGitVersion: (versionText: string) => void;
    compareVersion: (
      a: readonly [number, number, number],
      b: readonly [number, number, number],
    ) => number;
    ROLE_USERNAME: number;
    ROLE_PASSWORD: number;
    encodeCredentialRecord: (role: number, value: string) => Buffer;
    encodeCredentialRecords: (username: string, password: string) => Buffer;
    credentialBytesFor: (credential: unknown) => Buffer | undefined;
    gitAskpassHelperPath: string;
    [key: string]: unknown;
  };
}

declare module '@endo/git/src/native-git-backend.js' {
  export const makeNativeGitBackend: (opts: {
    repoRoot: string;
    makeReaderRef?: (readable: any) => any;
    [key: string]: unknown;
  }) => any;
  export const internalHelpers: Record<string, any>;
}
