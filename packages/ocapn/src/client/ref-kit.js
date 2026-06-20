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
 * @import { MakeRemoteKit, SendHandoff } from './ocapn.js'
 * @import { EmbargoState } from './embargo.js'
 */

/** @typedef {import('../cryptography.js').OcapnPublicKey} OcapnPublicKey */

import { ONE_N, ZERO_N } from '@endo/nat';
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
 * @property {(answerPosition: bigint, promise: Promise<unknown>) => Promise<unknown>} makeLocalAnswerPromiseAndFulfill
 * @property {(position: bigint) => Promise<unknown>} getLocalAnswerValue
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
 * @param {EmbargoState} embargoState
 * @param {(message: Record<string, any>) => void} send
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
  embargoState,
  send,
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

  const makePromiseResolverPair = () => {
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
    // Use a mutable reference that can be set after creation
    let target;
    const { promise: internalPromise, settler: rawSettler } = makeRemoteKit(
      () => target,
    );
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
        rawSettler.resolve(value);
      },
      reject: reason => {
        target = undefined; // Clear before rejecting to allow GC
        rawSettler.reject(reason);
      },
      resolveWithPresence: () => {
        target = undefined;
        return rawSettler.resolveWithPresence();
      },
    });

    return {
      internalPromise,
      answerPromise,
      settler,
    };
  };

  const makeRemotePromise = _position => makePromiseResolverPair();
  const makeLocalAnswer = _position => makePromiseResolverPair();

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

  /**
   * Build a "frozen forwarder" presence pinned to `target`'s current network
   * address. New E() calls on the forwarder always emit `op:deliver` with the
   * underlying target as the message target; the codec encodes that target
   * via its slot, which is stable regardless of any further resolution the
   * target itself undergoes (e.g. when its host vat fulfills it).
   *
   * This implements capnproto's Tribble 4-way rule: once a promise P has
   * been resolved to a remote reference R, messages addressed to P keep
   * forwarding to R rather than shortcutting through R's own resolution
   * (which could have shortened to yet another vat). Single-hop forwarding
   * keeps embargo accounting tractable.
   *
   * Note: the rule only matters when R is itself a *remote promise* that
   * resolves further. OCapN's current protocol restricts gifts to remotable
   * (passStyle === 'remotable'), and `fulfillRemoteResolverWithPromise`
   * auto-unwraps before encoding, so a remote-promise reference never
   * appears as a resolution value in practice. The wrap is kept as
   * defensive code: it fires correctly if a future protocol revision
   * permits promise gifts or pipes promise references through fulfillment.
   *
   * @param {object | Promise<unknown>} target
   * @param {string} label
   * @returns {object}
   */
  const makeFrozenForwarder = (target, label) => {
    const { settler } = makeRemoteKit(() => target);
    const stub = Remotable(
      `Alleged: ${label}`,
      undefined,
      settler.resolveWithPresence(),
    );
    return stub;
  };

  /**
   * Wrap a value as a frozen forwarder when it's a remote-to-us promise; pass
   * other shapes through. Remote objects already use a fixed presence handler
   * and don't shorten further; primitives and copy values can never shorten;
   * locally-hosted references go through the level-1 embargo path.
   *
   * @param {unknown} value
   * @returns {unknown}
   */
  const maybeWrapAsFrozenForwarder = value => {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    ) {
      return value;
    }
    /** @type {any} */
    const v = value;
    const valueSlot = ocapnTable.getSlotForValue(v);
    if (valueSlot === undefined) {
      return value;
    }
    const { type, isLocal } = parseSlot(valueSlot);
    if (isLocal || type !== 'p') {
      return value;
    }
    return makeFrozenForwarder(v, `Frozen Forwarder ${valueSlot}`);
  };

  const makeRemoteResolver = position => {
    return makeRemoteObject(position, `Remote Resolver ${position}`);
  };

  const makeRemoteBootstrap = () => {
    return makeRemoteObject(ZERO_N, 'Remote Bootstrap');
  };

  /**
   * Detect whether `value` is a reference hosted locally (an export of ours,
   * or a local answer). When a remote promise is fulfilled with such a value,
   * shortening the HandledPromise would let new E() calls bypass the original
   * promise's path while earlier pipelined messages are still in flight on
   * that path, breaking per-reference FIFO order. Those resolutions need a
   * disembargo round-trip; everything else (primitives, copy values, remote
   * references) can resolve immediately.
   *
   * @param {unknown} value
   * @returns {boolean}
   */
  const isValueLocallyHosted = value => {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function')
    ) {
      return false;
    }
    if (ocapnTable.getLocalAnswerToPosition(value) !== undefined) {
      return true;
    }
    const valueSlot = ocapnTable.getSlotForValue(value);
    if (valueSlot === undefined) {
      return false;
    }
    return parseSlot(valueSlot).isLocal;
  };

  const makeLocalResolver = (slot, settler) => {
    const ocapnResolver = Far('OcapnResolver', {
      fulfill: value => {
        logger.info(`ocapnResolver fulfill ${slot}`, value);
        // Capnproto-style level-1 embargo: if the resolution shortens the
        // promise to a locally-hosted capability, hold the resolve until a
        // disembargo round-trip confirms that all already-pipelined messages
        // on the original path have been forwarded back to us. The original
        // promise's handler keeps sending new calls through the peer (which
        // forwards them to us) while the embargo is in flight, so the natural
        // network FIFO and microtask FIFO cooperate to deliver everything in
        // order before we lift the embargo and let direct calls take over.
        if (isValueLocallyHosted(value)) {
          const target = ocapnTable.getValueForSlot(slot);
          if (target === undefined) {
            // The original promise/answer slot was already collected. Nothing
            // pipelined against it can still arrive, so just resolve.
            settler.resolve(value);
            return;
          }
          const embargoId = embargoState.allocate({ settler, value, slot });
          logger.info(
            `ocapnResolver embargo ${slot} → ${embargoId}`,
            value,
          );
          send({
            type: 'op:disembargo',
            context: harden({
              type: 'sender-loopback',
              target,
              embargoId,
            }),
          });
          return;
        }
        // Capnproto's Tribble 4-way rule: when shortening a promise to a
        // remote-to-us promise reference, pin it via a frozen forwarder so
        // the receiving promise's HP never follows the remote ref's further
        // resolution. Multi-hop shortening would otherwise bypass the
        // per-hop embargo accounting.
        settler.resolve(maybeWrapAsFrozenForwarder(value));
      },
      break: reason => {
        logger.info(`ocapnResolver break ${slot}`, reason);
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
        const { promise, settler } = makeRemotePromise(position);
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
      });
      const resolver = makeLocalResolver(slot, wrappedSettler);

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
      return makeLocalResolver(slot, settler);
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
      const { promise: answerPromise, settler } =
        makeLocalAnswer(answerPosition);
      const slot = makeSlot('a', true, answerPosition);
      ocapnTable.registerSlot(slot, answerPromise);
      // Fulfill the answer.
      Promise.resolve(internalPromise).then(settler.resolve, settler.reject);
      return answerPromise;
    },

    makeSturdyRef: (location, swissNum) => {
      return sturdyRefTracker.makeSturdyRef(location, swissNum);
    },

    provideHandoff: signedGive => {
      // Capnproto level-3 disembargo: as the receiver of a third-party
      // handoff, dispatch an `accept` disembargo on this same session (where
      // any earlier pipelined messages on the resolving promise also went).
      // The gifter forwards it as a `provide` disembargo on its session with
      // the exporter, and the exporter holds back the `withdraw-gift`
      // response until that arrives. By the time we get the cap, all
      // earlier pipelined messages have already been delivered to it.
      const { giftId, exporterSessionId: gifterExporterSessionId } =
        signedGive.object;
      send({
        type: 'op:disembargo',
        context: harden({
          type: 'accept',
          gifterExporterSessionId,
          giftId,
        }),
      });
      // Capnproto Tribble 4-way rule (defensive): if the eventual gift is a
      // remote-to-us promise reference, pin it behind a frozen forwarder so
      // the resolving promise can never shortcut through any further
      // resolution that promise undergoes on its host vat. OCapN's
      // deposit-gift currently requires `passStyle === 'remotable'`, so the
      // gift is always an object presence and the wrap is a no-op; it
      // remains in place against future protocol revisions.
      return makeHandoff(signedGive).then(gift =>
        maybeWrapAsFrozenForwarder(gift),
      );
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
