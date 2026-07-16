// @ts-check
import harden from '@endo/harden';
import { Fail } from '@endo/errors';
import { Remotable, getInterfaceOf } from '@endo/pass-style';
import { isPromise } from '@endo/promise-kit';

/** @typedef {string} CapTPSlot a CapTP slot name such as `o+1` or `p-2` */

/**
 * The serializable state of one side of a CapTP session.
 *
 * The counters make slot allocation resume where the previous incarnation
 * left off, so a restarted host never re-mints a slot the peer's snapshot
 * still associates with another object. The import and export maps record
 * slot-to-interface-name descriptors: imports are restorable through
 * `captp.provideImport`, exports are recorded for diagnostics (a host
 * cannot reconstruct arbitrary exported objects without a durable-object
 * layer; see the design's future work).
 *
 * Only object (`o`) slots are recorded in the descriptor maps. Promise
 * and question slots are transient by design: a snapshot is only taken at
 * quiescence, when no questions are in flight.
 *
 * @typedef {object} TablesRecord
 * @property {number} lastExportID
 * @property {number} lastPromiseID
 * @property {Record<string, string | null>} imports slot to interface name
 * @property {Record<string, string | null>} exports slot to interface name
 */

/** @returns {TablesRecord} */
export const makeFreshTablesRecord = () => ({
  lastExportID: 0,
  lastPromiseID: 0,
  imports: {},
  exports: {},
});
harden(makeFreshTablesRecord);

/**
 * Makes a `makeCapTPImportExportTables` option for `makeCapTP` whose slot
 * counters and slot descriptors live in a caller-provided plain-JSON
 * record, so one side of a CapTP session can be persisted and later
 * resumed against a peer restored from a heap snapshot.
 *
 * The tables mirror CapTP's default tables except that:
 * - slot counters read and write `record`, calling `onChange` after every
 *   mutation so the caller can write through to durable storage;
 * - import and export descriptors for object slots are recorded in
 *   `record` alongside the counters.
 *
 * @param {object} options
 * @param {TablesRecord} options.record
 * @param {() => void} [options.onChange] called after each record mutation
 */
export const makePersistentTablesKit = ({ record, onChange = () => {} }) => {
  /**
   * @param {object} tableOptions
   * @param {boolean} tableOptions.gcImports
   * @param {(slot: CapTPSlot) => { promise: Promise<unknown>, settler: { resolveWithPresence: () => object } }} tableOptions.makeRemoteKit
   */
  const makeCapTPImportExportTables = ({ gcImports, makeRemoteKit }) => {
    !gcImports ||
      Fail`persistent CapTP tables require gcImports: false, since a sleeping peer cannot be told about dropped imports`;

    /** @type {Map<CapTPSlot, any>} */
    const slotToExported = new Map();
    /** @type {Map<CapTPSlot, any>} */
    const slotToImported = new Map();

    /** @param {any} val */
    const makeSlotForValue = val => {
      /** @type {CapTPSlot} */
      let slot;
      if (isPromise(val)) {
        record.lastPromiseID += 1;
        slot = `p+${record.lastPromiseID}`;
      } else {
        record.lastExportID += 1;
        slot = `o+${record.lastExportID}`;
      }
      onChange();
      return slot;
    };

    /**
     * @param {CapTPSlot} slot
     * @param {string | undefined} iface
     */
    const makeValueForSlot = (slot, iface) => {
      const { promise, settler } = makeRemoteKit(slot);
      let val;
      if (slot[0] === 'o' || slot[0] === 't') {
        val = Remotable(iface, undefined, settler.resolveWithPresence());
      } else if (slot[0] === 'p') {
        val = promise;
      } else {
        Fail`Unknown slot type ${slot}`;
      }
      return { val, settler };
    };

    return harden({
      makeSlotForValue,
      makeValueForSlot,
      hasImport: slot => slotToImported.has(slot),
      getImport: slot => slotToImported.get(slot),
      markAsImported: (slot, val) => {
        slotToImported.set(slot, val);
        if (slot[0] === 'o') {
          record.imports[slot] = getInterfaceOf(val) || null;
          onChange();
        }
      },
      hasExport: slot => slotToExported.has(slot),
      getExport: slot => slotToExported.get(slot),
      markAsExported: (slot, val) => {
        slotToExported.set(slot, val);
        if (slot[0] === 'o') {
          record.exports[slot] = getInterfaceOf(val) || null;
          onChange();
        }
      },
      deleteExport: slot => {
        slotToExported.delete(slot);
        if (slot[0] === 'o') {
          delete record.exports[slot];
          onChange();
        }
      },
      didDisconnect: () => slotToImported.clear(),
    });
  };

  return harden({
    makeCapTPImportExportTables,
    getRecord: () => record,
  });
};
harden(makePersistentTablesKit);
