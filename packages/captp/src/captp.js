/** @import {RemoteKit} from '@endo/eventual-send' */
/** @import {ToCapData, FromCapData} from '@endo/marshal' */
/** @import {CapTPSlot, TrapHost, TrapGuest} from './types.js' */
/** @import {CapTPImportExportTables} from './captp-engine.js' */

import { E } from '@endo/eventual-send';
import { makeMarshal, QCLASS } from '@endo/marshal';
import { X, Fail, annotateError } from '@endo/errors';
import { makePromiseKit, isPromise } from '@endo/promise-kit';

import { makeCapTPEngine, reverseSlot } from './captp-engine.js';

export { E };

const sink = () => {};
harden(sink);

const WELL_KNOWN_SLOT_PROPERTIES = ['type', 'slots', 'body'];

/**
 * @typedef {(obj: Record<string, any>) => boolean} Dispatch
 * @typedef {(sendStats: Record<string, number>, recvStats: Record<string, number>) => Dispatch} MakeDispatch
 *
 * @typedef {object} MakeCapTPCommsKitOptions
 * @property {MakeDispatch} makeDispatch
 * @property {(err: any) => void} onReject
 * @property {number} epoch
 * @property {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} rawSend
 * @property {((slot: CapTPSlot) => void)} addSendSlot
 * @property {() => void} commitSendSlots
 *
 * @typedef {object} CapTPCommsKit
 * @property {((obj: Record<string, any>) => void)} dispatch
 * @property {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} send
 * @property {((reason?: any) => void)} abort
 * @property {((reason?: any, returnIt?: boolean) => void)} quietReject
 * @property {() => boolean} didUnplug
 * @property {((reason?: any) => void)} doUnplug
 * @property {Record<string, number>} sendStats
 * @property {Record<string, number>} recvStats
 */

/** @type {(opts: MakeCapTPCommsKitOptions) => CapTPCommsKit} */
const makeCapTPCommsKit = ({
  makeDispatch,
  onReject,
  epoch,
  rawSend,
  addSendSlot,
  commitSendSlots,
}) => {
  /** @type {Record<string, number>} */
  const sendStats = {};
  /** @type {Record<string, number>} */
  const recvStats = {};

  /** @type {any} */
  let unplug = false;
  const didUnplug = () => unplug;
  const doUnplug = reason => (unplug = reason);

  const quietReject = (reason = undefined, returnIt = true) => {
    if ((unplug === false || reason !== unplug) && reason !== undefined) {
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

    for (const prop of WELL_KNOWN_SLOT_PROPERTIES) {
      addSendSlot(obj[prop]);
    }
    commitSendSlots();

    // Don't throw here if unplugged, just don't send.
    if (unplug !== false) {
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
    dispatch({ type: 'CTP_DISCONNECT', epoch, reason });
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
 * @typedef {object} CapTPOptions the options to makeCapTP
 * @property {(val: unknown, slot: CapTPSlot) => void} [exportHook]
 * @property {(val: unknown, slot: CapTPSlot) => void} [importHook]
 * @property {(err: any) => void} [onReject]
 * @property {number} [epoch] an integer tag to attach to all messages in order to
 * assist in ignoring earlier defunct instance's messages
 * @property {TrapGuest} [trapGuest] if specified, enable this CapTP (guest) to
 * use Trap(target) to block while the recipient (host) resolves and
 * communicates the response to the message
 * @property {TrapHost} [trapHost] if specified, enable this CapTP (host) to serve
 * objects marked with makeTrapHandler to synchronous clients (guests)
 * @property {boolean} [gcImports] if true, aggressively garbage collect imports
 * @property {(MakeCapTPImportExportTablesOptions) => CapTPImportExportTables} [makeCapTPImportExportTables] provide external import/export tables
 *
 * @typedef {object} CapTP
 * @property {((reason?: any) => void)} abort
 * @property {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} dispatch
 * @property {() => Promise<any>} getBootstrap
 * @property {() => Record<string, Record<string, number>>} getStats
 * @property {(val: unknown) => boolean} isOnlyLocal
 * @property {ToCapData<string>} serialize
 * @property {FromCapData<string>} unserialize
 * @property {<T>(name: string, obj: T) => T} makeTrapHandler
 * @property {import('./ts-types.js').Trap | undefined} Trap
 * @property {((target: string) => RemoteKit)} makeRemoteKit
 */

/**
 * Create a CapTP connection.
 *
 * @param {string} ourId our name for the current side
 * @param {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} rawSend send a JSONable packet
 * @param {any} bootstrapObj the object to export to the other side
 * @param {CapTPOptions} opts options to the connection
 * @returns {CapTP}
 */
export const makeCapTP = (
  ourId,
  rawSend,
  bootstrapObj = undefined,
  opts = {},
) => {
  const {
    onReject = err => console.error('CapTP', ourId, 'exception:', err),
    epoch = 0,
    trapHost,
  } = opts;

  const {
    dispatch,
    sendStats,
    recvStats,
    abort,
    send,
    didUnplug,
    doUnplug,
    quietReject,
  } = makeCapTPCommsKit({
    rawSend,
    // eslint-disable-next-line no-use-before-define
    makeDispatch,
    onReject,
    epoch,
    // eslint-disable-next-line no-use-before-define
    addSendSlot: slot => engine.sendSlot.add(slot),
    // eslint-disable-next-line no-use-before-define
    commitSendSlots: () => engine.sendSlot.commit(),
  });

  /**
   * convertValToSlot and convertSlotToVal both perform side effects,
   * populating the c-lists (imports/exports/questions/answers) upon
   * marshalling/unmarshalling.  As we traverse the datastructure representing
   * the message, we discover what we need to import/export and send relevant
   * messages across the wire.
   */
  const { serialize, unserialize } = makeMarshal(
    // eslint-disable-next-line no-use-before-define
    val => engine.convertValToSlot(val),
    // eslint-disable-next-line no-use-before-define
    (slot, iface) => engine.convertSlotToVal(slot, iface),
    {
      marshalName: `captp:${ourId}`,
      // TODO Temporary hack.
      // See https://github.com/Agoric/agoric-sdk/issues/2780
      errorIdNum: 20000,
      // TODO: fix captp to be compatible with smallcaps
      serializeBodyFormat: 'capdata',
    },
  );

  /** @type {(val: Promise<unknown>, slot: CapTPSlot) => void} */
  const eagerlyForwardPromiseResolution = (val, slot) => {
    // Set up promise listener to inform other side when this promise
    // is fulfilled/broken
    const promiseID = reverseSlot(slot);
    const resolved = result =>
      send({
        type: 'CTP_RESOLVE',
        promiseID,
        res: serialize(harden(result)),
      });
    const rejected = reason =>
      send({
        type: 'CTP_RESOLVE',
        promiseID,
        rej: serialize(harden(reason)),
      });
    E.when(
      val,
      resolved,
      rejected,
      // Propagate internal errors as rejections.
    ).catch(rejected);
  };

  /** @type {(val: unknown, slot: CapTPSlot) => void} */
  const exportHook = (val, slot) => {
    if (opts.exportHook) {
      opts.exportHook(val, slot);
    }
    if (isPromise(val)) {
      eagerlyForwardPromiseResolution(val, slot);
    }
  };

  const engine = makeCapTPEngine(
    ourId,
    send,
    serialize,
    unserialize,
    quietReject,
    didUnplug,
    {
      ...opts,
      exportHook,
    },
  );

  /** @type {MakeDispatch} */
  function makeDispatch(
    // eslint-disable-next-line no-shadow
    sendStats,
    // eslint-disable-next-line no-shadow
    recvStats,
  ) {
    const disconnectReason = id =>
      Error(`${JSON.stringify(id)} connection closed`);

    // Message handler used for CapTP dispatcher
    const handler = harden({
      // Remote is asking for bootstrap object
      CTP_BOOTSTRAP(obj) {
        const { questionID } = obj;
        const bootstrap =
          typeof bootstrapObj === 'function' ? bootstrapObj(obj) : bootstrapObj;
        E.when(bootstrap, bs => {
          engine.resolveAnswer(questionID, bs);
          send({
            type: 'CTP_RETURN',
            epoch,
            answerID: questionID,
            result: serialize(bs),
          });
        });
      },
      CTP_DROP(obj) {
        const { slotID, decRefs = 0 } = obj;
        // Ensure we are decrementing one of our exports.
        slotID[1] === '-' || Fail`Cannot drop non-exported ${slotID}`;
        const slot = reverseSlot(slotID);
        const toDecr = Number(decRefs);
        engine.dropSlotRefs(slot, toDecr);
      },
      // Remote is invoking a method or retrieving a property.
      CTP_CALL(obj) {
        // questionId: Remote promise (for promise pipelining) this call is
        //   to fulfill
        // target: Slot id of the target to be invoked.  Checks against
        //   answers first; otherwise goes through unserializer
        const { questionID, target, trap } = obj;

        const [prop, args] = unserialize(obj.method);
        let val;
        if (engine.hasAnswer(target)) {
          val = engine.getAnswer(target);
        } else {
          val = unserialize({
            body: JSON.stringify({
              [QCLASS]: 'slot',
              index: 0,
            }),
            slots: [target],
          });
        }

        /** @type {(isReject: boolean, value: any) => void} */
        let processResult = (isReject, value) => {
          // Serialize the result.
          let serial;
          try {
            serial = serialize(harden(value));
          } catch (error) {
            // Promote serialization errors to rejections.
            isReject = true;
            serial = serialize(harden(error));
          }

          send({
            type: 'CTP_RETURN',
            epoch,
            answerID: questionID,
            [isReject ? 'exception' : 'result']: serial,
          });
        };
        if (trap) {
          engine.exportedTrapHandlers.has(val) ||
            Fail`Refused Trap(${val}) because target was not registered with makeTrapHandler`;
          assert.typeof(
            trapHost,
            'function',
            X`CapTP cannot answer Trap(${val}) without a trapHost function`,
          );

          // We need to create a promise for the "isDone" iteration right now to
          // prevent a race with the other side.
          const resultPK = makePromiseKit();
          engine.trapIteratorResultP.set(questionID, resultPK.promise);

          processResult = (isReject, value) => {
            const serialized = serialize(harden(value));
            const ait = trapHost([isReject, serialized]);
            if (!ait) {
              // One-shot, no async iterator.
              resultPK.resolve({ done: true });
              return;
            }

            // We're ready for them to drive the iterator.
            engine.trapIterator.set(questionID, ait);
            resultPK.resolve({ done: false });
          };
        }

        // If `args` is supplied, we're applying a method or function...
        // otherwise this is property access
        let hp;
        if (!args) {
          hp = HandledPromise.get(val, prop);
        } else if (prop === null) {
          hp = HandledPromise.applyFunction(val, args);
        } else {
          hp = HandledPromise.applyMethod(val, prop, args);
        }

        // Answer with our handled promise
        engine.resolveAnswer(questionID, hp);

        hp
          // Process this handled promise method's result when settled.
          .then(
            fulfilment => processResult(false, fulfilment),
            reason => processResult(true, reason),
          )
          // Propagate internal errors as rejections.
          .catch(reason => processResult(true, reason));
      },
      // Have the host serve more of the reply.
      CTP_TRAP_ITERATE: obj => {
        trapHost || Fail`CTP_TRAP_ITERATE is impossible without a trapHost`;
        const { questionID, serialized } = obj;

        const resultP = engine.trapIteratorResultP.get(questionID);
        resultP || Fail`CTP_TRAP_ITERATE did not expect ${questionID}`;

        const [method, args] = unserialize(serialized);

        const getNextResultP = async () => {
          const result = await resultP;

          // Done with this trap iterator.
          const cleanup = () => {
            engine.trapIterator.delete(questionID);
            engine.trapIteratorResultP.delete(questionID);
            return harden({ done: true });
          };

          // We want to ensure we clean up the iterator in case of any failure.
          try {
            if (!result || result.done) {
              return cleanup();
            }

            const ait = engine.trapIterator.get(questionID);
            if (!ait) {
              // The iterator is done, so we're done.
              return cleanup();
            }

            // Drive the next iteration.
            return await ait[method](...args);
          } catch (e) {
            cleanup();
            if (!e) {
              Fail`trapGuest expected trapHost AsyncIterator(${questionID}) to be done, but it wasn't`;
            }
            annotateError(e, X`trapHost AsyncIterator(${questionID}) threw`);
            throw e;
          }
        };

        // Store the next result promise.
        const nextResultP = getNextResultP();
        engine.trapIteratorResultP.set(questionID, nextResultP);

        // Ensure that our caller handles any rejection.
        return nextResultP.then(sink);
      },
      // Answer to one of our questions.
      CTP_RETURN(obj) {
        const { result, exception, answerID } = obj;
        if ('exception' in obj) {
          engine.rejectQuestion(answerID, unserialize(exception));
        } else {
          engine.resolveQuestion(answerID, unserialize(result));
        }
      },
      // Resolution to an imported promise
      CTP_RESOLVE(obj) {
        const { promiseID, res, rej } = obj;
        if ('rej' in obj) {
          engine.rejectQuestion(promiseID, unserialize(rej));
        } else {
          engine.resolveQuestion(promiseID, unserialize(res));
        }
      },
      // The other side has signaled something has gone wrong.
      // Pull the plug!
      CTP_DISCONNECT(obj) {
        const { reason = disconnectReason(ourId) } = obj;
        if (didUnplug() === false) {
          // Reject with the original reason.
          quietReject(obj.reason, false);
          doUnplug(reason);
          // Deliver the object, even though we're unplugged.
          Promise.resolve(rawSend(obj)).catch(sink);
        }
        engine.disconnect(reason);
      },
    });
    const validTypes = new Set(Object.keys(handler));
    for (const t of validTypes.keys()) {
      sendStats[t] = 0;
      recvStats[t] = 0;
    }

    /** @type {Dispatch} */
    // eslint-disable-next-line no-shadow
    const dispatch = obj => {
      try {
        validTypes.has(obj.type) || Fail`unknown message type ${obj.type}`;

        recvStats[obj.type] += 1;
        if (didUnplug() !== false) {
          return false;
        }
        const fn = handler[obj.type];
        if (!fn) {
          return false;
        }

        for (const prop of WELL_KNOWN_SLOT_PROPERTIES) {
          engine.recvSlot.add(obj[prop]);
        }
        fn(obj);
        engine.recvSlot.commit();

        return true;
      } catch (e) {
        engine.recvSlot.abort();
        quietReject(e, false);

        return false;
      }
    };

    return dispatch;
  }

  // Get a reference to the other side's bootstrap object.
  const getBootstrap = async () => {
    if (didUnplug() !== false) {
      return quietReject(didUnplug());
    }
    const [questionID, promise] = engine.makeQuestion();
    send({
      type: 'CTP_BOOTSTRAP',
      epoch,
      questionID,
    });
    return harden(promise);
  };

  // Set up isLocalOnly check.
  const IS_REMOTE_PUMPKIN = harden({});
  const assertValIsLocal = val => {
    const slot = engine.getSlotForValue(val);
    if (slot && slot[1] === '-') {
      throw IS_REMOTE_PUMPKIN;
    }
  };
  const { serialize: assertOnlyLocal } = makeMarshal(assertValIsLocal);
  const isOnlyLocal = specimen => {
    // Try marshalling the object, but throw on references to remote objects.
    try {
      assertOnlyLocal(harden(specimen));
      return true;
    } catch (e) {
      if (e === IS_REMOTE_PUMPKIN) {
        return false;
      }
      throw e;
    }
  };

  const getStats = () =>
    harden({
      send: { ...sendStats },
      recv: { ...recvStats },
      ...engine.getStats(),
    });

  return harden({
    ...engine,
    serialize,
    unserialize,
    dispatch,
    abort,
    isOnlyLocal,
    getStats,
    getBootstrap,
  });
};
