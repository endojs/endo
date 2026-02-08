// @ts-check

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { makeChangeTopic } from './pubsub.js';
import { assertEdgeName, namePathFrom } from './pet-name.js';
import { assertValidId } from './formula-identifier.js';
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
/** @import { DaemonCore, DefineRequest, DeferredTasks, Envelope, EnvelopedMessage, EvalRequest, FormRequest, FormulaIdentifier, Handle, Mail, MakeMailbox, MarshalDeferredTaskParams, MessageFormula, Name, NameOrPath, NamePath, PetName, Provide, Request, Responder, StampedMessage, Topic } from './types.js' */

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
 * @returns {MakeMailbox}
 */
export const makeMailboxMaker = ({
  provide,
  formulateMarshalValue,
  formulatePromise,
  formulateMessage,
  getFormulaForId,
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
     */
    const makeRequest = async (description, fromId, toId) => {
      const { promiseId, resolverId } = await formulatePromise();
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('request'),
        from: fromId,
        to: toId,
        description,
        promiseId,
        resolverId,
        settled,
      });
      return harden({ request, response: resolutionIdP });
    };

    /**
     * @param {string} source
     * @param {Array<Name>} codeNames
     * @param {Array<NamePath>} petNamePaths
     * @param {FormulaIdentifier} fromId
     * @param {FormulaIdentifier} toId
     */
    const makeEvalRequest = async (
      source,
      codeNames,
      petNamePaths,
      fromId,
      toId,
    ) => {
      const { promiseId, resolverId } = await formulatePromise();
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('eval-request'),
        from: fromId,
        to: toId,
        source,
        codeNames,
        petNamePaths,
        promiseId,
        resolverId,
        settled,
      });
      return harden({ request, response: resolutionIdP });
    };

    /**
     * @param {string} source
     * @param {Record<string, { label: string, pattern?: unknown }>} slots
     * @param {FormulaIdentifier} fromId
     * @param {FormulaIdentifier} toId
     */
    const makeDefineRequest = async (source, slots, fromId, toId) => {
      const { promiseId, resolverId } = await formulatePromise();
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('definition'),
        from: fromId,
        to: toId,
        source,
        slots,
        promiseId,
        resolverId,
        settled,
      });
      return harden({ request, response: resolutionIdP });
    };

    /**
     * @param {string} description
     * @param {Record<string, { label: string, pattern?: unknown }>} fields
     * @param {FormulaIdentifier} fromId
     * @param {FormulaIdentifier} toId
     */
    const makeFormRequest = async (description, fields, fromId, toId) => {
      const { promiseId, resolverId } = await formulatePromise();
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('form-request'),
        from: fromId,
        to: toId,
        description,
        fields,
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
      if (envelope.type === 'request') {
        return harden({
          type: 'message',
          messageType: envelope.type,
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
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          strings: envelope.strings,
          names: envelope.names,
          ids: /** @type {FormulaIdentifier[]} */ (envelope.ids),
        });
      }
      if (envelope.type === 'eval-request') {
        return harden({
          type: 'message',
          messageType: envelope.type,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          source: envelope.source,
          codeNames: envelope.codeNames,
          petNamePaths: envelope.petNamePaths,
          promiseId: /** @type {FormulaIdentifier} */ (envelope.promiseId),
          resolverId: /** @type {FormulaIdentifier} */ (envelope.resolverId),
        });
      }
      if (envelope.type === 'definition') {
        return harden({
          type: 'message',
          messageType: envelope.type,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          source: envelope.source,
          slots: envelope.slots,
          promiseId: /** @type {FormulaIdentifier} */ (envelope.promiseId),
          resolverId: /** @type {FormulaIdentifier} */ (envelope.resolverId),
        });
      }
      if (envelope.type === 'form-request') {
        return harden({
          type: 'message',
          messageType: envelope.type,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          description: envelope.description,
          fields: envelope.fields,
          promiseId: /** @type {FormulaIdentifier} */ (envelope.promiseId),
          resolverId: /** @type {FormulaIdentifier} */ (envelope.resolverId),
        });
      }
      throw new Error('Unknown message type');
    };

    /**
     * @param {EnvelopedMessage} envelope
     */
    const assertMessageEnvelope = envelope => {
      if (envelope.type === 'request') {
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
      if (envelope.type === 'eval-request') {
        if (typeof envelope.source !== 'string') {
          throw new Error('Invalid eval-request source');
        }
        return;
      }
      if (envelope.type === 'definition') {
        if (typeof envelope.source !== 'string') {
          throw new Error('Invalid definition source');
        }
        if (typeof envelope.slots !== 'object' || envelope.slots === null) {
          throw new Error('Invalid definition slots');
        }
        return;
      }
      if (envelope.type === 'form-request') {
        if (typeof envelope.description !== 'string') {
          throw new Error('Invalid form-request description');
        }
        if (typeof envelope.fields !== 'object' || envelope.fields === null) {
          throw new Error('Invalid form-request fields');
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
          number: messageNumber,
          date: formula.date,
          dismissed: dismissal.promise,
          dismisser,
        });
      }

      if (formula.messageType === 'eval-request') {
        if (
          formula.source === undefined ||
          formula.promiseId === undefined ||
          formula.resolverId === undefined
        ) {
          throw new Error('Eval-request message formula is incomplete');
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
          source: formula.source,
          codeNames: formula.codeNames,
          petNamePaths: formula.petNamePaths,
          promiseId: formula.promiseId,
          resolverId: formula.resolverId,
          settled,
          number: messageNumber,
          date: formula.date,
          dismissed: dismissal.promise,
          dismisser,
        });
      }

      if (formula.messageType === 'definition') {
        if (
          formula.source === undefined ||
          formula.slots === undefined ||
          formula.promiseId === undefined ||
          formula.resolverId === undefined
        ) {
          throw new Error('Definition message formula is incomplete');
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
          source: formula.source,
          slots: formula.slots,
          promiseId: formula.promiseId,
          resolverId: formula.resolverId,
          settled,
          number: messageNumber,
          date: formula.date,
          dismissed: dismissal.promise,
          dismisser,
        });
      }

      if (formula.messageType === 'form-request') {
        if (
          formula.description === undefined ||
          formula.fields === undefined ||
          formula.promiseId === undefined ||
          formula.resolverId === undefined
        ) {
          throw new Error('Form-request message formula is incomplete');
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
          fields: formula.fields,
          promiseId: formula.promiseId,
          resolverId: formula.resolverId,
          settled,
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
        throw new Error(`Unknown recipient ${q(toName)}`);
      }
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
        from: selfId,
        to: /** @type {FormulaIdentifier} */ (toId),
      });

      // add to recipient mailbox
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
    const request = async (toNameOrPath, description, responseNameOrPath) => {
      await null;
      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        const responseId = await E(directory).identify(...responseNamePath);
        if (responseId !== undefined) {
          context.thisDiesIfThatDies(responseId);
          return provide(/** @type {FormulaIdentifier} */ (responseId));
        }
      }

      const toNamePath = namePathFrom(toNameOrPath);
      const toId = await E(directory).identify(...toNamePath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${q(toNameOrPath)}`);
      }
      assertValidId(toId);
      const to = await provide(
        /** @type {FormulaIdentifier} */ (toId),
        'handle',
      );

      const { request: req, response: resolutionIdP } = await makeRequest(
        description,
        selfId,
        /** @type {FormulaIdentifier} */ (toId),
      );

      // Note: consider sending to each mailbox with different powers.
      await post(to, req);

      const resolutionId = /** @type {FormulaIdentifier} */ (
        await resolutionIdP
      );
      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      const responseP = provide(resolutionId);

      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        await E(directory).write(responseNamePath, resolutionId);
      }

      return responseP;
    };

    /** @type {Mail['requestEvaluation']} */
    const requestEvaluation = async (
      toNameOrPath,
      source,
      codeNames,
      petNamesOrPaths,
      responseNameOrPath,
    ) => {
      await null;
      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        const responseId = await E(directory).identify(...responseNamePath);
        if (responseId !== undefined) {
          context.thisDiesIfThatDies(responseId);
          return provide(/** @type {FormulaIdentifier} */ (responseId));
        }
      }

      const normalizedPaths = petNamesOrPaths.map(namePathFrom);
      if (codeNames.length !== normalizedPaths.length) {
        throw new Error(
          `Eval request must have one pet name path for each code name`,
        );
      }

      const toNamePath = namePathFrom(toNameOrPath);
      const toId = await E(directory).identify(...toNamePath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${q(toNameOrPath)}`);
      }
      const to = await provide(
        /** @type {FormulaIdentifier} */ (toId),
        'handle',
      );

      const { request: req, response: resolutionIdP } = await makeEvalRequest(
        source,
        codeNames,
        normalizedPaths,
        selfId,
        /** @type {FormulaIdentifier} */ (toId),
      );

      await post(to, req);

      const resolutionId = /** @type {FormulaIdentifier} */ (
        await resolutionIdP
      );
      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      const responseP = provide(resolutionId);

      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        await E(directory).write(responseNamePath, resolutionId);
      }

      return responseP;
    };

    /** @type {Mail['getEvalRequest']} */
    const getEvalRequest = messageNumber => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'eval-request') {
        throw new Error(
          `Message ${q(messageNumber)} is not an eval-request (is ${q(message.type)})`,
        );
      }
      const evalReq =
        /** @type {EvalRequest & { from: FormulaIdentifier, resolverId: FormulaIdentifier }} */ (
          message
        );
      return harden({
        source: evalReq.source,
        codeNames: evalReq.codeNames,
        petNamePaths: evalReq.petNamePaths,
        resolverId: evalReq.resolverId,
        guestHandleId: evalReq.from,
      });
    };

    /** @type {Mail['define']} */
    const define = async (source, slots) => {
      await null;
      const hostHandleId = petStore.identifyLocal(/** @type {Name} */ ('HOST'));
      if (hostHandleId === undefined) {
        throw new Error('No HOST found in namespace');
      }
      const hostHandle = await provide(
        /** @type {FormulaIdentifier} */ (hostHandleId),
        'handle',
      );

      const { request: req, response: resolutionIdP } = await makeDefineRequest(
        source,
        slots,
        selfId,
        /** @type {FormulaIdentifier} */ (hostHandleId),
      );

      await post(hostHandle, req);

      const resolutionId = /** @type {FormulaIdentifier} */ (
        await resolutionIdP
      );
      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      return provide(resolutionId);
    };

    /** @type {Mail['form']} */
    const form = async (
      toNameOrPath,
      description,
      fields,
      responseNameOrPath,
    ) => {
      await null;
      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        const responseId = await E(directory).identify(...responseNamePath);
        if (responseId !== undefined) {
          context.thisDiesIfThatDies(responseId);
          return provide(/** @type {FormulaIdentifier} */ (responseId));
        }
      }

      const toNamePath = namePathFrom(toNameOrPath);
      const toId = await E(directory).identify(...toNamePath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${q(toNameOrPath)}`);
      }
      assertValidId(toId);
      const to = await provide(
        /** @type {FormulaIdentifier} */ (toId),
        'handle',
      );

      const { request: req, response: resolutionIdP } = await makeFormRequest(
        description,
        fields,
        selfId,
        /** @type {FormulaIdentifier} */ (toId),
      );

      await post(to, req);

      const resolutionId = /** @type {FormulaIdentifier} */ (
        await resolutionIdP
      );
      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      const responseP = provide(resolutionId);

      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        await E(directory).write(responseNamePath, resolutionId);
      }

      return responseP;
    };

    /** @type {Mail['getDefineRequest']} */
    const getDefineRequest = messageNumber => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'definition') {
        throw new Error(
          `Message ${q(messageNumber)} is not a definition (is ${q(message.type)})`,
        );
      }
      const defReq =
        /** @type {DefineRequest & { from: FormulaIdentifier, resolverId: FormulaIdentifier }} */ (
          message
        );
      return harden({
        source: defReq.source,
        slots: defReq.slots,
        resolverId: defReq.resolverId,
        guestHandleId: defReq.from,
      });
    };

    /** @type {Mail['getFormRequest']} */
    const getFormRequest = messageNumber => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'form-request') {
        throw new Error(
          `Message ${q(messageNumber)} is not a form-request (is ${q(message.type)})`,
        );
      }
      const formReq =
        /** @type {FormRequest & { from: FormulaIdentifier, resolverId: FormulaIdentifier }} */ (
          message
        );
      return harden({
        description: formReq.description,
        fields: formReq.fields,
        resolverId: formReq.resolverId,
        guestHandleId: formReq.from,
      });
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
      requestEvaluation,
      getEvalRequest,
      define,
      form,
      getDefineRequest,
      getFormRequest,
      resolve,
      reject,
      dismiss,
      adopt,
    });
  };

  return makeMailbox;
};
