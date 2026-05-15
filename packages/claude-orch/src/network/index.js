// @ts-check
/**
 * @import { NetworkController } from '../../protocol.types.d.ts'
 */

import process from 'node:process';

import { makeNftablesController } from './nftables-controller.js';
import { makePfController } from './pf-controller.js';

/**
 * Select the appropriate network controller for the current host platform.
 *
 * @returns {NetworkController}
 */
export const makeNetworkController = () => {
  switch (process.platform) {
    case 'linux':
      return makeNftablesController();
    case 'darwin':
      return makePfController();
    default:
      throw new Error(
        `claude-orch does not support platform "${process.platform}". Only linux and darwin are implemented.`,
      );
  }
};
harden(makeNetworkController);
