// @ts-check

import { Far } from '@endo/far';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

export const makeHostMaker = ({
  provideValueForFormulaIdentifier,
  provideValueForFormula,
  provideValueForNumberedFormula,
  formulaIdentifierForRef,
  storeReaderRef,
  makeSha512,
  randomHex512,
  makeMailbox,
}) => {
  /**
   * @param {string} hostFormulaIdentifier
   * @param {string} storeFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {import('./types.js').Terminator} terminator
   */
  const makeIdentifiedHost = async (
    hostFormulaIdentifier,
    storeFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    terminator,
  ) => {
    terminator.thisDiesIfThatDies(storeFormulaIdentifier);
    terminator.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const petStore = /** @type {import('./types.js').PetStore} */ (
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      await provideValueForFormulaIdentifier(storeFormulaIdentifier)
    );

    const {
      lookup,
      reverseLookup,
      lookupFormulaIdentifierForName,
      listMessages,
      followMessages,
      resolve,
      reject,
      respond,
      request,
      receive,
      send,
      dismiss,
      adopt,
      rename,
      remove,
      terminate,
      adoptApp,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: hostFormulaIdentifier,
      specialNames: {
        SELF: hostFormulaIdentifier,
        NONE: 'least-authority',
        ENDO: 'endo',
      },
      terminator,
    });

    /**
     * @param {string} petName
     */
    const provideGuest = async petName => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = lookupFormulaIdentifierForName(petName);
      }
      if (formulaIdentifier === undefined) {
        /** @type {import('./types.js').GuestFormula} */
        const formula = {
          type: /* @type {'guest'} */ 'guest',
          host: hostFormulaIdentifier,
        };
        const { value, formulaIdentifier: guestFormulaIdentifier } =
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          await provideValueForFormula(formula, 'guest-id512');
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, guestFormulaIdentifier);
        }
        return value;
      } else if (!formulaIdentifier.startsWith('guest-id512:')) {
        throw new Error(
          `Existing pet name does not designate a guest powers capability: ${q(
            petName,
          )}`,
        );
      }
      return /** @type {Promise<import('./types.js').EndoHost>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
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
      let workerFormulaIdentifier = lookupFormulaIdentifierForName(workerName);
      if (workerFormulaIdentifier === undefined) {
        const workerId512 = await randomHex512();
        workerFormulaIdentifier = `worker-id512:${workerId512}`;
        assertPetName(workerName);
        await petStore.write(workerName, workerFormulaIdentifier);
      } else if (!workerFormulaIdentifier.startsWith('worker-id512:')) {
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
        const workerId512 = await randomHex512();
        return `worker-id512:${workerId512}`;
      }
      assertPetName(workerName);
      let workerFormulaIdentifier = lookupFormulaIdentifierForName(workerName);
      if (workerFormulaIdentifier === undefined) {
        const workerId512 = await randomHex512();
        workerFormulaIdentifier = `worker-id512:${workerId512}`;
        assertPetName(workerName);
        await petStore.write(workerName, workerFormulaIdentifier);
      }
      return workerFormulaIdentifier;
    };

    /**
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} partyName
     */
    const providePowersFormulaIdentifier = async partyName => {
      let guestFormulaIdentifier = lookupFormulaIdentifierForName(partyName);
      if (guestFormulaIdentifier === undefined) {
        const guest = await provideGuest(partyName);
        guestFormulaIdentifier = formulaIdentifierForRef.get(guest);
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
     * @param {Array<string>} codeNames
     * @param {Array<string>} petNames
     * @param {string} resultName
     */
    const evaluate = async (
      workerName,
      source,
      codeNames,
      petNames,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      if (resultName !== undefined) {
        assertPetName(resultName);
      }
      if (petNames.length !== codeNames.length) {
        throw new Error('Evaluator requires one pet name for each code name');
      }

      const formulaIdentifiers = await Promise.all(
        petNames.map(async (petName, index) => {
          if (typeof codeNames[index] !== 'string') {
            throw new Error(`Invalid endowment name: ${q(codeNames[index])}`);
          }
          const formulaIdentifier = lookupFormulaIdentifierForName(petName);
          if (formulaIdentifier === undefined) {
            throw new Error(`Unknown pet name ${q(petName)}`);
          }
          return formulaIdentifier;
        }),
      );

      const formula = {
        /** @type {'eval'} */
        type: 'eval',
        worker: workerFormulaIdentifier,
        source,
        names: codeNames,
        values: formulaIdentifiers,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await provideValueForFormula(
        formula,
        'eval-id512',
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /**
     * @param {string | 'NEW' | 'MAIN'} workerName
     * @param {string} importPath
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const importUnsafeAndEndow = async (
      workerName,
      importPath,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      const formula = {
        /** @type {'import-unsafe'} */
        type: 'import-unsafe',
        worker: workerFormulaIdentifier,
        powers: powersFormulaIdentifier,
        importPath,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { formulaIdentifier, value } = await provideValueForFormula(
        formula,
        'import-unsafe-id512',
      );
      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }
      return value;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const importBundleAndEndow = async (
      workerName,
      bundleName,
      powersName,
      resultName,
    ) => {
      const workerFormulaIdentifier = await provideWorkerFormulaIdentifier(
        workerName,
      );

      const bundleFormulaIdentifier =
        lookupFormulaIdentifierForName(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name for bundle: ${bundleName}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      const formula = {
        /** @type {'import-bundle'} */
        type: 'import-bundle',
        worker: workerFormulaIdentifier,
        powers: powersFormulaIdentifier,
        bundle: bundleFormulaIdentifier,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await provideValueForFormula(
        formula,
        'import-bundle-id512',
      );

      if (resultName !== undefined) {
        await petStore.write(resultName, formulaIdentifier);
      }

      return value;
    };

    /**
     * @param {string} [petName]
     */
    const makeWorker = async petName => {
      const workerId512 = await randomHex512();
      const formulaIdentifier = `worker-id512:${workerId512}`;
      if (petName !== undefined) {
        assertPetName(petName);
        await petStore.write(petName, formulaIdentifier);
      }
      return /** @type {Promise<import('./types.js').EndoWorker>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    /**
     * @param {string} [petName]
     */
    const provideHost = async petName => {
      /** @type {string | undefined} */
      let formulaIdentifier;
      if (petName !== undefined) {
        formulaIdentifier = lookupFormulaIdentifierForName(petName);
      }
      if (formulaIdentifier === undefined) {
        const id512 = await randomHex512();
        formulaIdentifier = `host-id512:${id512}`;
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, formulaIdentifier);
        }
      } else if (!formulaIdentifier.startsWith('host-id512:')) {
        throw new Error(
          `Existing pet name does not designate a host powers capability: ${q(
            petName,
          )}`,
        );
      }
      return /** @type {Promise<import('./types.js').EndoHost>} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        provideValueForFormulaIdentifier(formulaIdentifier)
      );
    };

    /**
     * @param {string} webPageName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     */
    const provideWebPage = async (webPageName, bundleName, powersName) => {
      const bundleFormulaIdentifier =
        lookupFormulaIdentifierForName(bundleName);
      if (bundleFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name: ${q(bundleName)}`);
      }

      const powersFormulaIdentifier = await providePowersFormulaIdentifier(
        powersName,
      );

      const digester = makeSha512();
      digester.updateText(
        `${bundleFormulaIdentifier},${powersFormulaIdentifier}`,
      );
      const formulaNumber = digester.digestHex().slice(32, 64);

      const formula = {
        type: 'web-bundle',
        bundle: bundleFormulaIdentifier,
        powers: powersFormulaIdentifier,
      };

      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      const { value, formulaIdentifier } = await provideValueForNumberedFormula(
        'web-bundle',
        formulaNumber,
        formula,
      );

      if (webPageName !== undefined) {
        assertPetName(webPageName);
        await petStore.write(webPageName, formulaIdentifier);
      }

      return value;
    };

    const { has, queryByType, followQueryByType, list, listWithId, follow: followNames, followWithId: followNamesWithId } = petStore;

    /** @type {import('./types.js').EndoHost} */
    const host = Far('EndoHost', {
      has,
      queryByType,
      followQueryByType,
      lookup,
      reverseLookup,
      listMessages,
      followMessages,
      resolve,
      reject,
      adopt,
      adoptApp,
      dismiss,
      request,
      send,
      list,
      listWithId,
      followNames,
      followNamesWithId,
      remove,
      rename,
      store,
      provideGuest,
      provideHost,
      makeWorker,
      provideWorker,
      evaluate,
      terminate,
      importUnsafeAndEndow,
      importBundleAndEndow,
      provideWebPage,
    });

    const internal = harden({ receive, respond });

    await provideValueForFormulaIdentifier(mainWorkerFormulaIdentifier);

    return harden({ external: host, internal });
  };

  return makeIdentifiedHost;
};
