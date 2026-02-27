// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { makeChangeTopic } from './pubsub.js';
import { assertFormulaNumber, assertValidId } from './formula-identifier.js';
import {
  assertName,
  assertNames,
  assertPetNamePath,
  namePathFrom,
} from './pet-name.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { makeSerialJobs } from './serial-jobs.js';

import {
  EnvelopeInterface,
  DismisserInterface,
  HandleInterface,
  ResponderInterface,
} from './interfaces.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { DaemonCore, DeferredTasks, DefineRequest, Envelope, EnvelopedMessage, EvalProposalProposer, EvalProposalReviewer, EvalRequest, FormulaIdentifier, FormRequest, Handle, Mail, MakeMailbox, MarshalDeferredTaskParams, MessageFormula, Name, NameHub, NameOrPath, NamePath, PetName, Provide, Request, Responder, StampedMessage, Topic } from './types.js' */

/** @type {PetName} */
const NEXT_MESSAGE_NUMBER_NAME = /** @type {PetName} */ ('next-number');
const messageNumberNamePattern = /^(0|[1-9][0-9]*)$/;

/**
 * Map a responder resolution to settled state, including Promise rejection payloads.
 * @param {Promise<string | Promise<string>>} responseIdP
 */
const mapSettled = responseIdP =>
  responseIdP.then(
    id =>
      id && typeof id === 'object'
        ? /** @type {Promise<string>} */ (id).then(
            () => /** @type {const} */ ('fulfilled'),
            () => /** @type {const} */ ('rejected'),
          )
        : /** @type {const} */ ('fulfilled'),
    () => /** @type {const} */ ('rejected'),
  );

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
 * @param {() => Promise<string>} args.randomHex256
 * @param {DaemonCore['pinTransient']} [args.pinTransient]
 * @param {DaemonCore['unpinTransient']} [args.unpinTransient]
 * @param args.getTypeForId
 * @returns {MakeMailbox}
 */
export const makeMailboxMaker = ({
  provide,
  formulateMarshalValue,
  formulatePromise,
  formulateMessage,
  getFormulaForId,
  getTypeForId,
  randomHex256,
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
     * @param {string} source
     * @param {Array<string>} codeNames
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
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex256()
      );
      const { promiseId, resolverId } = await formulatePromise(pinTransient);
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('eval-request'),
        from: fromId,
        to: toId,
        messageId,
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
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex256()
      );
      const { promiseId, resolverId } = await formulatePromise(pinTransient);
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('definition'),
        from: fromId,
        to: toId,
        messageId,
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
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex256()
      );
      const { promiseId, resolverId } = await formulatePromise(pinTransient);
      const resolutionIdP = provide(promiseId);
      const settled = resolutionIdP.then(
        () => /** @type {const} */ ('fulfilled'),
        () => /** @type {const} */ ('rejected'),
      );
      const request = harden({
        type: /** @type {const} */ ('form-request'),
        from: fromId,
        to: toId,
        messageId,
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
      if (envelope.type === 'eval-request') {
        return harden({
          type: 'message',
          messageType: envelope.type,
          messageId,
          ...replyToRecord,
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
          messageId,
          ...replyToRecord,
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
          messageId,
          ...replyToRecord,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          description: envelope.description,
          fields: envelope.fields,
          promiseId: /** @type {FormulaIdentifier} */ (envelope.promiseId),
          resolverId: /** @type {FormulaIdentifier} */ (envelope.resolverId),
        });
      }
      if (
        envelope.type === 'eval-proposal-reviewer' ||
        envelope.type === 'eval-proposal-proposer'
      ) {
        return /** @type {MessageFormula} */ (
          /** @type {unknown} */ (
            harden({
              type: 'message',
              messageType: envelope.type,
              messageId,
              ...replyToRecord,
              from: /** @type {FormulaIdentifier} */ (envelope.from),
              to: /** @type {FormulaIdentifier} */ (envelope.to),
              date,
              source: envelope.source,
              codeNames: envelope.codeNames,
              petNamePaths: envelope.petNamePaths,
              edgeNames: envelope.edgeNames,
              ids: envelope.ids,
              workerName: envelope.workerName,
            })
          )
        );
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
      if (envelope.type === 'eval-request') {
        if (typeof envelope.source !== 'string') {
          throw new Error('Invalid eval-request source');
        }
        if (!Array.isArray(envelope.codeNames)) {
          throw new Error('Invalid eval-request codeNames');
        }
        if (!Array.isArray(envelope.petNamePaths)) {
          throw new Error('Invalid eval-request petNamePaths');
        }
        if (envelope.codeNames.length !== envelope.petNamePaths.length) {
          throw new Error(
            `Eval request must have one pet name path for each code name`,
          );
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
      if (
        envelope.type === 'eval-proposal-reviewer' ||
        envelope.type === 'eval-proposal-proposer'
      ) {
        if (typeof envelope.source !== 'string') {
          throw new Error('Invalid eval-proposal source');
        }
        if (!Array.isArray(envelope.codeNames)) {
          throw new Error('Invalid eval-proposal codeNames');
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
          return undefined;
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
          codeNames: /** @type {string[]} */ (formula.codeNames),
          petNamePaths: /** @type {NamePath[]} */ (formula.petNamePaths),
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
          messageId: formula.messageId,
          replyTo: formula.replyTo,
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
      const { id } = await formulateMessage(formula, pinTransient);
      try {
        await mailboxStore.write(messageNumberName, id);
      } finally {
        unpinTransient(id);
      }
    };

    /** @param {bigint} messageNumber */
    const persistNextMessageNumber = async messageNumber => {
      /** @type {DeferredTasks<MarshalDeferredTaskParams>} */
      const tasks = makeDeferredTasks();
      const { id } = await formulateMarshalValue(
        messageNumber,
        tasks,
        pinTransient,
      );
      try {
        await mailboxStore.write(NEXT_MESSAGE_NUMBER_NAME, id);
      } finally {
        unpinTransient(id);
      }
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
     * Resolve a formula identifier to its handle.
     * If the id points to an agent (host or guest formula), follows the
     * formula's handle field to provide the actual handle.
     * If it already points to a handle formula, provides it directly.
     *
     * @param {FormulaIdentifier} id
     * @returns {Promise<Handle>}
     */
    const provideHandle = async id => {
      const type = await getTypeForId(id);
      if (type === 'host' || type === 'guest') {
        const formula = await getFormulaForId(id);
        const hostOrGuestFormula =
          /** @type {import('./types.js').HostFormula | import('./types.js').GuestFormula} */ (
            formula
          );
        return provide(
          /** @type {FormulaIdentifier} */ (hostOrGuestFormula.handle),
          'handle',
        );
      }
      return provide(id, 'handle');
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
    const resolve = async (messageNumber, resolutionNameOrPath) => {
      const resolutionPath = namePathFrom(resolutionNameOrPath);
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'request');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`Invalid request, ${q(messageNumber)}`);
      }
      const id = await E(directory).identify(...resolutionPath);
      if (id === undefined) {
        throw new TypeError(
          `No formula exists for the pet name ${q(resolutionNameOrPath)}`,
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
    const send = async (toNameOrPath, strings, edgeNames, petNamesOrPaths) => {
      const toPath = namePathFrom(toNameOrPath);
      assertNames(edgeNames);
      assertUniqueEdgeNames(edgeNames);
      const toId = await E(directory).identify(...toPath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${q(toNameOrPath)}`);
      }
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex256()
      );
      const to = await provideHandle(/** @type {FormulaIdentifier} */ (toId));

      if (petNamesOrPaths.length !== edgeNames.length) {
        throw new Error(
          `Message must have one edge name (${q(
            edgeNames.length,
          )}) for every pet name (${q(petNamesOrPaths.length)})`,
        );
      }
      if (strings.length < petNamesOrPaths.length) {
        throw new Error(
          `Message must have one string before every value delivered`,
        );
      }

      const ids = await Promise.all(
        petNamesOrPaths.map(async petNameOrPath => {
          const petPath = namePathFrom(petNameOrPath);
          const id = await E(directory).identify(...petPath);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNameOrPath)}`);
          }
          assertValidId(id);
          return /** @type {FormulaIdentifier} */ (id);
        }),
      );

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
    const reply = async (
      messageNumber,
      strings,
      edgeNames,
      petNamesOrPaths,
    ) => {
      assertNames(edgeNames);
      assertUniqueEdgeNames(edgeNames);
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
        await randomHex256()
      );
      const to = await provideHandle(
        /** @type {FormulaIdentifier} */ (otherId),
      );

      if (petNamesOrPaths.length !== edgeNames.length) {
        throw new Error(
          `Message must have one edge name (${q(
            edgeNames.length,
          )}) for every pet name (${q(petNamesOrPaths.length)})`,
        );
      }
      if (strings.length < petNamesOrPaths.length) {
        throw new Error(
          `Message must have one string before every value delivered`,
        );
      }

      const ids = await Promise.all(
        petNamesOrPaths.map(async petNameOrPath => {
          const petPath = namePathFrom(petNameOrPath);
          const id = await E(directory).identify(...petPath);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNameOrPath)}`);
          }
          assertValidId(id);
          return /** @type {FormulaIdentifier} */ (id);
        }),
      );

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

    /** @type {Mail['dismissAll']} */
    const dismissAll = async () => {
      const toDismiss = Array.from(messages.values());
      await Promise.all(
        toDismiss.map(message => {
          const { dismisser } = E.get(message);
          return E(dismisser).dismiss();
        }),
      );
    };

    /** @type {Mail['adopt']} */
    const adopt = async (messageNumber, edgeName, petNameOrPath) => {
      assertName(edgeName);
      const petNamePath = namePathFrom(petNameOrPath);
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
    const request = async (toNameOrPath, description, responseName) => {
      const toPath = namePathFrom(toNameOrPath);
      await null;
      if (responseName !== undefined) {
        const responseNamePath = namePathFrom(responseName);
        const resolutionId = await E(directory).identify(...responseNamePath);
        if (resolutionId !== undefined) {
          context.thisDiesIfThatDies(resolutionId);
          return provide(/** @type {FormulaIdentifier} */ (resolutionId));
        }
      }

      const toId = await E(directory).identify(...toPath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toPath.join('.')}`);
      }
      assertValidId(toId);
      const to = await provideHandle(/** @type {FormulaIdentifier} */ (toId));
      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex256()
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
        const responseNamePath = namePathFrom(responseName);
        await E(directory).write(responseNamePath, resolutionId);
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

    /** @type {Mail['requestEvaluation']} */
    const requestEvaluation = async (
      toNameOrPath,
      source,
      codeNames,
      petNamesOrPaths,
      responseName,
    ) => {
      const toPath = namePathFrom(toNameOrPath);
      await null;
      if (responseName !== undefined) {
        const responseNamePath = namePathFrom(responseName);
        const responseId = await E(directory).identify(...responseNamePath);
        if (responseId !== undefined) {
          context.thisDiesIfThatDies(responseId);
          return provide(/** @type {FormulaIdentifier} */ (responseId));
        }
      }

      /** @type {NamePath[]} */
      const normalizedPaths = petNamesOrPaths.map(namePathFrom);
      if (codeNames.length !== normalizedPaths.length) {
        throw new Error(
          `Eval request must have one pet name path for each code name`,
        );
      }

      const toId = await E(directory).identify(...toPath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toPath.join('.')}`);
      }
      const to = await provideHandle(/** @type {FormulaIdentifier} */ (toId));

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
      // Unpin after resolution to prevent collection during async wait.
      unpinTransient(req.promiseId);
      unpinTransient(req.resolverId);

      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      const responseP = provide(resolutionId);

      if (responseName !== undefined) {
        const responseNamePath = namePathFrom(responseName);
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
      const hostHandle = await provideHandle(
        /** @type {FormulaIdentifier} */ (hostHandleId),
      );

      const { request: req, response: resolutionIdP } = await makeDefineRequest(
        source,
        slots,
        selfId,
        /** @type {FormulaIdentifier} */ (hostHandleId),
      );

      try {
        await post(hostHandle, req);
      } finally {
        unpinTransient(req.promiseId);
        unpinTransient(req.resolverId);
      }

      const resolutionId = /** @type {FormulaIdentifier} */ (
        await resolutionIdP
      );
      assertValidId(resolutionId);
      context.thisDiesIfThatDies(resolutionId);
      return provide(resolutionId);
    };

    /** @type {Mail['form']} */
    const form = async (toNameOrPath, description, fields, responseName) => {
      const toPath = namePathFrom(toNameOrPath);
      await null;
      if (responseName !== undefined) {
        const responseNamePath = namePathFrom(responseName);
        const responseId = await E(directory).identify(...responseNamePath);
        if (responseId !== undefined) {
          context.thisDiesIfThatDies(responseId);
          return provide(/** @type {FormulaIdentifier} */ (responseId));
        }
      }

      const toId = await E(directory).identify(...toPath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toPath.join('.')}`);
      }
      assertValidId(toId);
      const to = await provideHandle(/** @type {FormulaIdentifier} */ (toId));

      const { request: req, response: resolutionIdP } = await makeFormRequest(
        description,
        fields,
        selfId,
        /** @type {FormulaIdentifier} */ (toId),
      );

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
        const responseNamePath = namePathFrom(responseName);
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
     * Send an eval-proposal to a recipient.
     * @type {Mail['evaluate']}
     */
    const evaluate = async (
      toId,
      source,
      codeNames,
      petNamePaths,
      edgeNames,
      ids,
      workerName,
      resultName,
    ) => {
      const to = /** @type {Handle} */ (
        await provide(/** @type {FormulaIdentifier} */ (toId))
      );

      const messageId = /** @type {import('./types.js').FormulaNumber} */ (
        await randomHex256()
      );

      // Create a responder to receive the evaluation result
      /** @type {PromiseKit<string>} */
      const { promise: responseIdP, resolve: resolveResponseId } =
        makePromiseKit();
      const settled = mapSettled(responseIdP);
      const responder = makeExo('EndoResponder', ResponderInterface, {
        resolveWithId: resolveResponseId,
      });

      const resultId = responseIdP.catch(() => undefined);
      const result = responseIdP
        .then(id =>
          typeof id === 'string'
            ? provide(/** @type {FormulaIdentifier} */ (id))
            : id,
        )
        .catch(() => undefined);

      /** @type {EvalProposalReviewer & { from: FormulaIdentifier, to: FormulaIdentifier }} */
      const reviewerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-reviewer'),
        messageId,
        source,
        codeNames,
        petNamePaths,
        edgeNames,
        ids,
        workerName,
        responder,
        settled,
        resultId,
        result,
        from: /** @type {FormulaIdentifier} */ (selfId),
        to: /** @type {FormulaIdentifier} */ (toId),
      });

      /** @type {EvalProposalProposer & { from: FormulaIdentifier, to: FormulaIdentifier }} */
      const proposerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-proposer'),
        messageId,
        source,
        codeNames,
        petNamePaths,
        edgeNames,
        ids,
        workerName,
        resultName,
        settled,
        resultId,
        result,
        from: /** @type {FormulaIdentifier} */ (selfId),
        to: /** @type {FormulaIdentifier} */ (toId),
      });

      // Deliver the proposer view to our own inbox first,
      // so it's available before the recipient sees the reviewer.
      if (reviewerMessage.from !== reviewerMessage.to) {
        await deliver(proposerMessage);
      }

      // Send the reviewer view to the recipient (host) via envelope.
      const envelope = makeEnvelope();
      outbox.set(envelope, reviewerMessage);
      await E(to).receive(envelope, selfId);

      // Wait for the response and provide the result
      const responseId = await responseIdP;
      if (resultName) {
        const resultNamePath = namePathFrom(resultName.split('.'));
        await E(directory).write(resultNamePath, responseId);
      }
      return provide(/** @type {FormulaIdentifier} */ (responseId));
    };

    /**
     * Grant an eval-proposal by executing the proposed code.
     * @type {Mail['grantEvaluate']}
     */
    const grantEvaluate = async (messageNumber, executeEval) => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'eval-proposal-reviewer') {
        throw new Error(
          `Message ${q(messageNumber)} is not an eval-proposal, it is ${q(message.type)}`,
        );
      }
      const proposal = /** @type {EvalProposalReviewer} */ (message);
      const { source, codeNames, ids, workerName, responder } = proposal;

      // Execute the evaluation using the provided executor
      const { id, value } = await executeEval(
        source,
        codeNames,
        ids,
        workerName,
        proposal,
      );

      E.sendOnly(responder).resolveWithId(id);

      return value;
    };

    /**
     * Send a counter-proposal back to the original proposer.
     * @type {Mail['counterEvaluate']}
     */
    const counterEvaluate = async (
      messageNumber,
      source,
      codeNames,
      petNamePaths,
      edgeNames,
      ids,
      workerName,
      resultName,
    ) => {
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'message');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'eval-proposal-reviewer') {
        throw new Error(
          `Message ${q(messageNumber)} is not an eval-proposal, it is ${q(message.type)}`,
        );
      }
      const originalProposal =
        /** @type {EvalProposalReviewer & { from: string }} */ (message);
      const originalSenderId = originalProposal.from;

      // Send counter-proposal back to original sender
      const to = /** @type {Handle} */ (
        await provide(/** @type {FormulaIdentifier} */ (originalSenderId))
      );

      const counterMessageId =
        /** @type {import('./types.js').FormulaNumber} */ (
          await randomHex256()
        );

      // Create a responder for the counter-proposal
      /** @type {PromiseKit<string>} */
      const { promise: responseIdP, resolve: resolveResponseId } =
        makePromiseKit();
      const settled = mapSettled(responseIdP);
      const responder = makeExo('EndoResponder', ResponderInterface, {
        resolveWithId: resolveResponseId,
      });

      const resultId = Promise.resolve(undefined);
      const result = Promise.resolve(undefined);

      /** @type {EvalProposalReviewer & { from: FormulaIdentifier, to: FormulaIdentifier }} */
      const counterReviewerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-reviewer'),
        messageId: counterMessageId,
        source,
        codeNames,
        petNamePaths,
        edgeNames,
        ids,
        workerName,
        responder,
        settled,
        resultId,
        result,
        from: /** @type {FormulaIdentifier} */ (selfId),
        to: /** @type {FormulaIdentifier} */ (originalSenderId),
      });

      /** @type {EvalProposalProposer & { from: FormulaIdentifier, to: FormulaIdentifier }} */
      const counterProposerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-proposer'),
        messageId: counterMessageId,
        source,
        codeNames,
        petNamePaths,
        edgeNames,
        ids,
        workerName,
        resultName,
        settled,
        resultId,
        result,
        from: /** @type {FormulaIdentifier} */ (selfId),
        to: /** @type {FormulaIdentifier} */ (originalSenderId),
      });

      // Deliver the counter-proposal proposer view to our own inbox first.
      if (counterReviewerMessage.from !== counterReviewerMessage.to) {
        await deliver(counterProposerMessage);
      }

      // Send the counter-proposal reviewer view to the original proposer.
      const counterEnvelope = makeEnvelope();
      outbox.set(counterEnvelope, counterReviewerMessage);
      await E(to).receive(counterEnvelope, selfId);
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
      dismissAll,
      adopt,
      requestEvaluation,
      getEvalRequest,
      define,
      form,
      getDefineRequest,
      getFormRequest,
      evaluate,
      grantEvaluate,
      counterEvaluate,
    });
  };

  return makeMailbox;
};
