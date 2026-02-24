// @ts-check

import { M } from '@endo/patterns';

/**
 * Canonical interface guard for FaeTool exo objects.
 * Imported by both the fae caplet and tool caplet modules.
 */
export const FaeToolInterface = M.interface('FaeTool', {
  schema: M.call().returns(M.record()),
  execute: M.call(M.record()).returns(M.promise()),
  help: M.call().returns(M.string()),
});
harden(FaeToolInterface);
