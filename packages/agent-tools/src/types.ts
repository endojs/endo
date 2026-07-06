import type { ERef } from '@endo/eventual-send';
import type { Filesystem } from '@endo/platform/fs/extended';
import type { EndoGit } from '@endo/exo-git';
import type { EndoShell } from '@endo/exo-shell';
import type { Pattern } from '@endo/patterns';

/**
 * The read- and branch-navigation slice of `EndoGit` the git tool catalog
 * exposes to an LLM.
 *
 * Deliberately omits the destructive and history-rewriting methods of `EndoGit`
 * — `merge`, `rebase`, `restore`, `deleteBranch`, `renameBranch`, the `stash*`
 * family, and the working-tree/detach mutators (`switch`, `detach`). Those carry
 * authority a tool surface handed to a model should not advertise: they can
 * discard uncommitted work or rewrite shared history. `commit`, `createBranch`,
 * and `switchBranch` are included as the additive, non-destructive write
 * surface. Widening this `Pick` is a deliberate authority decision, not a
 * convenience — add a method only when the tool surface is meant to grant it.
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
  EndoGit,
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
 * The mount-bridged slice of `EndoGit` behind `makeGitMountTools`: `status` and
 * `add`, plus `worktree` (the mount the bridge mints `EndoMountEntry` values
 * from). These two methods cannot live in {@link GitToolCapability} because
 * their native signatures carry live capabilities — `status()` returns rows
 * with `EndoMountEntry` / node remotables and `add()` takes an array of
 * `EndoMountEntry` remotables — so their tool wire (JSON-safe rows out, path
 * strings in) diverges from the raw `GitInterface` guard by design. `add` is the
 * additive staging half of the commit loop; it stages but never discards.
 */
export type GitMountToolCapability = Pick<
  EndoGit,
  'status' | 'add' | 'worktree'
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
  execute: (args: Record<string, unknown>) => Promise<unknown>;
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
  invoke: (args: Record<string, unknown>) => Promise<unknown>;
}

export declare function makeTool(spec: ToolSpec): ToolRecord;

export declare function makeGitTool(
  gitCap: ERef<GitToolCapability>,
): ToolRecord[];

export declare function makeGitMountTools(
  gitCap: ERef<GitMountToolCapability>,
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
