/** @import {RemoteKit} from '@endo/eventual-send' */
/** @import {ToCapData, FromCapData} from '@endo/marshal' */
/** @import {CapTPSlot, TrapHost, TrapGuest} from './types.js' */
/** @import {CapTPImportExportTables} from './captp-engine.js' */

import { E } from '@endo/eventual-send';
import { makeMarshal, QCLASS } from '@endo/marshal';
import { X, Fail, annotateError } from '@endo/errors';
import { makePromiseKit } from '@endo/promise-kit';

import { makeCapTPEngine } from './captp-engine.js';

export { E };

const sink = () => {};
harden(sink);

const WELL_KNOWN_SLOT_PROPERTIES = ['type', 'slots', 'body'];

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
  const { epoch = 0, trapHost } = opts;

  const engine = makeCapTPEngine(
    ourId,
    rawSend,
    // eslint-disable-next-line no-use-before-define
    makeDispatch,
    opts,
  );

  /** @type {import('./captp-engine.js').MakeDispatch} */
  function makeDispatch({
    send,
    serialize,
    unserialize,
    reverseSlot,
    exportedTrapHandlers,
    trapIterator,
    trapIteratorResultP,
    quietReject,
    didUnplug,
    doUnplug,
    sendStats,
    recvStats,
    recvSlot,
  }) {
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
          exportedTrapHandlers.has(val) ||
            Fail`Refused Trap(${val}) because target was not registered with makeTrapHandler`;
          assert.typeof(
            trapHost,
            'function',
            X`CapTP cannot answer Trap(${val}) without a trapHost function`,
          );

          // We need to create a promise for the "isDone" iteration right now to
          // prevent a race with the other side.
          const resultPK = makePromiseKit();
          trapIteratorResultP.set(questionID, resultPK.promise);

          processResult = (isReject, value) => {
            const serialized = serialize(harden(value));
            const ait = trapHost([isReject, serialized]);
            if (!ait) {
              // One-shot, no async iterator.
              resultPK.resolve({ done: true });
              return;
            }

            // We're ready for them to drive the iterator.
            trapIterator.set(questionID, ait);
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

        const resultP = trapIteratorResultP.get(questionID);
        resultP || Fail`CTP_TRAP_ITERATE did not expect ${questionID}`;

        const [method, args] = unserialize(serialized);

        const getNextResultP = async () => {
          const result = await resultP;

          // Done with this trap iterator.
          const cleanup = () => {
            trapIterator.delete(questionID);
            trapIteratorResultP.delete(questionID);
            return harden({ done: true });
          };

          // We want to ensure we clean up the iterator in case of any failure.
          try {
            if (!result || result.done) {
              return cleanup();
            }

            const ait = trapIterator.get(questionID);
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
        trapIteratorResultP.set(questionID, nextResultP);

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

    /** @type {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} */
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
          recvSlot.add(obj[prop]);
        }
        fn(obj);
        recvSlot.commit();

        return true;
      } catch (e) {
        recvSlot.abort();
        quietReject(e, false);

        return false;
      }
    };

    return dispatch;
  }

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

  return harden({
    ...engine,
    isOnlyLocal,
  });
};
