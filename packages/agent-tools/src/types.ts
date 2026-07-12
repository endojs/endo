import type { ERef } from '@endo/eventual-send';
import type { Filesystem } from '@endo/platform/fs/extended';
import type {
  GitRemote,
  WritableEndoGit,
  WritableGitWorktree,
} from '@endo/exo-git';
import type { EndoShell } from '@endo/exo-shell';
import type { HttpClient, HttpResponse } from '@endo/exo-http-client';
import type { Pattern } from '@endo/patterns';

/**
 * The read, branch-navigation, and additive-commit slice of `WritableEndoGit` that
 * the default git tool catalog exposes to an LLM.
 *
 * Deliberately omits the destructive and history-rewriting methods of
 * `WritableEndoGit`
 * — `merge`, `restore`, `deleteBranch`, `renameBranch`, the `stash*`
 * family, the working-tree/detach mutators (`switch`, `detach`), and history
 * rewrites (`commit` with `amend`, `reword`, `cherryPick`, `rebase`).
 * Those carry authority a tool
 * surface handed to a model should not advertise: they can discard uncommitted
 * work or rewrite shared history. `commit` is included only through the default
 * maker's message-only schema, so it creates a new commit.
 * Widening this `Pick`
 * is a deliberate authority decision, not a convenience — add a method only
 * when the tool surface is meant to grant it.
 *
 * This slice holds only the JSON-transparent methods whose hand-authored tool
 * schemas map one-to-one onto their `GitInterface` guards (the divergence gate
 * pins that parity). The two Phase 3 methods whose native signatures traffic in
 * live capabilities — `status` (rows bearing mount-entry remotables) and `add`
 * (an array of mount-entry remotables) — are served instead by
 * {@link GitMountToolCapability} / `makeGitMountTools`, which bridge path
 * strings to entries through the worktree mount.
 */
export type GitToolCapability = Pick<
  WritableEndoGit,
  | 'log'
  | 'diff'
  | 'show'
  | 'commit'
  | 'branches'
  | 'createBranch'
  | 'switchBranch'
  | 'currentBranch'
>;

/**
 * Explicitly elevated history-rewrite slice for `makeGitHistoryTool`.
 * Hosts must opt into constructing these tools; the default `makeGitTool`
 * inventory does not advertise these operations.
 */
export type GitHistoryToolCapability = Pick<
  WritableEndoGit,
  'commit' | 'reword' | 'cherryPick' | 'rebase'
>;

/**
 * The mount-bridged slice of `WritableEndoGit` behind `makeGitMountTools`: `status` and
 * `add`, plus `worktree` (the mount the bridge mints `PathEntry` values
 * from). These two methods cannot live in {@link GitToolCapability} because
 * their native signatures carry live capabilities — `status()` returns rows
 * with `PathEntry` / node remotables and `add()` takes an array of
 * `PathEntry` remotables — so their tool wire (JSON-safe rows out, path
 * strings in) diverges from the raw `GitInterface` guard by design. `add` is the
 * additive staging half of the commit loop; it stages but never discards.
 */
export type GitMountToolCapability = Pick<WritableEndoGit, 'status' | 'add'> & {
  /** The bridge mints lineage-bearing entries from the writable worktree. */
  worktree: () => Promise<WritableGitWorktree>;
};

/**
 * The push-tier slice of a `GitRemote` exposed to an LLM: `fetch`, `pull`, and
 * `push` (the network + credential layer, daemon-agent-tools § Phase 3), plus
 * the credential-free `inspect` that reports the remote's policy bounds. This
 * is the full guest-facing `GitRemote` surface; the policy-bearing
 * `GitRemoteController` (which mutates directions, refspecs, and revocation)
 * stays host-side and is never an agent-facing tool. A read-only `Git` cannot
 * construct a `GitRemote` at all, so the read tier structurally excludes push —
 * there is no attenuation to perform here, and this surface adds no authority
 * beyond what the granted `GitRemote` already carries.
 */
export type GitRemoteToolCapability = Pick<
  GitRemote,
  'inspect' | 'fetch' | 'pull' | 'push'
>;

export interface ToolSpec {
  /** Tool name advertised to callers. */
  name: string;
  /** One-line capability description. */
  description: string;
  /**
   * Hand-authored JSON Schema object. It is used verbatim as both the LLM tool
   * `parameters` and the MCP `inputSchema`.
   */
  parameters: object;
  /**
   * Optional array of `@endo/patterns` Patterns, one per positional argument,
   * used for a runtime `mustMatch` of each supplied argument before `execute`
   * runs.
   */
  argGuards?: Pattern[];
  /**
   * Dispatch target. Receives the named-args record keyed by the schema's
   * declared `parameters.properties` names (e.g. `{ message }`, `{ name,
   * options }`).
   */
  execute: (
    args: Record<string, unknown>,
    context?: ToolInvocationContext,
  ) => Promise<unknown>;
}

/** Host controls supplied alongside a tool invocation. */
export interface ToolInvocationContext {
  signal?: AbortSignal;
}

export interface ToolRecord {
  name: string;
  description: string;
  /** The JSON Schema used as LLM `parameters`. */
  parameters: object;
  /** The same JSON Schema used as MCP `inputSchema`. */
  inputSchema: object;
  /**
   * Validates the supplied args against `argGuards` when present, then calls
   * `execute(args)`.
   */
  invoke: (
    args: Record<string, unknown>,
    context?: ToolInvocationContext,
  ) => Promise<unknown>;
}

export declare function makeTool(spec: ToolSpec): ToolRecord;

export declare function makeGitTool(
  gitCap: ERef<GitToolCapability>,
): ToolRecord[];

export declare function makeGitHistoryTool(
  gitCap: ERef<GitHistoryToolCapability>,
): ToolRecord[];

export declare function makeGitMountTools(
  gitCap: ERef<GitMountToolCapability>,
): ToolRecord[];

export declare function makeGitRemoteTool(
  remoteCap: ERef<GitRemoteToolCapability>,
): ToolRecord[];

/**
 * The slice of `EndoShell` exposed to an LLM: `exec` (allowlisted, argv-only
 * command execution) and `inspect` (report the policy bounds). The allowlist,
 * sanitized env, timeout, and output cap are all enforced inside the `Shell`
 * exo, so this surface adds no authority beyond what the capability already
 * carries.
 */
export type ShellToolCapability = Pick<EndoShell, 'exec' | 'inspect'>;

/** A command-string reject pattern; ported from genie's command-tool policy. */
export type RejectPatternEntry = RegExp | { pattern: RegExp; reason?: string };

/** A forbidden-flag entry; ported from genie's command-tool policy. */
export type RejectFlagEntry = string | { flag: string; reason?: string };

export interface ShellToolOptions {
  /**
   * Advisory command-string veto patterns applied in the tool layer before the
   * call reaches `Shell.exec`. Hardening advice, not the boundary.
   */
  rejectPatterns?: RejectPatternEntry[];
  /**
   * Advisory forbidden-flag entries applied in the tool layer before the call
   * reaches `Shell.exec`. Hardening advice, not the boundary.
   */
  rejectFlags?: RejectFlagEntry[];
}

export declare function makeShellTool(
  shellCap: ERef<ShellToolCapability>,
  options?: ShellToolOptions,
): ToolRecord[];

export interface MountReadToolOptions {
  /**
   * Maximum number of UTF-8 characters returned before truncation. Defaults to
   * 50,000. A value of `0` disables the limit and returns the full contents.
   */
  maxChars?: number;
}

export interface MountFsToolsOptions {
  /**
   * When `true`, omit the write (edit) slice from the returned tool set so a
   * read-only deployment advertises only the read / list / stat tools.
   * Defaults to `false`.
   */
  readOnly?: boolean;
  /**
   * Maximum number of UTF-8 characters the read tool returns before
   * truncation, forwarded to `makeMountReadTool`. Defaults to 50,000; `0`
   * disables the limit.
   */
  maxChars?: number;
}

export declare function makeMountReadTool(
  fs: ERef<Filesystem>,
  opts?: MountReadToolOptions,
): ToolRecord;

export declare function makeMountListTool(fs: ERef<Filesystem>): ToolRecord;

export declare function makeMountStatTool(fs: ERef<Filesystem>): ToolRecord;

export declare function makeMountEditTool(fs: ERef<Filesystem>): ToolRecord;

export declare function makeMountFsTools(
  fs: ERef<Filesystem>,
  opts?: MountFsToolsOptions,
): ToolRecord[];

/**
 * The slice of `HttpClient` exposed to an LLM: `fetch` (a single confined
 * outbound request) and `allowedOrigins` (report the reachable origins). The
 * origin allowlist, rate limit, response-byte cap, timeout, redirect
 * containment, and revocation are all enforced inside the `HttpClient` exo, so
 * this surface adds no authority beyond what the capability already carries.
 *
 * `help` is deliberately omitted — it is capability introspection, not an agent
 * action.
 */
export type HttpToolCapability = Pick<HttpClient, 'fetch' | 'allowedOrigins'>;

/**
 * The live `HttpResponse` remotable `HttpClient.fetch` returns. The `fetch`
 * tool never hands this across the wire; its `execute` projects it to a
 * JSON-safe `{ status, statusText, ok, url, headers, truncated, body }` record.
 */
export type HttpResponseView = HttpResponse;

export declare function makeHttpTool(
  httpCap: ERef<HttpToolCapability>,
): ToolRecord[];
