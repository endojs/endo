import type { ERef } from '@endo/eventual-send';
import type {
  GitHistoryToolCapability,
  GitToolCapability,
  ToolRecord,
} from '../types.js';

export declare const makeGitTool: (
  gitCap: ERef<GitToolCapability>,
) => ToolRecord[];

export declare const makeGitHistoryTool: (
  gitCap: ERef<GitHistoryToolCapability>,
) => ToolRecord[];
