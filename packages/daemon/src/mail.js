// @ts-check

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { makeChangeTopic } from './pubsub.js';
import { assertFormulaNumber, assertValidId } from './formula-identifier.js';
import {
  assertPetNames,
  assertName,
  assertNames,
  assertPetNamePath,
} from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { makeSerialJobs } from './serial-jobs.js';

import {
  EnvelopeInterface,
  DismisserInterface,
  HandleInterface,
} from './interfaces.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { DaemonCore, DeferredTasks, Envelope, EnvelopedMessage, FormulaIdentifier, Handle, Mail, MakeMailbox, MarshalDeferredTaskParams, MessageFormula, Name, NameOrPath, PetName, Provide, Request, Responder, StampedMessage, Topic } from './types.js' */

/** @type {PetName} */
const NEXT_MESSAGE_NUMBER_NAME = /** @type {PetName} */ ('next-number');
const messageNumberNamePattern = /^(0|[1-9][0-9]*)$/;

/**
 * @param {string} name
 */
export const assertMailboxStoreName = name => {
  if (name === NEXT_MESSAGE_NUMBER_NAME) {
    return;
  }
  if (!messageNumberNamePattern.test(name)) {
    throw new Error(`Invalid mailbox store name ${q(name)}`);
  }
};

/**
 * @param {string} name
 */
const parseMessageNumberName = name => {
  if (!messageNumberNamePattern.test(name)) {
    return undefined;
  }
  try {
    const number = BigInt(name);
    return number >= 0n ? number : undefined;
  } catch {
    return undefined;
  }
};

/**
 * @param {unknown} value
 * @returns {bigint | undefined}
 */
const coerceMessageNumber = value => {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : undefined;
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0
      ? BigInt(value)
      : undefined;
  }
  return undefined;
};

const MESSAGE_SPECIAL_NAMES = new Set([
  'FROM',
  'TO',
  'DATE',
  'TYPE',
  'MESSAGE',
  'REPLY',
  'DESCRIPTION',
  'STRINGS',
  'PROMISE',
  'RESOLVER',
]);

/**
 * @param {Name[]} edgeNames
 */
const assertUniqueEdgeNames = edgeNames => {
  const seen = new Set();
  for (const edgeName of edgeNames) {
    if (MESSAGE_SPECIAL_NAMES.has(edgeName)) {
      throw new Error(`Message name ${q(edgeName)} is reserved`);
    }
    if (seen.has(edgeName)) {
      throw new Error(`Message name ${q(edgeName)} is duplicated`);
    }
    seen.add(edgeName);
  }
};

const makeEnvelope = () => makeExo('Envelope', EnvelopeInterface, {});

/**
 * @param {object} args
 * @param {Provide} args.provide
 * @param {DaemonCore['formulateMarshalValue']} args.formulateMarshalValue
 * @param {DaemonCore['formulatePromise']} args.formulatePromise
 * @param {DaemonCore['formulateMessage']} args.formulateMessage
 * @param {DaemonCore['getFormulaForId']} args.getFormulaForId
 * @param {() => Promise<string>} args.randomHex512
 * @param {DaemonCore['pinTransient']} [args.pinTransient]
 * @param {DaemonCore['unpinTransient']} [args.unpinTransient]
 * @returns {MakeMailbox}
 */
export const makeMailboxMaker = ({
  provide,
  formulateMarshalValue,
  formulatePromise,
  formulateMessage,
  getFormulaForId,
  randomHex512,
  pinTransient = () => {},
  unpinTransient = () => {},
}) => {
  /**
    @type {MakeMailbox} */
  const makeMailbox = async ({
    selfId,
    petStore,
    mailboxStore,
    directory,
    context,
  }) => {
    /** @type {Map<bigint, StampedMessage>} */
    const messages = new Map();

    /** @type {WeakMap<{}, EnvelopedMessage>} */
    const outbox = new WeakMap();

    /** @type {Topic<StampedMessage>} */
    const messagesTopic = makeChangeTopic();
    const mailboxStoreJobs = makeSerialJobs();
    let nextMessageNumber = 0n;

    /** @type {Mail['listMessages']} */
    const listMessages = async () => harden(Array.from(messages.values()));

    /** @type {Mail['followMessages']} */
    const followMessages = async function* currentAndSubsequentMessages() {
      const subsequentRequests = messagesTopic.subscribe();
      yield* messages.values();
      yield* subsequentRequests;
    };

    /**
     * @param {string} description
     * @param {FormulaIdentifier} fromId
     * @param {FormulaIdentifier} toId
     * @param {import('./types.js').FormulaNumber} messageId
     */
    const makeRequest = async (description, fromId, toId, messageId) => {
      const { promiseId, resolverId } = await formulatePromise(pinTransient);
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('request'),
        from: fromId,
        to: toId,
        messageId,
        description,
        promiseId,
        resolverId,
        settled,
      });
      return harden({ request, response: resolutionIdP });
    };

    /**
     * @param {EnvelopedMessage} envelope
     * @param {string} date
     * @returns {MessageFormula}
     */
    const makeMessageFormula = (envelope, date) => {
      const { messageId, replyTo } = envelope;
      const replyToRecord = replyTo === undefined ? {} : { replyTo };
      if (envelope.type === 'request') {
        return harden({
          type: 'message',
          messageType: envelope.type,
          messageId,
          ...replyToRecord,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          description: envelope.description,
          promiseId: /** @type {FormulaIdentifier} */ (envelope.promiseId),
          resolverId: /** @type {FormulaIdentifier} */ (envelope.resolverId),
        });
      }
      if (envelope.type === 'package') {
        return harden({
          type: 'message',
          messageType: envelope.type,
          messageId,
          ...replyToRecord,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          strings: envelope.strings,
          names: envelope.names,
          ids: /** @type {FormulaIdentifier[]} */ (envelope.ids),
        });
      }
      throw new Error('Unknown message type');
    };

    /**
     * @param {EnvelopedMessage} envelope
     */
    const assertMessageEnvelope = envelope => {
      if (typeof envelope.messageId !== 'string') {
        throw new Error('Invalid messageId');
      }
      assertFormulaNumber(envelope.messageId);
      if (
        envelope.replyTo !== undefined &&
        typeof envelope.replyTo !== 'string'
      ) {
        throw new Error('Invalid replyTo');
      }
      if (envelope.replyTo !== undefined) {
        assertFormulaNumber(envelope.replyTo);
      }
      if (envelope.type === 'request') {
        if (envelope.replyTo !== undefined) {
          throw new Error('Request messages cannot have replyTo');
        }
        if (typeof envelope.description !== 'string') {
          throw new Error('Invalid request description');
        }
        return;
      }
      if (envelope.type === 'package') {
        assertNames(envelope.names);
        assertUniqueEdgeNames(envelope.names);
        if (envelope.names.length !== envelope.ids.length) {
          throw new Error(
            `Message must have one formula identifier (${q(
              envelope.ids.length,
            )}) for every edge name (${q(envelope.names.length)})`,
          );
        }
        if (envelope.strings.length < envelope.names.length) {
          throw new Error(
            `Message must have one string before every value delivered`,
          );
        }
        return;
      }
      throw new Error('Unknown message type');
    };

    /**
     * @param {bigint} messageNumber
     * @param {PromiseKit<void>} dismissal
     */
    const makeDismisser = (messageNumber, dismissal) =>
      makeExo('Dismisser', DismisserInterface, {
        async dismiss() {
          await mailboxStoreJobs.enqueue(async () => {
            const messageNumberName = /** @type {PetName} */ (
              String(messageNumber)
            );
            await mailboxStore.remove(messageNumberName);
            messages.delete(messageNumber);
            dismissal.resolve();
          });
        },
      });

    /**
     * @param {bigint} messageNumber
     * @param {MessageFormula} formula
     * @returns {StampedMessage}
     */
    const makeStampedMessage = (messageNumber, formula) => {
      if (typeof formula.messageId !== 'string') {
        throw new Error('Message formula is missing messageId');
      }
      assertFormulaNumber(formula.messageId);
      if (formula.replyTo !== undefined) {
        assertFormulaNumber(formula.replyTo);
      }
      /** @type {PromiseKit<void>} */
      const dismissal = makePromiseKit();
      const dismisser = makeDismisser(messageNumber, dismissal);

      if (formula.messageType === 'request') {
        if (
          formula.description === undefined ||
          formula.promiseId === undefined ||
          formula.resolverId === undefined
        ) {
          throw new Error('Request message formula is incomplete');
        }
        const resolutionIdP = provide(formula.promiseId);
        /** @type {Promise<'fulfilled' | 'rejected'>} */
        const settled = resolutionIdP.then(
          () => /** @type {const} */ ('fulfilled'),
          () => /** @type {const} */ ('rejected'),
        );
        return harden({
          type: formula.messageType,
          from: formula.from,
          to: formula.to,
          description: formula.description,
          promiseId: formula.promiseId,
          resolverId: formula.resolverId,
          settled,
          messageId: formula.messageId,
          replyTo: formula.replyTo,
          number: messageNumber,
          date: formula.date,
          dismissed: dismissal.promise,
          dismisser,
        });
      }

      if (formula.messageType === 'package') {
        if (
          formula.strings === undefined ||
          formula.names === undefined ||
          formula.ids === undefined
        ) {
          throw new Error('Package message formula is incomplete');
        }
        assertNames(formula.names);
        assertUniqueEdgeNames(formula.names);
        if (formula.names.length !== formula.ids.length) {
          throw new Error(
            `Message must have one formula identifier (${q(
              formula.ids.length,
            )}) for every edge name (${q(formula.names.length)})`,
          );
        }
        return harden({
          type: formula.messageType,
          from: formula.from,
          to: formula.to,
          strings: formula.strings,
          names: formula.names,
          ids: formula.ids,
          messageId: formula.messageId,
          replyTo: formula.replyTo,
          number: messageNumber,
          date: formula.date,
          dismissed: dismissal.promise,
          dismisser,
        });
      }

      throw new Error('Unknown message formula type');
    };

    /**
     * @param {bigint} messageNumber
     * @param {MessageFormula} formula
     */
    const persistMessage = async (messageNumber, formula) => {
      const messageNumberName = /** @type {PetName} */ (String(messageNumber));
      const { id } = await formulateMessage(formula);
      await mailboxStore.write(messageNumberName, id);
    };

    /** @param {bigint} messageNumber */
    const persistNextMessageNumber = async messageNumber => {
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      const { id } = await formulateMarshalValue(messageNumber, tasks);
      await mailboxStore.write(NEXT_MESSAGE_NUMBER_NAME, id);
    };

    const loadMailboxState = async () => {
      await null;
      /** @type {bigint | undefined} */
      let storedNextNumber;
      const nextNumberId = mailboxStore.identifyLocal(NEXT_MESSAGE_NUMBER_NAME);
      if (nextNumberId !== undefined) {
        try {
          const value = await provide(
            /** @type {FormulaIdentifier} */ (nextNumberId),
          );
          storedNextNumber = coerceMessageNumber(value);
        } catch {
          // Ignore and fall back to scanning message slots.
        }
      }

      const messageNumbers = mailboxStore
        .list()
        .map(parseMessageNumberName)
        .filter(number => number !== undefined)
        .sort((a, b) => {
          if (a === b) {
            return 0;
          }
          return a < b ? -1 : 1;
        });

      const maxNumber =
        messageNumbers.length === 0
          ? -1n
          : messageNumbers[messageNumbers.length - 1];
      const maxNextNumber = maxNumber + 1n;
      let computedNextNumber = storedNextNumber ?? 0n;
      if (maxNextNumber > computedNextNumber) {
        computedNextNumber = maxNextNumber;
      }
      nextMessageNumber = computedNextNumber;

      const messageRecords = await Promise.allSettled(
        messageNumbers.map(async messageNumber => {
          const messageNumberName = /** @type {PetName} */ (
            String(messageNumber)
          );
          const messageId = mailboxStore.identifyLocal(messageNumberName);
          if (messageId === undefined) {
            return undefined;
          }
          assertValidId(messageId);
          const formula = await getFormulaForId(messageId);
          if (formula.type !== 'message') {
            throw new Error(
              `Mailbox entry ${q(
                String(messageNumber),
              )} is not a message formula`,
            );
          }
          return { messageNumber, formula };
        }),
      );

      messageRecords.forEach(entry => {
        if (entry.status === 'fulfilled' && entry.value !== undefined) {
          const { messageNumber, formula } = entry.value;
          const message = makeStampedMessage(messageNumber, formula);
          messages.set(messageNumber, message);
        }
      });

      if (
        storedNextNumber === undefined ||
        storedNextNumber !== computedNextNumber
      ) {
        await mailboxStoreJobs.enqueue(async () => {
          await persistNextMessageNumber(computedNextNumber);
        });
      }
    };

    /**
     * @param {unknown} messageNumber
     * @param {string} label
     */
    const mustParseBigint = (messageNumber, label) => {
      const normalized = coerceMessageNumber(messageNumber);
      if (normalized === undefined) {
        throw new Error(`Invalid ${label} number ${q(messageNumber)}`);
      }
      return normalized;
    };

    /**
     * @param {EnvelopedMessage} envelope
     */
    const deliver = async envelope => {
      await mailboxStoreJobs.enqueue(async () => {
        assertMessageEnvelope(envelope);
        const messageNumber = nextMessageNumber;
        const date = new Date().toISOString();
        const formula = makeMessageFormula(envelope, date);
        await persistMessage(messageNumber, formula);

        nextMessageNumber += 1n;
        await persistNextMessageNumber(nextMessageNumber);

        /** @type {PromiseKit<void>} */
        const dismissal = makePromiseKit();
        const dismisser = makeDismisser(messageNumber, dismissal);

        const message = harden({
          ...envelope,
          number: messageNumber,
          date,
          dismissed: dismissal.promise,
          dismisser,
        });

        messages.set(messageNumber, message);
        messagesTopic.publisher.next(message);
      });
    };

    /**
     * @param {Handle} recipient
     * @param {EnvelopedMessage} message
     */
    const post = async (recipient, message) => {
      /** @param {object} allegedRecipient */
      const envelope = makeEnvelope();
      outbox.set(envelope, message);
      await E(recipient).receive(envelope, selfId);
      // Send to own inbox.
      if (message.from !== message.to) {
        await deliver(message);
      }
    };

    /** @type {Mail['resolve']} */
    const resolve = async (messageNumber, resolutionName) => {
      assertName(resolutionName);
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'request');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`Invalid request, ${q(messageNumber)}`);
      }
      const id = petStore.identifyLocal(resolutionName);
      if (id === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionName)}`,
        );
      }
      // TODO validate shape of request
      const req = /** @type {Request} */ (message);
      const resolver = /** @type {ERef<Responder>} */ (
        provide(req.resolverId, 'resolver')
      );
      E.sendOnly(resolver).resolveWithId(id);
    };

    // TODO test reject
    /** @type {Mail['reject']} */
    const reject = async (messageNumber, reason = 'Declined') => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'request');
      const message = messages.get(normalizedMessageNumber);
      if (message !== undefined) {
        // TODO verify that the message is a request.
        const req = /** @type {Request} */ (message);
        const resolver = /** @type {ERef<Responder>} */ (
          provide(req.resolverId, 'resolver')
        );
        E.sendOnly(resolver).resolveWithId(
          harden(Promise.reject(harden(new Error(reason)))),
        );
      }
    };

    /** @type {Mail['send']} */
    const send = async (toName, strings, edgeNames, petNames) => {
      assertName(toName);
      assertNames(edgeNames);
      assertUniqueEdgeNames(edgeNames);
      assertPetNames(petNames);
      const toId = petStore.identifyLocal(toName);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toName}`);
      }
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex512()
      );
      const to = await provide(
        /** @type {FormulaIdentifier} */ (toId),
        'handle',
      );

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

      const ids = petNames.map(petName => {
        const id = petStore.identifyLocal(petName);
        if (id === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        assertValidId(id);
        return /** @type {FormulaIdentifier} */ (id);
      });

      const message = harden({
        type: /** @type {const} */ ('package'),
        strings,
        names: edgeNames,
        ids,
        messageId,
        from: selfId,
        to: /** @type {FormulaIdentifier} */ (toId),
      });

      // add to recipient mailbox
      await post(to, message);
    };

    /** @type {Mail['reply']} */
    const reply = async (messageNumber, strings, edgeNames, petNames) => {
      assertNames(edgeNames);
      assertUniqueEdgeNames(edgeNames);
      assertPetNames(petNames);
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const parent = messages.get(normalizedMessageNumber);
      if (parent === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (typeof parent.messageId !== 'string') {
        throw new Error(`Message ${q(messageNumber)} has no messageId`);
      }
      const otherId = parent.from === selfId ? parent.to : parent.from;
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex512()
      );
      const to = await provide(
        /** @type {FormulaIdentifier} */ (otherId),
        'handle',
      );

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

      const ids = petNames.map(petName => {
        const id = petStore.identifyLocal(petName);
        if (id === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        assertValidId(id);
        return /** @type {FormulaIdentifier} */ (id);
      });

      const message = harden({
        type: /** @type {const} */ ('package'),
        strings,
        names: edgeNames,
        ids,
        messageId,
        replyTo: parent.messageId,
        from: selfId,
        to: /** @type {FormulaIdentifier} */ (otherId),
      });

      await post(to, message);
    };

    /** @type {Mail['dismiss']} */
    const dismiss = async messageNumber => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'request');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`Invalid request number ${messageNumber}`);
      }
      const { dismisser } = E.get(message);
      return E(dismisser).dismiss();
    };

    /** @type {Mail['adopt']} */
    const adopt = async (messageNumber, edgeName, petNamePath) => {
      assertName(edgeName);
      assertPetNamePath(petNamePath);
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const message = messages.get(normalizedMessageNumber);
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
      const id = message.ids[index];
      if (id === undefined) {
        throw new Error(
          `panic: message must contain a formula for every name, including the name ${q(
            edgeName,
          )} at ${q(index)}`,
        );
      }
      context.thisDiesIfThatDies(id);
      await E(directory).write(petNamePath, id);
    };

    /** @type {Mail['request']} */
    const request = async (toName, description, responseName) => {
      assertName(toName);
      if (responseName !== undefined) {
        assertName(responseName);
      }
      await null;
      if (responseName !== undefined) {
        const resolutionId = await E(directory).identify(responseName);
        if (resolutionId !== undefined) {
          context.thisDiesIfThatDies(resolutionId);
          return provide(/** @type {FormulaIdentifier} */ (resolutionId));
        }
      }

      const toId = petStore.identifyLocal(toName);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toName}`);
      }
      assertValidId(toId);
      const to = await provide(
        /** @type {FormulaIdentifier} */ (toId),
        'handle',
      );
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex512()
      );

      const { request: req, response: resolutionIdP } = await makeRequest(
        description,
        selfId,
        /** @type {FormulaIdentifier} */ (toId),
        messageId,
      );

      // Note: consider sending to each mailbox with different powers.
      try {
        await post(to, req);
      } finally {
        unpinTransient(req.promiseId);
        unpinTransient(req.resolverId);
      }

      const resolutionId = /** @type {FormulaIdentifier} */ (
        await resolutionIdP
      );
      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      const responseP = provide(resolutionId);

      if (responseName !== undefined) {
        await E(directory).write(responseName, resolutionId);
      }

      return responseP;
    };

    /**
     * @param {Envelope} envelope
     */
    const open = envelope => {
      const message = outbox.get(envelope);
      if (message === undefined) {
        throw new Error('Mail fraud: unrecognized parcel');
      }
      return message;
    };

    // When receiving an envelope, we can assume we are the intended recipient
    // but we cannot assume the alleged sender.
    /**
     * @param {ERef<Envelope>} envelope
     * @param {string} allegedFromId
     */
    const receive = async (envelope, allegedFromId) => {
      assertValidId(allegedFromId);
      const senderId = allegedFromId;
      const sender = provide(senderId, 'handle');
      const message = await E(sender).open(envelope);
      if (senderId !== message.from) {
        throw new Error('Mail fraud: alleged sender does not recognize parcel');
      }
      await deliver(message);
    };

    const handle = makeExo('Handle', HandleInterface, {
      receive,
      open,
    });

    await loadMailboxState();

    return harden({
      handle: () => handle,
      deliver,
      petStore,
      listMessages,
      followMessages,
      request,
      send,
      reply,
      resolve,
      reject,
      dismiss,
      adopt,
    });
  };

  return makeMailbox;
};
