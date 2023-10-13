// @ts-check

import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from './pubsub.js';
import { makeIteratorRef } from './reader-ref.js';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

export const makeMailboxMaker = ({
  provideValueForFormulaIdentifier,
  formulaIdentifierForRef,
}) => {
  /** @type {WeakMap<object, import('./types.js').RequestFn>} */
  const partyRequestFunctions = new WeakMap();
  /** @type {WeakMap<object, import('./types.js').ReceiveFn>} */
  const partyReceiveFunctions = new WeakMap();

  const makeMailbox = ({ selfFormulaIdentifier, petStore, specialNames }) => {
    /** @type {Map<string, Promise<unknown>>} */
    const responses = new Map();
    /** @type {Map<number, import('./types.js').InternalMessage>} */
    const messages = new Map();
    /** @type {WeakMap<object, (value: unknown) => void>} */
    const resolvers = new WeakMap();
    /** @type {WeakMap<object, () => void>} */
    const dismissers = new WeakMap();
    /** @type {import('./types.js').Topic<import('./types.js').InternalMessage>} */
    const messagesTopic = makeChangeTopic();
    let nextMessageNumber = 0;

    /**
     * @param {string} petName
     */
    const lookupFormulaIdentifierForName = petName => {
      if (Object.hasOwn(specialNames, petName)) {
        return specialNames[petName];
      }
      return petStore.lookup(petName);
    };

    /**
     * @param {string} petName
     */
    const lookup = async petName => {
      const formulaIdentifier = lookupFormulaIdentifierForName(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    /**
     * @param {string} formulaIdentifier
     */
    const reverseLookupFormulaIdentifier = formulaIdentifier => {
      const names = Array.from(petStore.reverseLookup(formulaIdentifier));
      for (const [specialName, specialFormulaIdentifier] of Object.entries(
        specialNames,
      )) {
        if (specialFormulaIdentifier === formulaIdentifier) {
          names.push(specialName);
        }
      }
      return harden(names);
    };

    /**
     * @param {unknown} presence
     */
    const reverseLookup = async presence => {
      const formulaIdentifier = formulaIdentifierForRef.get(await presence);
      if (formulaIdentifier === undefined) {
        return harden([]);
      }
      return reverseLookupFormulaIdentifier(formulaIdentifier);
    };

    /**
     * @param {import('./types.js').InternalMessage} message
     * @returns {import('./types.js').Message | undefined}
     */
    const dubMessage = message => {
      const { type } = message;
      if (type === 'request') {
        const { who: senderFormulaIdentifier, ...rest } = message;
        const [senderName] = reverseLookupFormulaIdentifier(
          senderFormulaIdentifier,
        );
        if (senderName !== undefined) {
          return { who: senderName, ...rest };
        }
        return undefined;
      } else if (type === 'package') {
        const { formulas: _, who: senderFormulaIdentifier, ...rest } = message;
        const [senderName] = reverseLookupFormulaIdentifier(
          senderFormulaIdentifier,
        );
        if (senderName !== undefined) {
          return { who: senderName, ...rest };
        }
        return undefined;
      }
      throw Error(`panic: Unknown message type ${type}`);
    };

    const listMessages = async () =>
      harden(Array.from(messages.values(), dubMessage));

    const followMessages = async () =>
      makeIteratorRef(
        (async function* currentAndSubsequentMessages() {
          const subsequentRequests = messagesTopic.subscribe();
          for (const message of messages.values()) {
            const dubbedMessage = dubMessage(message);
            if (dubbedMessage !== undefined) {
              yield dubMessage(message);
            }
          }
          for await (const message of subsequentRequests) {
            const dubbedMessage = dubMessage(message);
            if (dubbedMessage !== undefined) {
              yield dubMessage(message);
            }
          }
        })(),
      );

    const deliver = partialMessage => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<void>} */
      const dismissal = makePromiseKit();
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1;

      const message = harden({
        number: messageNumber,
        when: new Date().toISOString(),
        dismissed: dismissal.promise,
        ...partialMessage,
      });

      dismissers.set(message, () => {
        messages.delete(messageNumber);
        dismissal.resolve();
      });

      messages.set(messageNumber, message);
      messagesTopic.publisher.next(message);

      return message;
    };

    /**
     * @param {string} what - user visible description of the desired value
     * @param {string} who
     */
    const requestFormulaIdentifier = async (what, who) => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<string>} */
      const { promise, resolve } = makePromiseKit();
      const settled = promise.then(
        () => 'fulfilled',
        () => 'rejected',
      );
      const message = deliver({
        type: /** @type {const} */ ('request'),
        who,
        what,
        settled,
      });
      resolvers.set(message, resolve);
      return promise;
    };

    /**
     * @param {string} what
     * @param {string} responseName
     * @param {string} senderFormulaIdentifier
     * @param {import('./types.js').PetStore} senderPetStore
     */
    const respond = async (
      what,
      responseName,
      senderFormulaIdentifier,
      senderPetStore,
    ) => {
      if (responseName !== undefined) {
        /** @type {string | undefined} */
        let formulaIdentifier = senderPetStore.lookup(responseName);
        if (formulaIdentifier === undefined) {
          formulaIdentifier = await requestFormulaIdentifier(
            what,
            senderFormulaIdentifier,
          );
          await senderPetStore.write(responseName, formulaIdentifier);
        }
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return provideValueForFormulaIdentifier(formulaIdentifier);
      }
      // The reference is not named nor to be named.
      const formulaIdentifier = await requestFormulaIdentifier(
        what,
        senderFormulaIdentifier,
      );
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    const resolve = async (messageNumber, resolutionName) => {
      assertPetName(resolutionName);
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(messageNumber)}`);
      }
      const req = messages.get(messageNumber);
      const resolveRequest = resolvers.get(req);
      if (resolveRequest === undefined) {
        throw new Error(`No pending request for number ${messageNumber}`);
      }
      const formulaIdentifier = lookupFormulaIdentifierForName(resolutionName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionName)}`,
        );
      }
      resolveRequest(formulaIdentifier);
    };

    // TODO test reject
    /**
     * @param {number} messageNumber
     * @param {string} [message]
     */
    const reject = async (messageNumber, message = 'Declined') => {
      const req = messages.get(messageNumber);
      if (req !== undefined) {
        const resolveRequest = resolvers.get(req);
        if (resolveRequest === undefined) {
          throw new Error(`panic: a resolver must exist for every request`);
        }
        resolveRequest(harden(Promise.reject(harden(new Error(message)))));
      }
    };

    /**
     * @param {string} senderFormulaIdentifier
     * @param {Array<string>} strings
     * @param {Array<string>} edgeNames
     * @param {Array<string>} formulaIdentifiers
     */
    const receive = (
      senderFormulaIdentifier,
      strings,
      edgeNames,
      formulaIdentifiers,
    ) =>
      deliver({
        type: /** @type {const} */ ('package'),
        strings,
        names: edgeNames,
        formulas: formulaIdentifiers,
        who: senderFormulaIdentifier,
      });

    /**
     * @param {string} recipientName
     * @param {Array<string>} strings
     * @param {Array<string>} edgeNames
     * @param {Array<string>} petNames
     */
    const send = async (recipientName, strings, edgeNames, petNames) => {
      const recipientFormulaIdentifier =
        lookupFormulaIdentifierForName(recipientName);
      if (recipientFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name for party: ${recipientName}`);
      }
      const recipient = await provideValueForFormulaIdentifier(
        recipientFormulaIdentifier,
      );
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

      const partyReceive = partyReceiveFunctions.get(recipient);
      if (partyReceive === undefined) {
        throw new Error(`panic: Message not deliverable`);
      }
      const formulaIdentifiers = petNames.map(petName => {
        const formulaIdentifier = lookupFormulaIdentifierForName(petName);
        if (formulaIdentifier === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        return formulaIdentifier;
      });
      partyReceive(
        selfFormulaIdentifier,
        strings,
        edgeNames,
        formulaIdentifiers,
      );
    };

    const dismiss = async messageNumber => {
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${q(messageNumber)}`);
      }
      const message = messages.get(messageNumber);
      const dismissMessage = dismissers.get(message);
      if (dismissMessage === undefined) {
        throw new Error(`No dismissable message for number ${messageNumber}`);
      }
      dismissMessage();
    };

    const adopt = async (messageNumber, edgeName, petName) => {
      assertPetName(edgeName);
      assertPetName(petName);
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid message number ${q(messageNumber)}`);
      }
      const message = messages.get(messageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'package') {
        throw new Error(`Message must be a package ${q(messageNumber)}`);
      }
      const index = message.names.lastIndexOf(edgeName);
      if (index === -1) {
        throw new Error(
          `No reference named ${q(edgeName)} in message ${q(messageNumber)}`,
        );
      }
      const formulaIdentifier = message.formulas[index];
      if (formulaIdentifier === undefined) {
        throw new Error(
          `panic: message must contain a formula for every name, including the name ${q(
            edgeName,
          )} at ${q(index)}`,
        );
      }
      await petStore.write(petName, formulaIdentifier);
    };

    /**
     * @param {string} recipientName
     * @param {string} what
     * @param {string} responseName
     */
    const request = async (recipientName, what, responseName) => {
      const recipientFormulaIdentifier =
        lookupFormulaIdentifierForName(recipientName);
      if (recipientFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name for party: ${recipientName}`);
      }
      const recipient = /** @type {object} */ (
        await provideValueForFormulaIdentifier(recipientFormulaIdentifier)
      );

      const deliverToRecipient = partyRequestFunctions.get(recipient);
      if (deliverToRecipient === undefined) {
        throw new Error(
          `panic: a receive request function must exist for every party`,
        );
      }
      if (responseName === undefined) {
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        return deliverToRecipient(
          what,
          responseName,
          selfFormulaIdentifier,
          petStore,
        );
      }
      const responseP = responses.get(responseName);
      if (responseP !== undefined) {
        return responseP;
      }
      // Behold, recursion:
      // eslint-disable-next-line
      const newResponseP = deliverToRecipient(
        what,
        responseName,
        selfFormulaIdentifier,
        petStore,
      );
      responses.set(responseName, newResponseP);
      return newResponseP;
    };

    /**
     * @param {string} fromName
     * @param {string} toName
     */
    const rename = async (fromName, toName) => {
      await petStore.rename(fromName, toName);
      const formulaIdentifier = responses.get(fromName);
      if (formulaIdentifier !== undefined) {
        responses.set(toName, formulaIdentifier);
        responses.delete(fromName);
      }
    };

    /**
     * @param {string} petName
     */
    const remove = async petName => {
      await petStore.remove(petName);
      responses.delete(petName);
    };

    return harden({
      lookup,
      reverseLookup,
      reverseLookupFormulaIdentifier,
      lookupFormulaIdentifierForName,
      followMessages,
      listMessages,
      request,
      respond,
      resolve,
      reject,
      receive,
      send,
      dismiss,
      adopt,
      rename,
      remove,
    });
  };

  return {
    makeMailbox,
    partyRequestFunctions,
    partyReceiveFunctions,
  };
};
