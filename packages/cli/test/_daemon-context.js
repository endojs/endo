/** @import { Context } from './_types.js' */

/**
 * Provides test setup and teardown hooks that purge the local endo
 * daemon. In the future, we should create isolated daemon instances
 * so that tests can be run in parallel.
 *
 * @type {Context}
 */
export const daemonContext = {
  setup: async execa => {
    await execa`endo purge -f`;
    await execa`endo start`;
  },
  teardown: async execa => {
    await execa`endo purge -f`;
  },
};
