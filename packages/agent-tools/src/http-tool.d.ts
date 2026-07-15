import type { ERef } from '@endo/eventual-send';
import type { HttpToolCapability, ToolRecord } from './types.js';

export declare const makeHttpTool: (
  httpCap: ERef<HttpToolCapability>,
) => ToolRecord[];
