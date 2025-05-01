/** @import {RemoteKit, Settler} from '@endo/eventual-send' */
/** @import {ToCapData, FromCapData} from '@endo/marshal' */
/** @import {CapTPSlot, TrapHost, TrapGuest, TrapImpl} from './types.js' */

// Your app may need to `import '@endo/eventual-send/shim.js'` to get HandledPromise

// This logic was mostly adapted from an earlier version of Agoric's liveSlots.js with a
// good dose of https://github.com/capnproto/capnproto/blob/master/c++/src/capnp/rpc.capnp
import { Remotable, Far } from '@endo/marshal';
import { E, HandledPromise } from '@endo/eventual-send';
import { isPromise } from '@endo/promise-kit';

import { X, Fail } from '@endo/errors';
import { makeTrap } from './trap.js';

import { makeFinalizingMap } from './finalize.js';

const WELL_KNOWN_SLOT_PROPERTIES = harden(['answerID', 'questionID', 'target']);

const sink = () => {};
harden(sink);

/**
 * @param {any} maybeThenable
 * @returns {boolean}
 */
const isThenable = maybeThenable =>
  maybeThenable && typeof maybeThenable.then === 'function';

/**
 * Reverse slot direction.
 *
 * Reversed to prevent namespace collisions between slots we
 * allocate and the ones the other side allocates.  If we allocate
 * a slot, serialize it to the other side, and they send it back to
 * us, we need to reference just our own slot, not one from their
 * side.
 *
 * @param {CapTPSlot} slot
 * @returns {CapTPSlot} slot with direction reversed
 */
export const reverseSlot = slot => {
  const otherDir = slot[1] === '+' ? '-' : '+';
  const revslot = `${slot[0]}${otherDir}${slot.slice(2)}`;
  return revslot;
};

/**
 * @typedef {object} CapTPImportExportTables 
 * @property {(value: any) => CapTPSlot} makeSlotForValue
 * @property {(slot: CapTPSlot, iface: string | undefined) => any} makeValueForSlot
 * @property {(slot: CapTPSlot) => boolean} hasImport
 * @property {(slot: CapTPSlot) => any} getImport
 * @property {(slot: CapTPSlot, value: any) => void} markAsImported
 * @property {(slot: CapTPSlot) => boolean} hasExport
 * @property {(slot: CapTPSlot) => any} getExport
 * @property {(slot: CapTPSlot, value: any) => void} markAsExported
 * @property {(slot: CapTPSlot) => void} deleteExport
 * @property {() => void} didDisconnect
 
 * @typedef {object} MakeCapTPImportExportTablesOptions
 * @property {boolean} gcImports
 * @property {(slot: CapTPSlot) => void} releaseSlot
 * @property {(slot: CapTPSlot) => RemoteKit} makeRemoteKit
 
 * @param {MakeCapTPImportExportTablesOptions} options
 * @returns {CapTPImportExportTables}
 */
const makeDefaultCapTPImportExportTables = ({
  gcImports,
  releaseSlot,
  makeRemoteKit,
}) => {
  /** @type {Map<CapTPSlot, any>} */
  const slotToExported = new Map();
  const slotToImported = makeFinalizingMap(
    /**
     * @param {CapTPSlot} slotID
     */
    slotID => {
      releaseSlot(slotID);
    },
    { weakValues: gcImports },
  );

  let lastExportID = 0;
  let lastPromiseID = 0;

  /**
   * Called when we have encountered a new value that needs to be assigned a slot.
   *
   * @param {any} val
   * @returns {CapTPSlot}
   */
  const makeSlotForValue = val => {
    /** @type {CapTPSlot} */
    let slot;
    if (isPromise(val)) {
      // This is a promise, so we're going to increment the lastPromiseID
      // and use that to construct the slot name.  Promise slots are prefaced
      // with 'p+'.
      lastPromiseID += 1;
      slot = `p+${lastPromiseID}`;
    } else {
      // Since this isn't a promise, we instead increment the lastExportId and
      // use that to construct the slot name.  Non-promises are prefaced with
      // 'o+' for normal objects.
      lastExportID += 1;
      slot = `o+${lastExportID}`;
    }
    return slot;
  };

  /**
   * Called when we have a new slot that needs to be made into a value.
   *
   * @param {CapTPSlot} slot
   * @param {string | undefined} iface
   * @returns {{val: any, settler: Settler }}
   */
  const makeValueForSlot = (slot, iface) => {
    let val;
    // Make a new handled promise for the slot.
    const { promise, settler } = makeRemoteKit(slot);
    if (slot[0] === 'o' || slot[0] === 't') {
      // A new remote presence
      // Use Remotable rather than Far to make a remote from a presence
      val = Remotable(iface, undefined, settler.resolveWithPresence());
    } else if (slot[0] === 'p') {
      val = promise;
    } else {
      Fail`Unknown slot type ${slot}`;
    }
    return { val, settler };
  };

  return {
    makeSlotForValue,
    makeValueForSlot,
    hasImport: slot => slotToImported.has(slot),
    getImport: slot => slotToImported.get(slot),
    markAsImported: (slot, val) => slotToImported.set(slot, val),
    hasExport: slot => slotToExported.has(slot),
    getExport: slot => slotToExported.get(slot),
    markAsExported: (slot, val) => slotToExported.set(slot, val),
    deleteExport: slot => slotToExported.delete(slot),
    didDisconnect: () => slotToImported.clearWithoutFinalizing(),
  };
};

/**
 * @template T
 * @typedef {object} RefCounter<T>
 * @property {((specimen: T) => T)} add
 * @property {() => void} commit
 * @property {() => void} abort
 */

/**
 * @template T
 * @param {Map<T, number>} specimenToRefCount
 * @param {(specimen: T) => boolean} predicate
 * @returns {RefCounter<T>}
 */
const makeRefCounter = (specimenToRefCount, predicate) => {
  /** @type {Set<T>} */
  const seen = new Set();

  return harden({
    /**
     * @param {T} specimen
     * @returns {T}
     */
    add(specimen) {
      if (predicate(specimen)) {
        seen.add(specimen);
      }
      return specimen;
    },
    commit() {
      // Increment the reference count for each seen specimen.
      for (const specimen of seen.keys()) {
        const numRefs = specimenToRefCount.get(specimen) || 0;
        specimenToRefCount.set(specimen, numRefs + 1);
      }
      seen.clear();
    },
    abort() {
      seen.clear();
    },
  });
};

/**
 * @typedef {object} CapTPEngineOptions the options to makeCapTP
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
 * @typedef {object} CapTPEngine
 * @property {() => Promise<any>} getBootstrap
 * @property {(val: unknown) => CapTPSlot | undefined} getSlotForValue
 * Gets the slot for a value, but does not register a new slot if the value is
 * unknown.
 * @property {() => Record<string, Record<string, number>>} getStats
 * @property {<T>(name: string, obj: T) => T} makeTrapHandler
 * @property {import('./ts-types.js').Trap | undefined} Trap
 * @property {((target: string) => RemoteKit)} makeRemoteKit
 * @property {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} dispatch
 * @property {((reason?: any) => void)} abort
 * @property {((slot: CapTPSlot, toDecr: number) => void)} dropSlotRefs
 * @property {((questionID: string, result: any) => void)} resolveAnswer
 * @property {((questionID: string) => boolean)} hasAnswer
 * @property {((questionID: string) => any)} getAnswer
 * @property {((answerID: string, result: any) => void)} resolveQuestion
 * @property {((answerID: string, exception: any) => void)} rejectQuestion
 * @property {((reason: any) => void)} disconnect
 * @property {import('@endo/marshal').ConvertValToSlot<CapTPSlot>} convertValToSlot
 * @property {import('@endo/marshal').ConvertSlotToVal<CapTPSlot>} convertSlotToVal
 * @property {RefCounter<string>} recvSlot
 * @property {RefCounter<string>} sendSlot
 * @property {WeakSet<any>} exportedTrapHandlers
 * @property {Map<string, Promise<IteratorResult<void, void>>>} trapIteratorResultP
 * @property {Map<string, AsyncIterator<void, void, any>>} trapIterator
 */

/**
 * @typedef {object} MakeDispatchArgs
 * @property {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} send
 * @property {((reason?: any, returnIt?: boolean) => void)} quietReject
 * @property {() => boolean} didUnplug
 * @property {((reason?: any) => void)} doUnplug
 * @property {Record<string, number>} sendStats
 * @property {Record<string, number>} recvStats
 */

/**
 * @typedef {((args: MakeDispatchArgs) => ((reason?: any) => void))} MakeDispatch
 */

/**
 * Create a CapTP connection.
 *
 * @param {string} ourId our name for the current side
 * @param {((obj: Record<string, any>) => void) | ((obj: Record<string, any>) => PromiseLike<void>)} rawSend send a JSONable packet
 * @param {MakeDispatch} makeDispatch make a handler for the CapTP
 * @param {ToCapData<string>} serialize
 * @param {FromCapData<string>} unserialize
 * @param {CapTPEngineOptions} opts options to the connection
 * @returns {CapTPEngine}
 */
export const makeCapTPEngine = (
  ourId,
  rawSend,
  makeDispatch,
  serialize,
  unserialize,
  opts = {},
) => {
  /** @type {Record<string, number>} */
  const sendStats = {};
  /** @type {Record<string, number>} */
  const recvStats = {};

  const gcStats = {
    DROPPED: 0,
  };
  const getStats = () =>
    harden({
      send: { ...sendStats },
      recv: { ...recvStats },
      gc: { ...gcStats },
    });

  const {
    onReject = err => console.error('CapTP', ourId, 'exception:', err),
    epoch = 0,
    exportHook,
    importHook,
    trapGuest,
    trapHost,
    gcImports = false,
    makeCapTPImportExportTables = makeDefaultCapTPImportExportTables,
  } = opts;

  // It's a hazard to have trapGuest and trapHost both enabled, as we may
  // encounter deadlock.  Without a lot more bookkeeping, we can't detect it for
  // more general networks of CapTPs, but we are conservative for at least this
  // one case.
  !(trapHost && trapGuest) ||
    Fail`CapTP ${ourId} can only be one of either trapGuest or trapHost`;

  /** @type {Map<string, Promise<IteratorResult<void, void>>>} */
  const trapIteratorResultP = new Map();
  /** @type {Map<string, AsyncIterator<void, void, any>>} */
  const trapIterator = new Map();

  /** @type {any} */
  let unplug = false;
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

  /** @type {Map<CapTPSlot, number>} */
  const slotToNumRefs = new Map();

  /** @type {RefCounter<string>} */
  const recvSlot = makeRefCounter(
    slotToNumRefs,
    slot => typeof slot === 'string' && slot[1] === '-',
  );

  /** @type {RefCounter<string>} */
  const sendSlot = makeRefCounter(
    slotToNumRefs,
    slot => typeof slot === 'string' && slot[1] === '+',
  );

  /**
   * @param {Record<string, any>} obj
   */
  const send = obj => {
    sendStats[obj.type] = (sendStats[obj.type] || 0) + 1;

    for (const prop of WELL_KNOWN_SLOT_PROPERTIES) {
      sendSlot.add(obj[prop]);
    }
    sendSlot.commit();

    // Don't throw here if unplugged, just don't send.
    if (unplug !== false) {
      return;
    }

    // Actually send the message.
    Promise.resolve(rawSend(obj))
      // eslint-disable-next-line no-use-before-define
      .catch(abort); // Abort if rawSend returned a rejection.
  };

  /** @type {WeakMap<any, CapTPSlot>} */
  const valToSlot = new WeakMap(); // exports looked up by val
  const exportedTrapHandlers = new WeakSet();

  // Used to construct slot names for questions.
  // In this version of CapTP we use strings for export/import slot names.
  // prefixed with 'p' if promises, 'q' for questions, 'o' for objects,
  // and 't' for traps.;
  let lastQuestionID = 0;
  let lastTrapID = 0;

  /** @type {Map<CapTPSlot, Settler<unknown>>} */
  const settlers = new Map();
  /** @type {Map<string, any>} */
  const answers = new Map(); // chosen by our peer

  /**
   * @template [T=unknown]
   * @param {string} target
   * @returns {RemoteKit<T>}
   * Make a remote promise for `target` (an id in the questions table)
   */
  const makeRemoteKit = target => {
    /**
     * This handler is set up such that it will transform both
     * attribute access and method invocation of this remote promise
     * as also being questions / remote handled promises
     *
     * @type {import('@endo/eventual-send').EHandler<{}>}
     */
    const handler = {
      get(_o, prop) {
        if (unplug !== false) {
          return quietReject(unplug);
        }
        // eslint-disable-next-line no-use-before-define
        const [questionID, promise] = makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          method: serialize(harden([prop])),
        });
        return promise;
      },
      applyFunction(_o, args) {
        if (unplug !== false) {
          return quietReject(unplug);
        }
        // eslint-disable-next-line no-use-before-define
        const [questionID, promise] = makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          // @ts-expect-error Type 'unknown' is not assignable to type 'Passable<PassableCap, Error>'.
          method: serialize(harden([null, args])),
        });
        return promise;
      },
      applyMethod(_o, prop, args) {
        if (unplug !== false) {
          return quietReject(unplug);
        }
        // Support: o~.[prop](...args) remote method invocation
        // eslint-disable-next-line no-use-before-define
        const [questionID, promise] = makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          // @ts-expect-error Type 'unknown' is not assignable to type 'Passable<PassableCap, Error>'.
          method: serialize(harden([prop, args])),
        });
        return promise;
      },
    };

    /** @type {Settler<T> | undefined} */
    let settler;

    /** @type {import('@endo/eventual-send').HandledExecutor<T>} */
    const executor = (resolve, reject, resolveWithPresence) => {
      const s = Far('settler', {
        resolve,
        reject,
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

  const releaseSlot = slotID => {
    // We drop all the references we know about at once, since GC told us we
    // don't need them anymore.
    const decRefs = slotToNumRefs.get(slotID) || 0;
    slotToNumRefs.delete(slotID);
    send({ type: 'CTP_DROP', slotID, decRefs, epoch });
  };

  const importExportTables = makeCapTPImportExportTables({
    gcImports,
    releaseSlot,
    // eslint-disable-next-line no-use-before-define
    makeRemoteKit,
  });

  /**
   * Called at marshalling time.  Either retrieves an existing export, or if
   * not yet exported, records this exported object.  If a promise, sets up a
   * promise listener to inform the other side when the promise is
   * fulfilled/broken.
   *
   * @type {import('@endo/marshal').ConvertValToSlot<CapTPSlot>}
   */
  function convertValToSlot(val) {
    if (!valToSlot.has(val)) {
      /** @type {CapTPSlot} */
      let slot;
      if (exportedTrapHandlers.has(val)) {
        lastTrapID += 1;
        slot = `t+${lastTrapID}`;
      } else {
        slot = importExportTables.makeSlotForValue(val);
      }
      if (exportHook) {
        exportHook(val, slot);
      }
      if (isPromise(val)) {
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
      }
      // Now record the export in both valToSlot and slotToVal so we can look it
      // up from either the value or the slot name later.
      valToSlot.set(val, slot);
      importExportTables.markAsExported(slot, val);
    }

    // At this point, the value is guaranteed to be exported, so return the
    // associated slot number.
    const slot = valToSlot.get(val);
    assert.typeof(slot, 'string');
    sendSlot.add(slot);

    return slot;
  }

  /**
   * Generate a new question in the questions table and set up a new
   * remote handled promise.
   *
   * @returns {[CapTPSlot, Promise]}
   */
  const makeQuestion = () => {
    lastQuestionID += 1;
    const slotID = `q-${lastQuestionID}`;

    const { promise, settler } = makeRemoteKit(slotID);
    settlers.set(slotID, settler);

    // To fix #2846:
    // We return 'p' to the handler, and the eventual resolution of 'p' will
    // be used to resolve the caller's Promise, but the caller never sees 'p'
    // itself. The caller got back their Promise before the handler ever got
    // invoked, and thus before queueMessage was called. If that caller
    // passes the Promise they received as argument or return value, we want
    // it to serialize as resultVPID. And if someone passes resultVPID to
    // them, we want the user-level code to get back that Promise, not 'p'.
    valToSlot.set(promise, slotID);
    importExportTables.markAsImported(slotID, promise);

    return [sendSlot.add(slotID), promise];
  };

  /**
   * Set up import
   *
   * @type {import('@endo/marshal').ConvertSlotToVal<CapTPSlot>}
   */
  function convertSlotToVal(theirSlot, iface = undefined) {
    const slot = reverseSlot(theirSlot);

    if (slot[1] === '+') {
      importExportTables.hasExport(slot) || Fail`Unknown export ${slot}`;
      return importExportTables.getExport(slot);
    }
    if (!importExportTables.hasImport(slot)) {
      if (iface === undefined) {
        iface = `Alleged: Presence ${ourId} ${slot}`;
      }
      const { val, settler } = importExportTables.makeValueForSlot(slot, iface);
      if (importHook) {
        importHook(val, slot);
      }
      if (slot[0] === 'p') {
        // A new promise
        settlers.set(slot, settler);
      }
      importExportTables.markAsImported(slot, val);
      valToSlot.set(val, slot);
    }

    // If we imported this slot, mark it as one our peer exported.
    recvSlot.add(slot);
    return importExportTables.getImport(slot);
  }

  // Get a reference to the other side's bootstrap object.
  const getBootstrap = async () => {
    if (unplug !== false) {
      return quietReject(unplug);
    }
    const [questionID, promise] = makeQuestion();
    send({
      type: 'CTP_BOOTSTRAP',
      epoch,
      questionID,
    });
    return harden(promise);
  };

  const dispatch = makeDispatch({
    send,
    quietReject,
    didUnplug: () => unplug,
    doUnplug: reason => {
      unplug = reason;
    },
    sendStats,
    recvStats,
  });

  // Abort a connection.
  /** @type {((reason?: any) => void)} */
  const abort = (reason = undefined) => {
    dispatch({ type: 'CTP_DISCONNECT', epoch, reason });
  };

  const makeTrapHandler = (name, obj) => {
    const far = Far(name, obj);
    exportedTrapHandlers.add(far);
    return far;
  };

  const getSlotForValue = val => {
    return valToSlot.get(val);
  };

  /**
   * @param {CapTPSlot} slot
   * @param {number} toDecr
   */
  const dropSlotRefs = (slot, toDecr) => {
    const numRefs = slotToNumRefs.get(slot) || 0;
    if (numRefs > toDecr) {
      slotToNumRefs.set(slot, numRefs - toDecr);
    } else {
      // We are dropping the last known reference to this slot.
      gcStats.DROPPED += 1;
      slotToNumRefs.delete(slot);
      importExportTables.deleteExport(slot);
      answers.delete(slot);
    }
  };

  const resolveAnswer = (questionID, result) => {
    answers.delete(questionID);
    answers.set(questionID, result);
  };

  const hasAnswer = questionID => {
    return answers.has(questionID);
  };

  const getAnswer = questionID => {
    return answers.get(questionID);
  };

  const takeSettler = answerID => {
    const settler = settlers.get(answerID);
    if (!settler) {
      throw Error(
        `Got an answer to a question we have not asked. (answerID = ${answerID} )`,
      );
    }
    settlers.delete(answerID);
    return settler;
  };

  const resolveQuestion = (answerID, result) => {
    const settler = takeSettler(answerID);
    settler.resolve(result);
  };

  const rejectQuestion = (answerID, exception) => {
    const settler = takeSettler(answerID);
    settler.reject(exception);
  };

  const rejectAllQuestions = reason => {
    for (const settler of settlers.values()) {
      settler.reject(reason);
    }
  };

  const disconnect = reason => {
    // We no longer wish to subscribe to object finalization.
    importExportTables.didDisconnect();
    rejectAllQuestions(reason);
  };

  // Put together our return value.
  /** @type {CapTPEngine} */
  const rets = {
    getBootstrap,
    getSlotForValue,
    getStats,
    makeTrapHandler,
    Trap: /** @type {import('./ts-types.js').Trap | undefined} */ (undefined),
    makeRemoteKit,
    dispatch,
    abort,
    dropSlotRefs,
    resolveAnswer,
    hasAnswer,
    getAnswer,
    resolveQuestion,
    rejectQuestion,
    disconnect,
    convertValToSlot,
    convertSlotToVal,
    recvSlot,
    sendSlot,
    exportedTrapHandlers,
    trapIterator,
    trapIteratorResultP,
  };

  if (trapGuest) {
    assert.typeof(trapGuest, 'function', X`opts.trapGuest must be a function`);

    // Create the Trap proxy maker.
    const makeTrapImpl =
      implMethod =>
      (val, ...implArgs) => {
        Promise.resolve(val) !== val ||
          Fail`Trap(${val}) target cannot be a promise`;

        const slot = valToSlot.get(val);
        // TypeScript confused about `||` control flow so use `if` instead
        // https://github.com/microsoft/TypeScript/issues/50739
        if (!(slot && slot[1] === '-')) {
          Fail`Trap(${val}) target was not imported`;
        }
        // @ts-expect-error TypeScript confused by `Fail` too?
        slot[0] === 't' ||
          Fail`Trap(${val}) imported target was not created with makeTrapHandler`;

        // Send a "trap" message.
        lastQuestionID += 1;
        const questionID = `q-${lastQuestionID}`;

        // Encode the "method" parameter of the CTP_CALL.
        let method;
        switch (implMethod) {
          case 'get': {
            const [prop] = implArgs;
            method = serialize(harden([prop]));
            break;
          }
          case 'applyFunction': {
            const [args] = implArgs;
            method = serialize(harden([null, args]));
            break;
          }
          case 'applyMethod': {
            const [prop, args] = implArgs;
            method = serialize(harden([prop, args]));
            break;
          }
          default: {
            Fail`Internal error; unrecognized implMethod ${implMethod}`;
          }
        }

        // Set up the trap call with its identifying information and a way to send
        // messages over the current CapTP data channel.
        const [isException, serialized] = trapGuest({
          trapMethod: implMethod,
          // @ts-expect-error TypeScript confused by `Fail` too?
          slot,
          trapArgs: implArgs,
          startTrap: () => {
            // Send the call metadata over the connection.
            send({
              type: 'CTP_CALL',
              epoch,
              trap: true, // This is the magic marker.
              questionID,
              target: slot,
              method,
            });

            // Return an IterationObserver.
            const makeIteratorMethod =
              (iteratorMethod, done) =>
              (...args) => {
                send({
                  type: 'CTP_TRAP_ITERATE',
                  epoch,
                  questionID,
                  serialized: serialize(harden([iteratorMethod, args])),
                });
                return harden({ done, value: undefined });
              };
            return harden({
              next: makeIteratorMethod('next', false),
              return: makeIteratorMethod('return', true),
              throw: makeIteratorMethod('throw', true),
            });
          },
        });

        const value = unserialize(serialized);
        !isThenable(value) ||
          Fail`Trap(${val}) reply cannot be a Thenable; have ${value}`;

        if (isException) {
          throw value;
        }
        return value;
      };

    /** @type {TrapImpl} */
    const trapImpl = {
      applyFunction: makeTrapImpl('applyFunction'),
      applyMethod: makeTrapImpl('applyMethod'),
      get: makeTrapImpl('get'),
    };
    harden(trapImpl);

    rets.Trap = makeTrap(trapImpl);
  }

  return harden(rets);
};
