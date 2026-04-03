// @ts-check

import { M } from '@endo/patterns';

/**
 * Canonical interface guard for daemon-signal tool exo objects.
 */
export const DaemonSignalToolInterface = M.interface('DaemonSignalTool', {
  schema: M.call().returns(M.record()),
  execute: M.call(M.record()).returns(M.promise()),
  help: M.call().returns(M.string()),
});
harden(DaemonSignalToolInterface);
