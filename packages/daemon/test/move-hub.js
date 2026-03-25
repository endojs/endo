// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { q } from '@endo/errors';

/** @import {Name, NameHub, FormulaIdentifier} from '../src/types.js' */

// This caplet is a mock name hub for testing NameHub.move().
export const make = (_powers, _context, _options) => {
  /** @type {Map<string, string>} */
  const locatorToName = new Map();
  /** @type {Map<string, string>} */
  const nameToLocator = new Map();

  /**
   * We only support paths of length 1.
   * @param {Array<string>} petNamePath
   */
  const parsePetNamePath = petNamePath => {
    if (!Array.isArray(petNamePath) || petNamePath.length !== 1) {
      throw new Error(`Unexpected pet name path ${q(petNamePath)}`);
    }
    return petNamePath[0];
  };

  /**
   * @param {string} petName
   */
  const expectGetLocator = petName => {
    const locator = nameToLocator.get(petName);
    if (locator === undefined) {
      throw new Error(`Unknown pet name ${q(petName)}`);
    }
    return locator;
  };

  /**
   * @param {string[]} petNamePath
   * @param {string} locator
   */
  const storeLocator = async (petNamePath, locator) => {
    const petName = parsePetNamePath(petNamePath);
    locatorToName.set(locator, petName);
    nameToLocator.set(petName, locator);
  };

  /**
   * @type {NameHub['remove']}
   */
  const remove = async (...petNamePath) => {
    const petName = parsePetNamePath(petNamePath);
    const locator = expectGetLocator(petName);

    nameToLocator.delete(petName);
    locatorToName.delete(locator);
  };

  return makeExo(
    'MoveHub',
    M.interface('MoveHub', {}, { defaultGuards: 'passable' }),
    {
      storeLocator,
      remove,

      /**
       * @type {NameHub['identify']}
       */
      async identify(...petNamePath) {
        const petName = parsePetNamePath(petNamePath);
        return nameToLocator.get(petName);
      },

      /**
       * @type {NameHub['locate']}
       */
      async locate(...petNamePath) {
        const petName = parsePetNamePath(petNamePath);
        return nameToLocator.get(petName);
      },

      /**
       * @type {NameHub['move']}
       */
      async move(fromPath, toPath) {
        const fromName = parsePetNamePath(fromPath);
        const locator = expectGetLocator(fromName);

        const toName = parsePetNamePath(toPath);

        await remove(/** @type {Name} */ (fromName));
        await storeLocator([toName], locator);
      },

      /**
       * @type {NameHub['has']}
       */
      async has(...petNamePath) {
        const petName = parsePetNamePath(petNamePath);
        return nameToLocator.has(petName);
      },
    },
  );
};
