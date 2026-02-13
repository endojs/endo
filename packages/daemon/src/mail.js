// @ts-check

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { makeChangeTopic } from './pubsub.js';
import {
  assertPetNames,
  assertNamePath,
  assertName,
  assertNames,
  assertPetName,
  assertPetNamePath,
  assertEdgeName,
  namePathFrom,
} from './pet-name.js';
import { assertValidId } from './formula-identifier.js';
import { makeDeferredTasks } from './deferred-tasks.js';
import { makeSerialJobs } from './serial-jobs.js';

import {
  EnvelopeInterface,
  DismisserInterface,
  HandleInterface,
  ResponderInterface,
  NameHubInterface,
} from './interfaces.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { DaemonCore, DeferredTasks, Envelope, EnvelopedMessage, EvalProposalProposer, EvalProposalReviewer, EvalRequest, FormulaIdentifier, Handle, Mail, MakeMailbox, MarshalDeferredTaskParams, MessageFormula, Name, NameHub, NameOrPath, NamePath, PetName, Provide, Request, Responder, StampedMessage, Topic } from './types.js' */

/** @type {PetName} */
const NEXT_MESSAGE_NUMBER_NAME = /** @type {PetName} */ ('next-number');
const messageNumberNamePattern = /^(0|[1-9][0-9]*)$/;

/** @typedef {(...petNamePath: string[]) => Promise<unknown>} HubLookup */

/**
 * Create a read-only NameHub view over a single message.
 * Exposes FROM, TO, and for package messages each edge name -> capability.
 *
 * @param {StampedMessage} message
 * @param {Provide} provide
 * @returns {NameHub}
 */
const makeMessageHub = (message, provide) => {
  const slotNames = ['FROM', 'TO'];
  const slotIds = [message.from, message.to];
  if (message.type === 'package') {
    slotNames.push(...message.names);
    slotIds.push(...message.ids);
  }
  const nameToId = new Map(slotNames.map((n, i) => [n, slotIds[i]]));

  const readOnlyError = () => {
    throw new Error('MAIL view is read-only');
  };

  return makeExo('MailMessageHub', NameHubInterface, {
    async has(...namePath) {
      if (namePath.length !== 1) return false;
      return nameToId.has(namePath[0]);
    },
    async identify(...namePath) {
      if (namePath.length !== 1) return undefined;
      return nameToId.get(namePath[0]);
    },
    async list() {
      return harden([...nameToId.keys()].sort());
    },
    async lookup(nameOrPath) {
      const path = Array.isArray(nameOrPath) ? nameOrPath : [nameOrPath];
      if (path.length !== 1) {
        throw new TypeError(`Message hub lookup requires a single name`);
      }
      const id = nameToId.get(path[0]);
      if (id === undefined) {
        throw new TypeError(`Unknown name in message: ${q(path[0])}`);
      }
      return provide(id);
    },
    async reverseLookup() {
      return harden([]);
    },
    async locate() {
      return undefined;
    },
    async reverseLocate() {
      return harden([]);
    },
    async listIdentifiers() {
      return harden([]);
    },
    async *followNameChanges() {
      if (false) {
        yield undefined;
      }
      await null;
    },
    async *followLocatorNameChanges() {
      if (false) {
        yield undefined;
      }
      await null;
    },
    async write() {
      readOnlyError();
    },
    async remove() {
      readOnlyError();
    },
    async move() {
      readOnlyError();
    },
    async copy() {
      readOnlyError();
    },
  });
};

/**
 * Create a read-only NameHub view over the mailbox.
 * Keys are message numbers as strings ("0", "1", ...). No next-id exposed.
 *
 * @param {Map<bigint, StampedMessage>} messages
 * @param {Provide} provide
 * @returns {NameHub}
 */
const makeMailHub = (messages, provide) => {
  const readOnlyError = () => {
    throw new Error('MAIL view is read-only');
  };

  return makeExo('MailHub', NameHubInterface, {
    async has(...namePath) {
      if (namePath.length !== 1) return false;
      const n = namePath[0];
      const num = parseInt(n, 10);
      if (String(num) !== n || num < 0) return false;
      return messages.has(BigInt(num));
    },
    async identify(...namePath) {
      if (namePath.length !== 1) return undefined;
      return undefined;
    },
    async list() {
      const nums = [...messages.keys()].sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      return harden(nums.map(n => String(n)));
    },
    async lookup(nameOrPath) {
      const path = Array.isArray(nameOrPath) ? nameOrPath : [nameOrPath];
      if (path.length !== 1) {
        throw new TypeError(`Mail hub lookup requires a single name`);
      }
      const n = path[0];
      const num = parseInt(n, 10);
      if (String(num) !== n || num < 0) {
        throw new TypeError(`Invalid mail slot: ${q(n)}`);
      }
      const message = messages.get(BigInt(num));
      if (message === undefined) {
        throw new TypeError(`No message ${q(n)}`);
      }
      return makeMessageHub(message, provide);
    },
    async reverseLookup() {
      return harden([]);
    },
    async locate() {
      return undefined;
    },
    async reverseLocate() {
      return harden([]);
    },
    async listIdentifiers() {
      return harden([]);
    },
    async *followNameChanges() {
      if (false) {
        yield undefined;
      }
      await null;
    },
    async *followLocatorNameChanges() {
      if (false) {
        yield undefined;
      }
      await null;
    },
    async write() {
      readOnlyError();
    },
    async remove() {
      readOnlyError();
    },
    async move() {
      readOnlyError();
    },
    async copy() {
      readOnlyError();
    },
  });
};

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

/**
 * @param {string} source
 * @param {Array<Name>} codeNames
 * @param {Array<NamePath>} petNamePaths
 * @param {string} fromId
 * @param {string} toId
 */
const makeEvalRequest = (source, codeNames, petNamePaths, fromId, toId) => {
  /** @type {PromiseKit<string>} */
  const { promise, resolve } = makePromiseKit();
  const settled = promise.then(
    () => /** @type {const} */ ('fulfilled'),
    () => /** @type {const} */ ('rejected'),
  );
  const responder = makeExo('EndoResponder', ResponderInterface, {
    respondId: resolve,
  });
  const request = harden({
    type: /** @type {const} */ ('eval-request'),
    from: fromId,
    to: toId,
    source,
    codeNames,
    petNamePaths,
    settled,
    responder,
  });
  return harden({ request, response: promise });
};

const makeEnvelope = () => makeExo('Envelope', EnvelopeInterface, {});

/**
 * Map a responder resolution to settled state, including Promise rejection payloads.
 * @param {Promise<string | Promise<string>>} responseIdP
 */
const mapSettled = responseIdP =>
  responseIdP.then(
    id =>
      id && typeof id.then === 'function'
        ? id.then(
            () => /** @type {const} */ ('fulfilled'),
            () => /** @type {const} */ ('rejected'),
          )
        : /** @type {const} */ ('fulfilled'),
    () => /** @type {const} */ ('rejected'),
  );

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
        });
      }
      if (
        envelope.type === 'eval-proposal-reviewer' ||
        envelope.type === 'eval-proposal-proposer'
      ) {
        return harden({
          type: 'message',
          messageType: envelope.type,
          from: /** @type {FormulaIdentifier} */ (envelope.from),
          to: /** @type {FormulaIdentifier} */ (envelope.to),
          date,
          source: envelope.source,
          codeNames: envelope.codeNames,
          petNamePaths: envelope.petNamePaths,
          edgeNames: envelope.edgeNames,
          ids: /** @type {FormulaIdentifier[]} */ (envelope.ids),
          workerName: envelope.workerName,
          resultName:
            envelope.type === 'eval-proposal-proposer'
              ? envelope.resultName
              : undefined,
        });
      }
      throw new Error(`Unknown message type: ${envelope.type}`);
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
        if (!Array.isArray(envelope.codeNames)) {
          throw new Error('Invalid eval-request codeNames');
        }
        if (!Array.isArray(envelope.petNamePaths)) {
          throw new Error('Invalid eval-request petNamePaths');
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
        if (!Array.isArray(envelope.edgeNames)) {
          throw new Error('Invalid eval-proposal edgeNames');
        }
        if (!Array.isArray(envelope.ids)) {
          throw new Error('Invalid eval-proposal ids');
        }
        return;
      }
      throw new Error(`Unknown message type: ${envelope.type}`);
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

      // Note: eval-request, eval-proposal-reviewer, eval-proposal-proposer
      // are handled at send/receive time with their live settled/responder
      // properties, not through formula persistence. This function is only
      // called during mailbox state loading for persisted messages.

      throw new Error(`Unknown message formula type: ${formula.messageType}`);
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
     * @param {EnvelopedMessage} [senderMessage]
     */
    const post = async (recipient, message, senderMessage = message) => {
      const envelope = makeEnvelope();
      outbox.set(envelope, message);
      await E(recipient).receive(envelope, selfId);
      // Send to own inbox.
      if (message.from !== message.to) {
        await deliver(senderMessage);
      }
    };

    /** @type {Mail['resolve']} */
    const resolve = async (messageNumber, resolutionNameOrPath) => {
      const resolutionNamePath = namePathFrom(resolutionNameOrPath);
      assertNamePath(resolutionNamePath);
      const normalizedMessageNumber = mustParseBigint(messageNumber, 'request');
      const message = messages.get(normalizedMessageNumber);
      if (message === undefined) {
        throw new Error(`Invalid request, ${q(messageNumber)}`);
      }
      const id = await E(directory).identify(...resolutionNamePath);
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
      E.sendOnly(resolver).respondId(id);
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
        E.sendOnly(resolver).respondId(
          harden(Promise.reject(harden(new Error(reason)))),
        );
      }
    };

    /** @type {Mail['send']} */
    const send = async (toNameOrPath, strings, edgeNames, petNamesOrPaths) => {
      const toNamePath = namePathFrom(toNameOrPath);
      assertNamePath(toNamePath);
      assertUniqueEdgeNames(edgeNames);
      const toId = await E(directory).identify(...toNamePath);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${q(toNameOrPath)}`);
      }
      const to = await provide(
        /** @type {FormulaIdentifier} */ (toId),
        'handle',
      );

      const petNamePaths = petNamesOrPaths.map(namePathFrom);
      edgeNames.forEach(assertEdgeName);
      const uniqueEdgeNames = new Set(edgeNames);
      if (uniqueEdgeNames.size !== edgeNames.length) {
        throw new Error(
          'Duplicate edge names in message are not allowed; each edge name must be unique.',
        );
      }
      if (petNamePaths.length !== edgeNames.length) {
        throw new Error(
          `Message must have one edge name (${q(
            edgeNames.length,
          )}) for every pet name (${q(petNamePaths.length)})`,
        );
      }
      if (strings.length < petNamePaths.length) {
        throw new Error(
          `Message must have one string before every value delivered`,
        );
      }

      const ids = await Promise.all(
        petNamePaths.map(async petNamePath => {
          const id = await E(directory).identify(...petNamePath);
          if (id === undefined) {
            throw new Error(`Unknown pet name ${q(petNamePath)}`);
          }
          assertValidId(id);
          return id;
        }),
      );

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
    const adopt = async (messageNumber, edgeNameOrPath, petNameOrPath) => {
      // Normalize edgeName - accept string or single-element array for consistency
      const edgeNamePath = namePathFrom(edgeNameOrPath);
      if (edgeNamePath.length !== 1) {
        throw new Error(
          `Edge name must be a single name, got path with ${edgeNamePath.length} elements`,
        );
      }
      const [edgeName] = edgeNamePath;
      assertEdgeName(edgeName);
      // Normalize petNamePath - accept string or array for consistency
      const petNamePath = namePathFrom(petNameOrPath);
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
        const resolutionId = await E(directory).identify(...responseNamePath);
        if (resolutionId !== undefined) {
          context.thisDiesIfThatDies(resolutionId);
          return provide(/** @type {FormulaIdentifier} */ (resolutionId));
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

      const { request: req, response: responseIdP } = makeEvalRequest(
        source,
        codeNames,
        normalizedPaths,
        selfId,
        toId,
      );

      await post(to, req);

      const responseId = await responseIdP;
      assertValidId(responseId);
      const responseP = provide(responseId);

      if (responseNameOrPath !== undefined) {
        const responseNamePath = namePathFrom(responseNameOrPath);
        await E(directory).write(responseNamePath, responseId);
      }

      return responseP;
    };

    /** @type {Mail['getEvalRequest']} */
    const getEvalRequest = messageNumber => {
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid message number ${q(messageNumber)}`);
      }
      const message = messages.get(BigInt(messageNumber));
      if (message === undefined) {
        throw new Error(`No such message with number ${q(messageNumber)}`);
      }
      if (message.type !== 'eval-request') {
        throw new Error(
          `Message ${q(messageNumber)} is not an eval-request (is ${q(message.type)})`,
        );
      }
      const evalReq = /** @type {EvalRequest & { from: string }} */ (message);
      return harden({
        source: evalReq.source,
        codeNames: evalReq.codeNames,
        petNamePaths: evalReq.petNamePaths,
        responder: evalReq.responder,
        guestHandleId: evalReq.from,
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
      return undefined;
    };

    const handle = makeExo('Handle', HandleInterface, {
      receive,
      open,
    });

    await loadMailboxState();

    /**
     * Send an eval-proposal to the host.
     * This is used by guests to propose code evaluation.
     * Returns a promise that resolves when the proposal is granted.
     * @param {string} toId - The host handle ID
     * @param {string} source - JavaScript source code
     * @param {Array<string>} codeNames - Variable names used in source
     * @param {Array<Array<string>>} petNamePaths - Pet name paths for the values (sender's namespace)
     * @param {Array<string>} edgeNames - Edge names for display
     * @param {Array<string>} ids - Formula identifiers for the values
     * @param {string} [workerName] - Worker to execute on
     * @param {string} [resultName] - Where sender wants result stored
     * @returns {Promise<unknown>} - Resolves with evaluation result when granted
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
      const to = /** @type {Handle} */ (await provide(toId));

      // Create a responder to receive the evaluation result
      /** @type {PromiseKit<string>} */
      const { promise: responseIdP, resolve: resolveResponseId } =
        makePromiseKit();
      const settled = mapSettled(responseIdP);
      const responder = makeExo('EndoResponder', ResponderInterface, {
        respondId: resolveResponseId,
      });

      const resultId = responseIdP.catch(() => undefined);
      const result = responseIdP
        .then(id => (typeof id === 'string' ? provide(id) : id))
        .catch(() => undefined);

      /** @type {EvalProposalReviewer & { from: string, to: string }} */
      const reviewerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-reviewer'),
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
        from: selfId,
        to: toId,
      });

      /** @type {EvalProposalProposer & { from: string, to: string }} */
      const proposerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-proposer'),
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
        from: selfId,
        to: toId,
      });

      await post(to, reviewerMessage, proposerMessage);

      // Wait for the response and provide the result
      const responseId = await responseIdP;
      if (resultName) {
        const resultNamePath = namePathFrom(resultName.split('.'));
        await E(directory).write(resultNamePath, responseId);
      }
      return provide(responseId);
    };

    /**
     * Grant an eval-proposal by executing the proposed code.
     * Resolves the proposer's promise with the evaluation result.
     * @param {number} messageNumber - The message number of the eval-proposal
     * @param {(source: string, codeNames: string[], ids: string[], workerName: string | undefined, proposal: EvalProposalReviewer) => Promise<{id: string, value: unknown}>} executeEval - Function to execute the evaluation
     */
    const grantEvaluate = async (messageNumber, executeEval) => {
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid message number ${q(messageNumber)}`);
      }
      const message = messages.get(BigInt(messageNumber));
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

      // Resolve the proposer's promise with the result ID
      E.sendOnly(responder).respondId(id);

      return value;
    };

    /**
     * Send a counter-proposal back to the original proposer.
     * When the counter-proposal is granted, resolves both the counter's promise
     * and the original proposal's promise with the result.
     * @param {number} messageNumber - The message number of the original eval-proposal
     * @param {string} source - Modified JavaScript source code
     * @param {Array<string>} codeNames - Variable names used in source
     * @param {Array<Array<string>>} petNamePaths - Pet name paths for values (counter-proposer's namespace)
     * @param {Array<string>} edgeNames - Edge names for values (counter-proposer's namespace)
     * @param {Array<string>} ids - Formula identifiers for the values
     * @param {string} [workerName] - Worker to execute on
     * @param {string} [resultName] - Where to store result
     * @returns {Promise<unknown>} - Resolves with evaluation result when counter is granted
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
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid message number ${q(messageNumber)}`);
      }
      const message = messages.get(BigInt(messageNumber));
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
      const originalResponder = originalProposal.responder;

      // Send counter-proposal back to original sender
      const to = /** @type {Handle} */ (await provide(originalSenderId));

      // Create a responder for the counter-proposal
      /** @type {PromiseKit<string>} */
      const { promise: responseIdP, resolve: resolveResponseId } =
        makePromiseKit();
      const settled = mapSettled(responseIdP);
      const responder = makeExo('EndoResponder', ResponderInterface, {
        respondId: resolveResponseId,
      });

      const resultId = Promise.resolve(undefined);
      const result = Promise.resolve(undefined);

      /** @type {EvalProposalReviewer & { from: string, to: string }} */
      const counterReviewerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-reviewer'),
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
        from: selfId,
        to: originalSenderId,
      });

      /** @type {EvalProposalProposer & { from: string, to: string }} */
      const counterProposerMessage = harden({
        type: /** @type {const} */ ('eval-proposal-proposer'),
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
        from: selfId,
        to: originalSenderId,
      });

      await post(to, counterReviewerMessage, counterProposerMessage);

      // Resolve the original proposal immediately with the counter message so
      // the proposer doesn't hang while a counter-proposal is pending.
      try {
        await E(originalResponder).respondId(counterReviewerMessage);
      } catch {
        // Fall back to a resolved undefined to avoid leaving the proposal pending.
        try {
          await E(originalResponder).respondId(undefined);
        } catch {
          // Ignore if responder is already gone.
        }
      }

      // Resolve the original proposal when the counter is granted,
      // but don't block returning from counterEvaluate.
      Promise.resolve().then(async () => {
        try {
          const responseId = await responseIdP;

          if (resultName) {
            const resultNamePath = namePathFrom(resultName.split('.'));
            await E(directory).write(resultNamePath, responseId);
          }

          // Resolve the original proposal's responder with the same result
          // if it hasn't already been resolved.
          E.sendOnly(originalResponder).respondId(responseId);
        } catch {
          // Counter-proposal was never granted or the connection closed.
        }
      });

      return undefined;
    };

    const mailHub = makeMailHub(messages, provide);

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
      resolve,
      reject,
      dismiss,
      dismissAll,
      adopt,
      evaluate,
      grantEvaluate,
      counterEvaluate,
      getMailHub: () => mailHub,
    });
  };

  return makeMailbox;
};
