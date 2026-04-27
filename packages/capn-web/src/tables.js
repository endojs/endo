// Imports and exports tables for a single Cap'n Web session.
//
// Each session keeps:
//
//   exports: Map<negativeId, ExportEntry>
//     Strong references to local values that the peer holds a reference to.
//     The peer addresses these via ["import", id] / ["pipeline", id].  Cleared
//     when the peer sends ["release", id, refcount].
//
//   imports: FinalizingMap<positiveId, presence>
//     Weak references to remote presences we've created.  When a presence
//     is GC'd we send ["release", id, refcount] to the peer.
//
// Identifier sign convention (sender's perspective):
//   * Negative ids (-1, -2, ...) are allocated by the EXPORTER and embedded
//     in outgoing messages as ["export", id] / ["promise", id].
//   * Positive ids (1, 2, ...) are allocated by the IMPORTER (the side that
//     issues a "push") to receive an answer.
//   * Id 0 is the bootstrap / main interface; both sides reach the peer's
//     main via ["import", 0] or ["pipeline", 0, ...].

import harden from '@endo/harden';

import { makeFinalizingMap } from './finalize.js';

/**
 * @typedef {object} ExportEntry
 * @property {unknown} value     Local value being exported.
 * @property {number} refcount   Number of outstanding wire introductions.
 * @property {boolean} isPromise If true, the entry was sent as ["promise", id].
 */

/**
 * @typedef {object} ImportEntry
 * @property {object} presence
 * @property {number} refcount  Outstanding wire introductions for this id.
 * @property {boolean} isPromise
 */

/**
 * @param {object} opts
 * @param {boolean} [opts.gcImports]              Use weak imports + auto-release.
 * @param {(id: number, refcount: number) => void} opts.sendRelease
 *   Called when an import id is no longer referenced locally.
 */
export const makeTables = ({ gcImports = true, sendRelease }) => {
  /** @type {Map<number, ExportEntry>} */
  const exportsTable = new Map();
  /** WeakMap from local value -> negative export id (for re-export identity). */
  const valueToExportId = new WeakMap();

  let nextExportId = -1;

  /** Imports: positive id -> presence.  Weak when gcImports is on. */
  /** @type {Map<number, number>} */
  const importRefcounts = new Map();
  /** Track whether an import id is for a promise (vs object presence). */
  /** @type {Map<number, boolean>} */
  const importIsPromise = new Map();

  /**
   * Pending release messages, keyed by id, accumulated in this turn.
   * @type {Map<number, number>}
   */
  let pendingReleases = new Map();
  let releaseScheduled = false;
  const flushReleases = () => {
    const releases = pendingReleases;
    pendingReleases = new Map();
    releaseScheduled = false;
    for (const [id, count] of releases) {
      try {
        sendRelease(id, count);
      } catch (_e) {
        /* swallow: session may be aborting */
      }
    }
  };
  const scheduleRelease = () => {
    if (releaseScheduled) return;
    releaseScheduled = true;
    Promise.resolve().then(flushReleases);
  };

  const onImportFinalized = id => {
    const refcount = importRefcounts.get(id) || 1;
    importRefcounts.delete(id);
    importIsPromise.delete(id);
    pendingReleases.set(id, (pendingReleases.get(id) || 0) + refcount);
    scheduleRelease();
  };

  /** @type {import('./finalize.js').FinalizingMap<number, object>} */
  const importsTable = makeFinalizingMap(onImportFinalized, {
    weakValues: gcImports,
  });
  /** WeakMap from imported presence -> positive id. */
  const presenceToImportId = new WeakMap();

  let nextImportId = 1;

  // ----- exports API -----

  /**
   * Allocate a fresh export id for a local value, or reuse an existing one
   * (incrementing refcount).  Returns the id.
   *
   * @param {unknown} value
   * @param {boolean} isPromise
   */
  const exportValue = (value, isPromise) => {
    if (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      valueToExportId.has(/** @type {object} */ (value))
    ) {
      const id = /** @type {number} */ (
        valueToExportId.get(/** @type {object} */ (value))
      );
      const entry = /** @type {ExportEntry} */ (exportsTable.get(id));
      entry.refcount += 1;
      return id;
    }
    const id = nextExportId;
    nextExportId -= 1;
    exportsTable.set(id, { value, refcount: 1, isPromise });
    if (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function')
    ) {
      valueToExportId.set(/** @type {object} */ (value), id);
    }
    return id;
  };

  /**
   * Install an export at a specific id (used for incoming-push answers, where
   * the id was chosen by the peer and is positive).  Does not register the
   * value in valueToExportId — these answers are not pooled with general
   * exports for re-export deduplication.
   *
   * @param {number} id
   * @param {unknown} value
   * @param {boolean} isPromise
   */
  const installExportAtId = (id, value, isPromise) => {
    exportsTable.set(id, { value, refcount: 1, isPromise });
  };

  /**
   * @param {number} id
   * @returns {ExportEntry | undefined}
   */
  const getExport = id => exportsTable.get(id);

  /**
   * Decrement the export refcount; remove when it reaches zero.
   * @param {number} id
   * @param {number} count
   */
  const releaseExport = (id, count) => {
    const entry = exportsTable.get(id);
    if (!entry) return;
    entry.refcount -= count;
    if (entry.refcount <= 0) {
      exportsTable.delete(id);
      if (
        entry.value !== null &&
        (typeof entry.value === 'object' ||
          typeof entry.value === 'function') &&
        valueToExportId.get(/** @type {object} */ (entry.value)) === id
      ) {
        valueToExportId.delete(/** @type {object} */ (entry.value));
      }
      // Notify the value if it implements [Symbol.dispose].
      const v = entry.value;
      if (
        v !== null &&
        (typeof v === 'object' || typeof v === 'function') &&
        Symbol.dispose &&
        typeof (/** @type {any} */ (v)[Symbol.dispose]) === 'function'
      ) {
        try {
          /** @type {any} */ (v)[Symbol.dispose]();
        } catch (_e) {
          /* ignore */
        }
      }
    }
  };

  // ----- imports API -----

  /**
   * Allocate a fresh positive id for a question we're issuing (push result).
   * The caller is responsible for installing a presence at that id.
   */
  const allocateQuestionId = () => {
    const id = nextImportId;
    nextImportId += 1;
    return id;
  };

  /**
   * Install a presence at a positive id.  If one already exists it's reused
   * and its refcount bumped.
   *
   * @param {number} id
   * @param {object} presence
   * @param {boolean} isPromise
   */
  const installImport = (id, presence, isPromise) => {
    const existing = importsTable.get(id);
    if (existing) {
      importRefcounts.set(id, (importRefcounts.get(id) || 0) + 1);
      return existing;
    }
    importsTable.set(id, presence);
    presenceToImportId.set(presence, id);
    importRefcounts.set(id, 1);
    importIsPromise.set(id, isPromise);
    return presence;
  };

  /**
   * Look up an existing import; returns undefined if absent or collected.
   * @param {number} id
   */
  const getImport = id => importsTable.get(id);

  /**
   * Bump the refcount on an existing import (e.g. when the peer reintroduces
   * the same export).  Returns true if the import is still live.
   * @param {number} id
   */
  const reintroduceImport = id => {
    if (!importsTable.has(id)) return false;
    importRefcounts.set(id, (importRefcounts.get(id) || 0) + 1);
    return true;
  };

  /**
   * If `value` is a presence that came from this session's imports, return
   * its id; otherwise undefined.
   * @param {object} value
   */
  const importIdOf = value => presenceToImportId.get(value);

  /**
   * If `value` was already exported by this session, return its id.
   * @param {object} value
   */
  const exportIdOf = value =>
    valueToExportId.get(/** @type {object} */ (value));

  /**
   * Force-drop an import; sends the appropriate release synchronously
   * (on the next microtask).  Used by explicit Symbol.dispose on a presence.
   * @param {number} id
   */
  const disposeImport = id => {
    if (!importsTable.has(id)) return;
    const refcount = importRefcounts.get(id) || 1;
    importsTable.delete(id);
    importRefcounts.delete(id);
    importIsPromise.delete(id);
    pendingReleases.set(id, (pendingReleases.get(id) || 0) + refcount);
    scheduleRelease();
  };

  const getStats = () =>
    harden({
      exports: exportsTable.size,
      imports: importsTable.getSize(),
    });

  /**
   * Drain every export and import without sending any releases.  Used on
   * abort.
   */
  const clear = () => {
    exportsTable.clear();
    importsTable.clearWithoutFinalizing();
    importRefcounts.clear();
    importIsPromise.clear();
    pendingReleases = new Map();
    releaseScheduled = false;
  };

  return harden({
    exportValue,
    installExportAtId,
    getExport,
    releaseExport,
    exportIdOf,
    allocateQuestionId,
    installImport,
    getImport,
    reintroduceImport,
    importIdOf,
    disposeImport,
    flushReleases,
    getStats,
    clear,
  });
};
