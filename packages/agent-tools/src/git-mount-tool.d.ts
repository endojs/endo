import type { ERef } from '@endo/eventual-send';
import type { GitMountToolCapability, ToolRecord } from './types.js';

export declare const makeGitMountTools: (
  gitCap: ERef<GitMountToolCapability>,
) => ToolRecord[];
