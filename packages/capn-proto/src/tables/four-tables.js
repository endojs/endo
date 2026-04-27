// @ts-check
/**
 * The four Cap'n Proto RPC tables, scoped per peer connection.
 *
 *   QuestionTable : outgoing call IDs we allocated; awaiting Return
 *   AnswerTable   : incoming call IDs the peer allocated; awaiting Finish
 *   ExportTable   : capabilities we've sent to the peer (we hold them strongly)
 *   ImportTable   : capabilities the peer has sent to us (weak; FR releases)
 *
 * Identity preservation:
 *   `valToExportId` is a WeakMap from a local capability value to the export
 *   id we've assigned it. As long as the peer holds a reference, the export
 *   table keeps the value alive. When the refcount drops to zero (peer sends
 *   Release), the export entry is removed and the WeakMap entry can decay.
 *   A subsequent re-export gets a fresh id.
 *
 *   `importIdToPresence` is a FinalizingMap (weak values). The same import id
 *   always yields the same Presence as long as the JS-side reference is
 *   alive; once the Presence is collected, FR triggers a Release.
 */

import { makeIdAllocator } from './id-allocator.js';
import { makeFinalizingMap } from '../finalize.js';

/**
 * @typedef {object} QuestionEntry
 * @property {(value: unknown) => void} resolve
 * @property {(reason: unknown) => void} reject
 * @property {Promise<unknown>} returnedP
 * @property {boolean} settled
 * @property {boolean} finishSent
 * @property {object} pipelineHandler   handler for downstream calls on the question
 * @property {Set<number>} pipelinedCapImports import ids referenced by inbound caps that arrived in the Return; tracked so we can release them on finish.
 */

/**
 * @typedef {object} AnswerEntry
 * @property {Promise<unknown>} resultP   the local promise representing the answer
 * @property {boolean} returnSent
 * @property {boolean} finishReceived
 * @property {Map<Array<{op: string, fieldOrdinal?: number}>, number>} pipelineExportsByPath
 *   per pipelined transform path used by peer, our export id we surrendered for it
 */

/**
 * @typedef {object} ExportEntry
 * @property {unknown} value             a Presence, exo, or unresolved promise
 * @property {boolean} isPromise
 * @property {number} refCount
 * @property {boolean} resolved
 * @property {{ vinedFor: number } | undefined} vine  if this export is a vine for a Provide
 */

/**
 * @typedef {object} ImportEntry
 * @property {object} presence
 * @property {((v: unknown) => void) | undefined} resolveSettler
 * @property {((reason: unknown) => void) | undefined} rejectSettler
 * @property {boolean} isPromise
 * @property {object | undefined} resolvedTo   the resolved presence (Tribble: route via R)
 */

/**
 * @param {{ onImportFinalized: (id: number) => void }} hooks
 */
export const makeFourTables = ({ onImportFinalized }) => {
  // Question / Export ids are allocated by us. Answer / Import ids are
  // allocated by the peer.
  const questions = new Map(); // id → QuestionEntry
  const answers = new Map(); // id → AnswerEntry
  // Named `exportsMap` to avoid the reserved-word collision with the
  // `exports` keyword in module scope; the public field name is still
  // `exports`.
  const exportsMap = new Map(); // id → ExportEntry
  /** @type {WeakMap<object, number>} */
  const valToExportId = new WeakMap();
  /** @type {WeakMap<Promise<unknown>, number>} */
  const promiseValToExportId = new WeakMap();

  /** @type {import('../finalize.js').FinalizingMap<number, object>} */
  const importIdToPresence = makeFinalizingMap(
    id => onImportFinalized(/** @type {number} */ (id)),
    { weakValues: true },
  );
  /** @type {Map<number, ImportEntry>} */
  const importEntries = new Map(); // strong metadata keyed by import id

  const questionIds = makeIdAllocator();
  const exportIds = makeIdAllocator();

  return {
    questions,
    answers,
    exports: exportsMap,
    valToExportId,
    promiseValToExportId,
    importIdToPresence,
    importEntries,
    questionIds,
    exportIds,
  };
};
