// @ts-check

import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { q } from '@endo/errors';
import { makeIteratorRef } from './reader-ref.js';
import { externalizeId, internalizeLocator } from './locator.js';
import {
  assertNamePath,
  assertNames,
  assertPetNamePath,
  namePathFrom,
} from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { directoryHelp, makeHelp } from './help-text.js';

import { DirectoryInterface } from './interfaces.js';

/** @import { DaemonCore, DeferredTasks, MakeDirectoryNode, EndoDirectory, NameHub, LocatorNameChange, Context, Name, NamePath, PetName, FormulaIdentifier, NodeNumber, ReadableBlobDeferredTaskParams, StoreController } from './types.js' */

/**
 * @param {object} args
 * @param {DaemonCore['provide']} args.provide
 * @param {(storeId: FormulaIdentifier) => Promise<StoreController>} args.provideStoreController
 * @param {DaemonCore['getIdForRef']} args.getIdForRef
 * @param {DaemonCore['getTypeForId']} args.getTypeForId
 * @param {DaemonCore['formulateDirectory']} args.formulateDirectory
 * @param {DaemonCore['formulateReadableBlob']} args.formulateReadableBlob
 * @param {DaemonCore['pinTransient']} args.pinTransient
 * @param {DaemonCore['unpinTransient']} args.unpinTransient
 */
export const makeDirectoryMaker = ({
  provide,
  provideStoreController,
  getIdForRef,
  getTypeForId,
  formulateDirectory,
  formulateReadableBlob,
  pinTransient,
  unpinTransient,
}) => {
  /** @type {MakeDirectoryNode} */
  const makeDirectoryNode = (
    controller,
    agentNodeNumber,
    isLocalKey,
    getNetworkAddresses,
  ) => {
    /** @type {EndoDirectory['lookup']} */
    const lookup = petNamePath => {
      const namePath = namePathFrom(petNamePath);
      const [headName, ...tailNames] = namePath;

      const id = controller.identifyLocal(headName);
      if (id === undefined) {
        throw new TypeError(`Unknown pet name: ${q(headName)}`);
      }
      const value = provide(/** @type {FormulaIdentifier} */ (id), 'hub');
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        value,
      );
    };

    /** @type {EndoDirectory['maybeLookup']} */
    const maybeLookup = petNamePath => {
      const namePath = namePathFrom(petNamePath);
      const [headName, ...tailNames] = namePath;

      const id = controller.identifyLocal(headName);
      if (id === undefined) {
        return undefined;
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
      return controller.reverseIdentify(id);
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
        return controller.has(petName);
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
        return controller.identifyLocal(petName);
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
      const addresses = await getNetworkAddresses();
      return externalizeId(
        /** @type {FormulaIdentifier} */ (id),
        formulaType,
        agentNodeNumber,
        addresses,
      );
    };

    /** @type {EndoDirectory['reverseLocate']} */
    const reverseLocate = async locator => {
      const { id } = internalizeLocator(locator);
      return controller.reverseIdentify(id);
    };

    /** @type {EndoDirectory['followLocatorNameChanges']} */
    const followLocatorNameChanges = async function* followLocatorNameChanges(
      locator,
    ) {
      const { id } = internalizeLocator(locator);
      for await (const idNameChange of controller.followIdNameChanges(id)) {
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
        return controller.list();
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

    /** @type {EndoDirectory['listLocators']} */
    const listLocators = async (...petNamePath) => {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        const names = await controller.list();
        /** @type {Record<string, string>} */
        const record = {};
        await Promise.all(
          names.map(async name => {
            const locator = await locate(name);
            if (locator !== undefined) {
              record[name] = locator;
            }
          }),
        );
        return harden(record);
      }
      const hub = /** @type {NameHub} */ (await lookup(petNamePath));
      return E(hub).listLocators();
    };

    /** @type {EndoDirectory['followNameChanges']} */
    const followNameChanges = async function* followNameChanges(
      ...petNamePath
    ) {
      assertNames(petNamePath);
      if (petNamePath.length === 0) {
        yield* controller.followNameChanges();
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
        await controller.remove(petName);
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
            await controller.rename(fromPetName, toPetName);
          } else {
            const hub = /** @type {NameHub} */ (await lookup(fromPrefixPath));
            await E(hub).move([fromPetName], [toPetName]);
          }
          return;
        }
      }

      // Cross-hub move: copy then remove
      const id = await identify(...fromPath);
      if (id === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      // First write to the "to" hub so that the original name is preserved on the
      // "from" hub in case of failure.
      await storeIdentifier(toPath, id);
      await remove(...fromPath);
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
      await storeIdentifier(toPath, id);
    };

    /**
     * Store a formula identifier at a pet name path (internal).
     * @param {string | string[]} petNamePath
     * @param {string} id
     */
    const storeIdentifier = async (petNamePath, id) => {
      const { prefixPath, petName } = assertPetNamePath(
        namePathFrom(petNamePath),
      );
      await null;
      if (prefixPath.length === 0) {
        await controller.storeIdentifier(petName, id);
        return;
      }
      const hub = /** @type {NameHub} */ (await lookup(prefixPath));
      await E(hub).storeIdentifier([petName], id);
    };

    /**
     * Store a locator (endo:// URL) at a pet name path.
     * @param {string | string[]} petNamePath
     * @param {string} locator
     */
    const storeLocator = async (petNamePath, locator) => {
      if (!locator.startsWith('endo://')) {
        throw new Error(
          `storeLocator requires an endo:// locator, got ${q(locator)}`,
        );
      }
      const { id } = internalizeLocator(locator);
      await storeIdentifier(petNamePath, id);
    };

    /** @type {EndoDirectory['makeDirectory']} */
    const makeDirectory = async directoryPetNamePath => {
      const { value: newDirectory, id } = await formulateDirectory();
      pinTransient(id);
      try {
        await storeIdentifier(directoryPetNamePath, id);
      } finally {
        unpinTransient(id);
      }
      return newDirectory;
    };

    /** @type {EndoDirectory['readText']} */
    const readText = async petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      assertNamePath(namePath);
      if (namePath.length < 2) {
        const blob = await lookup(namePath);
        return E(/** @type {any} */ (blob)).text();
      }
      const { hub, name } = await lookupTailNameHub(namePath);
      return E(/** @type {any} */ (hub)).readText(name);
    };

    /** @type {EndoDirectory['maybeReadText']} */
    const maybeReadText = async petNameOrPath => {
      const namePath = namePathFrom(petNameOrPath);
      assertNamePath(namePath);
      if (namePath.length < 2) {
        const blob = await maybeLookup(namePath);
        if (blob === undefined || blob === null) {
          return undefined;
        }
        return E(/** @type {any} */ (blob)).text();
      }
      const { hub, name } = await lookupTailNameHub(namePath);
      return E(/** @type {any} */ (hub)).maybeReadText(name);
    };

    /** @type {EndoDirectory['writeText']} */
    const writeText = async (petNameOrPath, content) => {
      const namePath = namePathFrom(petNameOrPath);
      assertNamePath(namePath);
      if (namePath.length < 2) {
        const bytes = new TextEncoder().encode(content);
        const readerRef = makeIteratorRef(
          harden([encodeBase64(bytes)])[Symbol.iterator](),
        );
        /** @type {DeferredTasks<ReadableBlobDeferredTaskParams>} */
        const tasks = makeDeferredTasks();
        tasks.push(identifiers =>
          storeIdentifier(namePath, identifiers.readableBlobId),
        );
        await formulateReadableBlob(/** @type {any} */ (readerRef), tasks);
        return;
      }
      const { hub, name } = await lookupTailNameHub(namePath);
      await E(/** @type {any} */ (hub)).writeText(name, content);
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
      listLocators,
      followNameChanges,
      lookup,
      maybeLookup,
      reverseLookup,
      storeIdentifier,
      storeLocator,
      move,
      remove,
      copy,
      makeDirectory,
      readText,
      maybeReadText,
      writeText,
    };
    return directory;
  };

  /**
   * @param {object} args
   * @param {FormulaIdentifier} args.petStoreId
   * @param {Context} args.context
   * @param {NodeNumber} args.agentNodeNumber
   * @param {(node: string) => boolean} args.isLocalKey
   */
  const makeIdentifiedDirectory = async ({
    petStoreId,
    context,
    agentNodeNumber,
    isLocalKey,
  }) => {
    // TODO thread context

    const petStore = await provideStoreController(petStoreId);
    const noNetworkAddresses = async () => [];
    const directory = makeDirectoryNode(
      petStore,
      agentNodeNumber,
      isLocalKey,
      noNetworkAddresses,
    );

    const help = makeHelp(directoryHelp);

    const {
      has,
      identify,
      locate,
      reverseLocate,
      list,
      listIdentifiers,
      listLocators,
      lookup,
      reverseLookup,
      remove,
      move,
      copy,
      makeDirectory,
    } = directory;

    return makeExo(
      'EndoDirectory',
      DirectoryInterface,
      /** @type {any} */ ({
        help,
        has,
        identify,
        locate,
        reverseLocate,
        followLocatorNameChanges: locator =>
          makeIteratorRef(directory.followLocatorNameChanges(locator)),
        list,
        listIdentifiers,
        listLocators,
        followNameChanges: () => makeIteratorRef(directory.followNameChanges()),
        lookup,
        maybeLookup: directory.maybeLookup,
        reverseLookup,
        storeIdentifier: directory.storeIdentifier,
        storeLocator: directory.storeLocator,
        remove,
        move,
        copy,
        makeDirectory,
        readText: directory.readText,
        maybeReadText: directory.maybeReadText,
        writeText: directory.writeText,
      }),
    );
  };

  return { makeIdentifiedDirectory, makeDirectoryNode };
};
