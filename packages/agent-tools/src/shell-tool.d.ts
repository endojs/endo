import type { ERef } from '@endo/eventual-send';
import type {
  ShellToolCapability,
  ShellToolOptions,
  ToolRecord,
} from './types.js';

export declare const makeShellTool: (
  shellCap: ERef<ShellToolCapability>,
  options?: ShellToolOptions,
) => ToolRecord[];
