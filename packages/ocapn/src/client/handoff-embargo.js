// @ts-check

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * @import { PromiseKit } from '@endo/promise-kit'
 *
 * @typedef {object} HandoffEmbargoState
 * @property {(gifterExporterSessionId: ArrayBufferLike, giftId: ArrayBufferLike) => Promise<void>} awaitDisembargo
 *   Returns a promise that resolves when a matching `provide` disembargo has
 *   been observed. If the disembargo has already arrived, the returned
 *   promise is already resolved.
 * @property {(gifterExporterSessionId: ArrayBufferLike, giftId: ArrayBufferLike) => void} disembargo
 *   Records that a `provide` disembargo for this handoff has arrived,
 *   resolving any pending `awaitDisembargo` promise.
 * @property {(gifterExporterSessionId: ArrayBufferLike, giftId: ArrayBufferLike) => void} forget
 *   Drops bookkeeping for a handoff that has both been disembargoed and
 *   withdrawn (or otherwise will never be referenced again).
 * @property {(reason: Error) => void} rejectAll
 *   Rejects every pending `awaitDisembargo` promise. Used on shutdown.
 */

/**
 * @param {ArrayBufferLike} gifterExporterSessionId
 * @param {ArrayBufferLike} giftId
 * @returns {string}
 */
const makeKey = (gifterExporterSessionId, giftId) => {
  // Concat hex of both. ArrayBufferLike → Uint8Array → hex.
  const sBytes = new Uint8Array(gifterExporterSessionId);
  const gBytes = new Uint8Array(giftId);
  let out = '';
  for (const byte of sBytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  out += ':';
  for (const byte of gBytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
};

/**
 * @typedef {object} Entry
 * @property {PromiseKit<void>} kit
 * @property {boolean} disembargoed
 */

/**
 * Per-client bookkeeping for the exporter side of a level-3 disembargo. The
 * exporter (C) holds back `withdraw-gift` responses until the gifter (B)
 * sends a matching `provide` disembargo. Either side can arrive first:
 *
 *   - withdraw-gift first: registers the kit, gets a pending promise.
 *   - provide first: marks the entry disembargoed; the next withdraw-gift
 *     sees an already-resolved promise.
 *
 * The state is shared across sessions because withdraw-gift arrives on the
 * receiver's session while provide arrives on the gifter's session; both run
 * inside the same OCapN client.
 *
 * @returns {HandoffEmbargoState}
 */
export const makeHandoffEmbargoState = () => {
  /** @type {Map<string, Entry>} */
  const entries = new Map();

  /**
   * @param {string} key
   * @returns {Entry}
   */
  const provideEntry = key => {
    let entry = entries.get(key);
    if (entry === undefined) {
      entry = harden({
        kit: makePromiseKit(),
        disembargoed: false,
      });
      entries.set(key, entry);
    }
    return entry;
  };

  const awaitDisembargo = (gifterExporterSessionId, giftId) => {
    const key = makeKey(gifterExporterSessionId, giftId);
    const entry = provideEntry(key);
    return entry.kit.promise;
  };

  const disembargo = (gifterExporterSessionId, giftId) => {
    const key = makeKey(gifterExporterSessionId, giftId);
    const existing = entries.get(key);
    if (existing && existing.disembargoed) {
      return;
    }
    if (existing) {
      // Replace with disembargoed entry but reuse the same kit so any
      // already-handed-out promise resolves.
      const updated = harden({ kit: existing.kit, disembargoed: true });
      entries.set(key, updated);
      existing.kit.resolve(undefined);
      return;
    }
    const kit = makePromiseKit();
    kit.resolve(undefined);
    entries.set(key, harden({ kit, disembargoed: true }));
  };

  const forget = (gifterExporterSessionId, giftId) => {
    const key = makeKey(gifterExporterSessionId, giftId);
    entries.delete(key);
  };

  const rejectAll = reason => {
    for (const entry of entries.values()) {
      if (!entry.disembargoed) {
        entry.kit.reject(reason);
      }
    }
    entries.clear();
  };

  return harden({
    awaitDisembargo,
    disembargo,
    forget,
    rejectAll,
  });
};
