// @ts-check
import { Far } from '@endo/far';

/**
 * @param {object} args
 * @param {import('../types.js').DaemonCore['provideValueForFormulaIdentifier']} args.provideValueForFormulaIdentifier
 * @returns {import('@endo/far').FarRef<import('../types.js').EndoNetwork>}
 */
export const makeLoopbackNetwork = ({ provideValueForFormulaIdentifier }) => {
  return Far(
    'Loopback Network',
    /** @type {import('../types.js').EndoNetwork} */ ({
      addresses: () => [],
      supports: address => new URL(address).protocol === 'loop:',
      connect: address => {
        if (address !== 'loop:') {
          throw new Error(
            'Failed invariant: loopback only supports loop: address',
          );
        }
        return { provide: provideValueForFormulaIdentifier };
      },
    }),
  );
};
