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
 * per-slot descriptors: imports are restorable through
 * `captp.provideImport`; an export is restorable when its descriptor
 * carries a durable `description` (provided by the `describeExport`
 * power), and is otherwise recorded for diagnostics only.
 *
 * Only object (`o`) slots are recorded in the descriptor maps. Promise
 * and question slots are transient by design: a snapshot is only taken at
 * quiescence, when no questions are in flight.
 *
 * @typedef {object} ExportDescriptor
 * @property {string | null} iface
 * @property {unknown} [description] durable description from which the
 *   export can be re-instantiated at resume; absent for exports that are
 *   not durable
 *
 * @typedef {object} TablesRecord
 * @property {number} lastExportID
 * @property {number} lastPromiseID
 * @property {Record<string, string | null>} imports slot to interface name
 * @property {Record<string, ExportDescriptor>} exports
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
 *   `record` alongside the counters;
 * - export durability lives at this layer: when a value is exported,
 *   `describeExport` is consulted for a durable description, which is
 *   persisted in the export table; at resume, `restoreExports` uses
 *   `instantiateExport` to rebuild each described export, and the caller
 *   seats the pairs with `captp.provideExport`.
 *
 * @param {object} options
 * @param {TablesRecord} options.record
 * @param {() => void} [options.onChange] called after each record mutation
 * @param {(val: object) => unknown | undefined} [options.describeExport]
 *   returns the durable description of an exported value, or undefined
 *   for ordinary (non-durable) exports
 * @param {(description: unknown, slot: string) => object} [options.instantiateExport]
 *   rebuilds an export from its recorded description at resume
 */
export const makePersistentTablesKit = ({
  record,
  onChange = () => {},
  describeExport = () => undefined,
  instantiateExport = (_description, slot) => {
    throw Fail`No instantiateExport power to restore export ${slot}`;
  },
}) => {
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
          /** @type {ExportDescriptor} */
          const descriptor = { iface: getInterfaceOf(val) || null };
          const description = describeExport(val);
          if (description !== undefined) {
            descriptor.description = description;
          }
          record.exports[slot] = descriptor;
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

  /**
   * Re-instantiates every export the record describes durably, in slot
   * order. Call once after `makeCapTP` and seat each pair with
   * `captp.provideExport(slot, val)` so both the tables and CapTP's
   * value-to-slot registry bind the restored export.
   *
   * @returns {Array<{ slot: string, val: object }>}
   */
  const restoreExports = () =>
    Object.entries(record.exports)
      .filter(([_slot, descriptor]) => descriptor.description !== undefined)
      .map(([slot, descriptor]) => ({
        slot,
        val: instantiateExport(descriptor.description, slot),
      }));

  return harden({
    makeCapTPImportExportTables,
    restoreExports,
    getRecord: () => record,
  });
};
harden(makePersistentTablesKit);
