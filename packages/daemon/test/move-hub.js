// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

const { quote: q } = assert;

/** @import {NameHub} from '../src/types.js' */

// This caplet is a mock name hub for testing NameHub.move().
export const make = () => {
  /** @type {Map<string, string>} */
  const idToName = new Map();
  /** @type {Map<string, string>} */
  const nameToId = new Map();

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
  const expectGetId = petName => {
    const id = nameToId.get(petName);
    if (id === undefined) {
      throw new Error(`Unknown pet name ${q(petName)}`);
    }
    return id;
  };

  /**
   * @type {NameHub['write']}
   */
  const write = async (petNamePath, id) => {
    const petName = parsePetNamePath(petNamePath);
    idToName.set(id, petName);
    nameToId.set(petName, id);
  };

  /**
   * @type {NameHub['remove']}
   */
  const remove = async (...petNamePath) => {
    const petName = parsePetNamePath(petNamePath);
    const id = expectGetId(petName);

    nameToId.delete(petName);
    idToName.delete(id);
  };

  return makeExo(
    'MoveHub',
    M.interface('MoveHub', {}, { defaultGuards: 'passable' }),
    {
      write,
      remove,

      /**
       * @type {NameHub['identify']}
       */
      async identify(...petNamePath) {
        const petName = parsePetNamePath(petNamePath);
        return nameToId.get(petName);
      },

      /**
       * @type {NameHub['move']}
       */
      async move(fromPath, toPath) {
        const fromName = parsePetNamePath(fromPath);
        const id = expectGetId(fromName);

        const toName = parsePetNamePath(toPath);

        await remove(fromName);
        await write([toName], id);
      },

      /**
       * @type {NameHub['has']}
       */
      async has(...petNamePath) {
        const petName = parsePetNamePath(petNamePath);
        return nameToId.has(petName);
      },
    },
  );
};
