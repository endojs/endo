// @ts-check

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { formatLocator, idFromLocator } from './locator.js';

import { DirectoryInterface } from './interfaces.js';

/** @import { DaemonCore, MakeDirectoryNode, EndoDirectory, NameHub, LocatorNameChange, Context } from './types.js' */

/**
 * @param {object} args
 * @param {DaemonCore['provide']} args.provide
 * @param {DaemonCore['getIdForRef']} args.getIdForRef
 * @param {DaemonCore['getTypeForId']} args.getTypeForId
 * @param {DaemonCore['formulateDirectory']} args.formulateDirectory
 */
export const makeDirectoryMaker = ({
  provide,
  getIdForRef,
  getTypeForId,
  formulateDirectory,
}) => {
  /** @type {MakeDirectoryNode} */
  const makeDirectoryNode = petStore => {
    /** @type {EndoDirectory['lookup']} */
    const lookup = (...petNamePath) => {
      const [headName, ...tailNames] = petNamePath;
      const id = petStore.identifyLocal(headName);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(headName)}`);
      }
      const value = provide(id, 'hub');
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        value,
      );
    };

    /** @type {EndoDirectory['reverseLookup']} */
    const reverseLookup = async presence => {
      const id = getIdForRef(await presence);
      if (id === undefined) {
        return harden([]);
      }
      return petStore.reverseIdentify(id);
    };

    /**
     * @param {Array<string>} petNamePath
     * @returns {Promise<{ hub: NameHub, name: string }>}
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
      const nameHub = /** @type {NameHub} */ (await lookup(...headPath));
      return { hub: nameHub, name: tailName };
    };

    /** @type {EndoDirectory['has']} */
    const has = async (...petNamePath) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        return petStore.has(petName);
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      return hub.has(name);
    };

    /** @type {EndoDirectory['identify']} */
    const identify = async (...petNamePath) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        return petStore.identifyLocal(petName);
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      return hub.identify(name);
    };

    /** @type {EndoDirectory['locate']} */
    const locate = async (...petNamePath) => {
      const id = await identify(...petNamePath);
      if (id === undefined) {
        return undefined;
      }

      const formulaType = await getTypeForId(id);
      return formatLocator(id, formulaType);
    };

    /** @type {EndoDirectory['reverseLocate']} */
    const reverseLocate = async locator => {
      const id = idFromLocator(locator);
      return petStore.reverseIdentify(id);
    };

    /** @type {EndoDirectory['followLocatorNameChanges']} */
    const followLocatorNameChanges = async function* followLocatorNameChanges(
      locator,
    ) {
      const id = idFromLocator(locator);
      for await (const idNameChange of petStore.followIdNameChanges(id)) {
        /** @type {any} */
        const locatorNameChange = {
          ...idNameChange,
          ...(Object.hasOwn(idNameChange, 'add')
            ? { add: locator }
            : { remove: locator }),
        };

        yield /** @type {LocatorNameChange} */ (locatorNameChange);
      }
    };

    /** @type {EndoDirectory['list']} */
    const list = async (...petNamePath) => {
      if (petNamePath.length === 0) {
        return petStore.list();
      }
      const hub = /** @type {NameHub} */ (await lookup(...petNamePath));
      return hub.list();
    };

    /** @type {EndoDirectory['listIdentifiers']} */
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

    /** @type {EndoDirectory['followNameChanges']} */
    const followNameChanges = async function* followNameChanges(
      ...petNamePath
    ) {
      if (petNamePath.length === 0) {
        yield* petStore.followNameChanges();
        return;
      }
      const hub = /** @type {NameHub} */ (await lookup(...petNamePath));
      yield* hub.followNameChanges();
    };

    /** @type {EndoDirectory['remove']} */
    const remove = async (...petNamePath) => {
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        await petStore.remove(petName);
        return;
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      await hub.remove(name);
    };

    /** @type {EndoDirectory['move']} */
    const move = async (fromPath, toPath) => {
      const { hub: fromHub, name: fromName } =
        await lookupTailNameHub(fromPath);
      const { hub: toHub, name: toName } = await lookupTailNameHub(toPath);

      if (fromHub === toHub) {
        // eslint-disable-next-line no-use-before-define
        if (fromHub === directory) {
          await petStore.rename(fromName, toName);
        } else {
          await E(fromHub).move([fromName], [toName]);
        }
        return;
      }

      const id = await E(fromHub).identify(fromName);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      // First write to the "to" hub so that the original name is preserved on the
      // "from" hub in case of failure.
      await E(toHub).write([toName], id);
      await E(fromHub).remove(fromName);
    };

    /** @type {EndoDirectory['copy']} */
    const copy = async (fromPath, toPath) => {
      const { hub: fromHub, name: fromName } =
        await lookupTailNameHub(fromPath);
      const { hub: toHub, name: toName } = await lookupTailNameHub(toPath);
      const id = await fromHub.identify(fromName);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      await toHub.write([toName], id);
    };

    /** @type {EndoDirectory['write']} */
    const write = async (petNamePath, id) => {
      if (typeof petNamePath === 'string') {
        petNamePath = [petNamePath];
      }
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        await petStore.write(petName, id);
        return;
      }
      const { hub, name } = await lookupTailNameHub(petNamePath);
      await hub.write([name], id);
    };

    /** @type {EndoDirectory['makeDirectory']} */
    const makeDirectory = async (...directoryPetNamePath) => {
      const { value: directory, id } = await formulateDirectory();
      await write(directoryPetNamePath, id);
      return directory;
    };

    /** @type {EndoDirectory} */
    const directory = {
      has,
      identify,
      locate,
      reverseLocate,
      followLocatorNameChanges,
      list,
      listIdentifiers,
      followNameChanges,
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
   * @param {Context} args.context
   */
  const makeIdentifiedDirectory = async ({ petStoreId, context }) => {
    // TODO thread context

    const petStore = await provide(petStoreId, 'pet-store');
    const directory = makeDirectoryNode(petStore);

    return makeExo('EndoDirectory', DirectoryInterface, {
      ...directory,
      /** @param {string} locator */
      followLocatorNameChanges: locator =>
        makeIteratorRef(directory.followLocatorNameChanges(locator)),
      followNameChanges: () => makeIteratorRef(directory.followNameChanges()),
    });
  };

  return { makeIdentifiedDirectory, makeDirectoryNode };
};
