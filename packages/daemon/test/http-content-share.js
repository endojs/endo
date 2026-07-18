import { Far } from '@endo/pass-style';

/**
 * Make an HTTP content-plane sharing capability inside the daemon, where it
 * is a formulable value that can be moved into the agent's \@planes directory.
 *
 * @param {unknown} _powers
 * @param {unknown} _context
 * @param {{ env?: Record<string, string> }} [options]
 */
export const make = (_powers, _context, { env = {} } = {}) => {
  const { GATEWAY_ADDRESS: gatewayAddress, WRONG_HASH: wrongHash } = env;
  return Far('HTTP content share', {
    source: async (hash, kind) => {
      const sources = [];
      if (wrongHash !== undefined) {
        sources.push({
          plane: 'ws',
          payload: `${gatewayAddress}/content/${wrongHash}`,
        });
      }
      const suffix = kind === 'tree' ? '?kind=tree' : '';
      sources.push({
        plane: 'ws',
        payload: `${gatewayAddress}/content/${hash}${suffix}`,
      });
      return sources;
    },
  });
};
