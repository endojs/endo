import type { ERef } from '@endo/far';
import type { Filesystem } from '@endo/endo-fs';
import type { MountReadToolRecord } from './types.js';

export declare const makeMountReadTool: (
  fs: ERef<Filesystem>,
) => MountReadToolRecord;
