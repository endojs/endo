// @ts-check

import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { formatLocator, idFromLocator } from './locator.js';
import {
  assertNamePath,
  assertNames,
  assertPetNamePath,
  namePathFrom,
} from './pet-name.js';

import { DirectoryInterface } from './interfaces.js';

/** @import { DaemonCore, MakeDirectoryNode, EndoDirectory, NameHub, LocatorNameChange, Context, FormulaIdentifier, Name, NamePath, PetName } from './types.js' */

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
    const lookup = petNamePath => {
      const namePath = namePathFrom(petNamePath);
      const [headName, ...tailNames] = namePath;

      const id = petStore.identifyLocal(headName);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(headName)}`);
      }
      const value = provide(/** @type {FormulaIdentifier} */ (id), 'hub');
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        value,
      );
    };

    /** @type {EndoDirectory['reverseLookup']} */
    const reverseLookup = async presence => {
      await null;
      const id = getIdForRef(await presence);
      if (id === undefined) {
        return harden([]);
      }
      return petStore.reverseIdentify(id);
    };

    /**
     * @param {NamePath} petNamePath
     * @returns {Promise<{ hub: NameHub, name: Name }>}
     */
    const lookupTailNameHub = async petNamePath => {
      assertNamePath(petNamePath);
      const tailName = petNamePath[petNamePath.length - 1];
      if (petNamePath.length === 1) {
        // eslint-disable-next-line no-use-before-define
        return { hub: directory, name: tailName };
      }
      const prefixPath = petNamePath.slice(0, -1);
      const hub = /** @type {NameHub} */ (await lookup(prefixPath));
      return { hub, name: tailName };
    };

    /** @type {EndoDirectory['has']} */
    const has = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        return petStore.has(petName);
      }
      const { hub, name } = await lookupTailNameHub(
        /** @type {NamePath} */ (petNamePath),
      );
      return E(hub).has(name);
    };

    /** @type {EndoDirectory['identify']} */
    const identify = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 1) {
        const petName = petNamePath[0];
        return petStore.identifyLocal(petName);
      }
      const { hub, name } = await lookupTailNameHub(
        /** @type {NamePath} */ (petNamePath),
      );
      return E(hub).identify(name);
    };

    /** @type {EndoDirectory['locate']} */
    const locate = async (...petNamePath) => {
      assertNames(petNamePath);
      const id = await identify(...petNamePath);
      if (id === undefined) {
        return undefined;
      }

      const formulaType = await getTypeForId(
        /** @type {FormulaIdentifier} */ (id),
      );
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
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        return petStore.list();
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      return E(hub).list();
    };

    /** @type {EndoDirectory['listIdentifiers']} */
    const listIdentifiers = async (...petNamePath) => {
      assertNames(petNamePath);
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
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        yield* petStore.followNameChanges();
        return;
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      yield* await E(hub).followNameChanges();
    };

    /** @type {EndoDirectory['remove']} */
    const remove = async (...petNamePath) => {
      const { prefixPath, petName } = assertPetNamePath(petNamePath);
      await null;
      if (prefixPath.length === 0) {
        await petStore.remove(petName);
        return;
      }
      const hub = /** @type {NameHub} */ (await lookup(prefixPath));
      await E(hub).remove(petName);
    };

    /** @type {EndoDirectory['move']} */
    const move = async (fromPath, toPath) => {
      const { prefixPath: fromPrefixPath, petName: fromPetName } =
        assertPetNamePath(fromPath);
      const { prefixPath: toPrefixPath, petName: toPetName } =
        assertPetNamePath(toPath);
      await null;

      // Optimize for same-hub moves (rename)
      if (fromPrefixPath.length === toPrefixPath.length) {
        const samePrefix = fromPrefixPath.every(
          (name, i) => name === toPrefixPath[i],
        );
        if (samePrefix) {
          if (fromPrefixPath.length === 0) {
            await petStore.rename(fromPetName, toPetName);
          } else {
            const hub = /** @type {NameHub} */ (await lookup(fromPrefixPath));
            await E(hub).move([fromPetName], [toPetName]);
          }
          return;
        }
      }

      // Cross-hub move: copy then remove
      // eslint-disable-next-line no-use-before-define
      const id = await directory.identify(...fromPath);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      // First write to the "to" hub so that the original name is preserved on the
      // "from" hub in case of failure.
      // eslint-disable-next-line no-use-before-define
      await directory.write(toPath, id);
      // eslint-disable-next-line no-use-before-define
      await directory.remove(...fromPath);
    };

    /** @type {EndoDirectory['copy']} */
    const copy = async (fromPath, toPath) => {
      assertNamePath(fromPath);
      assertPetNamePath(toPath);
      const fromNamePath = /** @type {NamePath} */ (fromPath);
      const { hub: fromHub, name: fromName } =
        await lookupTailNameHub(fromNamePath);
      const id = await E(fromHub).identify(fromName);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      // eslint-disable-next-line no-use-before-define
      await directory.write(toPath, id);
    };

    /** @type {EndoDirectory['write']} */
    const write = async (petNamePath, id) => {
      const { prefixPath, petName } = assertPetNamePath(
        namePathFrom(petNamePath),
      );
      await null;
      if (prefixPath.length === 0) {
        await petStore.write(petName, id);
        return;
      }
      const hub = /** @type {NameHub} */ (await lookup(prefixPath));
      await E(hub).write([petName], id);
    };

    /** @type {EndoDirectory['makeDirectory']} */
    const makeDirectory = async directoryPetNamePath => {
      const { value: newDirectory, id } = await formulateDirectory();
      await write(directoryPetNamePath, id);
      return newDirectory;
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
   * @param {FormulaIdentifier} args.petStoreId
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
        readerFromIterator(directory.followLocatorNameChanges(locator)),
      followNameChanges: () => readerFromIterator(directory.followNameChanges()),
    });
  };

  return { makeIdentifiedDirectory, makeDirectoryNode };
};
