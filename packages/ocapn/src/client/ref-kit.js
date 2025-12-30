// @ts-check

/**
 * @import {Slot} from '../captp/types.js'
 * @import { SlotType } from '../captp/pairwise.js'
 * @import { OcapnTable } from '../captp/ocapn-tables.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { HandoffGiveSigEnvelope } from '../codecs/descriptors.js'
 * @import { Logger, SwissNum } from './types.js'
 * @import { GrantTracker, GrantDetails, HandoffGiveDetails } from './grant-tracker.js'
 * @import { SturdyRef, SturdyRefTracker } from './sturdyrefs.js'
 * @import { MakeRemoteKit, SendHandoff } from './ocapn.js'
 */

/** @typedef {import('../cryptography.js').OcapnPublicKey} OcapnPublicKey */

import { Far, Remotable } from '@endo/marshal';
import { makeSlot, parseSlot } from '../captp/pairwise.js';

/**
 * @typedef {any} LocalResolver
 * @typedef {any} RemoteResolver
 * @typedef {(questionSlot: Slot, ownerLabel?: string) => LocalResolver} MakeLocalResolver
 * @typedef {(slot: Slot) => RemoteResolver} MakeRemoteResolver
 * @typedef {(node: OcapnLocation, swissNum: SwissNum) => Promise<any>} MakeRemoteSturdyRef
 * @typedef {(signedGive: HandoffGiveSigEnvelope) => Promise<any>} MakeHandoff
 * @typedef {(nodeLocation: OcapnLocation, swissNum: SwissNum) => any} GetRemoteSturdyRef
 * @typedef {Record<string, any>} Handler
 * @typedef {'object' | 'promise' | 'answer'} SlotTypeName
 */

/**
 * @typedef {object} ValInfo
 * @property {Slot} slot
 * @property {bigint} position
 * @property {SlotTypeName} type
 * @property {boolean} isLocal
 * @property {boolean} isThirdParty
 * @property {GrantDetails} [grantDetails]
 */

/**
 * @typedef {object} TakeNextRemoteAnswerResult
 * @property {Promise<unknown>} internalPromise
 * @property {Promise<unknown>} answerPromise
 * @property {bigint} position
 * @property {unknown} resolver
 */

/**
 * @typedef {(externalAnswerPromise?: Promise<unknown>) => TakeNextRemoteAnswerResult} TakeNextRemoteAnswer
 * @param {Promise<unknown>} [externalAnswerPromise] - The promise returned by E(), from the HandledPromise handler (if available)
 */

/**
 * @typedef {object} ReferenceKit
 * @property {(position: bigint) => object} provideRemoteObjectValue
 * @property {(position: bigint) => Promise<unknown>} provideRemotePromiseValue
 * @property {(position: bigint) => object} provideLocalExportValue
 * @property {(position: bigint) => Promise<unknown>} provideLocalAnswerValue
 * @property {(position: bigint) => object} provideRemoteResolverValue
 * @property {() => object} provideRemoteBootstrapValue
 * @property {(value: object) => bigint} provideLocalObjectPosition
 * @property {(value: Promise<unknown>) => bigint} provideLocalPromisePosition
 * @property {(value: object) => bigint} provideRemoteExportPosition
 * @property {(value: Promise<unknown>) => bigint} provideRemoteAnswerPosition
 * @property {TakeNextRemoteAnswer} takeNextRemoteAnswer
 * @property {(remotePromise: Promise<unknown>) => object} makeLocalResolverForRemotePromise
 * @property {(answerPosition: bigint, promise: Promise<unknown>) => void} fulfillLocalAnswerWithPromise
 * @property {(location: OcapnLocation, swissNum: SwissNum) => SturdyRef} makeSturdyRef
 * @property {(signedGive: HandoffGiveSigEnvelope) => Promise<unknown>} provideHandoff
 * @property {(signedGive: HandoffGiveDetails) => HandoffGiveSigEnvelope} sendHandoff
 * @property {(value: object) => ValInfo} getInfoForVal
 */

/** @type {Record<SlotType, SlotTypeName>} */
const slotTypes = harden({
  o: 'object',
  p: 'promise',
  a: 'answer',
});

/**
 * @param {SlotType} type
 * @returns {SlotTypeName}
 */
export const slotTypeToName = type => {
  const name = slotTypes[type];
  if (name === undefined) {
    throw new Error(`OCapN: Unknown slot type: ${type}`);
  }
  return name;
};

/**
 * @param {Logger} logger
 * @param {OcapnLocation} peerLocation
 * @param {OcapnTable} ocapnTable
 * @param {GrantTracker} grantTracker
 * @param {SturdyRefTracker} sturdyRefTracker
 * @param {MakeRemoteKit} makeRemoteKit
 * @param {MakeHandoff} makeHandoff
 * @param {SendHandoff} sendHandoff
 * @returns {ReferenceKit}
 */
export const makeReferenceKit = (
  logger,
  peerLocation,
  ocapnTable,
  grantTracker,
  sturdyRefTracker,
  makeRemoteKit,
  makeHandoff,
  sendHandoff,
) => {
  let nextExportPosition = 1n;
  const provideSlotForValue = value => {
    let slot = ocapnTable.getSlotForValue(value);
    if (slot === undefined) {
      // If there is no slot for this value, its our own export.
      const position = nextExportPosition;
      nextExportPosition += 1n;
      const type = value instanceof Promise ? 'p' : 'o';
      slot = makeSlot(type, true, position);
      ocapnTable.registerSlot(slot, value);
    }
    return slot;
  };

  const getPositionForSlot = slot => {
    const { position } = parseSlot(slot);
    return position;
  };

  const makePromiseResolverPair = () => {
    const { promise, settler } = makeRemoteKit(() => promise);
    return { promise, settler };
  };

  /**
   * Create a promise/settler pair with an optional externally defined answer promise.
   * @param {Promise<unknown>} [externalAnswerPromise] - The promise returned by E()
   * @returns {{ internalPromise: Promise<unknown>, answerPromise: Promise<unknown>, settler: unknown }}
   */
  const makeRemoteAnswer = externalAnswerPromise => {
    // Use a mutable reference that can be set after creation
    let target;
    const { promise: internalPromise, settler } = makeRemoteKit(() => target);
    // Default to the internal promise, but can be overridden

    // Decide which promise to register: prefer externalAnswerPromise (E()'s promise) when available
    const answerPromise = externalAnswerPromise || internalPromise;
    // Update the handler's target to use the registered promise
    // This ensures pipelining serializes the correct promise
    target = answerPromise;

    return {
      internalPromise,
      answerPromise,
      settler,
    };
  };

  const makeRemotePromise = _position => makePromiseResolverPair();
  const makeLocalAnswer = _position => makePromiseResolverPair();

  const makeRemoteObject = (position, label) => {
    let remoteObject;
    const { settler } = makeRemoteKit(() => remoteObject);
    remoteObject = Remotable(
      `Alleged: ${label}`,
      undefined,
      settler.resolveWithPresence(),
    );
    logger.info('makeRemoteObject', { position, label });
    return remoteObject;
  };

  const makeRemoteResolver = position => {
    return makeRemoteObject(position, `Remote Resolver ${position}`);
  };

  const makeRemoteBootstrap = () => {
    return makeRemoteObject(0n, 'Remote Bootstrap');
  };

  const makeLocalResolver = (slot, settler) => {
    const ocapnResolver = Far('OcapnResolver', {
      fulfill: value => {
        logger.info(`ocapnResolver fulfill ${slot}`, value);
        settler.resolve(value);
      },
      break: reason => {
        logger.info(`ocapnResolver break ${slot}`, reason);
        settler.reject(reason);
      },
    });
    return ocapnResolver;
  };

  // Track the next answer position.
  let nextAnswerPosition = 0n;
  /**
   * Create a new remote answer slot and return the internal promise, answer promise, position, and resolver.
   *   The internal promise is to be returned in the HandledPromise handler.
   *   The answer promise is registered in the table as the remote answer.
   *   The position is the position of the answer slot in the table.
   *   The resolver is used to resolve the internal promise (which should resolve the external answer promise).
   */
  /** @type {TakeNextRemoteAnswer} */
  const takeNextRemoteAnswer = externalAnswerPromise => {
    const answerPosition = nextAnswerPosition;
    nextAnswerPosition += 1n;

    // Create a promise+settler pair with an optional externalAnswerPromise.
    // The settler is needed to resolve the promise when the answer comes back.
    const { internalPromise, answerPromise, settler } = makeRemoteAnswer(
      externalAnswerPromise,
    );

    const slot = makeSlot('a', false, answerPosition);
    // registerSlot triggers importHook which records in grantTracker
    ocapnTable.registerSlot(slot, answerPromise);

    const resolver = makeLocalResolver(slot, settler);

    // Return:
    // - internalPromise: used by HandledPromise to resolve externalAnswerPromise
    // - answerPromise: the promise registered in the table as the remote answer
    return {
      internalPromise,
      answerPromise,
      position: answerPosition,
      resolver,
    };
  };

  /** @type {ReferenceKit} */
  const referenceKit = {
    provideRemoteObjectValue: position => {
      const slot = makeSlot('o', false, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        value = makeRemoteObject(position);
        ocapnTable.registerSlot(slot, value);
      }
      return value;
    },
    provideRemotePromiseValue: position => {
      const slot = makeSlot('p', false, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        const { promise, settler } = makeRemotePromise(position);
        value = promise;
        ocapnTable.registerSettler(slot, settler);
        ocapnTable.registerSlot(slot, promise);
      }
      return value;
    },
    provideLocalExportValue: position => {
      // Exports are either promises or objects.
      const promiseSlot = makeSlot('p', true, position);
      let value = ocapnTable.getValueForSlot(promiseSlot);
      if (value !== undefined) {
        return value;
      }
      const objectSlot = makeSlot('o', true, position);
      value = ocapnTable.getValueForSlot(objectSlot);
      if (value !== undefined) {
        return value;
      }
      throw new Error(`OCapN: No export value found for position: ${position}`);
    },
    provideLocalAnswerValue: position => {
      const slot = makeSlot('a', true, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        const { promise, settler } = makeLocalAnswer(position);
        value = promise;
        ocapnTable.registerSettler(slot, settler);
        ocapnTable.registerSlot(slot, promise);
      }
      return value;
    },
    // Only used by ResolveMeDescCodec
    provideRemoteResolverValue: position => {
      const slot = makeSlot('o', false, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        value = makeRemoteResolver(position);
        ocapnTable.registerSlot(slot, value);
      }
      return value;
    },
    provideRemoteBootstrapValue: () => {
      const slot = makeSlot('o', false, 0n);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        value = makeRemoteBootstrap();
        ocapnTable.registerSlot(slot, value);
      }
      return value;
    },

    provideLocalObjectPosition: value => {
      const slot = provideSlotForValue(value);
      const { type, isLocal, position } = parseSlot(slot);
      if (type !== 'o' || !isLocal) {
        throw new Error(`OCapN: Expected local object slot, got slot: ${slot}`);
      }
      return position;
    },
    provideLocalPromisePosition: value => {
      const slot = provideSlotForValue(value);
      const { type, isLocal, position } = parseSlot(slot);
      if (type !== 'p' || !isLocal) {
        throw new Error(
          `OCapN: Expected local promise slot, got slot: ${slot}`,
        );
      }
      return position;
    },
    provideRemoteExportPosition: value => {
      const slot = ocapnTable.getSlotForValue(value);
      if (slot === undefined) {
        throw new Error(`OCapN: No slot found for value: ${value}`);
      }
      const { type, isLocal, position } = parseSlot(slot);
      if ((type !== 'o' && type !== 'p') || isLocal) {
        throw new Error(
          `OCapN: Expected remote export slot, got slot: ${slot}`,
        );
      }
      return position;
    },
    provideRemoteAnswerPosition: value => {
      const slot = ocapnTable.getSlotForValue(value);
      if (slot === undefined) {
        throw new Error(`OCapN: No slot found for value: ${value}`);
      }
      const { type, isLocal, position } = parseSlot(slot);
      if (type !== 'a' || isLocal) {
        throw new Error(
          `OCapN: Expected remote answer slot, got slot: ${slot}`,
        );
      }
      return position;
    },

    takeNextRemoteAnswer,
    makeLocalResolverForRemotePromise: remotePromise => {
      const slot = ocapnTable.getSlotForValue(remotePromise);
      if (slot === undefined) {
        throw new Error(
          `OCapN: No slot found for remote promise: ${remotePromise}`,
        );
      }
      const { type, isLocal } = parseSlot(slot);
      if (type !== 'p' || isLocal) {
        throw new Error(
          `OCapN: Expected remote promise slot, got slot: ${slot}`,
        );
      }
      const settler = ocapnTable.takeSettler(slot);
      return makeLocalResolver(slot, settler);
    },
    fulfillLocalAnswerWithPromise: (answerPosition, promise) => {
      // Ensure the answer is registered.
      referenceKit.provideLocalAnswerValue(answerPosition);
      // Fulfill the answer.
      const slot = makeSlot('a', true, answerPosition);
      const settler = ocapnTable.takeSettler(slot);
      promise.then(settler.resolve, settler.reject);
    },

    makeSturdyRef: (location, swissNum) => {
      return sturdyRefTracker.makeSturdyRef(location, swissNum);
    },

    provideHandoff: signedGive => {
      return makeHandoff(signedGive);
    },
    sendHandoff,

    getInfoForVal: val => {
      // Special handling for local answers.
      const localAnswerPosition = ocapnTable.getLocalAnswerToPosition(val);
      if (localAnswerPosition !== undefined) {
        return {
          slot: makeSlot('a', true, localAnswerPosition),
          position: localAnswerPosition,
          type: 'answer',
          isLocal: true,
          isThirdParty: false,
        };
      }
      const grantDetails = grantTracker.getGrantDetails(val);
      if (grantDetails) {
        // This is a grant, either imported from this location or exported from another.
        const { location, slot } = grantDetails;
        const { type, isLocal } = parseSlot(slot);
        const isThirdParty = location !== peerLocation;
        const position = getPositionForSlot(slot);
        const namedType = slotTypeToName(type);
        if (isLocal !== false) {
          throw Error(`OCapN: Unexpected local slot for grant: ${slot}`);
        }
        return {
          slot,
          position,
          type: namedType,
          isLocal,
          isThirdParty,
          grantDetails,
        };
      } else {
        // This is an export
        const slot = provideSlotForValue(val);
        const { type, isLocal, position } = parseSlot(slot);
        if (!isLocal) {
          throw Error(
            `OCapN: Unexpected remote value without grant details: ${val}`,
          );
        }
        const namedType = slotTypeToName(type);
        const isThirdParty = false;
        return { slot, position, type: namedType, isLocal, isThirdParty };
      }
    },
  };
  return referenceKit;
};
