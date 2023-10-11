// @ts-check

import { Far } from '@endo/far';

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  partyReceiveFunctions,
  partyRequestFunctions,
  makeMailbox,
}) => {
  /**
   * @param {string} guestFormulaIdentifier
   * @param {string} hostFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   * @param {string} mainWorkerFormulaIdentifier
   */
  const makeIdentifiedGuest = async (
    guestFormulaIdentifier,
    hostFormulaIdentifier,
    petStoreFormulaIdentifier,
    mainWorkerFormulaIdentifier,
  ) => {
    const petStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const hostController = /** @type {import('./types.js').Controller<>} */ (
      await provideControllerForFormulaIdentifier(hostFormulaIdentifier)
    );

    const deliverToHost = partyRequestFunctions.get(host);
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
    } = makeMailbox({
      petStore,
      selfFormulaIdentifier: guestFormulaIdentifier,
      specialNames: {
        SELF: guestFormulaIdentifier,
        HOST: hostFormulaIdentifier,
      },
    });

    const { list, follow: followNames } = petStore;

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      lookup,
      reverseLookup,
      request,
      send,
      list,
      followNames,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      remove,
      rename,
    });

    partyReceiveFunctions.set(guest, receive);
    partyRequestFunctions.set(guest, respond);

    return { promise: guest };
  };

  return makeIdentifiedGuest;
};
