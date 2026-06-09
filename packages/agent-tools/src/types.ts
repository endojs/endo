import type { ERef } from '@endo/far';
import type { Filesystem } from '@endo/endo-fs';
import type { EndoGit } from '@endo/exo-git';
import type { Pattern } from '@endo/patterns';

/**
 * The read- and branch-navigation slice of `EndoGit` the git tool catalog
 * exposes to an LLM.
 *
 * Deliberately omits the destructive and history-rewriting methods of `EndoGit`
 * — `merge`, `rebase`, `restore`, `deleteBranch`, `renameBranch`, the `stash*`
 * family, and the working-tree/detach mutators (`add`, `switch`, `detach`,
 * `worktree`). Those carry authority a tool surface handed to a model should not
 * advertise: they can discard uncommitted work or rewrite shared history.
 * `commit`, `createBranch`, and `switchBranch` are included as the additive,
 * non-destructive write surface. Widening this `Pick` is a deliberate authority
 * decision, not a convenience — add a method only when the tool surface is meant
 * to grant it.
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
  /** Dispatch target. Receives the named-args record `{arg0, arg1, ...}`. */
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

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: readonly string[];
      additionalProperties?: boolean;
    };
  };
}

export interface MountReadToolRecord {
  schema: () => ToolSchema;
  execute: (args: Record<string, unknown>) => Promise<string>;
  help: () => string;
}

export declare function makeTool(spec: ToolSpec): ToolRecord;

export declare function makeGitTool(
  gitCap: ERef<GitToolCapability>,
): ToolRecord[];

export interface MountReadToolOptions {
  /**
   * Maximum number of UTF-8 characters returned before truncation. Defaults to
   * 50,000. A value of `0` disables the limit and returns the full contents.
   */
  maxChars?: number;
}

export declare function makeMountReadTool(
  fs: ERef<Filesystem>,
  opts?: MountReadToolOptions,
): MountReadToolRecord;
