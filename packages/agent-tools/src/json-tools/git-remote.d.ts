import type { ERef } from '@endo/eventual-send';
import type { GitRemoteToolCapability, ToolRecord } from '../types.js';

export declare const makeGitRemoteTool: (
  remoteCap: ERef<GitRemoteToolCapability>,
) => ToolRecord[];
