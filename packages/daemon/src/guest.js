import { Far } from '@endo/far';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

export const makeGuestMaker = ({
  provideValueForFormulaIdentifier,
  partyReceiveFunctions,
  partyRequestFunctions,
}) => {
  /**
   * @param {string} guestFormulaIdentifier
   * @param {string} hostFormulaIdentifier
   * @param {string} petStoreFormulaIdentifier
   */
  const makeIdentifiedGuest = async (
    guestFormulaIdentifier,
    hostFormulaIdentifier,
    petStoreFormulaIdentifier,
  ) => {
    /** @type {Map<string, Promise<unknown>>} */
    const responses = new Map();

    const guestPetStore = /** @type {import('./types.js').PetStore} */ (
      await provideValueForFormulaIdentifier(petStoreFormulaIdentifier)
    );
    const host = /** @type {object} */ (
      await provideValueForFormulaIdentifier(hostFormulaIdentifier)
    );

    const hostRequest = partyRequestFunctions.get(host);
    if (hostRequest === undefined) {
      throw new Error(
        `panic: a host request function must exist for every host`,
      );
    }

    /**
     * @param {string} petName
     */
    const provide = async petName => {
      assertPetName(petName);
      const formulaIdentifier = guestPetStore.get(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    /**
     * @param {string} fromName
     * @param {string} toName
     */
    const rename = async (fromName, toName) => {
      assertPetName(fromName);
      assertPetName(toName);
      await guestPetStore.rename(fromName, toName);
      const formulaIdentifier = responses.get(fromName);
      if (formulaIdentifier === undefined) {
        throw new Error(
          `panic: the pet store rename must ensure that the renamed identifier exists`,
        );
      }
      responses.set(toName, formulaIdentifier);
      responses.delete(fromName);
    };

    /**
     * @param {string} petName
     */
    const remove = async petName => {
      await guestPetStore.remove(petName);
      responses.delete(petName);
    };

    const { list } = guestPetStore;

    const request = async (what, responseName) => {
      if (responseName === undefined) {
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return hostRequest(
          what,
          responseName,
          guestFormulaIdentifier,
          guestPetStore,
        );
      }
      const responseP = responses.get(responseName);
      if (responseP !== undefined) {
        return responseP;
      }
      // Behold, recursion:
      // eslint-disable-next-line
      const newResponseP = hostRequest(
        what,
        responseName,
        guestFormulaIdentifier,
        guestPetStore,
      );
      responses.set(responseName, newResponseP);
      return newResponseP;
    };

    /**
     * @param {Array<string>} strings
     * @param {Array<string>} edgeNames
     * @param {Array<string>} petNames
     */
    const receive = async (strings, edgeNames, petNames) => {
      petNames.forEach(assertPetName);
      edgeNames.forEach(assertPetName);
      if (petNames.length !== edgeNames.length) {
        throw new Error(
          `Message must have one edge name (${q(
            edgeNames.length,
          )}) for every pet name (${q(petNames.length)})`,
        );
      }
      if (strings.length < petNames.length) {
        throw new Error(
          `Message must have one string before every value delivered`,
        );
      }

      const partyReceive = partyReceiveFunctions.get(host);
      if (partyReceive === undefined) {
        throw new Error(`panic: Message not deliverable`);
      }
      const formulaIdentifiers = petNames.map(petName => {
        const formulaIdentifier = guestPetStore.get(petName);
        if (formulaIdentifier === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        return formulaIdentifier;
      });
      partyReceive(
        guestFormulaIdentifier,
        strings,
        edgeNames,
        formulaIdentifiers,
      );
    };

    /** @type {import('@endo/eventual-send').ERef<import('./types.js').EndoGuest>} */
    const guest = Far('EndoGuest', {
      request,
      receive,
      list,
      remove,
      rename,
      provide,
    });

    return guest;
  };

  return makeIdentifiedGuest;
};
