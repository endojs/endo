// @ts-check

import { makeError, q, X } from '@endo/errors';

/**
 * @typedef {object} TraceCauseRef
 * @property {string} errorId
 * @property {string} name
 * @property {string} message
 */

/**
 * @typedef {object} TraceRecord
 * @property {string} errorId
 * @property {string} workerId
 * @property {string} name
 * @property {string} message
 * @property {string} stack
 * @property {string[]} annotations
 * @property {TraceCauseRef[]} causes
 * @property {number} t
 * @property {string} site
 * @property {string} [compartmentId]
 * @property {string} [parentErrorId]
 */

/**
 * @typedef {object} TraceReport
 * @property {string} errorId
 * @property {string} workerId
 * @property {string} name
 * @property {string} message
 * @property {string} stack
 * @property {string[]} annotations
 * @property {TraceReport[]} causes
 * @property {number} t
 * @property {string} site
 * @property {string} [compartmentId]
 * @property {TraceReport[]} related
 * @property {boolean} partial
 */

/**
 * @typedef {object} TraceAggregatorOptions
 * @property {number} [maxWorkers]
 * @property {number} [maxRecordsPerWorker]
 * @property {number} [maxBytes]
 */

const textEncoder = new TextEncoder();

/** @param {TraceRecord} rec */
const recordByteLength = rec => textEncoder.encode(JSON.stringify(rec)).length;

/**
 * @param {TraceRecord} rec
 * @param {string} workerId
 * @returns {TraceReport}
 */
const recordToShallowReport = (rec, workerId) =>
  harden({
    errorId: rec.errorId,
    workerId,
    name: rec.name,
    message: rec.message,
    stack: rec.stack,
    annotations: rec.annotations,
    t: rec.t,
    site: rec.site,
    ...(rec.compartmentId !== undefined && {
      compartmentId: rec.compartmentId,
    }),
    causes: [],
    related: [],
    partial: false,
  });

/**
 * Bounded, in-memory aggregator of error traces emitted by workers.
 *
 * Storage is `Map<workerId, Map<errorId, TraceRecord>>`. Both maps preserve
 * insertion order, which is leveraged for LRU on workers and FIFO on
 * records within a worker.
 *
 * @param {TraceAggregatorOptions} [options]
 */
export const makeTraceAggregator = ({
  maxWorkers = 64,
  maxRecordsPerWorker = 1024,
  maxBytes = 8 * 1024 * 1024,
} = {}) => {
  /** @type {Map<string, Map<string, TraceRecord>>} */
  const recordsByWorker = new Map();

  /**
   * Forwarded-id aliases. Maps `aliasErrorId` (e.g. the CLI-facing id
   * minted by the daemon's outbound CapTP) to the `(workerId, errorId)`
   * coordinate of the underlying record.
   *
   * @type {Map<string, { workerId: string, errorId: string }>}
   */
  const aliases = new Map();

  /**
   * Composite-key set of records that have been evicted, so reports
   * crossing them can mark `partial: true`.
   *
   * @type {Set<string>}
   */
  const evictedKeys = new Set();

  let currentBytes = 0;

  /**
   * @param {string} workerId
   * @param {string} errorId
   */
  const compositeKey = (workerId, errorId) => `${workerId} ${errorId}`;

  /**
   * Touch a worker's buffer to mark it most-recently-used.
   *
   * @param {string} workerId
   * @param {Map<string, TraceRecord>} buffer
   */
  const touchWorker = (workerId, buffer) => {
    recordsByWorker.delete(workerId);
    recordsByWorker.set(workerId, buffer);
  };

  /** Drop the entire least-recently-used worker buffer. */
  const evictOldestWorker = () => {
    const next = recordsByWorker.entries().next();
    if (next.done) return;
    const [workerId, buffer] = next.value;
    for (const rec of buffer.values()) {
      currentBytes -= recordByteLength(rec);
      evictedKeys.add(compositeKey(workerId, rec.errorId));
    }
    recordsByWorker.delete(workerId);
    for (const [aliasKey, target] of [...aliases.entries()]) {
      if (target.workerId === workerId) aliases.delete(aliasKey);
    }
  };

  /**
   * @param {string} workerId
   * @param {Map<string, TraceRecord>} buffer
   */
  const evictOneFromWorker = (workerId, buffer) => {
    const oldest = buffer.entries().next();
    if (oldest.done) return;
    const [errorId, rec] = oldest.value;
    buffer.delete(errorId);
    currentBytes -= recordByteLength(rec);
    evictedKeys.add(compositeKey(workerId, errorId));
    for (const [aliasKey, target] of [...aliases.entries()]) {
      if (target.workerId === workerId && target.errorId === errorId) {
        aliases.delete(aliasKey);
      }
    }
  };

  /**
   * Record a worker emission. The caller (daemon glue) supplies the
   * authoritative `workerId` from connection identity. Any `workerId`
   * field on the incoming record is overwritten.
   *
   * @param {string} workerId
   * @param {TraceRecord} incoming
   */
  const record = (workerId, incoming) => {
    if (typeof workerId !== 'string' || workerId.length === 0) {
      throw makeError(
        X`record requires a non-empty workerId, got ${q(workerId)}`,
      );
    }
    if (
      !incoming ||
      typeof incoming.errorId !== 'string' ||
      incoming.errorId.length === 0
    ) {
      throw makeError(
        X`record requires errorId on the incoming record, got ${q(incoming?.errorId)}`,
      );
    }
    /** @type {TraceRecord} */
    const stamped = harden({ ...incoming, workerId });
    const size = recordByteLength(stamped);

    let buffer = recordsByWorker.get(workerId);
    if (buffer === undefined) {
      while (recordsByWorker.size >= maxWorkers) {
        evictOldestWorker();
      }
      buffer = new Map();
      recordsByWorker.set(workerId, buffer);
    } else {
      touchWorker(workerId, buffer);
    }

    while (buffer.size >= maxRecordsPerWorker) {
      evictOneFromWorker(workerId, buffer);
    }

    while (currentBytes + size > maxBytes && recordsByWorker.size > 0) {
      const next = recordsByWorker.entries().next();
      if (next.done) break;
      const [oldestWorkerId, oldestBuffer] = next.value;
      if (oldestBuffer.size === 0) {
        recordsByWorker.delete(oldestWorkerId);
      } else {
        evictOneFromWorker(oldestWorkerId, oldestBuffer);
        if (oldestBuffer.size === 0 && oldestWorkerId !== workerId) {
          recordsByWorker.delete(oldestWorkerId);
        }
      }
    }

    // If the same errorId is being recorded again, replace the existing
    // entry (this preserves "the most recent observation" semantics and
    // is cheap because the FIFO Map keeps the slot's insertion order).
    const existing = buffer.get(stamped.errorId);
    if (existing !== undefined) {
      currentBytes -= recordByteLength(existing);
      buffer.delete(stamped.errorId);
    }
    buffer.set(stamped.errorId, stamped);
    currentBytes += size;
    return undefined;
  };

  /**
   * Register an additional key (typically the daemon-side `errorId`
   * minted when forwarding to the CLI) that resolves to an existing
   * record.
   *
   * @param {object} args
   * @param {string} args.workerId
   * @param {string} args.errorId existing key
   * @param {string} args.aliasErrorId new key
   */
  const alias = ({ workerId, errorId, aliasErrorId }) => {
    // Register the mapping eagerly, even when the underlying record has not yet
    // arrived. The (workerId, errorId) coordinate is authoritative — the daemon
    // stamps it from connection identity when it decodes the worker's error —
    // but the record ITSELF is delivered on a SEPARATE, asynchronous
    // `reportTrace` send that can land AFTER the daemon has already forwarded
    // the error to the client and minted `aliasErrorId`. The old behavior
    // dropped the alias in that window, permanently severing the client-facing
    // errorId from its record: no later `lookup` could ever recover the trace,
    // however long the client waited. `resolve()` already tolerates a missing
    // record by returning undefined, so an alias to a not-yet-present record
    // simply starts resolving once the record lands — which is exactly what lets
    // the client's error bubble WATCH for the trace to appear.
    aliases.set(aliasErrorId, harden({ workerId, errorId }));
  };

  /**
   * Convenience: find any worker that recorded the supplied errorId and
   * register an alias to it. Used by the daemon's outbound CapTP hook
   * to map a CLI-facing errorId onto the original worker record without
   * needing to know which worker emitted the error.
   *
   * @param {string} errorId
   * @param {string} aliasErrorId
   */
  const aliasByErrorId = (errorId, aliasErrorId) => {
    // Try the alias map first so chained forwarding works.
    const aliased = aliases.get(errorId);
    if (aliased !== undefined) {
      aliases.set(aliasErrorId, aliased);
      return;
    }
    for (const [workerId, buffer] of recordsByWorker.entries()) {
      if (buffer.has(errorId)) {
        aliases.set(aliasErrorId, harden({ workerId, errorId }));
        return;
      }
    }
  };

  /**
   * Resolve an errorId (raw or aliased) to its live record.
   *
   * @param {string} errorId
   * @returns {{ record: TraceRecord, workerId: string,
   *             buffer: Map<string, TraceRecord> } | undefined}
   */
  const resolve = errorId => {
    // First try the alias map (CLI-facing case).
    const aliased = aliases.get(errorId);
    if (aliased !== undefined) {
      const buffer = recordsByWorker.get(aliased.workerId);
      if (buffer !== undefined) {
        const rec = buffer.get(aliased.errorId);
        if (rec !== undefined) {
          return { record: rec, workerId: aliased.workerId, buffer };
        }
      }
    }
    // Fall back to a scan; in practice this path is the worker→daemon
    // case where the CLI was bypassed.
    for (const [workerId, buffer] of recordsByWorker.entries()) {
      const rec = buffer.get(errorId);
      if (rec !== undefined) {
        return { record: rec, workerId, buffer };
      }
    }
    return undefined;
  };

  /**
   * @param {string} errorId
   * @param {{ relatedWindow?: number }} [opts]
   * @returns {TraceReport | undefined}
   */
  const lookup = (errorId, { relatedWindow = 16 } = {}) => {
    const found = resolve(errorId);
    if (found === undefined) return undefined;
    const { record: target, workerId, buffer } = found;
    const causeIds = new Set(target.causes.map(c => c.errorId));
    /** @type {TraceReport[]} */
    const related = [];
    let partial = false;
    if (evictedKeys.has(compositeKey(workerId, errorId))) {
      partial = true;
    }
    // Walk the worker's FIFO buffer; collect entries preceding the
    // target into `related`, capped at `relatedWindow`. Cause matches
    // are prioritized.
    /** @type {TraceRecord[]} */
    const preceding = [];
    for (const [eid, candidate] of buffer.entries()) {
      if (eid === target.errorId) break;
      preceding.push(candidate);
    }
    const window = preceding.slice(-relatedWindow);
    if (preceding.length > window.length) partial = true;
    for (const candidate of window) {
      if (causeIds.has(candidate.errorId)) {
        related.push(recordToShallowReport(candidate, workerId));
      }
    }
    for (const candidate of window) {
      if (!causeIds.has(candidate.errorId)) {
        related.push(recordToShallowReport(candidate, workerId));
      }
    }
    /** @type {TraceReport[]} */
    const causes = target.causes.map(c => {
      const causeFound = resolve(c.errorId);
      if (causeFound !== undefined) {
        return recordToShallowReport(causeFound.record, causeFound.workerId);
      }
      partial = true;
      return harden({
        errorId: c.errorId,
        workerId: '',
        name: c.name,
        message: c.message,
        stack: '',
        annotations: [],
        causes: [],
        t: 0,
        site: 'unknown',
        related: [],
        partial: true,
      });
    });
    return harden({
      errorId: target.errorId,
      workerId,
      name: target.name,
      message: target.message,
      stack: target.stack,
      annotations: target.annotations,
      t: target.t,
      site: target.site,
      ...(target.compartmentId !== undefined && {
        compartmentId: target.compartmentId,
      }),
      causes,
      related,
      partial,
    });
  };

  /**
   * @param {object} [opts]
   * @param {string} [opts.workerId]
   * @param {number} [opts.limit]
   * @returns {TraceReport[]}
   */
  const recent = ({ workerId, limit = 32 } = {}) => {
    /** @type {TraceReport[]} */
    const out = [];
    /** @type {Iterable<[string, Map<string, TraceRecord>]>} */
    const iter =
      workerId !== undefined
        ? recordsByWorker.has(workerId)
          ? [
              [
                workerId,
                /** @type {Map<string, TraceRecord>} */ (
                  recordsByWorker.get(workerId)
                ),
              ],
            ]
          : []
        : [...recordsByWorker.entries()].reverse();
    for (const [wid, buffer] of iter) {
      const records = [...buffer.values()].reverse();
      for (const r of records) {
        if (out.length >= limit) break;
        out.push(recordToShallowReport(r, wid));
      }
      if (out.length >= limit) break;
    }
    return harden(out);
  };

  /** @param {string} [workerId] */
  const clear = workerId => {
    if (workerId === undefined) {
      recordsByWorker.clear();
      aliases.clear();
      evictedKeys.clear();
      currentBytes = 0;
      return;
    }
    const buffer = recordsByWorker.get(workerId);
    if (buffer === undefined) return;
    for (const r of buffer.values()) {
      currentBytes -= recordByteLength(r);
    }
    recordsByWorker.delete(workerId);
    for (const [aliasKey, target] of [...aliases.entries()]) {
      if (target.workerId === workerId) aliases.delete(aliasKey);
    }
  };

  /**
   * @returns {{ workers: number, totalRecords: number, bytes: number,
   *             aliases: number }}
   */
  const stats = () => {
    let totalRecords = 0;
    for (const buffer of recordsByWorker.values()) {
      totalRecords += buffer.size;
    }
    return harden({
      workers: recordsByWorker.size,
      totalRecords,
      bytes: currentBytes,
      aliases: aliases.size,
    });
  };

  return harden({
    record,
    alias,
    aliasByErrorId,
    lookup,
    recent,
    clear,
    stats,
  });
};
harden(makeTraceAggregator);
