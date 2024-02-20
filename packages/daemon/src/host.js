// @ts-check

import { Far } from '@endo/far';
import { assertPetName, petNamePathFrom } from './pet-name.js';

const { quote: q } = assert;

export const makeHostMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
  incarnateWorker,
  incarnateHost,
  incarnateGuest,
  incarnateEval,
  incarnateUnconfined,
  incarnateBundle,
  incarnateWebBundle,
  incarnateHandle,
  storeReaderRef,
  randomHex512,
  makeMailbox,
}) => {
  /**
   * @param {string} hostFormulaIdentifier
   * @param {string} endoFormulaIdentifier
   * @param {string} storeFormulaIdentifier
   * @param {string} inspectorFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {string} leastAuthorityFormulaIdentifier
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedHost = async (
    hostFormulaIdentifier,
    endoFormulaIdentifier,
    storeFormulaIdentifier,
    inspectorFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    leastAuthorityFormulaIdentifier,
    context,
  ) => {
    context.thisDiesIfThatDies(storeFormulaIdentifier);
    context.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const petStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(storeFormulaIdentifier)
    );

    const {
      lookup,
      reverseLookup,
      identifyLocal,
      listMessages,
      provideLookupFormula,
      followMessages,
      resolve,
      reject,
      respond,
      request,
      receive,
      send,
      dismiss,
      adopt,
      list,
      listAll,
      listSpecial,
      rename,
      remove,
      cancel,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: hostFormulaIdentifier,
      specialNames: {
        SELF: hostFormulaIdentifier,
        ENDO: endoFormulaIdentifier,
        INFO: inspectorFormulaIdentifier,
        NONE: leastAuthorityFormulaIdentifier,
      },
      context,
    });

    /**
     * @returns {Promise<{ formulaIdentifier: string, value: import('./types').ExternalHandle }>}
     */
    const makeNewHandleForSelf = () => {
      return incarnateHandle(hostFormulaIdentifier);
    };

    /**
     * @param {import('./types.js').Controller} newController
     * @param {Record<string,string>} introducedNames
     * @returns {Promise<void>}
     */
    const introduceNamesToNewHostOrGuest = async (
      newController,
      introducedNames,
    ) => {
      const { petStore: newPetStore } = await newController.internal;
      await Promise.all(
        Object.entries(introducedNames).map(async ([parentName, childName]) => {
          const introducedFormulaIdentifier = identifyLocal(parentName);
          if (introducedFormulaIdentifier === undefined) {
            return;
          }
          await newPetStore.write(childName, introducedFormulaIdentifier);
        }),
      );
    };

    /**
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{formulaIdentifier: string, value: Promise<import('./types.js').EndoGuest>}>}
     */
    const makeGuest = async (petName, { introducedNames = {} } = {}) => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = identifyLocal(petName);
      }

      if (formulaIdentifier === undefined) {
        const { formulaIdentifier: hostHandleFormulaIdentifier } =
          await makeNewHandleForSelf();
        const { value, formulaIdentifier: guestFormulaIdentifier } =
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          await incarnateGuest(hostHandleFormulaIdentifier);
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, guestFormulaIdentifier);
        }

        return { value, formulaIdentifier: guestFormulaIdentifier };
      } else if (!formulaIdentifier.startsWith('guest:')) {
        throw new Error(
          `Existing pet name does not designate a guest powers capability: ${q(
            petName,
          )}`,
        );
      }

      const newGuestController =
        /** @type {import('./types.js').Controller<>} */ (
          provideControllerForFormulaIdentifier(formulaIdentifier)
        );
      if (introducedNames !== undefined) {
        introduceNamesToNewHostOrGuest(newGuestController, introducedNames);
      }
      return {
        formulaIdentifier,
        value: /** @type {Promise<import('./types.js').EndoGuest>} */ (
          newGuestController.external
        ),
      };
    };

    /** @type {import('./types.js').EndoHost['provideGuest']} */
    const provideGuest = async (petName, opts) => {
      const { value } = await makeGuest(petName, opts);
      return value;
    };

    /**
     * @param {import('@endo/eventual-send').ERef<AsyncIterableIterator<string>>} readerRef
     * @param {string} [petName]
     */
    const store = async (readerRef, petName) => {
      if (petName !== undefined) {
        assertPetName(petName);
      }

      const formulaIdentifier = await storeReaderRef(readerRef);

      if (petName !== undefined) {
        await petStore.write(petName, formulaIdentifier);
      }
    };

    /**
     * @param {string} workerName
     */
    const provideWorker = async workerName => {
      if (typeof workerName !== 'string') {
        throw new Error('worker name must be string');
      }
      let workerFormulaIdentifier = identifyLocal(workerName);
      if (workerFormulaIdentifier === undefined) {
        ({ formulaIdentifier: workerFormulaIdentifier } =
          await incarnateWorker());
        assertPetName(workerName);
        await petStore.write(workerName, workerFormulaIdentifier);
      } else if (!workerFormulaIdentifier.startsWith('worker:')) {
        throw new Error(`Not a worker ${q(workerName)}`);
      }
      return /** @type {Promise<import('./types.js').EndoWorker>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(workerFormulaIdentifier)
      );
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     */
    const provideWorkerFormulaIdentifier = async workerName => {
      if (workerName === 'MAIN') {
        return mainWorkerFormulaIdentifier;
      } else if (workerName === 'NEW') {
        const { formulaIdentifier: workerFormulaIdentifier } =
          await incarnateWorker();
        return workerFormulaIdentifier;
      }
      assertPetName(workerName);
      let workerFormulaIdentifier = identifyLocal(workerName);
      if (workerFormulaIdentifier === undefined) {
        ({ formulaIdentifier: workerFormulaIdentifier } =
          await incarnateWorker());
        assertPetName(workerName);
        await petStore.write(workerName, workerFormulaIdentifier);
      }
      return workerFormulaIdentifier;
    };

    /**
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} partyName
     * @returns {Promise<string>}
     */
    const providePowersFormulaIdentifier = async partyName => {
      let guestFormulaIdentifier = identifyLocal(partyName);
      if (guestFormulaIdentifier === undefined) {
        ({ formulaIdentifier: guestFormulaIdentifier } = await makeGuest(
          partyName,
        ));
        if (guestFormulaIdentifier === undefined) {
          throw new Error(
            `panic: provideGuest must return an guest with a corresponding formula identifier`,
          );
        }
      }
      return guestFormulaIdentifier;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} source
     * @param {string[]} codeNames
     * @param {(string | string[])[]} petNamePaths
     * @param {string} resultName
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNamePaths,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      if (resultName !== undefined) {
        assertPetName(resultName);
      }
      if (petNamePaths.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      const endowmentFormulaIdentifiers = await Promise.all(
        petNamePaths.map(async (petNameOrPath, index) => {
          if (typeof codeNames[index] !== 'string') {
            throw new Error(`Invalid endowment name: ${q(codeNames[index])}`);
          }

          const petNamePath = petNamePathFrom(petNameOrPath);
          if (petNamePath.length === 1) {
            const formulaIdentifier = identifyLocal(petNamePath[0]);
            if (formulaIdentifier === undefined) {
              throw new Error(`Unknown pet name ${q(petNamePath[0])}`);
            }
            return formulaIdentifier;
          }

          const { formulaIdentifier: lookupFormulaIdentifier } =
            await provideLookupFormula(petNamePath);
          return lookupFormulaIdentifier;
        }),
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await incarnateEval(
        workerFormulaIdentifier,
        source,
        codeNames,
        endowmentFormulaIdentifiers,
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /** @type {import('./types.js').EndoHost['makeUnconfined']} */
    const makeUnconfined = async (
      workerName,
      specifier,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await incarnateUnconfined(
        workerFormulaIdentifier,
        powersFormulaIdentifier,
        specifier,
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const makeBundle = async (
      workerName,
      bundleName,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const bundleFormulaIdentifier = identifyLocal(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${bundleName}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await incarnateBundle(
        powersFormulaIdentifier,
        workerFormulaIdentifier,
        bundleFormulaIdentifier,
      );

      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }

      return value;
    };

    /**
     * @param {string} [petName]
     * @returns {Promise<import('./types.js').EndoWorker>}
     */
    const makeWorker = async petName => {
      // Behold, recursion:
      const { formulaIdentifier, value } = await incarnateWorker();
      if (petName !== undefined) {
        assertPetName(petName);
        await petStore.write(petName, formulaIdentifier);
      }
      return /** @type {import('./types.js').EndoWorker} */ (value);
    };

    /**
     * @param {string} [petName]
     * @param {import('./types.js').MakeHostOrGuestOptions} [opts]
     * @returns {Promise<{formulaIdentifier: string, value: Promise<import('./types.js').EndoHost>}>}
     */
    const makeHost = async (petName, { introducedNames = {} } = {}) => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = identifyLocal(petName);
      }
      if (formulaIdentifier === undefined) {
        const { formulaIdentifier: newFormulaIdentifier, value } =
          await incarnateHost(
            endoFormulaIdentifier,
            leastAuthorityFormulaIdentifier,
          );
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, newFormulaIdentifier);
        }
        return { formulaIdentifier: newFormulaIdentifier, value };
      } else if (!formulaIdentifier.startsWith('host:')) {
        throw new Error(
          `Existing pet name does not designate a host powers capability: ${q(
            petName,
          )}`,
        );
      }
      const newHostController =
        /** @type {import('./types.js').Controller<>} */ (
          provideControllerForFormulaIdentifier(formulaIdentifier)
        );
      if (introducedNames !== undefined) {
        introduceNamesToNewHostOrGuest(newHostController, introducedNames);
      }
      return {
        formulaIdentifier,
        value: /** @type {Promise<import('./types.js').EndoHost>} */ (
          newHostController.external
        ),
      };
    };

    /** @type {import('./types.js').EndoHost['provideHost']} */
    const provideHost = async (petName, opts) => {
      const { value } = await makeHost(petName, opts);
      return value;
    };

    /**
     * @param {string} webPageName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'SELF' | 'ENDO'} powersName
     */
    const provideWebPage = async (webPageName, bundleName, powersName) => {
      const bundleFormulaIdentifier = identifyLocal(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name: ${q(bundleName)}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      // Behold, recursion:
      const { value, formulaIdentifier } = await incarnateWebBundle(
        powersFormulaIdentifier,
        bundleFormulaIdentifier,
      );

      if (webPageName !== undefined) {
        assertPetName(webPageName);
        await petStore.write(webPageName, formulaIdentifier);
      }

      return value;
    };

    const { has, follow: followNames, listEntries, followEntries } = petStore;

    /** @type {import('./types.js').EndoHost} */
    const host = Far('EndoHost', {
      has,
      lookup,
      reverseLookup,
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      dismiss,
      request,
      send,
      list,
      listSpecial,
      listAll,
      followNames,
      listEntries,
      followEntries,
      remove,
      rename,
      store,
      provideGuest,
      provideHost,
      makeWorker,
      provideWorker,
      evaluate,
      cancel,
      makeUnconfined,
      makeBundle,
      provideWebPage,
    });

    const internal = harden({ receive, respond, petStore });

    await provideValueForFormulaIdentifier(mainWorkerFormulaIdentifier);

    return harden({ external: host, internal });
  };

  return makeIdentifiedHost;
};
