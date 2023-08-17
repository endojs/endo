import { Far } from '@endo/far';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

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
    const host = /** @type {object} */ (
      await provideValueForFormulaIdentifier(hostFormulaIdentifier)
    );

    const deliverToHost = partyRequestFunctions.get(host);
    if (deliverToHost === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    const {
      reverseLookup,
      lookupFormulaIdentifierForName,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      sendMail,
      receiveMail,
      receiveRequest,
      sendRequest,
      rename,
      remove,
    } = makeMailbox({
      petStore,
      specialNames: {
        SELF: guestFormulaIdentifier,
        HOST: hostFormulaIdentifier,
      },
    });

    /**
     * @param {string} petName
     */
    const lookup = async petName => {
      assertPetName(petName);
      const formulaIdentifier = lookupFormulaIdentifierForName(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    const { list } = petStore;

    const receive = (strings, edgeNames, petNames) => {
      return sendMail(
        guestFormulaIdentifier,
        hostFormulaIdentifier,
        strings,
        edgeNames,
        petNames,
      );
    };

    const send = async (recipientName, strings, edgeNames, petNames) => {
      const recipientFormulaIdentifier =
        lookupFormulaIdentifierForName(recipientName);
      if (recipientFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name for party: ${recipientName}`);
      }
      return sendMail(
        guestFormulaIdentifier,
        recipientFormulaIdentifier,
        strings,
        edgeNames,
        petNames,
      );
    };

    const request = async (recipientName, what, responseName) => {
      const recipientFormulaIdentifier =
        lookupFormulaIdentifierForName(recipientName);
      if (recipientFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name for party: ${recipientName}`);
      }
      return sendRequest(
        guestFormulaIdentifier,
        recipientFormulaIdentifier,
        what,
        responseName,
      );
    };

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      lookup,
      reverseLookup,
      request,
      receive,
      send,
      list,
      followMessages,
      listMessages,
      resolve,
      reject,
      dismiss,
      adopt,
      remove,
      rename,
    });

    partyReceiveFunctions.set(guest, receiveMail);
    partyRequestFunctions.set(guest, receiveRequest);

    return guest;
  };

  return makeIdentifiedGuest;
};
