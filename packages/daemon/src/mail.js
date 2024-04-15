// @ts-check

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from './pubsub.js';
import { assertPetName } from './pet-name.js';

const { quote: q } = assert;

/**
 * @param {string} description
 * @param {string} fromId
 * @param {string} toId
 */
const makeRequest = (description, fromId, toId) => {
  /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<string>} */
  const { promise, resolve } = makePromiseKit();
  const settled = promise.then(
    () => /** @type {const} */ ('fulfilled'),
    () => /** @type {const} */ ('rejected'),
  );
  const responder = makeExo(
    'Responder',
    M.interface(
      'Responder',
      {},
      {
        defaultGuards: 'passable',
      },
    ),
    {
      respondId: resolve,
    },
  );
  const request = harden({
    type: /** @type {const} */ ('request'),
    from: fromId,
    to: toId,
    description,
    settled,
    responder,
  });
  return harden({ request, response: promise });
};

const EnvelopeShape = M.interface('Envelope', {});
const makeEnvelope = () => makeExo('Envelope', EnvelopeShape, {});

/**
 * @param {object} args
 * @param {import('./types.js').DaemonCore['provide']} args.provide
 * @returns {import('./types.js').MakeMailbox}
 */
export const makeMailboxMaker = ({ provide }) => {
  /**
    @type {import('./types.js').MakeMailbox} */
  const makeMailbox = ({ selfId, petStore, context }) => {
    /** @type {Map<number, import('./types.js').StampedMessage>} */
    const messages = new Map();

    /** @type {WeakMap<{}, import('./types.js').EnvelopedMessage>} */
    const outbox = new WeakMap();

    /** @type {import('./types.js').Topic<import('./types.js').StampedMessage>} */
    const messagesTopic = makeChangeTopic();
    let nextMessageNumber = 0;

    /** @type {import('./types.js').Mail['listMessages']} */
    const listMessages = async () => harden(Array.from(messages.values()));

    /** @type {import('./types.js').Mail['followMessages']} */
    const followMessages = async function* currentAndSubsequentMessages() {
      const subsequentRequests = messagesTopic.subscribe();
      yield* messages.values();
      yield* subsequentRequests;
    };

    /**
     * @param {import('./types.js').EnvelopedMessage} envelope
     */
    const deliver = envelope => {
      /** @type {import('@endo/promise-kit/src/types.js').PromiseKit<void>} */
      const dismissal = makePromiseKit();
      const messageNumber = nextMessageNumber;
      nextMessageNumber += 1;

      const dismisser = makeExo(
        'Dismisser',
        M.interface(
          'Dismisser',
          {},
          {
            defaultGuards: 'passable',
          },
        ),
        {
          dismiss() {
            messages.delete(messageNumber);
            dismissal.resolve();
          },
        },
      );

      const message = harden({
        ...envelope,
        number: messageNumber,
        date: new Date().toISOString(),
        dismissed: dismissal.promise,
        dismisser,
      });

      messages.set(messageNumber, message);
      messagesTopic.publisher.next(message);
    };

    /**
     * @param {import('./types.js').Handle} recipient
     * @param {import('./types.js').EnvelopedMessage} message
     */
    const post = async (recipient, message) => {
      /** @param {object} allegedRecipient */
      const envelope = makeEnvelope();
      outbox.set(envelope, message);
      await E(recipient).receive(envelope, selfId);
      // Send to own inbox.
      if (message.from !== message.to) {
        deliver(message);
      }
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
      const message = messages.get(messageNumber);
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
      const req = /** @type {import('./types.js').Request} */ (message);
      const { responder } = E.get(req);
      E.sendOnly(responder).respondId(id);
    };

    // TODO test reject
    /** @type {import('./types.js').Mail['reject']} */
    const reject = async (messageNumber, reason = 'Declined') => {
      const message = messages.get(messageNumber);
      if (message !== undefined) {
        // TODO verify that the message is a request.
        const req = /** @type {import('./types.js').Request} */ (message);
        const { responder } = E.get(req);
        E.sendOnly(responder).respondId(
          harden(Promise.reject(harden(new Error(reason)))),
        );
      }
    };

    /** @type {import('./types.js').Mail['send']} */
    const send = async (toName, strings, edgeNames, petNames) => {
      const toId = petStore.identifyLocal(toName);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toName}`);
      }
      const to = /** @type {import('./types.js').Handle} */ (
        await provide(toId)
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

      const ids = petNames.map(petName => {
        const id = petStore.identifyLocal(petName);
        if (id === undefined) {
          throw new Error(`Unknown pet name ${q(petName)}`);
        }
        return id;
      });

      const message = harden({
        type: /** @type {const} */ ('package'),
        strings,
        names: edgeNames,
        ids,
        from: selfId,
        to: toId,
      });

      // add to recipient mailbox
      await post(to, message);
    };

    /** @type {import('./types.js').Mail['dismiss']} */
    const dismiss = async messageNumber => {
      if (
        typeof messageNumber !== 'number' ||
        messageNumber >= Number.MAX_SAFE_INTEGER
      ) {
        throw new Error(`Invalid request number ${messageNumber}`);
      }
      const message = messages.get(messageNumber);
      if (message === undefined) {
        throw new Error(`Invalid request number ${messageNumber}`);
      }
      const { dismisser } = E.get(message);
      return E(dismisser).dismiss();
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
      const id = message.ids[index];
      if (id === undefined) {
        throw new Error(
          `panic: message must contain a formula for every name, including the name ${q(
            edgeName,
          )} at ${q(index)}`,
        );
      }
      context.thisDiesIfThatDies(id);
      await petStore.write(petName, id);
    };

    /** @type {import('./types.js').Mail['request']} */
    const request = async (toName, description, responseName) => {
      if (responseName !== undefined) {
        const responseId = petStore.identifyLocal(responseName);
        if (responseId !== undefined) {
          return provide(responseId);
        }
      }

      const toId = petStore.identifyLocal(toName);
      if (toId === undefined) {
        throw new Error(`Unknown recipient ${toName}`);
      }
      const to = /** @type {import('./types.js').Handle} */ (
        await provide(toId)
      );

      const { request: req, response: responseIdP } = makeRequest(
        description,
        selfId,
        toId,
      );

      // Note: consider sending to each mailbox with different powers.
      await post(to, req);

      const responseId = await responseIdP;
      const responseP = provide(responseId);

      if (responseName !== undefined) {
        await petStore.write(responseName, responseId);
      }

      return responseP;
    };

    /**
     * @param {import('./types.js').Envelope} envelope
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
     * @param {import('@endo/eventual-send').ERef<import('./types.js').Envelope>} envelope
     * @param {string} allegedFromId
     */
    const receive = async (envelope, allegedFromId) => {
      const sender = /** @type {Promise<import('./types.js').Handle>} */ (
        provide(allegedFromId)
      );
      const message = await E(sender).open(envelope);
      if (allegedFromId !== message.from) {
        throw new Error('Mail fraud: alleged sender does not recognize parcel');
      }
      deliver(message);
    };

    const handle = makeExo(
      'Handle',
      M.interface(
        'Handle',
        {},
        {
          defaultGuards: 'passable',
        },
      ),
      {
        receive,
        open,
      },
    );

    return harden({
      handle: () => handle,
      deliver,
      petStore,
      listMessages,
      followMessages,
      request,
      send,
      resolve,
      reject,
      dismiss,
      adopt,
    });
  };

  return makeMailbox;
};
