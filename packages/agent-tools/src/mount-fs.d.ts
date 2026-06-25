import type { ERef } from '@endo/far';
import type { Filesystem } from '@endo/platform/fs/extended';
import type { ToolRecord, MountReadToolOptions } from './types.js';

export declare const makeMountReadTool: (
  fs: ERef<Filesystem>,
  opts?: MountReadToolOptions,
) => ToolRecord;
