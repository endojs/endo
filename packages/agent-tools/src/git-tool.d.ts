import type { ERef } from '@endo/far';
import type { GitToolCapability, ToolRecord } from './types.js';

export declare const makeGitTool: (
  gitCap: ERef<GitToolCapability>,
) => ToolRecord[];
