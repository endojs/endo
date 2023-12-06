// @ts-check

import { Far } from '@endo/far';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifier,
  storeReaderRef,
  makeMailbox,
  provideValueForFormula,
}) => {
  /**
   * @param {string} guestFormulaIdentifier
   * @param {string} hostFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   * @param {import('./types.js').Terminator} terminator
   */
  const makeIdentifiedGuestController = async (
    guestFormulaIdentifier,
    hostFormulaIdentifier,
    petStoreFormulaIdentifier,
    mainWorkerFormulaIdentifier,
    terminator,
  ) => {
    terminator.thisDiesIfThatDies(hostFormulaIdentifier);
    terminator.thisDiesIfThatDies(petStoreFormulaIdentifier);
    terminator.thisDiesIfThatDies(mainWorkerFormulaIdentifier);

    const petStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const hostController = /** @type {import('./types.js').Controller<>} */ (
      await provideControllerForFormulaIdentifier(hostFormulaIdentifier)
    );
    const hostPrivateFacet = await hostController.internal;
    if (hostPrivateFacet === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }
    const { respond: deliverToHost } = hostPrivateFacet;
    if (deliverToHost === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    const {
      lookup,
      reverseLookup,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      send,
      receive,
      respond,
      request,
      rename,
      remove,
      adoptApp,
      lookupFormulaIdentifierForName,
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      specialNames: {
        SELF: guestFormulaIdentifier,
        HOST: hostFormulaIdentifier,
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
        const { value, formulaIdentifier: newGuestFormulaIdentifier } =
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          await provideValueForFormula(formula, 'guest-id512');
        if (petName !== undefined) {
          assertPetName(petName);
          await petStore.write(petName, newGuestFormulaIdentifier);
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

    const { has, queryByType, list, listWithId, follow: followNames, followWithId: followNamesWithId, followQueryByType } = petStore;
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

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      has,
      queryByType,
      followQueryByType,
      lookup,
      reverseLookup,
      request,
      send,
      list,
      listWithId,
      followNames,
      followNamesWithId,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      adoptApp,
      remove,
      rename,
      store,
      provideGuest,
    });

    const internal = harden({
      receive,
      respond,
    });

    return harden({ external: guest, internal });
  };

  return makeIdentifiedGuestController;
};
