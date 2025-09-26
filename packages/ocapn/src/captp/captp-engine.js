/** @import {RemoteKit, Settler} from '@endo/eventual-send' */
/** @import {CapTPSlot} from './types.js' */

/**
 * @import { Logger } from '../client/types.js'
 */

// Your app may need to `import '@endo/eventual-send/shim.js'` to get HandledPromise

// This logic was mostly adapted from an earlier version of Agoric's liveSlots.js with a
// good dose of https://github.com/capnproto/capnproto/blob/master/c++/src/capnp/rpc.capnp
import { Remotable } from '@endo/marshal';
import { isPromise } from '@endo/promise-kit';

import { Fail } from '@endo/errors';
import { makeFinalizingMap } from './finalize.js';

const sink = () => {};
harden(sink);

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
      lastExportID += 1;
      slot = `p+${lastExportID}`;
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
 * @property {(slotID: CapTPSlot, decRefs: number) => void} [importCollectedHook]
 * @property {boolean} [gcImports] if true, aggressively garbage collect imports
 * @property {(MakeCapTPImportExportTablesOptions) => CapTPImportExportTables} [makeCapTPImportExportTables] provide external import/export tables
 * @property {WeakSet<any>} [exportedTrapHandlers]
 *
 * @typedef {object} CapTPEngine
 * @property {(val: unknown) => CapTPSlot | undefined} getSlotForValue
 * Gets the slot for a value, but does not register a new slot if the value is
 * unknown.
 * @property {() => Record<string, Record<string, number>>} getStats
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
 * @property {() => [CapTPSlot, Promise<any>]} makeQuestion
 * @property {() => string} takeNextQuestionID
 * @property {((val: unknown, slot: CapTPSlot) => void)} registerExport
 * @property {((val: unknown, slot: CapTPSlot) => void)} registerImport
 * @property {((questionID: string) => Settler<any>)} takeSettler
 * @property {((slot: CapTPSlot) => any)} getExport
 *  * Gets the value for a slot, but does not create a new value if the slot is
 * unknown.
 * @property {((slot: CapTPSlot) => any)} getImport
 *  * Gets the value for a slot, but does not create a new value if the slot is
 * unknown.
 */

/**
 * Create a CapTP connection.
 *
 * @param {string} ourId our name for the current side
 * @param {Logger} logger
 * @param {((target: string) => RemoteKit)} makeRemoteKit
 * @param {CapTPEngineOptions} opts options to the connection
 * @returns {CapTPEngine}
 */
export const makeCapTPEngine = (ourId, logger, makeRemoteKit, opts = {}) => {
  const gcStats = {
    DROPPED: 0,
  };
  const getStats = () =>
    harden({
      gc: { ...gcStats },
    });

  const {
    exportHook,
    importHook,
    importCollectedHook,
    gcImports = false,
    makeCapTPImportExportTables = makeDefaultCapTPImportExportTables,
    exportedTrapHandlers = new WeakSet(),
  } = opts;

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

  /** @type {WeakMap<any, CapTPSlot>} */
  const valToSlot = new WeakMap(); // exports looked up by val

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

  const releaseSlot = slotID => {
    // We drop all the references we know about at once, since GC told us we
    // don't need them anymore.
    const decRefs = slotToNumRefs.get(slotID) || 0;
    slotToNumRefs.delete(slotID);
    if (importCollectedHook) {
      importCollectedHook(slotID, decRefs);
    }
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
      // Now record the export in both valToSlot and slotToVal so we can look it
      // up from either the value or the slot name later.
      valToSlot.set(val, slot);
      importExportTables.markAsExported(slot, val);
      if (exportHook) {
        exportHook(val, slot);
      }
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

    // eslint-disable-next-line no-use-before-define
    registerImport(promise, slotID);

    return [sendSlot.add(slotID), promise];
  };

  // Used by the trap mechanism.
  const takeNextQuestionID = () => {
    lastQuestionID += 1;
    return `q-${lastQuestionID}`;
  };

  /**
   * Set up import
   *
   * @type {import('@endo/marshal').ConvertSlotToVal<CapTPSlot>}
   */
  function convertSlotToVal(slot, iface = undefined) {
    if (slot[1] === '+') {
      importExportTables.hasExport(slot) || Fail`Unknown export ${slot}`;
      return importExportTables.getExport(slot);
    }
    if (!importExportTables.hasImport(slot)) {
      if (iface === undefined) {
        iface = `Alleged: Presence ${ourId} ${slot}`;
      }
      const { val, settler } = importExportTables.makeValueForSlot(slot, iface);
      if (slot[0] === 'p') {
        // A new promise
        settlers.set(slot, settler);
      }
      importExportTables.markAsImported(slot, val);
      valToSlot.set(val, slot);
      if (importHook) {
        importHook(val, slot);
      }
    }

    // If we imported this slot, mark it as one our peer exported.
    recvSlot.add(slot);
    return importExportTables.getImport(slot);
  }

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

  // This is a bad idea, bc the slot could conflict with a future export.
  const registerExport = (val, slot) => {
    const isRemote = slot[1] === '-';
    if (isRemote) {
      throw new Error('Cannot register a remote as an export');
    }
    if (exportedTrapHandlers.has(val)) {
      throw new Error('Cannot register a trap as an export');
    }
    if (valToSlot.has(val)) {
      throw new Error('Cannot register an already exported value');
    }
    if (importExportTables.hasExport(slot)) {
      throw new Error('Cannot register an already exported slot');
    }
    valToSlot.set(val, slot);
    importExportTables.markAsExported(slot, val);
    if (exportHook) {
      exportHook(val, slot);
    }
  };

  const registerImport = (val, slot) => {
    const isLocal = slot[1] === '+';
    if (isLocal) {
      throw new Error('Cannot register a local as an import');
    }
    if (importExportTables.hasImport(slot)) {
      throw new Error('Cannot register an already imported slot');
    }
    if (valToSlot.has(val)) {
      throw new Error('Cannot register an already imported value');
    }
    valToSlot.set(val, slot);
    importExportTables.markAsImported(slot, val);
    if (importHook) {
      importHook(val, slot);
    }
  };

  const getExport = slot => {
    return importExportTables.getExport(slot);
  };

  const getImport = slot => {
    return importExportTables.getImport(slot);
  };

  // Put together our return value.
  /** @type {CapTPEngine} */
  const rets = {
    getSlotForValue,
    getStats,
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
    makeQuestion,
    takeNextQuestionID,
    registerExport,
    registerImport,
    takeSettler,
    getExport,
    getImport,
  };

  return harden(rets);
};
