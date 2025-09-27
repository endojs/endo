// @ts-check

/** @import {RemoteKit, Settler} from '@endo/eventual-send' */
/** @import {RemotableObject} from '@endo/marshal' */
/** @import {CapTPSlot} from '../captp/types.js' */

/**
 * @import { CapTPEngine } from '../captp/captp-engine.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { HandoffGive, HandoffGiveSigEnvelope, HandoffReceiveSigEnvelope } from '../codecs/descriptors.js'
 * @import { SyrupReader } from '../syrup/decode.js'
 * @import { Client, Connection, LocationId, Logger, Session } from './types.js'
 */

/** @typedef {import('../cryptography.js').OcapnPublicKey} OcapnPublicKey */

import { E, HandledPromise } from '@endo/eventual-send';
import { Far, Remotable } from '@endo/marshal';
import { makePromiseKit } from '@endo/promise-kit';
import { makeCapTPEngine } from '../captp/captp-engine.js';
import {
  makeDescCodecs,
  makeWithdrawGiftDescriptor,
  serializeHandoffGive,
  serializeHandoffReceive,
} from '../codecs/descriptors.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { makePassableCodecs } from '../codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../codecs/operations.js';
import { getSelectorName, makeSelector } from '../pass-style-helpers.js';
import { decodeSyrup } from '../syrup/js-representation.js';
import { decodeSwissnum, locationToLocationId, toHex } from './util.js';
import {
  makePublicKeyId,
  publicKeyDataToPublicKey,
  publicKeyToPublicKeyData,
  randomGiftId,
} from '../cryptography.js';
import { compareByteArrays } from '../syrup/compare.js';
/**
 * @typedef {OcapnFarObject<{resolve: (value: any) => void, break: (reason: any) => void}>} LocalResolver
 * @typedef {(questionSlot: CapTPSlot, ownerLabel?: string) => LocalResolver} MakeLocalResolver
 * @typedef {(slot: CapTPSlot) => RemotableObject<"Alleged: Resolver">} MakeRemoteResolver
 * @typedef {(node: OcapnLocation, swissNum: Uint8Array) => Promise<any>} MakeRemoteSturdyRef
 * @typedef {(signedGive: HandoffGiveSigEnvelope) => Promise<any>} MakeHandoff
 * @typedef {(nodeLocation: OcapnLocation, swissNum: Uint8Array) => any} GetRemoteSturdyRef
 * @typedef {Record<string, any>} Handler
 * @typedef {'object' | 'promise' | 'question'} SlotType
 */

const sink = harden(() => {});

/**
 * @param {string} slot
 * @returns {bigint}
 */
const slotToPosition = slot => {
  const position = slot.slice(2);
  return BigInt(position);
};

/**
 * @param {string} label
 * @param {object} object
 * @returns {any}
 * In OCapN, objects are represented by functions that are called with a
 * selector representing the method name as the first argument.
 */
const OcapnFarObject = (label, object) => {
  harden(object);
  return Far(`${label}:object`, (selector, ...args) => {
    const methodName = getSelectorName(selector);
    const method = object[methodName];
    if (!method) {
      throw Error(`Unknown method: ${methodName}`);
    }
    return method.apply(object, args);
  });
};

/**
 * @param {string} label
 * @param {any} object
 * @returns {any}
 */
export const OcapnFar = (label, object) => {
  if (typeof object === 'function') {
    return Far(label, object);
  }
  return OcapnFarObject(label, object);
};

/**
 * @typedef {object} MakeOcapnCommsKitOptions
 * @property {Logger} logger
 * @property {(sendStats: Record<string, number>, recvStats: Record<string, number>) => (message: any) => void} makeDispatch
 * @property {(reason?: any) => void} onReject
 * @property {(message: any) => void} rawSend
 * @property {() => void} commitSendSlots
 */

/**
 * @typedef {object} OcapnCommsKit
 * @property {(message: any) => void} dispatch
 * @property {(message: any) => void} send
 * @property {(reason?: any) => void} abort
 * @property {(reason?: any) => void} quietReject
 * @property {() => boolean} didUnplug
 * @property {() => void} doUnplug
 * @property {Record<string, number>} sendStats
 * @property {Record<string, number>} recvStats
 */

/**
 * @param {MakeOcapnCommsKitOptions} opts
 * @returns {OcapnCommsKit}
 */
const makeOcapnCommsKit = ({
  logger,
  makeDispatch,
  onReject,
  rawSend,
  commitSendSlots,
}) => {
  /** @type {Record<string, number>} */
  const sendStats = {};
  /** @type {Record<string, number>} */
  const recvStats = {};

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
   * @param {Record<string, any>} obj
   */
  const send = obj => {
    sendStats[obj.type] = (sendStats[obj.type] || 0) + 1;
    commitSendSlots();

    // Don't throw here if unplugged, just don't send.
    if (unplugError !== false) {
      return;
    }

    // Actually send the message.
    Promise.resolve(rawSend(obj))
      // eslint-disable-next-line no-use-before-define
      .catch(abort); // Abort if rawSend returned a rejection.
  };

  // Return a dispatch function.
  const dispatch = makeDispatch(sendStats, recvStats);

  // Abort a connection.
  const abort = (reason = undefined) => {
    logger.info('abort', reason);
    doUnplug(reason);
  };

  // Can't harden stats.
  return {
    dispatch,
    send,
    abort,
    quietReject,
    didUnplug,
    doUnplug,
    sendStats,
    recvStats,
  };
};

/**
 * @param {OcapnLocation} location
 * @param {CapTPSlot} slot
 * @param {'handoff' | 'sturdy-ref'} type
 * @param {Uint8Array} [swissNum]
 * @returns {GrantDetails}
 */
export const makeGrantDetails = (
  location,
  slot,
  type = 'handoff',
  swissNum = undefined,
) => {
  if (type !== 'handoff' && type !== 'sturdy-ref') {
    throw Error(`Invalid grant type: ${type}`);
  }
  if (type === 'sturdy-ref' && !swissNum) {
    throw Error('Sturdy ref must have a swiss num');
  }
  if (type === 'handoff' && swissNum) {
    throw Error('Handoff must not have a swiss num');
  }
  return harden({ location, slot, type, swissNum });
};

/**
 * @typedef {object} GrantDetails
 * @property {OcapnLocation} location
 * @property {CapTPSlot} slot
 * @property {'handoff' | 'sturdy-ref'} type
 * @property {Uint8Array} [swissNum]
 *
 * @typedef {object} HandoffGiveDetails
 * @property {any} value
 * @property {GrantDetails} grantDetails
 *
 * @typedef {object} GrantTracker
 * @property {(remotable: RemotableObject, grantDetails: GrantDetails) => void} recordImport
 * @property {(remotable: RemotableObject) => GrantDetails | undefined} getGrantDetails
 *
 * @returns {GrantTracker}
 */
export const makeGrantTracker = () => {
  /** @type {WeakMap<RemotableObject, GrantDetails>} */
  const remotableToGrant = new WeakMap();
  return harden({
    recordImport: (remotable, grantDetails) => {
      const existingGrant = remotableToGrant.get(remotable);
      if (existingGrant) {
        const oldGrantType = existingGrant.type;
        const newGrantType = grantDetails.type;
        if (oldGrantType !== 'handoff' || newGrantType !== 'sturdy-ref') {
          throw Error(
            `Invalid grant type transition: ${oldGrantType} -> ${newGrantType}`,
          );
        }
      }
      remotableToGrant.set(remotable, grantDetails);
    },
    getGrantDetails: remotable => {
      return remotableToGrant.get(remotable);
    },
  });
};

/**
 * @typedef {(handler: Handler) => RemoteKit} MakeRemoteKitForHandler
 * Makes a HandledPromise and settler for the given handler
 * @typedef {(targetSlot: CapTPSlot, mode?: 'deliver' | 'deliver-only') => Handler} MakeHandlerForRemoteReference
 * Makes a HandledPromise handler for the given target and mode
 * @typedef {(targetSlot: CapTPSlot, mode?: 'deliver' | 'deliver-only') => RemoteKit} MakeRemoteKit
 * Make a HandledPromise and settler that sends op:deliver to the `targetSlot`
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
 * @param {() => [CapTPSlot, Promise<any>]} opts.makeQuestion
 * @param {((obj: Record<string, any>) => void)} opts.send
 * @param {(slot: CapTPSlot) => any} opts.getValForSlot
 * @param {MakeLocalResolver} opts.makeLocalResolver
 * @returns {MakeHandlerForRemoteReference}
 */
const makeMakeHandlerForRemoteReference = ({
  logger,
  send,
  didUnplug,
  quietReject,
  makeQuestion,
  getValForSlot,
  makeLocalResolver,
}) => {
  const makeHandlerForRemoteReference = (targetSlot, mode = 'deliver') => {
    const sendDeliver = args => {
      if (mode === 'deliver-only') {
        send({
          type: 'op:deliver-only',
          to: getValForSlot(targetSlot),
          args: harden(args),
        });
        return Promise.resolve();
      } else if (mode === 'deliver') {
        const [questionSlot, promise] = makeQuestion();
        const answerPosition = slotToPosition(questionSlot);
        const resolveMeDesc = makeLocalResolver(questionSlot);
        send({
          type: 'op:deliver',
          to: getValForSlot(targetSlot),
          args: harden(args),
          answerPosition,
          resolveMeDesc,
        });
        return promise;
      } else {
        throw new Error(`OCapN APPLY FUNCTION: Invalid mode: ${mode}`);
      }
    };

    /**
     * This handler is set up such that it will transform both
     * attribute access and method invocation of this remote promise
     * as also being questions / remote handled promises
     *
     * @type {import('@endo/eventual-send').EHandler<{}>}
     */
    const handler = harden({
      get(_o, prop) {
        if (didUnplug() !== false) {
          return quietReject(didUnplug());
        }
        throw new Error('OCapN GET: Not implemented');
      },
      applyFunction(_o, args) {
        if (didUnplug() !== false) {
          return quietReject(didUnplug());
        }
        logger.info(`applyFunction`, targetSlot, args);
        return sendDeliver(args);
      },
      applyMethod(_o, prop, args) {
        if (didUnplug() !== false) {
          return quietReject(didUnplug());
        }
        logger.info(`applyMethod`, targetSlot, prop, args);
        // eslint-disable-next-line no-use-before-define
        if (typeof prop !== 'string') {
          throw new Error('OCapN APPLY METHOD: Property must be a string');
        }
        const methodSelector = makeSelector(prop);
        return sendDeliver([methodSelector, ...args]);
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
  const makeRemoteKit = (targetSlot, mode = 'deliver') => {
    const handler = makeHandlerForRemoteReference(targetSlot, mode);
    return makeRemoteKitForHandler(handler);
  };

  return makeRemoteKit;
};

/**
 * @typedef {object} CodecKit
 * @property {(syrupReader: SyrupReader) => any} readOcapnMessage
 * @property {(message: any) => Uint8Array} writeOcapnMessage
 *
 * @param {TableKit} tableKit
 * @returns {CodecKit}
 */
const makeCodecKit = tableKit => {
  const descCodecs = makeDescCodecs(tableKit);
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

/** @type {Record<string, SlotType>} */
const slotTypes = harden({
  o: 'object',
  p: 'promise',
  q: 'question',
});

/**
 * @typedef {object} ValInfo
 * @property {bigint} position
 * @property {CapTPSlot} slot
 * @property {SlotType} type
 * @property {boolean} isLocal
 * @property {boolean} isThirdParty
 * @property {GrantDetails} [grantDetails]
 *
 * @typedef {object} TableKit
 * @property {(value: any) => bigint} convertRemoteValToPosition
 * @property {(value: any) => bigint} convertRemotePromiseToPosition
 * @property {(value: any) => bigint} convertLocalValToPosition
 * @property {(value: any) => bigint} convertLocalPromiseToPosition
 * @property {(value: any) => bigint} positionForRemoteAnswer
 * @property {(position: bigint) => any} convertPositionToRemoteVal
 * @property {(position: bigint) => any} provideRemotePromise
 * @property {(position: bigint) => any} convertPositionToLocal
 * @property {(position: bigint) => any} convertPositionToLocalPromise
 * @property {(position: bigint) => any} provideRemoteResolver
 * @property {(position: bigint) => any} provideLocalAnswer
 * @property {(nodeLocation: OcapnLocation, swissNum: Uint8Array) => Promise<any>} provideSturdyRef
 * @property {(signedGive: HandoffGiveSigEnvelope) => Promise<any>} provideHandoff
 * @property {(value: any) => ValInfo} getInfoForVal
 * @property {(handoffGiveDetails: HandoffGiveDetails) => HandoffGiveSigEnvelope} sendHandoff
 */

/**
 * @param {OcapnLocation} peerLocation
 * @param {CapTPEngine} engine
 * @param {MakeRemoteResolver} makeRemoteResolver
 * @param {MakeRemoteSturdyRef} makeRemoteSturdyRef
 * @param {MakeHandoff} makeHandoff
 * @param {GrantTracker} grantTracker
 * @param {((locationId: LocationId) => Session | undefined)} getActiveSession
 * @param {(session: Session, giftId: Uint8Array, value: any) => void} sendDepositGift
 * @returns {TableKit}
 */
export const makeTableKit = (
  peerLocation,
  engine,
  makeRemoteResolver,
  makeRemoteSturdyRef,
  makeHandoff,
  grantTracker,
  getActiveSession,
  sendDepositGift,
) => {
  const convertValToPosition = val => {
    const slot = engine.convertValToSlot(val);
    return slotToPosition(slot);
  };
  /** @type {TableKit} */
  const tableKit = {
    convertRemoteValToPosition: convertValToPosition,
    convertRemotePromiseToPosition: convertValToPosition,
    convertLocalValToPosition: convertValToPosition,
    convertLocalPromiseToPosition: convertValToPosition,
    convertPositionToRemoteVal: position => {
      const slot = `o-${position}`;
      return engine.convertSlotToVal(slot);
    },
    provideRemotePromise: position => {
      const slot = `p-${position}`;
      return engine.convertSlotToVal(slot);
    },
    convertPositionToLocal: position => {
      // OCapN has a shared id space for promises and objects.
      // We don't have enough context to know which it is, so we
      // just try both.
      const promSlot = `p+${position}`;
      const promVal = engine.getExport(promSlot);
      if (promVal) {
        return promVal;
      }
      const objSlot = `o+${position}`;
      const objVal = engine.getExport(objSlot);
      if (objVal) {
        return objVal;
      }
      throw new Error(`OCapN: No value found for position: ${position}`);
    },
    convertPositionToLocalPromise: position => {
      const slot = `p+${position}`;
      return engine.convertSlotToVal(slot);
    },
    provideLocalAnswer: position => {
      const slot = `q-${position}`;
      const answer = engine.getAnswer(slot);
      if (!answer) {
        throw new Error(`OCapN: No answer found for position: ${position}`);
      }
      return answer;
    },
    positionForRemoteAnswer: value => {
      const slot = engine.convertValToSlot(value);
      const position = slotToPosition(slot);
      return position;
    },
    provideRemoteResolver: position => {
      const slot = `o-${position}`;
      let resolver = engine.getImport(slot);
      if (!resolver) {
        resolver = makeRemoteResolver(slot);
      }
      return resolver;
    },
    provideSturdyRef: (nodeLocation, swissNum) => {
      return makeRemoteSturdyRef(nodeLocation, swissNum);
    },
    provideHandoff: signedGive => {
      return makeHandoff(signedGive);
    },
    getInfoForVal: val => {
      const grantDetails = grantTracker.getGrantDetails(val);
      if (grantDetails) {
        // This is a grant, either imported from this location or exported from another.
        const { location, slot } = grantDetails;
        const isThirdParty = location !== peerLocation;
        const position = slotToPosition(slot);
        const type = slotTypes[slot[0]];
        const isLocal = slot[1] === '+';
        if (isLocal !== false) {
          throw Error(`OCapN: Unexpected local slot for grant: ${slot}`);
        }
        return { position, type, isLocal, slot, isThirdParty, grantDetails };
      } else {
        // This is an export
        const slot = engine.convertValToSlot(val);
        const isThirdParty = false;
        const position = slotToPosition(slot);
        const type = slotTypes[slot[0]];
        const isLocal = slot[1] === '+';
        if (isLocal !== true) {
          throw Error(`OCapN: Unexpected non-local slot for export: ${slot}`);
        }
        return { position, type, isLocal, slot, isThirdParty };
      }
    },
    sendHandoff: handoffGiveDetails => {
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
      const gifterSideId = makePublicKeyId(
        gifterExporterSession.self.keyPair.publicKey,
      );
      const giftId = randomGiftId();
      /** @type {HandoffGive} */
      const handoffGive = {
        type: 'desc:handoff-give',
        receiverKey: publicKeyToPublicKeyData(receiverPublicKeyForGifter),
        exporterLocation,
        exporterSessionId: gifterExporterSessionId,
        gifterSideId,
        giftId,
      };
      const giveBytes = serializeHandoffGive(handoffGive);
      /** @type {HandoffGiveSigEnvelope} */
      const signedHandoffGive = {
        type: 'desc:sig-envelope',
        object: handoffGive,
        signature: gifterKeyForExporter.sign(giveBytes),
      };
      sendDepositGift(gifterExporterSession, giftId, value);
      return signedHandoffGive;
    },
  };
  return tableKit;
};

/**
 * @param {string} label
 * @param {Logger} logger
 * @param {Uint8Array} sessionId
 * @param {Map<string, any>} swissnumTable
 * @param {Map<string, any>} giftTable
 * @param {(sessionId: Uint8Array) => OcapnPublicKey | undefined} getPeerPublicKeyForSessionId
 * @returns {any}
 */
const makeBootstrapObject = (
  label,
  logger,
  sessionId,
  swissnumTable,
  giftTable,
  getPeerPublicKeyForSessionId,
) => {
  // The "usedGiftHandoffs" is one per session.
  const usedGiftHandoffs = new Set();
  return OcapnFar(`${label}:bootstrap`, {
    /**
     * @param {Uint8Array} swissnum
     * @returns {Promise<any>}
     */
    fetch: swissnum => {
      const swissnumString = decodeSwissnum(swissnum);
      const object = swissnumTable.get(swissnumString);
      if (!object) {
        throw Error(
          `${label}: Bootstrap fetch: Unknown swissnum for sturdyref: ${swissnumString}`,
        );
      }
      return object;
    },
    /**
     * @param {Uint8Array} giftId
     * @param {any} gift
     */
    'deposit-gift': (giftId, gift) => {
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
      // Ideally we should verify the gift is local.
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
        receivingSide: receiverKeyForExporter,
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
      if (
        compareByteArrays(peerPublicKey.bytes, receiverKeyForExporter) !== 0
      ) {
        throw Error(
          `${label}: Bootstrap withdraw-gift: Receiver key mismatch.`,
        );
      }
      if (compareByteArrays(sessionId, receivingSession) !== 0) {
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
      const handoffGiveBytes = serializeHandoffGive(handoffGive);
      const handoffGiveIsValid = gifterKeyForExporter.verify(
        handoffGiveBytes,
        handoffGiveSig,
      );
      if (!handoffGiveIsValid) {
        throw Error(`${label}: Bootstrap withdraw-gift: Invalid HandoffGive.`);
      }

      // Verify HandoffReceive
      const handoffReceiveBytes = serializeHandoffReceive(handoffReceive);
      const receiverKeyForGifter = publicKeyDataToPublicKey(
        receiverKeyDataForGifter,
      );
      const handoffReceiveIsValid = receiverKeyForGifter.verify(
        handoffReceiveBytes,
        handoffReceiveSig,
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
 * @typedef {object} Ocapn
 * @property {((reason?: any) => void)} abort
 * @property {((data: Uint8Array) => void)} dispatchMessageData
 * @property {() => Promise<any>} getBootstrap
 * @property {CapTPEngine} engine
 */

/**
 * @param {Logger} logger
 * @param {Connection} connection
 * @param {Uint8Array} sessionId
 * @param {OcapnLocation} peerLocation
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {((locationId: LocationId) => Session | undefined)} getActiveSession
 * @param {(sessionId: Uint8Array) => OcapnPublicKey | undefined} getPeerPublicKeyForSessionId
 * @param {GrantTracker} grantTracker
 * @param {Map<string, any>} swissnumTable
 * @param {Map<string, any>} giftTable
 * @param {string} [ourIdLabel]
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
  grantTracker,
  swissnumTable,
  giftTable,
  ourIdLabel = 'OCapN',
) => {
  const commitSendSlots = () => {
    logger.info(`commitSendSlots`);
  };

  const onReject = reason => {
    logger.info(`onReject`, reason);
  };

  const abort = reason => {
    logger.info(`client received abort`, reason);
    connection.end();
  };

  const handler = {
    'op:deliver': message => {
      const { to, answerPosition, args, resolveMeDesc } = message;
      const hp = HandledPromise.applyFunction(to, args);
      // Answer with our handled promise
      if (answerPosition) {
        const answerSlot = `q-${answerPosition}`;
        // eslint-disable-next-line no-use-before-define
        engine.resolveAnswer(answerSlot, hp);
      }
      logger.info(`deliver`, { to, args, answerPosition });

      // This could probably just be `E(resolveMeDesc).fulfill(hp)`
      // which should handle rejections. But might be more overhead
      // on the wire.

      const processResult = (isReject, value) => {
        if (isReject) {
          logger.info(`dispatch op:deliver result reject`, value);
          E(resolveMeDesc).break(value);
        } else {
          logger.info(`dispatch op:deliver result resolve`, value);
          E(resolveMeDesc).fulfill(value);
        }
      };

      hp
        // Process this handled promise method's result when settled.
        .then(
          fulfilment => processResult(false, fulfilment),
          reason => processResult(true, reason),
        )
        //   // Propagate internal errors as rejections.
        //   .catch(reason => processResult(true, reason));
        .catch(reason => {
          logger.info(`dispatch op:deliver result error`, reason);
        });
    },
    'op:deliver-only': message => {
      const { to, args } = message;
      const hp = HandledPromise.applyFunction(to, args);
      // Add context and pass the error to the reject handler.
      hp.catch(cause => {
        const err = new Error('OCapN: Error during deliver-only');
        err.cause = cause;
        onReject(err);
      });
    },
    'op:listen': message => {
      // TODO: Handle "wantsPartial".
      const { to, resolveMeDesc } = message;
      Promise.resolve(to).then(
        val => {
          E(resolveMeDesc).fulfill(val);
        },
        reason => {
          E(resolveMeDesc).break(reason);
        },
      );
    },
    'op:abort': message => {
      const { reason } = message;
      abort(reason);
    },
  };

  /**
   * @param {Record<string, number>} sendStats
   * @param {Record<string, number>} recvStats
   * @returns {(message: any) => void}
   */
  const makeDispatch = (sendStats, recvStats) => {
    return message => {
      try {
        if (typeof message !== 'object' || message === null) {
          throw Error(`Invalid message: ${message}`);
        }
        const fn = handler[message.type];
        if (!fn) {
          throw Error(`Unknown message type: ${message.type}`);
        }
        fn(message);
      } catch (error) {
        logger.info('Error in dispatch', error);
      }
    };
  };

  const { dispatch, send, quietReject, didUnplug } = makeOcapnCommsKit({
    logger,
    makeDispatch,
    onReject,
    commitSendSlots,
    // eslint-disable-next-line no-use-before-define
    rawSend: serializeAndSendMessage,
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
    // eslint-disable-next-line no-use-before-define
    makeQuestion: () => engine.makeQuestion(),
    // eslint-disable-next-line no-use-before-define
    getValForSlot: slot => engine.convertSlotToVal(slot),
    makeLocalResolver: (questionSlot, ownerLabel) =>
      // eslint-disable-next-line no-use-before-define
      makeLocalResolver(questionSlot, ownerLabel),
  });

  const makeRemoteKit = makeMakeRemoteKit({
    makeRemoteKitForHandler,
    makeHandlerForRemoteReference,
  });

  const makeRemoteBootstrap = () => {
    const slot = `o-0`;
    const innerHandler = makeHandlerForRemoteReference(slot);
    const outerHandler = harden({
      ...innerHandler,
      applyMethod: (_o, prop, args) => {
        const promise = innerHandler.applyMethod(_o, prop, args);
        // We need to record the results of fetch so that we can identify which
        // objects are sturdyrefs.
        if (prop === 'fetch') {
          const [swissNum] = args;
          return promise.then(result => {
            // eslint-disable-next-line no-use-before-define
            const sturdyRefSlot = engine.convertValToSlot(result);
            // this will overwrite any previous grant details, upgrading the grant to a sturdyref
            const grantDetails = makeGrantDetails(
              peerLocation,
              sturdyRefSlot,
              'sturdy-ref',
              swissNum,
            );
            grantTracker.recordImport(result, grantDetails);
            return result;
          });
        }
        return promise;
      },
    });
    const { settler } = makeRemoteKitForHandler(outerHandler);
    const bootstrap = Remotable(
      'Alleged: Bootstrap',
      undefined,
      settler.resolveWithPresence(),
    );
    // eslint-disable-next-line no-use-before-define
    engine.registerImport(bootstrap, slot);
    return bootstrap;
  };

  /** @type {MakeRemoteResolver} */
  const makeRemoteResolver = slot => {
    const { settler } = makeRemoteKit(slot, 'deliver-only');
    const resolver = Remotable(
      'Alleged: Resolver',
      undefined,
      settler.resolveWithPresence(),
    );
    logger.info('makeRemoteResolver', { slot, resolver });
    // eslint-disable-next-line no-use-before-define
    engine.registerImport(resolver, slot);
    return resolver;
  };

  /** @type {MakeLocalResolver} */
  const makeLocalResolver = questionSlot => {
    // eslint-disable-next-line no-use-before-define
    const settler = engine.takeSettler(questionSlot);
    const ocapnResolver = OcapnFarObject('ocapnResolver', {
      fulfill: value => {
        logger.info(`ocapnResolver fulfill ${questionSlot}`, value);
        settler.resolve(value);
      },
      break: reason => {
        logger.info(`ocapnResolver break ${questionSlot}`, reason);
        settler.reject(reason);
      },
    });
    return ocapnResolver;
  };

  const eagerlySubscribeToPromise = (promise, slot) => {
    const resolveMeDesc = makeLocalResolver(slot);
    send({
      type: 'op:listen',
      to: promise,
      resolveMeDesc,
      wantsPartial: false,
    });
  };

  const importHook = (val, slot) => {
    logger.info(`importHook`, val, slot);
    const grantDetails = makeGrantDetails(peerLocation, slot);
    grantTracker.recordImport(val, grantDetails);
    const type = slotTypes[slot[0]];
    // Only subscribe to promises, not questions.
    if (type === 'promise') {
      eagerlySubscribeToPromise(val, slot);
    }
  };

  const exportHook = (val, slot) => {
    logger.info(`exportHook`, val, slot);
  };

  const importCollectedHook = (slot, decRefs) => {
    logger.info(`importCollectedHook`, slot, decRefs);
  };

  const engine = makeCapTPEngine(ourIdLabel, logger, makeRemoteKit, {
    exportHook,
    importHook,
    importCollectedHook,
    gcImports: true,
  });

  /** @type {MakeRemoteSturdyRef} */
  const makeRemoteSturdyRef = (location, swissNum) => {
    const promise = HandledPromise.resolve(
      (async () => {
        const { ocapn } = await provideSession(location);
        return E(ocapn.getBootstrap()).fetch(swissNum);
      })(),
    );
    return promise;
  };

  /** @type {MakeHandoff} */
  const makeHandoff = signedGive => {
    const {
      object: { exporterLocation },
    } = signedGive;
    return HandledPromise.resolve(
      (async () => {
        const [receiverGifterSession, receiverExporterSession] =
          await Promise.all([
            provideSession(peerLocation),
            provideSession(exporterLocation),
          ]);
        const {
          ocapn,
          id: receiverExporterSessionId,
          self: { keyPair: receiverExporterKey },
        } = receiverExporterSession;
        const {
          self: { keyPair: receiverGifterKey },
        } = receiverGifterSession;
        const bootstrap = ocapn.getBootstrap();
        const handoffCount = 0n;
        const signedHandoffReceive = makeWithdrawGiftDescriptor(
          signedGive,
          handoffCount,
          receiverExporterSessionId,
          receiverExporterKey.publicKey,
          receiverGifterKey,
        );
        return E(bootstrap)['withdraw-gift'](signedHandoffReceive);
      })(),
    );
  };

  let remoteBootstrap;
  const getRemoteBootstrap = () => {
    if (remoteBootstrap) {
      return remoteBootstrap;
    }
    remoteBootstrap = makeRemoteBootstrap();
    return remoteBootstrap;
  };

  const sendDepositGift = (session, giftId, gift) => {
    const { ocapn } = session;
    const bootstrap = ocapn.getBootstrap();
    const promise = E(bootstrap)['deposit-gift'](giftId, gift);
    // Log but don't handle the error.
    promise.catch(error => {
      logger.error(`sendDepositGift error`, error);
    });
  };

  const tableKit = makeTableKit(
    peerLocation,
    engine,
    makeRemoteResolver,
    makeRemoteSturdyRef,
    makeHandoff,
    grantTracker,
    getActiveSession,
    sendDepositGift,
  );

  const { readOcapnMessage, writeOcapnMessage } = makeCodecKit(tableKit);

  function serializeAndSendMessage(message) {
    // If we dont catch the error here it gets swallowed.
    logger.info(`sending message`, message);
    try {
      const bytes = writeOcapnMessage(message);
      const syrupObject = decodeSyrup(bytes);
      logger.info(`sending message syrup:`);
      logger.info(syrupObject);
      connection.write(bytes);
    } catch (error) {
      logger.info(`sending message error`, error);
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
        message = readOcapnMessage(syrupReader);
      } catch (err) {
        const problematicBytes = data.slice(start);
        const syrupMessage = decodeSyrup(problematicBytes);
        logger.error(`Message decode error:`);
        console.dir(syrupMessage, { depth: null });
        connection.end();
        throw err;
      }
      logger.info(`dispatch`, message);
      if (!didUnplug()) {
        dispatch(message);
      } else {
        logger.info(
          'Client received message after session was unplugged',
          message,
        );
      }
    }
  };

  const localBootstrapSlot = `o+0`;
  const bootstrapObj = makeBootstrapObject(
    ourIdLabel,
    logger,
    sessionId,
    swissnumTable,
    giftTable,
    getPeerPublicKeyForSessionId,
  );
  engine.registerExport(bootstrapObj, localBootstrapSlot);

  /** @type {Ocapn} */
  return harden({
    abort,
    dispatchMessageData,
    getBootstrap: getRemoteBootstrap,
    engine,
  });
};
