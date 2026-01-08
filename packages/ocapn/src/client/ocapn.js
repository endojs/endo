// @ts-check

/**
 * @import { RemoteKit, Settler } from '@endo/eventual-send'
 * @import { Slot } from '../captp/types.js'
 * @import { ReferenceKit, TakeNextRemoteAnswer, RemoteKitHandler } from './ref-kit.js'
 * @import { OcapnTable } from '../captp/ocapn-tables.js'
 * @import { GrantTracker, HandoffGiveDetails } from './grant-tracker.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { HandoffGiveSigEnvelope, HandoffReceiveSigEnvelope } from '../codecs/descriptors.js'
 * @import { SyrupReader } from '../syrup/decode.js'
 * @import { SturdyRefTracker } from './sturdyrefs.js'
 * @import { Connection, InternalSession, LocationId, Logger, SessionId, SwissNum } from './types.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 */

import { ZERO_N } from '@endo/nat';
import { E, HandledPromise } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import {
  makeDescCodecs,
  makeHandoffReceiveDescriptor,
  makeHandoffReceiveSigEnvelope,
} from '../codecs/descriptors.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { makePassableCodecs } from '../codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../codecs/operations.js';
import { getSelectorName, makeSelector } from '../selector.js';
import { decodeSyrup } from '../syrup/js-representation.js';
import { decodeSwissnum, locationToLocationId, toHex } from './util.js';
import {
  publicKeyDescriptorToPublicKey,
  randomGiftId,
  verifyHandoffGiveSignature,
  verifyHandoffReceiveSignature,
  signHandoffReceive,
  makeSignedHandoffGive,
} from '../cryptography.js';
import { compareImmutableArrayBuffers } from '../syrup/compare.js';
import { ocapnPassStyleOf } from '../codecs/ocapn-pass-style.js';
import { makeOcapnTable } from '../captp/ocapn-tables.js';
import { makeSlot, parseSlot } from '../captp/pairwise.js';
import { makeReferenceKit } from './ref-kit.js';
import { makeGrantDetails } from './grant-tracker.js';

/**
 * @typedef {any} LocalResolver
 * @typedef {any} RemoteResolver
 * @typedef {(questionSlot: Slot, ownerLabel?: string) => LocalResolver} MakeLocalResolver
 * @typedef {(slot: Slot) => RemoteResolver} MakeRemoteResolver
 * @typedef {(node: OcapnLocation, swissNum: SwissNum) => Promise<any>} MakeRemoteSturdyRef
 * @typedef {(signedGive: HandoffGiveSigEnvelope) => Promise<any>} MakeHandoff
 * @typedef {(nodeLocation: OcapnLocation, swissNum: SwissNum) => any} GetRemoteSturdyRef
 * @typedef {'object' | 'promise' | 'question'} SlotType
 */

const sink = harden(() => {});

/**
 * @callback MessageObserver
 * @param {'send' | 'receive'} direction - Whether the message was sent or received
 * @param {object} message - The message object
 * @returns {void}
 */

/**
 * @typedef {object} MakeOcapnCommsKitOptions
 * @property {Logger} logger
 * @property {(message: any) => void} rawDispatch
 * @property {(reason?: any) => void} onReject
 * @property {(message: any) => void} rawSend
 * @property {() => void} clearPendingRefCounts
 * @property {() => void} commitSentRefCounts
 */

/**
 * @typedef {object} OcapnCommsKit
 * @property {(message: any) => void} dispatch
 * @property {(message: any) => void} send
 * @property {(reason?: any) => void} quietReject
 * @property {() => boolean} didUnplug
 * @property {(reason?: Error) => void} doUnplug
 * @property {() => { send: Record<string, number>; recv: Record<string, number> }} getStats
 * @property {(observer: MessageObserver) => () => void} subscribeMessages
 */

/**
 * @param {MakeOcapnCommsKitOptions} opts
 * @returns {OcapnCommsKit}
 */
const makeOcapnCommsKit = ({
  logger,
  onReject,
  rawDispatch,
  rawSend,
  clearPendingRefCounts,
  commitSentRefCounts,
}) => {
  /** @type {Record<string, number>} */
  const sendStats = {};
  /** @type {Record<string, number>} */
  const recvStats = {};

  /** @type {Set<MessageObserver>} */
  const messageObservers = new Set();

  /**
   * Subscribe to all messages sent and received.
   * @param {MessageObserver} observer - Callback invoked for each message
   * @returns {() => void} Unsubscribe function
   */
  const subscribeMessages = observer => {
    messageObservers.add(observer);
    return () => {
      messageObservers.delete(observer);
    };
  };

  /** @type {any} */
  let unplugError = false;
  const didUnplug = () => unplugError;
  const doUnplug = reason => {
    logger.info('doUnplug', reason);
    unplugError = reason;
  };

  const quietReject = (reason = undefined, returnIt = true) => {
    if (
      (unplugError === false || reason !== unplugError) &&
      reason !== undefined
    ) {
      onReject(reason);
    }
    if (!returnIt) {
      return Promise.resolve();
    }

    // Silence the unhandled rejection warning, but don't affect
    // the user's handlers.
    const p = Promise.reject(reason);
    p.catch(sink);
    return p;
  };

  /**
   * @param {Record<string, any>} message
   */
  const send = message => {
    // Don't throw here if unplugged, just don't send.
    if (didUnplug()) {
      logger.info(`Unplugged, not sending message:`, message);
      return;
    }

    logger.info(`Sending message:`, message);

    // Notify message observers
    for (const observer of messageObservers) {
      try {
        observer('send', message);
      } catch (err) {
        // Ignore observer errors
      }
    }

    try {
      // Prepare for sending the message.
      clearPendingRefCounts();
      // Actually send the message. Throws on serialization error.
      rawSend(message);
      // Finalize the sending of the message.
      commitSentRefCounts();
      sendStats[message.type] = (sendStats[message.type] || 0) + 1;
    } catch (error) {
      // Message send failed.
      logger.info('Error in send', error);
      clearPendingRefCounts();
      throw error;
    }
  };

  // Return a dispatch function that notifies observers.
  const dispatch = message => {
    if (didUnplug()) {
      logger.info('Unplugged, not dispatching message:', message);
      return;
    }

    if (
      typeof message !== 'object' ||
      message === null ||
      message.type === undefined
    ) {
      throw Error(`Invalid message: ${message}`);
    }

    logger.info(`Dispatching message:`, message);

    // Notify message observers before dispatching
    for (const observer of messageObservers) {
      try {
        observer('receive', message);
      } catch (err) {
        // Only log observer errors.
        logger.info('Error in message observer', err);
      }
    }

    try {
      // Actually dispatch the message. If it made it this far, its unlikely to throw.
      rawDispatch(message);
      // Finalize the dispatching of the message.
      recvStats[message.type] = (recvStats[message.type] || 0) + 1;
    } catch (error) {
      // Message dispatch failed.
      logger.info('Error in dispatch', error);
      throw error;
    }
  };

  const getStats = () => {
    return harden({
      send: { ...sendStats },
      recv: { ...recvStats },
    });
  };

  // Can't harden stats.
  return harden({
    getStats,
    dispatch,
    send,
    quietReject,
    didUnplug,
    doUnplug,
    subscribeMessages,
  });
};

/**
 * @typedef {(handler: RemoteKitHandler) => RemoteKit} MakeRemoteKitForHandler
 * Makes a HandledPromise and settler for the given handler
 * @typedef {(targetGetter: () => unknown) => RemoteKitHandler} MakeHandlerForRemoteReference
 * Makes a HandledPromise handler for the given target
 * @typedef {(targetGetter: () => unknown) => RemoteKit} MakeRemoteKit
 * Make a HandledPromise and settler that sends op:deliver to the `targetSlot`
 * @typedef {(handoffGiveDetails: HandoffGiveDetails) => HandoffGiveSigEnvelope} SendHandoff
 */

/**
 *
 * @param {object} opts
 * @param {Logger} opts.logger
 * @param {((reason?: any, returnIt?: boolean) => void)} opts.quietReject
 * @returns {MakeRemoteKitForHandler}
 */
const makeMakeRemoteKitForHandler = ({ logger, quietReject }) => {
  const makeRemoteKitForHandler = handler => {
    /** @type {Settler | undefined} */
    let settler;

    /** @type {import('@endo/eventual-send').HandledExecutor} */
    const executor = (resolve, reject, resolveWithPresence) => {
      const s = Far('settler', {
        resolve: value => {
          logger.info(`settler resolve`, value);
          resolve(value);
        },
        reject: reason => {
          logger.info(`settler reject`, reason);
          reject(reason);
        },
        resolveWithPresence: () => resolveWithPresence(handler),
      });
      settler = s;
    };

    const promise = new HandledPromise(executor, handler);
    assert(settler);

    // Silence the unhandled rejection warning, but don't affect
    // the user's handlers.
    promise.catch(e => quietReject(e, false));

    return harden({ promise, settler });
  };

  return makeRemoteKitForHandler;
};

/**
 * @param {object} opts
 * @param {Logger} opts.logger
 * @param {() => boolean} opts.didUnplug
 * @param {((reason?: any, returnIt?: boolean) => void)} opts.quietReject
 * @param {((obj: Record<string, any>) => void)} opts.send
 * @param {TakeNextRemoteAnswer} opts.takeNextRemoteAnswer
 * @returns {MakeHandlerForRemoteReference}
 */
const makeMakeHandlerForRemoteReference = ({
  logger,
  send,
  didUnplug,
  quietReject,
  takeNextRemoteAnswer,
}) => {
  const makeHandlerForRemoteReference = targetGetter => {
    /**
     * Send op:deliver and return the internal promise for the answer.
     * @param {unknown[]} args
     * @param {Promise<unknown>} [externalAnswerPromise] - The promise E() returns to the caller
     */
    const sendDeliver = (args, externalAnswerPromise) => {
      const {
        internalPromise,
        position: answerPosition,
        resolver: resolveMeDesc,
      } = takeNextRemoteAnswer(externalAnswerPromise);
      send({
        type: 'op:deliver',
        to: targetGetter(),
        args: harden(args),
        answerPosition,
        resolveMeDesc,
      });
      return internalPromise;
    };

    /**
     * Send op:deliver-only (fire and forget, no answer expected).
     * @param {unknown[]} args
     */
    const sendDeliverOnly = args => {
      send({
        type: 'op:deliver-only',
        to: targetGetter(),
        args: harden(args),
      });
    };

    /**
     * This handler is set up such that it will transform both
     * attribute access and method invocation of this remote promise
     * as also being questions / remote handled promises
     *
     * @type {RemoteKitHandler}
     */
    const handler = harden({
      get(_o, prop, externalAnswerPromise) {
        if (didUnplug()) {
          return quietReject(didUnplug());
        }
        logger.info(`get`, targetGetter(), prop);

        // Reject for unsupported property types (Symbol, etc.) before consuming an answer slot
        // Note: JavaScript proxies always receive strings or symbols, never bigint/number
        if (typeof prop !== 'string') {
          return Promise.reject(
            new Error(
              `OCapN GET: Property must be a string, got ${typeof prop}`,
            ),
          );
        }

        // Create a question for the answer
        const {
          internalPromise,
          answerPromise,
          position: answerPosition,
          resolver: resolveMeDesc,
        } = takeNextRemoteAnswer(externalAnswerPromise);

        // Check if the string looks like a non-negative integer (for array index access)
        // JavaScript proxies receive "0", "1", etc. for array-style access like obj[0]
        if (/^(0|[1-9][0-9]*)$/.test(prop)) {
          // op:index for integer index access on Lists (copyArray)
          send({
            type: 'op:index',
            receiverDesc: targetGetter(),
            index: BigInt(prop),
            answerPosition,
          });
        } else {
          // op:get for string field access on Structs (copyRecord)
          send({
            type: 'op:get',
            receiverDesc: targetGetter(),
            fieldName: prop,
            answerPosition,
          });
        }

        // Send op:listen for the answerPromise so B knows how to send the result back
        send({
          type: 'op:listen',
          to: answerPromise,
          resolveMeDesc,
          wantsPartial: false,
        });

        return internalPromise;
      },
      applyFunction(_o, args, externalAnswerPromise) {
        if (didUnplug()) {
          return quietReject(didUnplug());
        }
        logger.info(`applyFunction`, targetGetter(), args);
        return sendDeliver(args, externalAnswerPromise);
      },
      applyFunctionSendOnly(_o, args) {
        if (didUnplug()) {
          return;
        }
        logger.info(`applyFunctionSendOnly`, targetGetter(), args);
        sendDeliverOnly(args);
      },
      applyMethod(_o, prop, args, externalAnswerPromise) {
        if (didUnplug()) {
          return quietReject(didUnplug());
        }
        logger.info(`applyMethod`, targetGetter(), prop, args);
        if (typeof prop !== 'string') {
          throw new Error('OCapN APPLY METHOD: Property must be a string');
        }
        const methodSelector = makeSelector(prop);
        return sendDeliver([methodSelector, ...args], externalAnswerPromise);
      },
      applyMethodSendOnly(_o, prop, args) {
        if (didUnplug()) {
          return;
        }
        logger.info(`applyMethodSendOnly`, targetGetter(), prop, args);
        if (typeof prop !== 'string') {
          throw new Error('OCapN APPLY METHOD: Property must be a string');
        }
        const methodSelector = makeSelector(prop);
        sendDeliverOnly([methodSelector, ...args]);
      },
    });

    return handler;
  };
  return makeHandlerForRemoteReference;
};

/**
 * @param {object} opts
 * @param {MakeRemoteKitForHandler} opts.makeRemoteKitForHandler
 * @param {MakeHandlerForRemoteReference} opts.makeHandlerForRemoteReference
 * @returns {MakeRemoteKit}
 */
const makeMakeRemoteKit = ({
  makeRemoteKitForHandler,
  makeHandlerForRemoteReference,
}) => {
  /** @type {MakeRemoteKit} */
  const makeRemoteKit = targetGetter => {
    const handler = makeHandlerForRemoteReference(targetGetter);
    return makeRemoteKitForHandler(handler);
  };

  return makeRemoteKit;
};

/**
 * @typedef {object} CodecKit
 * @property {(syrupReader: SyrupReader) => any} readOcapnMessage
 * @property {(message: any) => Uint8Array} writeOcapnMessage
 *
 * @param {ReferenceKit} referenceKit
 * @returns {CodecKit}
 */
const makeCodecKit = referenceKit => {
  const descCodecs = makeDescCodecs(referenceKit);
  const passableCodecs = makePassableCodecs(descCodecs);
  const { readOcapnMessage, writeOcapnMessage } = makeOcapnOperationsCodecs(
    descCodecs,
    passableCodecs,
  );
  return {
    readOcapnMessage,
    writeOcapnMessage,
  };
};

/**
 * @param {string} label
 * @param {Logger} logger
 * @param {SessionId} sessionId
 * @param {SturdyRefTracker} sturdyRefTracker
 * @param {ReferenceKit} referenceKit
 * @param {Map<string, any>} giftTable
 * @param {(sessionId: SessionId) => OcapnPublicKey | undefined} getPeerPublicKeyForSessionId
 * @returns {any}
 */
const makeBootstrapObject = (
  label,
  logger,
  sessionId,
  sturdyRefTracker,
  referenceKit,
  giftTable,
  getPeerPublicKeyForSessionId,
) => {
  // The "usedGiftHandoffs" is one per session.
  const usedGiftHandoffs = new Set();
  return Far(`${label}:bootstrap`, {
    /**
     * @param {SwissNum} swissnum
     * @returns {Promise<any>}
     */
    fetch: swissnum => {
      const object = sturdyRefTracker.lookup(swissnum);
      if (!object) {
        const swissnumString = decodeSwissnum(swissnum);
        throw Error(
          `${label}: Bootstrap fetch: Unknown swissnum for sturdyref: ${swissnumString}`,
        );
      }
      return object;
    },
    /**
     * @param {ArrayBufferLike} giftId
     * @param {any} gift
     */
    'deposit-gift': (giftId, gift) => {
      const passStyle = ocapnPassStyleOf(gift);
      if (passStyle !== 'remotable') {
        throw Error(`${label}: Bootstrap deposit-gift: Gift must be remotable`);
      }
      const { isLocal } = referenceKit.getInfoForVal(gift);
      if (!isLocal) {
        throw Error(`${label}: Bootstrap deposit-gift: Gift must be local`);
      }
      const giftKey = `${toHex(sessionId)}:${toHex(giftId)}`;
      logger.info('deposit-gift', { giftKey, gift });
      const pendingGiftKey = `pending:${giftKey}`;
      const promiseKit = giftTable.get(pendingGiftKey);
      if (promiseKit) {
        promiseKit.resolve(gift);
        return;
      }
      if (giftTable.has(giftKey)) {
        throw Error(
          `${label}: Bootstrap deposit-gift: Gift already exists: ${giftId}`,
        );
      }
      giftTable.set(giftKey, gift);
    },
    /**
     * @param {HandoffReceiveSigEnvelope} signedHandoffReceive
     * @returns {any}
     */
    'withdraw-gift': signedHandoffReceive => {
      // We are the exporter.
      // This peer is the receiver.
      // The gifter session is in the HandoffGive.
      logger.info('withdraw-gift', signedHandoffReceive);
      const { object: handoffReceive, signature: handoffReceiveSig } =
        signedHandoffReceive;
      const {
        signedGive,
        receivingSession,
        receivingSide: peerIdFromHandoffReceive,
        handoffCount,
      } = handoffReceive;
      const { object: handoffGive, signature: handoffGiveSig } = signedGive;
      const {
        giftId,
        receiverKey: receiverKeyDataForGifter,
        exporterSessionId: gifterExporterSessionId,
      } = handoffGive;

      // Ensure our peer is the authorized receiver.
      const peerPublicKey = getPeerPublicKeyForSessionId(sessionId);
      if (!peerPublicKey) {
        throw Error(
          `${label}: Bootstrap withdraw-gift: No peer public key for session id: ${toHex(sessionId)}. This should never happen.`,
        );
      }
      const peerIdFromSession = peerPublicKey.id;
      if (
        compareImmutableArrayBuffers(
          peerIdFromSession,
          peerIdFromHandoffReceive,
        ) !== 0
      ) {
        throw Error(
          `${label}: Bootstrap withdraw-gift: Receiver key mismatch for session ${toHex(sessionId)}.\n  peerIdFromSession: ${toHex(peerIdFromSession)}\n  peerIdFromHandoffReceive: ${toHex(peerIdFromHandoffReceive)}`,
        );
      }
      if (compareImmutableArrayBuffers(sessionId, receivingSession) !== 0) {
        throw Error(`${label}: Bootstrap withdraw-gift: Session id mismatch.`);
      }

      // Verify HandoffGive
      const gifterKeyForExporter = getPeerPublicKeyForSessionId(
        gifterExporterSessionId,
      );
      if (!gifterKeyForExporter) {
        throw Error(
          `${label}: Bootstrap withdraw-gift: No session with id: ${toHex(gifterExporterSessionId)}`,
        );
      }
      const handoffGiveIsValid = verifyHandoffGiveSignature(
        handoffGive,
        handoffGiveSig,
        gifterKeyForExporter,
      );
      if (!handoffGiveIsValid) {
        throw Error(`${label}: Bootstrap withdraw-gift: Invalid HandoffGive.`);
      }

      // Verify HandoffReceive
      const receiverKeyForGifter = publicKeyDescriptorToPublicKey(
        receiverKeyDataForGifter,
      );
      const handoffReceiveIsValid = verifyHandoffReceiveSignature(
        handoffReceive,
        handoffReceiveSig,
        receiverKeyForGifter,
      );
      if (!handoffReceiveIsValid) {
        throw Error(
          `${label}: Bootstrap withdraw-gift: Invalid HandoffReceive.`,
        );
      }

      // Check that the gift hasn't already been used.
      if (usedGiftHandoffs.has(handoffCount)) {
        throw Error(
          `${label}: Bootstrap withdraw-gift: Gift handoff already used: ${handoffCount}`,
        );
      }

      // Return the gift or a promise that resolves to the gift.
      const giftKey = `${toHex(gifterExporterSessionId)}:${toHex(giftId)}`;
      const gift = giftTable.get(giftKey);
      logger.info('withdraw-gift', { giftKey, gift, handoffCount });
      if (gift) {
        usedGiftHandoffs.add(handoffCount);
        giftTable.delete(giftKey);
        return gift;
      }
      // If the gift is not in the table, we need to return a promise for its deposit.
      const promiseKit = makePromiseKit();
      const pendingGiftKey = `pending:${giftKey}`;
      giftTable.set(pendingGiftKey, promiseKit);
      return promiseKit.promise;
    },
  });
};

/**
 * **EXPERIMENTAL**: Internal APIs for testing. Subject to change.
 * @typedef {object} OcapnDebug
 * @property {OcapnTable} ocapnTable
 * @property {(message: object) => void} sendMessage
 * @property {(observer: MessageObserver) => () => void} subscribeMessages
 */

/**
 * @typedef {object} Ocapn
 * @property {((reason?: Error) => void)} abort
 * @property {((data: Uint8Array) => void)} dispatchMessageData
 * @property {() => object} getRemoteBootstrap
 * @property {ReferenceKit} referenceKit
 * @property {(message: any) => Uint8Array} writeOcapnMessage
 * @property {OcapnDebug} [_debug] - **EXPERIMENTAL**: Internal APIs for testing. Only present when `debugMode` is true.
 */

/**
 * @param {Logger} logger
 * @param {Connection} connection
 * @param {SessionId} sessionId
 * @param {OcapnLocation} peerLocation
 * @param {(location: OcapnLocation) => Promise<InternalSession>} provideSession
 * @param {((locationId: LocationId) => InternalSession | undefined)} getActiveSession
 * @param {(sessionId: SessionId) => OcapnPublicKey | undefined} getPeerPublicKeyForSessionId
 * @param {() => void} endSession
 * @param {GrantTracker} grantTracker
 * @param {Map<string, any>} giftTable
 * @param {SturdyRefTracker} sturdyRefTracker
 * @param {string} [ourIdLabel]
 * @param {boolean} [enableImportCollection] - If true, imports are tracked with WeakRefs and GC'd when unreachable. Default: true.
 * @param {boolean} [debugMode] - **EXPERIMENTAL**: If true, exposes `_debug` object with internal APIs for testing. Default: false.
 * @returns {Ocapn}
 */
export const makeOcapn = (
  logger,
  connection,
  sessionId,
  peerLocation,
  provideSession,
  getActiveSession,
  getPeerPublicKeyForSessionId,
  endSession,
  grantTracker,
  giftTable,
  sturdyRefTracker,
  ourIdLabel = 'OCapN',
  enableImportCollection = true,
  debugMode = false,
) => {
  const onReject = reason => {
    logger.info(`onReject`, reason);
  };

  /**
   * @param {Error} [reason]
   */
  const abort = reason => {
    logger.info(`client received abort`, reason);
    const disconnectError = harden(
      reason
        ? Error('Session disconnected', { cause: reason })
        : Error('Session disconnected'),
    );
    // Mark as unplugged first so no further messages are sent
    // eslint-disable-next-line no-use-before-define
    doUnplug(disconnectError);
    connection.end();
    // eslint-disable-next-line no-use-before-define
    ocapnTable.destroy(disconnectError);
    // Notify the session manager to immediately end the session.
    // This prevents race conditions where a new connection arrives
    // before the socket 'close' event fires.
    endSession();
  };

  /**
   * @param {any} to The target to invoke. This is at least a locally hosted
   * @param {any[]} args
   * @returns {Promise<unknown>}
   */
  const invokeDeliver = async (to, args) => {
    // We need to resolve the target to an object or function before we can invoke it.
    const resolvedTarget = await Promise.resolve(to);
    // We only apply functions to values with pass-style "remotable".
    const passStyle = ocapnPassStyleOf(resolvedTarget);
    if (passStyle !== 'remotable') {
      throw Error(
        `OCapN: Cannot apply functions to values with pass-style ${passStyle}`,
      );
    }
    // While the to-value must be local (see DeliverTargetCodec), the resolved target may be remote.
    // We only want to apply our implementation's selector -> string method name coercion if the target is local.
    // eslint-disable-next-line no-use-before-define
    const { isLocal } = referenceKit.getInfoForVal(resolvedTarget);
    const targetType = typeof resolvedTarget;
    if (isLocal && targetType === 'object' && resolvedTarget !== null) {
      const [methodName, ...methodArgs] = args;
      // Coerce selector to string for method name. Note: This is a deviation from the spec.
      const methodNameString =
        typeof methodName === 'string'
          ? methodName
          : getSelectorName(methodName);
      return HandledPromise.applyMethod(
        resolvedTarget,
        methodNameString,
        methodArgs,
      );
    } else {
      return HandledPromise.applyFunction(resolvedTarget, args);
    }
  };

  const fulfillRemoteResolverWithPromise = (resolveMeDesc, promise) => {
    // Use E.sendOnly since we don't need a response from fulfill/break calls.
    // This sends via op:deliver-only
    Promise.resolve(promise).then(
      val => {
        E.sendOnly(resolveMeDesc).fulfill(val);
      },
      reason => {
        E.sendOnly(resolveMeDesc).break(reason);
      },
    );
  };

  const ocapnSystemMessageHandler = harden({
    'op:deliver': message => {
      const { to, answerPosition, args, resolveMeDesc } = message;
      logger.info(`deliver`, { to, toType: typeof to, args, answerPosition });

      const deliverPromise = invokeDeliver(to, args);
      // Answer with our handled promise
      if (answerPosition !== false) {
        // eslint-disable-next-line no-use-before-define
        referenceKit.makeLocalAnswerPromiseAndFulfill(
          answerPosition,
          deliverPromise,
        );
      }

      fulfillRemoteResolverWithPromise(resolveMeDesc, deliverPromise);
    },
    'op:deliver-only': message => {
      const { to, args } = message;
      logger.info(`deliver-only`, { to, toType: typeof to, args });

      const deliverPromise = invokeDeliver(to, args);

      // Add context and pass the error to the reject handler.
      deliverPromise.catch(cause => {
        const err = Error('OCapN: Error during deliver-only', { cause });
        onReject(err);
      });
    },
    'op:listen': message => {
      // There is a "wantsPartial" option, but we don't support it yet.
      const { to: listenTarget, resolveMeDesc } = message;
      if (!(listenTarget instanceof Promise)) {
        throw Error(`OCapN: Expected a promise, got ${listenTarget}`);
      }
      fulfillRemoteResolverWithPromise(resolveMeDesc, listenTarget);
    },
    'op:get': message => {
      const { receiverDesc, fieldName, answerPosition } = message;
      logger.info(`get`, { receiverDesc, fieldName, answerPosition });

      // Create a promise for the field value
      const getPromise = Promise.resolve(receiverDesc).then(resolved => {
        // Check that the resolved value is a copyRecord
        const passStyle = ocapnPassStyleOf(resolved);
        if (passStyle !== 'copyRecord') {
          throw Error(
            `OCapN: Cannot get fields from values with pass-style ${passStyle}`,
          );
        }

        // Check if the field exists
        if (!Object.hasOwn(resolved, fieldName)) {
          throw Error(`Field '${fieldName}' not found on record`);
        }

        // Return the field value
        return Reflect.get(resolved, fieldName);
      });

      // eslint-disable-next-line no-use-before-define
      referenceKit.makeLocalAnswerPromiseAndFulfill(answerPosition, getPromise);
    },
    'op:index': message => {
      const { receiverDesc, index, answerPosition } = message;
      logger.info(`index`, { receiverDesc, index, answerPosition });

      // Create a promise for the indexed value
      const indexPromise = Promise.resolve(receiverDesc).then(resolved => {
        // Reject for unsupported index types (bigint/number) before consuming an answer slot
        if (typeof index !== 'bigint') {
          return Promise.reject(
            new Error(
              `OCapN INDEX: Index must be a bigint, got ${typeof index}`,
            ),
          );
        }

        // Check that the resolved value is a copyArray (List)
        const passStyle = ocapnPassStyleOf(resolved);
        if (passStyle !== 'copyArray') {
          throw Error(
            `OCapN: Cannot index into values with pass-style ${passStyle}`,
          );
        }
        if (!Array.isArray(resolved)) {
          throw Error(`OCapN: Cannot index into non-array values`);
        }

        // Check if the index is within bounds
        if (index < ZERO_N || index >= resolved.length) {
          throw Error(
            `Index ${index} out of bounds for array of length ${resolved.length}`,
          );
        }

        // Return the value at the index
        return Reflect.get(resolved, index.toString());
      });

      // eslint-disable-next-line no-use-before-define
      referenceKit.makeLocalAnswerPromiseAndFulfill(
        answerPosition,
        indexPromise,
      );
    },
    'op:untag': message => {
      const { receiverDesc, tag, answerPosition } = message;
      logger.info(`untag`, { receiverDesc, tag, answerPosition });

      // Create a promise for the untagged value
      const untagPromise = Promise.resolve(receiverDesc).then(resolved => {
        // Check that the resolved value is a tagged value
        const passStyle = ocapnPassStyleOf(resolved);
        if (passStyle !== 'tagged') {
          throw Error(
            `OCapN: Cannot untag values with pass-style ${passStyle}`,
          );
        }

        // Check that the tag matches
        const actualTag = resolved[Symbol.toStringTag];
        if (actualTag !== tag) {
          throw Error(
            `OCapN: Tag mismatch: expected '${tag}', got '${actualTag}'`,
          );
        }

        // Return the payload
        return resolved.payload;
      });

      // eslint-disable-next-line no-use-before-define
      referenceKit.makeLocalAnswerPromiseAndFulfill(
        answerPosition,
        untagPromise,
      );
    },
    'op:gc-export': message => {
      const { exportPosition, wireDelta } = message;
      logger.info(`gc-export (${exportPosition})`, {
        exportPosition,
        wireDelta,
      });
      // eslint-disable-next-line no-use-before-define
      const value = referenceKit.provideLocalExportValue(exportPosition);
      // eslint-disable-next-line no-use-before-define
      const slot = ocapnTable.getSlotForValue(value);
      if (slot === undefined) {
        return;
      }
      // eslint-disable-next-line no-use-before-define
      ocapnTable.dropSlot(slot, Number(wireDelta));
    },
    'op:gc-answer': message => {
      const { answerPosition } = message;
      logger.info(`gc-answer (${answerPosition})`, { answerPosition });
      const slot = makeSlot('a', true, answerPosition);
      // eslint-disable-next-line no-use-before-define
      ocapnTable.dropSlot(slot, 1);
    },
    'op:abort': message => {
      const { reason } = message;
      abort(reason);
    },
  });

  /**
   * @param {Record<string, any>} message
   */
  const dispatchMessage = message => {
    const fn = ocapnSystemMessageHandler[message.type];
    if (!fn) {
      throw Error(`Unknown message type: ${message.type}`);
    }
    fn(message);
  };

  const {
    dispatch,
    send,
    quietReject,
    didUnplug,
    doUnplug,
    subscribeMessages,
  } = makeOcapnCommsKit({
    logger,
    onReject,
    rawDispatch: dispatchMessage,
    // eslint-disable-next-line no-use-before-define
    rawSend: serializeAndSendMessage,
    // eslint-disable-next-line no-use-before-define
    clearPendingRefCounts: () => ocapnTable.clearPendingRefCounts(),
    // eslint-disable-next-line no-use-before-define
    commitSentRefCounts: () => ocapnTable.commitSentRefCounts(),
  });

  const makeRemoteKitForHandler = makeMakeRemoteKitForHandler({
    logger,
    quietReject,
  });

  const makeHandlerForRemoteReference = makeMakeHandlerForRemoteReference({
    logger,
    send,
    didUnplug,
    quietReject,
    takeNextRemoteAnswer: externalAnswerPromise =>
      // eslint-disable-next-line no-use-before-define
      referenceKit.takeNextRemoteAnswer(externalAnswerPromise),
  });

  const makeRemoteKit = makeMakeRemoteKit({
    makeRemoteKitForHandler,
    makeHandlerForRemoteReference,
  });

  const eagerlySubscribeToRemotePromise = promise => {
    const resolveMeDesc =
      // eslint-disable-next-line no-use-before-define
      referenceKit.makeLocalResolverForRemotePromise(promise);
    send({
      type: 'op:listen',
      to: promise,
      resolveMeDesc,
      wantsPartial: false,
    });
  };

  const importHook = (val, slot) => {
    logger.info(`imported`, slot, val);
    const grantDetails = makeGrantDetails(peerLocation, slot);
    grantTracker.recordImport(val, grantDetails);
    const { type, isLocal } = parseSlot(slot);
    // Only subscribe to promises, not questions.
    if (!isLocal && type === 'p') {
      eagerlySubscribeToRemotePromise(val);
    }
  };

  const exportHook = (val, slot) => {
    logger.info(`exported`, slot, val);
  };

  const slotCollectedHook = (slot, refcount) => {
    // Ignore if the session has been unplugged.
    if (didUnplug()) {
      return;
    }

    const { type, isLocal, position } = parseSlot(slot);
    logger.info(`slotCollected`, slot, refcount, { type, isLocal, position });

    // Only send GC for remote (imported) slots.
    // This should never be called for local slots, but just for sanity.
    if (isLocal) {
      return;
    }

    if (type === 'o' || type === 'p') {
      // Remote object or promise - tell peer to decrement export refcount
      send({
        type: 'op:gc-export',
        exportPosition: position,
        wireDelta: BigInt(refcount),
      });
    } else if (type === 'a') {
      // Remote answer - tell peer they can GC the answer
      send({
        type: 'op:gc-answer',
        answerPosition: position,
      });
    }
  };

  const ocapnTable = makeOcapnTable({
    importHook,
    exportHook,
    onSlotCollected: slotCollectedHook,
    enableImportCollection,
  });

  /** @type {MakeHandoff} */
  const makeHandoff = signedGive => {
    // We are the Receiver.
    // This peer is the Gifter.
    // The Exporter is specified by location in the HandoffGive.
    const gifterLocation = peerLocation;
    const {
      object: { exporterLocation },
    } = signedGive;
    return HandledPromise.resolve(
      (async () => {
        const [receiverGifterSession, receiverExporterSession] =
          await Promise.all([
            provideSession(gifterLocation),
            provideSession(exporterLocation),
          ]);
        const {
          ocapn,
          id: receiverExporterSessionId,
          self: { keyPair: receiverKeyForExporter },
        } = receiverExporterSession;
        const receiverPeerIdForExporter = receiverKeyForExporter.publicKey.id;
        const {
          self: { keyPair: receiverGifterKey },
        } = receiverGifterSession;
        const bootstrap = ocapn.getRemoteBootstrap();
        const handoffCount = receiverExporterSession.takeNextHandoffCount();
        // Make the HandoffReceive descriptor
        const handoffReceive = makeHandoffReceiveDescriptor(
          signedGive,
          handoffCount,
          receiverExporterSessionId,
          receiverPeerIdForExporter,
        );
        const signature = signHandoffReceive(handoffReceive, receiverGifterKey);
        const signedHandoffReceive = makeHandoffReceiveSigEnvelope(
          handoffReceive,
          signature,
        );
        return E(bootstrap)['withdraw-gift'](signedHandoffReceive);
      })(),
    );
  };

  /** @type {SendHandoff} */
  const sendHandoff = handoffGiveDetails => {
    // We are the gifter.
    // This peer is the receiver.
    // The receiver location is in the grant details.
    const receiverLocation = peerLocation;
    const { value, grantDetails } = handoffGiveDetails;
    const { location: exporterLocation } = grantDetails;
    const exporterLocationId = locationToLocationId(exporterLocation);
    const gifterExporterSession = getActiveSession(exporterLocationId);
    if (gifterExporterSession === undefined) {
      throw Error(
        `OCapN: No active session for exporter location: ${exporterLocation}`,
      );
    }
    const receiverLocationId = locationToLocationId(receiverLocation);
    const gifterReceiverSession = getActiveSession(receiverLocationId);
    if (gifterReceiverSession === undefined) {
      throw Error(
        `OCapN: No active session for receiver location: ${receiverLocation}`,
      );
    }
    const {
      self: { keyPair: gifterKeyForExporter },
      id: gifterExporterSessionId,
    } = gifterExporterSession;
    const {
      peer: { publicKey: receiverPublicKeyForGifter },
    } = gifterReceiverSession;
    const gifterSideId = gifterExporterSession.self.keyPair.publicKey.id;
    const giftId = randomGiftId();
    const signedHandoffGive = makeSignedHandoffGive(
      receiverPublicKeyForGifter,
      exporterLocation,
      gifterExporterSessionId,
      gifterSideId,
      giftId,
      gifterKeyForExporter,
    );
    // eslint-disable-next-line no-use-before-define
    sendDepositGift(gifterExporterSession, giftId, value);
    return signedHandoffGive;
  };

  const sendDepositGift = (session, giftId, gift) => {
    const { ocapn } = session;
    const bootstrap = ocapn.getRemoteBootstrap();
    const promise = E(bootstrap)['deposit-gift'](giftId, gift);
    // Log but don't handle the error.
    promise.catch(error => {
      logger.error(`sendDepositGift error`, error);
    });
  };

  const referenceKit = makeReferenceKit(
    logger,
    peerLocation,
    ocapnTable,
    grantTracker,
    sturdyRefTracker,
    makeRemoteKit,
    makeHandoff,
    sendHandoff,
  );

  const { readOcapnMessage, writeOcapnMessage } = makeCodecKit(referenceKit);

  function serializeAndSendMessage(message) {
    try {
      const bytes = writeOcapnMessage(message);
      connection.write(bytes);
    } catch (error) {
      logger.info(`Message serialization error`, error);
      throw error;
    }
  }

  /**
   * @param {Uint8Array} data
   */
  const dispatchMessageData = data => {
    const syrupReader = makeSyrupReader(data);
    while (syrupReader.index < data.length) {
      let message;
      const start = syrupReader.index;
      try {
        ocapnTable.clearPendingRefCounts();
        message = readOcapnMessage(syrupReader);
        // Tell the engine message deserialization has completed.
        ocapnTable.commitReceivedRefCounts();
      } catch (err) {
        // Tell the engine message deserialization has failed.
        ocapnTable.clearPendingRefCounts();
        const problematicBytes = data.slice(start);
        const syrupMessage = decodeSyrup(problematicBytes);
        logger.error(`Message decode error:`);
        logger.error(
          JSON.stringify(
            syrupMessage,
            (key, value) => (typeof value === 'bigint' ? `${value}n` : value),
            2,
          ),
        );
        connection.end();
        throw err;
      }
      dispatch(message);
    }
  };

  const localBootstrapSlot = makeSlot('o', true, ZERO_N);
  const bootstrapObj = makeBootstrapObject(
    ourIdLabel,
    logger,
    sessionId,
    sturdyRefTracker,
    referenceKit,
    giftTable,
    getPeerPublicKeyForSessionId,
  );
  ocapnTable.registerSlot(localBootstrapSlot, bootstrapObj);

  const remoteBootstrap = referenceKit.provideRemoteBootstrapValue();
  const getRemoteBootstrap = () => {
    return remoteBootstrap;
  };

  /** @type {Ocapn} */
  const ocapn = {
    abort,
    dispatchMessageData,
    getRemoteBootstrap,
    writeOcapnMessage,
    referenceKit,
  };
  if (debugMode) {
    // eslint-disable-next-line no-underscore-dangle
    ocapn._debug = {
      ocapnTable,
      sendMessage: send,
      subscribeMessages,
    };
  }
  return harden(ocapn);
};
