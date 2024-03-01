// @ts-check

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from './pubsub.js';
import { makeIteratorRef } from './reader-ref.js';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provideValueForFormulaIdentifier']} args.provideValueForFormulaIdentifier
 * @param {import('./types.js').DaemonCore['getFormulaIdentifierForRef']} args.getFormulaIdentifierForRef
 * @param {import('./types.js').DaemonCore['provideControllerForFormulaIdentifierAndResolveHandle']} args.provideControllerForFormulaIdentifierAndResolveHandle
 * @param {import('./types.js').DaemonCore['cancelValue']} args.cancelValue
 * @returns {import('./types.js').MakeMailbox}
 */
export const makeMailboxMaker = ({
  getFormulaIdentifierForRef,
  provideValueForFormulaIdentifier,
  provideControllerForFormulaIdentifierAndResolveHandle,
  cancelValue,
}) => {
  /**
    @type {import('./types.js').MakeMailbox} */
  const makeMailbox = ({ selfFormulaIdentifier, petStore, context }) => {
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

    /** @type {import('./types.js').Mail['lookup']} */
    const lookup = async (...petNamePath) => {
      const [headName, ...tailNames] = petNamePath;
      const formulaIdentifier = petStore.identifyLocal(headName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(headName)}`);
      }
      // Behold, recursion:
      return tailNames.reduce(
        // @ts-expect-error calling lookup on an unknown object
        (currentValue, petName) => E(currentValue).lookup(petName),
        provideValueForFormulaIdentifier(formulaIdentifier),
      );
    };

    /** @type {import('./types.js').Mail['cancel']} */
    const cancel = async (petName, reason = new Error('Cancelled')) => {
      const formulaIdentifier = petStore.identifyLocal(petName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(`Unknown pet name: ${q(petName)}`);
      }
      return cancelValue(formulaIdentifier, reason);
    };

    /** @type {import('./types.js').Mail['reverseLookup']} */
    const reverseLookup = async presence => {
      const formulaIdentifier = getFormulaIdentifierForRef(await presence);
      if (formulaIdentifier === undefined) {
        return harden([]);
      }
      return petStore.reverseIdentify(formulaIdentifier);
    };

    /**
     * @param {import('./types.js').InternalMessage} message
     * @returns {import('./types.js').Message | undefined}
     */
    const dubMessage = message => {
      const { type } = message;
      if (type === 'request') {
        const {
          who: senderFormulaIdentifier,
          dest: recipientFormulaIdentifier,
          ...rest
        } = message;
        const [senderName] = petStore.reverseIdentify(senderFormulaIdentifier);
        const [recipientName] = petStore.reverseIdentify(
          recipientFormulaIdentifier,
        );
        if (senderName !== undefined) {
          return { who: senderName, dest: recipientName, ...rest };
        }
        return undefined;
      } else if (type === 'package') {
        const {
          who: senderFormulaIdentifier,
          dest: recipientFormulaIdentifier,
          ...rest
        } = message;
        const [senderName] = petStore.reverseIdentify(senderFormulaIdentifier);
        const [recipientName] = petStore.reverseIdentify(
          recipientFormulaIdentifier,
        );
        if (senderName !== undefined) {
          return { who: senderName, dest: recipientName, ...rest };
        }
        return undefined;
      }
      throw new Error(
        `panic: Unknown message type ${/** @type {any} */ (message).type}`,
      );
    };

    /**
     * @returns {Generator<import('./types.js').Message>}
     */
    const dubAndFilterMessages = function* dubAndFilterMessages() {
      for (const message of messages.values()) {
        const dubbedMessage = dubMessage(message);
        if (dubbedMessage !== undefined) {
          yield dubbedMessage;
        }
      }
    };

    /** @type {import('./types.js').Mail['listMessages']} */
    const listMessages = async () => harden(Array.from(dubAndFilterMessages()));

    /** @type {import('./types.js').Mail['followMessages']} */
    const followMessages = async () =>
      makeIteratorRef(
        (async function* currentAndSubsequentMessages() {
          const subsequentRequests = messagesTopic.subscribe();
          for (const message of messages.values()) {
            const dubbedMessage = dubMessage(message);
            if (dubbedMessage !== undefined) {
              yield dubbedMessage;
            }
          }
          for await (const message of subsequentRequests) {
            const dubbedMessage = dubMessage(message);
            if (dubbedMessage !== undefined) {
              yield dubbedMessage;
            }
          }
        })(),
      );

    /**
     * @param {object} partialMessage
     * @returns {import('./types.js').InternalMessage}
     */
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
     * @param {string} dest
     * @returns {Promise<string>}
     */
    const requestFormulaIdentifier = async (what, who, dest) => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<string>} */
      const { promise, resolve } = makePromiseKit();
      const settled = promise.then(
        () => 'fulfilled',
        () => 'rejected',
      );
      const message = deliver({
        type: /** @type {const} */ ('request'),
        who,
        dest,
        what,
        settled,
      });
      resolvers.set(message, resolve);
      return promise;
    };

    /** @type {import('./types.js').Mail['respond']} */
    const respond = async (
      what,
      responseName,
      senderFormulaIdentifier,
      senderPetStore,
      recipientFormulaIdentifier = selfFormulaIdentifier,
    ) => {
      if (responseName !== undefined) {
        /** @type {string | undefined} */
        let formulaIdentifier = senderPetStore.identifyLocal(responseName);
        if (formulaIdentifier === undefined) {
          formulaIdentifier = await requestFormulaIdentifier(
            what,
            senderFormulaIdentifier,
            recipientFormulaIdentifier,
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
        recipientFormulaIdentifier,
      );
      // TODO:
      // context.thisDiesIfThatDies(formulaIdentifier);
      // Behold, recursion:
      // eslint-disable-next-line no-use-before-define
      return provideValueForFormulaIdentifier(formulaIdentifier);
    };

    /** @type {import('./types.js').Mail['resolve']} */
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
      const formulaIdentifier = petStore.identifyLocal(resolutionName);
      if (formulaIdentifier === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionName)}`,
        );
      }
      resolveRequest(formulaIdentifier);
    };

    // TODO test reject
    /** @type {import('./types.js').Mail['reject']} */
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

    /** @type {import('./types.js').Mail['receive']} */
    const receive = (
      senderFormulaIdentifier,
      strings,
      edgeNames,
      formulaIdentifiers,
      receiverFormulaIdentifier = selfFormulaIdentifier,
    ) => {
      deliver({
        type: /** @type {const} */ ('package'),
        strings,
        names: edgeNames,
        formulas: formulaIdentifiers,
        who: senderFormulaIdentifier,
        dest: receiverFormulaIdentifier,
      });
    };

    /** @type {import('./types.js').Mail['send']} */
    const send = async (recipientName, strings, edgeNames, petNames) => {
      const recipientFormulaIdentifier = petStore.identifyLocal(recipientName);
      if (recipientFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name for party: ${recipientName}`);
      }
      const recipientController =
        await provideControllerForFormulaIdentifierAndResolveHandle(
          recipientFormulaIdentifier,
        );
      const recipientInternal = await recipientController.internal;
      if (recipientInternal === undefined || recipientInternal === null) {
        throw new Error(`Recipient cannot receive messages: ${recipientName}`);
      }
      // @ts-expect-error We check if its undefined immediately after
      const { receive: partyReceive } = recipientInternal;
      if (partyReceive === undefined) {
        throw new Error(`Recipient cannot receive messages: ${recipientName}`);
      }

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

      const formulaIdentifiers = petNames.map(petName => {
        const formulaIdentifier = petStore.identifyLocal(petName);
        if (formulaIdentifier === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        return formulaIdentifier;
      });
      // add to recipient mailbox
      partyReceive(
        selfFormulaIdentifier,
        strings,
        edgeNames,
        formulaIdentifiers,
      );
      // add to own mailbox
      receive(
        selfFormulaIdentifier,
        strings,
        edgeNames,
        formulaIdentifiers,
        // Sender expects the handle formula identifier.
        recipientFormulaIdentifier,
      );
    };

    /** @type {import('./types.js').Mail['dismiss']} */
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

    /** @type {import('./types.js').Mail['adopt']} */
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
      context.thisDiesIfThatDies(formulaIdentifier);
      await petStore.write(petName, formulaIdentifier);
    };

    /** @type {import('./types.js').Mail['request']} */
    const request = async (recipientName, what, responseName) => {
      const recipientFormulaIdentifier = petStore.identifyLocal(recipientName);
      if (recipientFormulaIdentifier === undefined) {
        throw new Error(`Unknown pet name for party: ${recipientName}`);
      }
      const recipientController =
        await provideControllerForFormulaIdentifierAndResolveHandle(
          recipientFormulaIdentifier,
        );
      const recipientInternal = await recipientController.internal;
      if (recipientInternal === undefined || recipientInternal === null) {
        throw new Error(
          `panic: a receive request function must exist for every party`,
        );
      }

      // @ts-expect-error We sufficiently check if recipientInternal or deliverToRecipient is undefined
      const { respond: deliverToRecipient } = recipientInternal;
      if (deliverToRecipient === undefined) {
        throw new Error(
          `panic: a receive request function must exist for every party`,
        );
      }

      if (responseName !== undefined) {
        const responseP = responses.get(responseName);
        if (responseP !== undefined) {
          return responseP;
        }
      }

      // Note: consider sending to each mailbox with different powers.
      // Behold, recursion:
      // eslint-disable-next-line
      const recipientResponseP = deliverToRecipient(
        what,
        responseName,
        selfFormulaIdentifier,
        petStore,
      );
      // Send to own inbox.
      const selfResponseP = respond(
        what,
        responseName,
        selfFormulaIdentifier,
        petStore,
        // Sender expects the handle formula identifier.
        recipientFormulaIdentifier,
      );
      const newResponseP = Promise.race([recipientResponseP, selfResponseP]);

      if (responseName !== undefined) {
        responses.set(responseName, newResponseP);
      }

      return newResponseP;
    };

    /** @type {import('./types.js').PetStore['rename']} */
    const rename = async (fromName, toName) => {
      await petStore.rename(fromName, toName);
      const formulaIdentifier = responses.get(fromName);
      if (formulaIdentifier !== undefined) {
        responses.set(toName, formulaIdentifier);
        responses.delete(fromName);
      }
    };

    /** @type {import('./types.js').PetStore['remove']} */
    const remove = async petName => {
      await petStore.remove(petName);
      responses.delete(petName);
    };

    const { has, list, identifyLocal, reverseIdentify } = petStore;

    return harden({
      // PetStore
      has,
      rename,
      remove,
      list,
      identifyLocal,
      reverseIdentify,
      // NameHub
      lookup,
      reverseLookup,
      // Mail
      listMessages,
      followMessages,
      request,
      respond,
      receive,
      send,
      resolve,
      reject,
      dismiss,
      adopt,
      // etc
      cancel,
    });
  };

  return makeMailbox;
};
