// @ts-check

import harden from '@endo/harden';

/**
 * @import { EHandler, Settler } from '@endo/eventual-send'
 * @import { Slot } from '../captp/types.js'
 * @import { SlotType } from '../captp/pairwise.js'
 * @import { OcapnTable } from '../captp/ocapn-tables.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { HandoffGiveSigEnvelope } from '../codecs/descriptors.js'
 * @import { Logger, SwissNum } from './types.js'
 * @import { GrantTracker, GrantDetails, HandoffGiveDetails } from './grant-tracker.js'
 * @import { SturdyRef, SturdyRefTracker } from './sturdyrefs.js'
 * @import { MakeRemoteKit, SendHandoff, SendFlush } from './ocapn.js'
 */

/** @typedef {import('../cryptography.js').OcapnPublicKey} OcapnPublicKey */

import { ONE_N, ZERO_N } from '@endo/nat';
import { Far, isPrimitive, Remotable } from '@endo/marshal';
import { E, HandledPromise } from '@endo/eventual-send';
import { makeSlot, parseSlot } from '../captp/pairwise.js';

/**
 * @typedef {any} LocalResolver
 * @typedef {any} RemoteResolver
 * @typedef {(questionSlot: Slot, ownerLabel?: string) => LocalResolver} MakeLocalResolver
 * @typedef {(slot: Slot) => RemoteResolver} MakeRemoteResolver
 * @typedef {(node: OcapnLocation, swissNum: SwissNum) => Promise<any>} MakeRemoteSturdyRef
 * @typedef {(signedGive: HandoffGiveSigEnvelope) => Promise<any>} MakeHandoff
 * @typedef {(nodeLocation: OcapnLocation, swissNum: SwissNum) => any} GetRemoteSturdyRef
 * @typedef {EHandler<{}>} RemoteKitHandler
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
 * @property {(position: bigint) => object} provideRemoteResolverValue
 * @property {() => object} provideRemoteBootstrapValue
 * @property {(value: object) => bigint} provideLocalObjectPosition
 * @property {(value: Promise<unknown>) => bigint} provideLocalPromisePosition
 * @property {(value: object) => bigint} provideRemoteExportPosition
 * @property {(value: Promise<unknown>) => bigint} provideRemoteAnswerPosition
 * @property {TakeNextRemoteAnswer} takeNextRemoteAnswer
 * @property {(remotePromise: Promise<unknown>) => object} makeLocalResolverForRemotePromise
 * @property {(slot: Slot) => { promise: Promise<unknown>, resolver: object, settler: Settler<unknown> }} makeFlushKit
 * @property {(answerPosition: bigint, promise: Promise<unknown>) => Promise<unknown>} makeLocalAnswerPromiseAndFulfill
 * @property {(position: bigint) => Promise<unknown>} getLocalAnswerValue
 * @property {(promise: Promise<unknown>, resolveMeDesc: RemoteResolver, wantsPartial?: boolean) => void} forwardLocalPromiseResolutionToRemoteResolver
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
 * @param {SendFlush} sendFlush
 * @param {boolean} enableExperimentalFeatureFlush
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
  sendFlush,
  enableExperimentalFeatureFlush = false,
) => {
  let nextExportPosition = ONE_N;
  const provideSlotForValue = value => {
    let slot = ocapnTable.getSlotForValue(value);
    if (slot === undefined) {
      // If there is no slot for this value, its our own export.
      const position = nextExportPosition;
      nextExportPosition += ONE_N;
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

  const makePromiseSettlerPair = () => {
    /** @type {{ promise: Promise<unknown>, settler: Settler<unknown> }} */
    const { promise, settler } = makeRemoteKit(() => promise);
    return { promise, settler };
  };

  /**
   * Create a promise/settler pair with an optional externally defined answer promise.
   * @param {Promise<unknown>} [externalAnswerPromise] - The promise returned by E()
   * @returns {{ internalPromise: Promise<unknown>, answerPromise: Promise<unknown>, settler: Settler<unknown> }}
   */
  const makeRemoteAnswer = externalAnswerPromise => {
    // Use a mutable reference so that it can be cleared after resolution.
    let target;
    const { promise: internalPromise, settler: internalSettler } =
      makeRemoteKit(() => target);
    // Default to the internal promise, but can be overridden

    // Decide which promise to register: prefer externalAnswerPromise (E()'s promise) when available
    const answerPromise = externalAnswerPromise || internalPromise;
    // Update the handler's target to use the registered promise
    // This ensures pipelining serializes the correct promise
    target = answerPromise;

    // Wrap the settler to clear `target` when the promise settles.
    // This breaks the reference cycle: internalPromise -> handler -> () => target -> answerPromise
    // Without this, the answerPromise is never GC'd because the handler keeps a reference to it.
    const settler = harden({
      resolve: value => {
        target = undefined; // Clear before resolving to allow GC
        internalSettler.resolve(value);
      },
      reject: reason => {
        target = undefined; // Clear before rejecting to allow GC
        internalSettler.reject(reason);
      },
      resolveWithPresence: () => {
        target = undefined;
        return internalSettler.resolveWithPresence();
      },
    });

    return {
      internalPromise,
      answerPromise,
      settler,
    };
  };

  // Partially redundant with getInfoForVal, but if we just need to know if a value is a handoff.
  const valueRequiresFlushBeforeResolution = value => {
    if (isPrimitive(value)) {
      return false;
    }
    const grantDetails = grantTracker.getGrantDetails(value);
    if (grantDetails === undefined) {
      return false;
    }
    // It is a handoff if the grant details are for a different location.
    return grantDetails.location !== peerLocation;
  };

  /** @param {unknown} v */
  const isThenable = v =>
    v != null &&
    (typeof v === 'object' || typeof v === 'function') &&
    typeof (/** @type {{ then?: unknown }} */ (v).then) === 'function';

  /**
   * @param {Promise<unknown>} promise
   * @param {Settler<unknown>} settler
   */
  const forwardNextPromiseValueToSettler = (promise, settler) => {
    HandledPromise.getNextPromiseValue(promise, ({ kind, value }) => {
      if (kind === 'rejected') {
        settler.reject(value);
      } else {
        settler.resolve(value);
      }
    });
  };

  /**
   * Create a presence for a remote object with the given position and label.
   * @param {bigint} position
   * @param {string} label
   * @returns {object}
   */
  const makeRemoteObject = (position, label) => {
    /** @type {object} */
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
    return makeRemoteObject(ZERO_N, 'Remote Bootstrap');
  };

  /**
   * @param {string} debugLabel
   * @param {Settler<unknown>} settler
   * @returns {object}
   */
  const makeLocalOcapnResolver = (debugLabel, settler) => {
    const ocapnResolver = Far('OcapnResolver', {
      fulfill: value => {
        logger.info(`ocapnResolver fulfill ${debugLabel}`, value);
        settler.resolve(value);
      },
      break: reason => {
        logger.info(`ocapnResolver break ${debugLabel}`, reason);
        settler.reject(reason);
      },
    });
    return ocapnResolver;
  };

  // Track the next answer position.
  let nextAnswerPosition = ZERO_N;

  /** @type {ReferenceKit} */
  const referenceKit = harden({
    provideRemoteObjectValue: position => {
      const slot = makeSlot('o', false, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        value = makeRemoteObject(position, `Remote Object ${position}`);
        ocapnTable.registerSlot(slot, value);
      }
      // Record that we're receiving this reference in the current message
      ocapnTable.recordReceivedSlot(slot);
      return value;
    },
    provideRemotePromiseValue: position => {
      const slot = makeSlot('p', false, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        const { promise, settler } = makePromiseSettlerPair();
        value = promise;
        ocapnTable.registerSettler(slot, settler);
        ocapnTable.registerSlot(slot, promise);
      }
      // Record that we're receiving this reference in the current message
      ocapnTable.recordReceivedSlot(slot);
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
    // Only used by ResolveMeDescCodec
    provideRemoteResolverValue: position => {
      const slot = makeSlot('o', false, position);
      let value = ocapnTable.getValueForSlot(slot);
      if (value === undefined) {
        value = makeRemoteResolver(position);
        ocapnTable.registerSlot(slot, value);
      }
      // Record that we're receiving this reference in the current message
      ocapnTable.recordReceivedSlot(slot);
      return value;
    },
    provideRemoteBootstrapValue: () => {
      const slot = makeSlot('o', false, ZERO_N);
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
      // Record that we're sending this reference in the current message
      ocapnTable.recordSentSlot(slot);
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
      // Record that we're sending this reference in the current message
      ocapnTable.recordSentSlot(slot);
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
    takeNextRemoteAnswer: externalAnswerPromise => {
      /**
       * Create a new remote answer slot and return the internal promise, answer promise, position, and resolver.
       *   The internal promise is to be returned in the HandledPromise handler.
       *   The answer promise is registered in the table as the remote answer.
       *   The position is the position of the answer slot in the table.
       *   The resolver is used to resolve the internal promise (which should resolve the external answer promise).
       */
      const answerPosition = nextAnswerPosition;
      nextAnswerPosition += ONE_N;

      // Create a promise + settler pair with an optional externalAnswerPromise.
      // The settler is needed to resolve the promise when the answer comes back.
      const { internalPromise, answerPromise, settler } = makeRemoteAnswer(
        externalAnswerPromise,
      );

      const slot = makeSlot('a', false, answerPosition);
      // registerSlot triggers importHook which records in grantTracker
      ocapnTable.registerSlot(slot, answerPromise);

      // Register the settler only so that it will be rejected on session disconnect.
      ocapnTable.registerSettler(slot, settler);

      // Wrap the settler to remove it from the table when settled normally.
      const wrappedSettler = harden({
        resolve: value => {
          // Remove settler from table as it has now been settled.
          ocapnTable.takeSettler(slot);
          settler.resolve(value);
        },
        reject: reason => {
          // Remove settler from table as it has now been settled.
          ocapnTable.takeSettler(slot);
          settler.reject(reason);
        },
        resolveWithPresence: () => {
          ocapnTable.takeSettler(slot);
          return settler.resolveWithPresence();
        },
      });
      const resolver = makeLocalOcapnResolver(slot, wrappedSettler);

      // Return:
      // - internalPromise: used by HandledPromise to resolve externalAnswerPromise
      // - answerPromise: the promise registered in the table as the remote answer
      return {
        internalPromise,
        answerPromise,
        position: answerPosition,
        resolver,
      };
    },
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
      return makeLocalOcapnResolver(slot, settler);
    },
    /**
     * HandledPromise + {@link makeLocalOcapnResolver} sharing one settler, for
     * `op:flush` replacement cells (`p'` / `r'` in the shortening proposal).
     *
     * @param {Slot} slot - For logging only.
     */
    makeFlushKit: slot => {
      const { promise, settler } = makePromiseSettlerPair();
      const resolver = makeLocalOcapnResolver(slot, settler);
      return harden({ promise, resolver, settler });
    },
    getLocalAnswerValue: position => {
      const slot = makeSlot('a', true, position);
      const value = /** @type {Promise<unknown> | undefined} */ (
        ocapnTable.getValueForSlot(slot)
      );
      if (value === undefined) {
        throw new Error(
          `OCapN: No local answer found for position: ${position}`,
        );
      }
      return value;
    },
    makeLocalAnswerPromiseAndFulfill: (answerPosition, internalPromise) => {
      // Ensure the answer is registered.
      const slot = makeSlot('a', true, answerPosition);
      const { promise: answerPromise, settler } = makePromiseSettlerPair();
      ocapnTable.registerSlot(slot, answerPromise);
      // Fulfill the answer locally.
      forwardNextPromiseValueToSettler(internalPromise, settler);
      return answerPromise;
    },
    /**
     * @param {Promise<unknown>} promise
     * @param {RemoteResolver} resolveMeDesc
     * @param {boolean} [wantsPartial] - If true (default), subscribe to promise shortening
     *   ({@link HandledPromise.getNextPromiseValue}); if false, only the final
     *   settlement is observed ({@link Promise.prototype.then}).
     */
    forwardLocalPromiseResolutionToRemoteResolver(
      promise,
      resolveMeDesc,
      wantsPartial = true,
    ) {
      // Ensure valid resolveMeDesc.
      const resolverSlot = ocapnTable.getSlotForValue(resolveMeDesc);
      if (resolverSlot === undefined) {
        throw new Error(
          `OCapN: No slot found for resolveMeDesc: ${resolveMeDesc}`,
        );
      }
      const {
        type,
        isLocal,
        position: resolverPosition,
      } = parseSlot(resolverSlot);
      if (type !== 'o' || isLocal) {
        throw new Error(
          `OCapN: Expected remote resolver slot, got slot: ${resolverSlot}`,
        );
      }
      // When sending the resolution, use E.sendOnly since we don't need a response from fulfill/break calls.
      // This sends op:deliver with answerPosition and resolveMeDesc both false.
      const sendResolve = value => {
        E.sendOnly(resolveMeDesc).fulfill(value);
      };
      const sendBreak = reason => {
        E.sendOnly(resolveMeDesc).break(reason);
      };

      /** @param {unknown} reason */
      const onRejected = reason => {
        sendBreak(reason);
      };

      /** @param {unknown} value */
      const scheduleFlushThenResolve = value => {
        const { promise: flushDonePromise, settler } = makePromiseSettlerPair();
        const debugLabel = `(flush for ${resolverSlot})`;
        const flushDoneResolver = makeLocalOcapnResolver(debugLabel, settler);
        sendFlush(resolverPosition, flushDoneResolver);
        flushDonePromise.then(
          () => {
            sendResolve(value);
          },
          reason => {
            logger.error(`flush failed on ${resolverSlot}: ${reason}`);
          },
        );
      };

      /** @param {unknown} value */
      const maybeFlushAndResolve = value => {
        if (
          enableExperimentalFeatureFlush &&
          valueRequiresFlushBeforeResolution(value)
        ) {
          scheduleFlushThenResolve(value);
        } else {
          sendResolve(value);
        }
      };

      /**
       * With shortening (`wantsPartial`), follow thenables until we flush for a
       * third-party handoff target or {@link sendResolve}.
       *
       * @param {unknown} value
       */
      const settleAfterShortening = value => {
        if (
          enableExperimentalFeatureFlush &&
          valueRequiresFlushBeforeResolution(value)
        ) {
          scheduleFlushThenResolve(value);
        } else if (isThenable(value)) {
          HandledPromise.getNextPromiseValue(
            /** @type {Promise<unknown>} */ (value),
            ({ kind, value: next }) => {
              if (kind === 'rejected') {
                onRejected(next);
              } else {
                settleAfterShortening(next);
              }
            },
          );
        } else {
          sendResolve(value);
        }
      };

      if (wantsPartial) {
        HandledPromise.getNextPromiseValue(promise, ({ kind, value }) => {
          if (kind === 'rejected') {
            onRejected(value);
          } else {
            settleAfterShortening(value);
          }
        });
      } else {
        Promise.resolve(promise).then(maybeFlushAndResolve, onRejected);
      }
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
  });
  return referenceKit;
};
