import type { ERef } from '@endo/eventual-send';
import type { Filesystem } from '@endo/platform/fs/extended';
import type {
  ToolRecord,
  MountReadToolOptions,
  MountFsToolsOptions,
} from './types.js';

export declare const makeMountReadTool: (
  fs: ERef<Filesystem>,
  opts?: MountReadToolOptions,
) => ToolRecord;

export declare const makeMountListTool: (fs: ERef<Filesystem>) => ToolRecord;

export declare const makeMountStatTool: (fs: ERef<Filesystem>) => ToolRecord;

export declare const makeMountEditTool: (fs: ERef<Filesystem>) => ToolRecord;

export declare const makeMountFsTools: (
  fs: ERef<Filesystem>,
  opts?: MountFsToolsOptions,
) => ToolRecord[];
