import type { ERef } from '@endo/far';
import type { Filesystem } from '@endo/endo-fs';
import type { Pattern } from '@endo/patterns';

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

export declare function makeMountReadTool(
  fs: ERef<Filesystem>,
): MountReadToolRecord;
