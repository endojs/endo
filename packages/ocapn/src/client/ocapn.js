// @ts-check

/** @import {RemoteKit, Settler} from '@endo/eventual-send' */
/** @import {CapTPSlot} from '../captp/types.js' */

/**
 * @typedef {import('./types.js').Client} Client
 * @typedef {import('./types.js').Connection} Connection
 * @typedef {import('./types.js').Logger} Logger
 * @typedef {import('../captp/captp-engine.js').CapTPEngine} CapTPEngine
 * @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader
 */

import { E, HandledPromise } from '@endo/eventual-send';
import { Far, Remotable } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';
import { makeCapTPEngine } from '../captp/captp-engine.js';
import { makeDescCodecs } from '../codecs/descriptors.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { makePassableCodecs } from '../codecs/passable.js';
import { makeOcapnOperationsCodecs } from '../codecs/operations.js';
import { getSelectorName, makeSelector } from '../pass-style-helpers.js';
import { decodeSyrup } from '../syrup/js-representation.js';

/**
 * @typedef {OcapNFarObject<{resolve: (value: any) => void, break: (reason: any) => void}>} LocalResolver
 * @typedef {(questionSlot: CapTPSlot, ownerLabel?: string) => LocalResolver} MakeLocalResolver
 * @typedef {(slot: CapTPSlot) => RemoteKit} MakeRemoteResolver
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
const OcapNFarObject = (label, object) => {
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
export const OCapNFar = (label, object) => {
  if (typeof object === 'function') {
    return Far(label, object);
  }
  return OcapNFarObject(label, object);
};

/**
 * @typedef {object} MakeOCapNCommsKitOptions
 * @property {Logger} logger
 * @property {(sendStats: Record<string, number>, recvStats: Record<string, number>) => (message: any) => void} makeDispatch
 * @property {(reason?: any) => void} onReject
 * @property {(message: any) => void} rawSend
 * @property {() => void} commitSendSlots
 */

/**
 * @typedef {object} OCapNCommsKit
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
 * @param {MakeOCapNCommsKitOptions} opts
 * @returns {OCapNCommsKit}
 */
const makeOCapNCommsKit = ({
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
 * @typedef {(targetSlot: CapTPSlot, mode?: 'deliver' | 'deliver-only') => RemoteKit} MakeRemoteKit
 * Make a remote promise for `target` (an id in the questions table)
 *
 * @param {object} opts
 * @param {Logger} opts.logger
 * @param {() => boolean} opts.didUnplug
 * @param {((reason?: any, returnIt?: boolean) => void)} opts.quietReject
 * @param {() => [CapTPSlot, Promise<any>]} opts.makeQuestion
 * @param {((obj: Record<string, any>) => void)} opts.send
 * @param {(slot: CapTPSlot) => any} opts.getValForSlot
 * @param {MakeLocalResolver} opts.makeLocalResolver
 * @returns {MakeRemoteKit}
 */
const makeMakeRemoteKit = ({
  logger,
  send,
  didUnplug,
  quietReject,
  makeQuestion,
  getValForSlot,
  makeLocalResolver,
}) => {
  /** @type {MakeRemoteKit} */
  const makeRemoteKit = (targetSlot, mode = 'deliver') => {
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
    const handler = {
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
    };

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

  return makeRemoteKit;
};

/**
 * @typedef {object} CodecKit
 * @property {(syrupReader: SyrupReader) => any} readOCapNMessage
 * @property {(message: any) => Uint8Array} writeOCapNMessage
 *
 * @param {TableKit} tableKit
 * @returns {CodecKit}
 */
const makeCodecKit = tableKit => {
  const descCodecs = makeDescCodecs(tableKit);
  const passableCodecs = makePassableCodecs(descCodecs);
  const { readOCapNMessage, writeOCapNMessage } = makeOcapnOperationsCodecs(
    descCodecs,
    passableCodecs,
  );
  return {
    readOCapNMessage,
    writeOCapNMessage,
  };
};

/**
 * @typedef {'object' | 'promise' | 'question'} SlotType
 */

/** @type {Record<string, SlotType>} */
const slotTypes = harden({
  o: 'object',
  p: 'promise',
  q: 'question',
});

/**
 * @typedef {object} TableKit
 * @property {(value: any) => bigint} convertRemoteValToPosition
 * @property {(value: any) => bigint} convertRemotePromiseToPosition
 * @property {(value: any) => bigint} convertLocalValToPosition
 * @property {(value: any) => bigint} convertLocalPromiseToPosition
 * @property {(position: bigint) => any} convertPositionToRemoteVal
 * @property {(position: bigint) => any} provideRemotePromise
 * @property {(position: bigint) => any} convertPositionToLocal
 * @property {(position: bigint) => any} convertPositionToLocalPromise
 * @property {(position: bigint) => any} provideRemoteResolver
 * @property {(position: bigint) => any} provideLocalAnswer
 * @property {(position: bigint) => any} positionForRemoteAnswer
 * @property {(value: any) => { position: bigint, type: SlotType, isLocal: boolean, slot: CapTPSlot }} getInfoForVal
 */

/**
 * @param {CapTPEngine} engine
 * @param {MakeRemoteResolver} makeRemoteResolver
 * @returns {TableKit}
 */
export const makeTableKit = (engine, makeRemoteResolver) => {
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
    getInfoForVal: val => {
      const slot = engine.convertValToSlot(val);
      const position = slotToPosition(slot);
      const type = slotTypes[slot[0]];
      const isLocal = slot[1] === '+';
      return { position, type, isLocal, slot };
    },
  };
  return tableKit;
};

/**
 * @typedef {object} OCapN
 * @property {((reason?: any) => void)} abort
 * @property {((data: Uint8Array) => void)} dispatchMessageData
 * @property {() => Promise<any>} getBootstrap
 */

/**
 * @param {Logger} logger
 * @param {Connection} connection
 * @param {unknown} [bootstrapObj]
 * @param {string} [ourIdLabel]
 * @returns {OCapN}
 */
export const makeOCapN = (
  logger,
  connection,
  bootstrapObj = undefined,
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
      const answerSlot = `q-${answerPosition}`;
      // eslint-disable-next-line no-use-before-define
      engine.resolveAnswer(answerSlot, hp);
      logger.info(`deliver`, { to, args, answerSlot });

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

  const { dispatch, send, quietReject, didUnplug } = makeOCapNCommsKit({
    logger,
    makeDispatch,
    onReject,
    commitSendSlots,
    // eslint-disable-next-line no-use-before-define
    rawSend: serializeAndSendMessage,
  });

  const makeRemoteKit = makeMakeRemoteKit({
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

  /** @type {MakeRemoteResolver} */
  const makeRemoteResolver = slot => {
    const { settler } = makeRemoteKit(slot, 'deliver-only');
    const resolver = Remotable(
      'Alleged: resolver',
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
    const ocapnResolver = OcapNFarObject('ocapnResolver', {
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
    if (isPromise(val)) {
      eagerlySubscribeToPromise(val, slot);
    }
  };

  const exportHook = (val, slot) => {
    logger.info(`exportHook`, val, slot);
  };

  const exportCollectedHook = (slot, decRefs) => {
    logger.info(`exportCollectedHook`, slot, decRefs);
  };

  const engine = makeCapTPEngine(ourIdLabel, makeRemoteKit, {
    exportHook,
    importHook,
    exportCollectedHook,
    gcImports: true,
  });

  const tableKit = makeTableKit(engine, makeRemoteResolver);
  const { readOCapNMessage, writeOCapNMessage } = makeCodecKit(tableKit);

  function serializeAndSendMessage(message) {
    // If we dont catch the error here it gets swallowed.
    logger.info(`sending message`, message);
    try {
      const bytes = writeOCapNMessage(message);
      const syrupObject = decodeSyrup(bytes);
      logger.info(`sending message syrup:`);
      logger.info(syrupObject, { depth: null });
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
        message = readOCapNMessage(syrupReader);
      } catch (err) {
        const problematicBytes = data.slice(start);
        const syrupMessage = decodeSyrup(problematicBytes);
        logger.info(`Message decode error:`);
        logger.info(syrupMessage, { depth: null });
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

  const getRemoteBootstrap = () => {
    const remoteBootstrapSlot = `o-0`;
    return engine.convertSlotToVal(remoteBootstrapSlot);
  };

  const localBootstrapSlot = `o+0`;
  engine.registerExport(bootstrapObj, localBootstrapSlot);

  return harden({
    abort,
    dispatchMessageData,
    getBootstrap: getRemoteBootstrap,
  });
};
