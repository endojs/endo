// @ts-check

import { E, Far } from '@endo/far';
import { assertPetName } from './pet-name.js';
import { parseFormulaIdentifier } from './identifier.js';

const { quote: q } = assert;

export const makeHostMaker = ({
  provideValueForFormulaIdentifier,
  provideValueForFormula,
  provideValueForNumberedFormula,
  formulaIdentifierForRef,
  locate,
  storeReaderRef,
  makeSha512,
  randomHex512,
  makeMailbox,
  nonceLocatorFormulaIdentifier,
}) => {
  /**
   * @param {string} hostFormulaIdentifier
   * @param {string} storeFormulaIdentifier
   * @param {string} infoFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {string} leastAuthorityFormulaIdentifier
   * @param {string} endoFormulaIdentifier
   * @param {string} networksFormulaIdentifier
   * @param {string} networksPetStoreFormulaIdentifier
   * @param {import('./types.js').Context} context
   */
  const makeIdentifiedHost = async (
    hostFormulaIdentifier,
    storeFormulaIdentifier,
    infoFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    leastAuthorityFormulaIdentifier,
    endoFormulaIdentifier,
    networksFormulaIdentifier,
    networksPetStoreFormulaIdentifier,
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
      lookupPath,
      lookupWriter,
      lookupFormulaIdentifierForName,
      identify,
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
      list,
      listAll,
      listSpecial,
      rename,
      remove,
      move,
      copy,
      makeDirectory,
      cancel,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: hostFormulaIdentifier,
      specialNames: {
        SELF: hostFormulaIdentifier,
        INFO: infoFormulaIdentifier,
        NONE: leastAuthorityFormulaIdentifier,
        ENDO: endoFormulaIdentifier,
        NETS: networksFormulaIdentifier,
        HELO: nonceLocatorFormulaIdentifier,
      },
      context,
    });

    /**
     * @param {string} petName
     */
    const provideGuestFormulaIdentifier = async petName => {
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
        const { formulaIdentifier: guestFormulaIdentifier } =
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          await provideValueForFormula(formula, 'guest');
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, guestFormulaIdentifier);
        }
        return guestFormulaIdentifier;
      } else if (!formulaIdentifier.startsWith('guest:')) {
        throw new Error(
          `Existing pet name does not designate a guest powers capability: ${q(
            petName,
          )}`,
        );
      }
      return formulaIdentifier;
    };

    /**
     * @param {string} petName
     */
    const provideGuest = async petName => {
      const formulaIdentifier = await provideGuestFormulaIdentifier(petName);
      return /** @type {Promise<import('./types.js').EndoGuest>} */ (
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
      const writeResult = await lookupWriter(petName);
      const formulaIdentifier = await storeReaderRef(readerRef);
      await writeResult(formulaIdentifier);
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
        workerFormulaIdentifier = `worker:${workerId512}`;
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
        const workerId512 = await randomHex512();
        return `worker:${workerId512}`;
      }
      assertPetName(workerName);
      let workerFormulaIdentifier = lookupFormulaIdentifierForName(workerName);
      if (workerFormulaIdentifier === undefined) {
        const workerId512 = await randomHex512();
        workerFormulaIdentifier = `worker:${workerId512}`;
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

      const writeResult = await lookupWriter(resultName);

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
        'eval',
      );

      await writeResult(formulaIdentifier);

      return value;
    };

    /**
     * @param {string | 'NEW' | 'MAIN'} workerName
     * @param {string} importPath
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
     * @param {string} resultName
     */
    const makeUnsafe = async (
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

      const writeResult = await lookupWriter(resultName);

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
        'import-unsafe',
      );

      await writeResult(formulaIdentifier);

      return value;
    };

    /**
     * @param {string | 'MAIN' | 'NEW'} workerName
     * @param {string} bundleName
     * @param {string | 'NONE' | 'HOST' | 'ENDO'} powersName
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

      const writeResult = await lookupWriter(resultName);

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
        'import-bundle',
      );

      await writeResult(formulaIdentifier);

      return value;
    };

    /**
     * @param {string} [petName]
     */
    const makeWorker = async petName => {
      const workerId512 = await randomHex512();
      const formulaIdentifier = `worker:${workerId512}`;
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
        formulaIdentifier = `host:${id512}`;
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, formulaIdentifier);
        }
      } else if (!formulaIdentifier.startsWith('host:')) {
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

    // TODO expand guestName to guestPath
    /**
     * @param {string} guestName
     */
    const invite = async guestName => {
      const networksPetStore = /** @type {import('./types.js').PetStore} */ (
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        await provideValueForFormulaIdentifier(
          networksPetStoreFormulaIdentifier,
        )
      );
      const guestFormulaIdentifier = await provideGuestFormulaIdentifier(
        guestName,
      );
      if (guestFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name: ${guestName}`);
      }
      const { formulaNumber: guestFormulaNumber } = parseFormulaIdentifier(
        guestFormulaIdentifier,
      );
      const networkFormulaIdentifiers = networksPetStore
        .list()
        .map(name => networksPetStore.lookup(name));
      const addresses = (
        await Promise.all(
          networkFormulaIdentifiers.map(async networkFormulaIdentifier => {
            const network = await provideValueForFormulaIdentifier(
              networkFormulaIdentifier,
            );
            return E(network).addresses();
          }),
        )
      ).flat();
      return harden({
        powers: guestFormulaNumber,
        addresses,
      });
    };

    /**
     * @param {import('./types.js').Invitation} invitation
     * @param {string} resultName
     */
    const accept = async (invitation, resultName) => {
      const writeResult = await lookupWriter(resultName);
      // TODO validate invitation
      const { powers, addresses } = invitation;
      const formula = {
        type: 'peer',
        powers,
        addresses,
      };
      const { formulaIdentifier } = await provideValueForFormula(
        formula,
        'peer',
      );
      await writeResult(formulaIdentifier);
    };

    const { has, follow: followNames } = petStore;

    const nonceLocator = () =>
      provideValueForFormulaIdentifier(nonceLocatorFormulaIdentifier);

    /** @type {import('./types.js').EndoHost} */
    const host = Far('EndoHost', {
      has,
      lookup,
      reverseLookup,
      locate,
      identify,
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
      remove,
      rename,
      move,
      copy,
      makeDirectory,
      store,
      provideGuest,
      provideHost,
      makeWorker,
      provideWorker,
      evaluate,
      cancel,
      makeUnsafe,
      makeBundle,
      provideWebPage,
      invite,
      accept,
      nonceLocator,
    });

    const internal = harden({ receive, respond, lookupPath });

    await provideValueForFormulaIdentifier(mainWorkerFormulaIdentifier);

    return harden({ external: host, internal });
  };

  return makeIdentifiedHost;
};
