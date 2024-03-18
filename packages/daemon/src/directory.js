// @ts-check

import { E, Far } from '@endo/far';
import { makeIteratorRef } from './reader-ref.js';

const { quote: q } = assert;

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @param {import('./types.js').DaemonCore['getIdForRef']} args.getIdForRef
 * @param {import('./types.js').DaemonCore['formulateDirectory']} args.formulateDirectory
 */
export const makeDirectoryMaker = ({
  provide,
  getIdForRef,
  formulateDirectory,
}) => {
  /** @type {import('./types.js').MakeDirectoryNode} */
  const makeDirectoryNode = petStore => {
    /** @type {import('./types.js').EndoDirectory['lookup']} */
    const lookup = (...petNamePath) => {
      const [headName, ...tailNames] = petNamePath;
      const id = petStore.identifyLocal(headName);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(headName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const value = provide(id);
      return tailNames.reduce(
        // @ts-expect-error We assume its a NameHub
        (directory, petName) => E(directory).lookup(petName),
        value,
      );
    };

    /** @type {import('./types.js').EndoDirectory['reverseLookup']} */
    const reverseLookup = async presence => {
      const id = getIdForRef(await presence);
      if (id === undefined) {
        return harden([]);
      }
      return petStore.reverseIdentify(id);
    };

    /**
     * @param {Array<string>} petNamePath
     * @returns {Promise<{ hub: import('./types.js').NameHub, name: string }>}
     */
    const lookupTailNameHub = async petNamePath => {
      if (petNamePath.length === 0) {
        throw new TypeError(`Empty pet name path`);
      }
      const headPath = petNamePath.slice(0, -1);
      const tailName = petNamePath[petNamePath.length - 1];
      if (headPath.length === 0) {
        // eslint-disable-next-line no-use-before-define
        return { hub: directory, name: tailName };
      }
      const nameHub = /** @type {import('./types.js').NameHub} */ (
        await lookup(...headPath)
      );
      return { hub: nameHub, name: tailName };
    };

    /** @type {import('./types.js').EndoDirectory['has']} */
    const has = async (...petNamePath) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        return petStore.has(petName);
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      return hub.has(name);
    };

    /** @type {import('./types.js').EndoDirectory['identify']} */
    const identify = async (...petNamePath) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        return petStore.identifyLocal(petName);
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      return hub.identify(name);
    };

    /** @type {import('./types.js').EndoDirectory['list']} */
    const list = async (...petNamePath) => {
      if (petNamePath.length === 0) {
        return petStore.list();
      }
      const hub = /** @type {import('./types.js').NameHub} */ (
        await lookup(...petNamePath)
      );
      return hub.list();
    };

    /** @type {import('./types.js').EndoDirectory['listIdentifiers']} */
    const listIdentifiers = async (...petNamePath) => {
      const names = await list(...petNamePath);
      const identities = new Set();
      await Promise.all(
        names.map(async name => {
          const id = await identify(...petNamePath, name);
          if (id !== undefined) {
            identities.add(id);
          }
        }),
      );
      return harden(Array.from(identities).sort());
    };

    /** @type {import('./types.js').EndoDirectory['followChanges']} */
    const followChanges = async function* followChanges(...petNamePath) {
      if (petNamePath.length === 0) {
        yield* petStore.follow();
        return;
      }
      const hub = /** @type {import('./types.js').NameHub} */ (
        await lookup(...petNamePath)
      );
      yield* hub.followChanges();
    };

    /** @type {import('./types.js').EndoDirectory['remove']} */
    const remove = async (...petNamePath) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        await petStore.remove(petName);
        return;
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      await hub.remove(name);
    };

    /** @type {import('./types.js').EndoDirectory['move']} */
    const move = async (fromPath, toPath) => {
      const { hub: fromHub, name: fromName } = await lookupTailNameHub(
        fromPath,
      );
      const { hub: toHub, name: toName } = await lookupTailNameHub(toPath);
      if (fromHub === toHub) {
        // eslint-disable-next-line no-use-before-define
        if (fromHub === directory) {
          await petStore.rename(fromName, toName);
        } else {
          await fromHub.move([fromName], [toName]);
        }
        return;
      }
      const id = await fromHub.identify(fromName);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      const removeP = fromHub.remove(fromName);
      const addP = toHub.write([toName], id);
      await Promise.all([addP, removeP]);
    };

    /** @type {import('./types.js').EndoDirectory['copy']} */
    const copy = async (fromPath, toPath) => {
      const { hub: fromHub, name: fromName } = await lookupTailNameHub(
        fromPath,
      );
      const { hub: toHub, name: toName } = await lookupTailNameHub(toPath);
      const id = await fromHub.identify(fromName);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      await toHub.write([toName], id);
    };

    /** @type {import('./types.js').EndoDirectory['makeDirectory']} */
    const makeDirectory = async directoryPetName => {
      const { value: directory, id } = await formulateDirectory();
      await petStore.write(directoryPetName, id);
      return directory;
    };

    /** @type {import('./types.js').EndoDirectory['write']} */
    const write = async (petNamePath, id) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        await petStore.write(petName, id);
        return;
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      await hub.write([name], id);
    };

    /** @type {import('./types.js').EndoDirectory} */
    const directory = {
      has,
      identify,
      list,
      listIdentifiers,
      followChanges,
      lookup,
      reverseLookup,
      write,
      move,
      remove,
      copy,
      makeDirectory,
    };
    return directory;
  };

  /**
   * @param {object} args
   * @param {string} args.petStoreId
   * @param {import('./types.js').Context} args.context
   */
  const makeIdentifiedDirectory = async ({ petStoreId, context }) => {
    // TODO thread context

    const petStore = /** @type {import('./types.js').PetStore} */ (
      await provide(petStoreId)
    );
    const directory = makeDirectoryNode(petStore);

    const external = Far('EndoDirectory', {
      ...directory,
      followChanges: () => makeIteratorRef(directory.followChanges()),
    });
    const internal = harden({});

    return harden({ external, internal });
  };

  return { makeIdentifiedDirectory, makeDirectoryNode };
};
