// @ts-check

import { E, Far } from '@endo/far';

const { quote: q } = assert;

export const makeDirectoryMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
  randomHex512,
}) => {
  const makeNode = ({ lookupFormulaIdentifierForName, petStore }) => {
    /**
     * @param {string} petNamePath
     */
    const lookup = petNamePath => {
      const [headName, ...tailNames] = petNamePath.split('.');
      const formulaIdentifier = lookupFormulaIdentifierForName(headName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(headName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const value = provideValueForFormulaIdentifier(formulaIdentifier);
      return tailNames.reduce(
        (directory, petName) => E(directory).lookup(petName),
        value,
      );
    };

    /**
     * @param {Array<string>} petNamePath
     */
    const lookupPath = async petNamePath => {
      const [headName, ...tailPath] = petNamePath;
      if (tailPath.length === 0) {
        return { store: petStore, name: headName };
      }
      const headFormulaIdentifier = lookupFormulaIdentifierForName(headName);
      if (headFormulaIdentifier === undefined) {
        throw new Error(`Unknown name: ${headName}`);
      }
      const headController = provideControllerForFormulaIdentifier(
        headFormulaIdentifier,
      );
      const { internal: internalP } = headController;
      if (internalP === undefined) {
        throw new Error(`Unable to store in object: ${q(headName)}`);
      }
      const internal = await internalP;
      if (internal === undefined) {
        throw new Error(`Unable to store in object: ${q(headName)}`);
      }
      if (internal.lookupPath === undefined) {
        throw new Error(`Unable to store in object: ${q(headName)}`);
      }
      const lookupPathNext = /** @type {import('./types.js').LookupPathFn} */ (
        internal.lookupPath
      );
      return lookupPathNext(tailPath);
    };

    /**
     * @param {string} petNamePath
     */
    const remove = async petNamePath => {
      const { store, name } = await lookupPath(petNamePath.split('.'));
      await store.remove(name);
    };

    /**
     * @param {string} fromPath
     * @param {string} toPath
     */
    const move = async (fromPath, toPath) => {
      const { store: fromStore, name: fromName } = await lookupPath(
        fromPath.split('.'),
      );
      const { store: toStore, name: toName } = await lookupPath(
        toPath.split('.'),
      );
      if (fromStore === toStore) {
        return fromStore.rename(fromPath, toPath);
      } else {
        const formulaIdentifier = fromStore.lookup(fromName);
        if (formulaIdentifier === undefined) {
          throw new Error(`Unknown name: ${q(fromPath)}`);
        }
        const removeP = fromStore.remove(fromName);
        const addP = toStore.write(toName, formulaIdentifier);
        return Promise.all([addP, removeP]);
      }
    };

    /**
     * @param {string} fromPath
     * @param {string} toPath
     */
    const copy = async (fromPath, toPath) => {
      const { store: fromStore, name: fromName } = await lookupPath(
        fromPath.split('.'),
      );
      const { store: toStore, name: toName } = await lookupPath(
        toPath.split('.'),
      );
      const formulaIdentifier = fromStore.lookup(fromName);
      if (formulaIdentifier === undefined) {
        throw new Error(`Unknown name: ${q(fromPath)}`);
      }
      await toStore.write(toName, formulaIdentifier);
    };

    const makeDirectory = async directoryPetName => {
      const formulaNumber = await randomHex512();
      const formulaIdentifier = `directory-id512:${formulaNumber}`;
      await petStore.write(directoryPetName, formulaIdentifier);
      return /** @type {import('./types.js').EndoDirectory} */ (
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    /**
     * @param {string} [petNamePath]
     */
    const lookupWriter = async petNamePath => {
      if (petNamePath === undefined) {
        return () => {};
      }
      const { store, name } = await lookupPath(petNamePath.split('.'));
      return formulaIdentifier => store.write(name, formulaIdentifier);
    };

    return {
      lookup,
      lookupPath,
      lookupWriter,
      move,
      remove,
      copy,
      makeDirectory,
    };
  };

  /**
   * @param {object} args
   * @param {string} args.petStoreFormulaIdentifier
   * @param {import('./types.js').Context} args.context
   */
  const makeIdentifiedDirectory = async ({
    petStoreFormulaIdentifier,
    context,
  }) => {
    // TODO thread cancellation

    const petStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );

    const { has, list, follow: followNames, rename } = petStore;

    const node = makeNode({
      lookupFormulaIdentifierForName: petStore.lookup,
      petStore,
    });

    const { lookup, lookupPath, move, remove, copy, makeDirectory } = node;

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoDirectory>} */
    const external = Far('EndoDirectory', {
      has,
      lookup,
      list,
      followNames,
      rename,
      remove,
      move,
      copy,
      makeDirectory,
    });

    const internal = harden({
      lookupPath,
    });

    return harden({ external, internal });
  };

  return { makeIdentifiedDirectory, makeNode };
};
