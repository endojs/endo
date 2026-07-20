// @ts-check

/**
 * The engine seam of the machine: the power to run worker incarnations
 * with (or without) engine-level heap snapshots. `makeXsEngine` is the
 * production implementation; the in-process peer replay engines
 * (`peer-replay-engine.js`) are deterministic test doubles. The seam
 * stays open for future JS engines with other heap snapshot mechanisms.
 *
 * @typedef {object} WorkerEngine
 * @property {boolean} canSnapshot whether `snapshot` returns a real
 *   engine-level snapshot ref; if false the host must retain the full
 *   journal and the engine must reconstruct state by replay
 * @property {(options: {
 *   debugName: string,
 *   snapshot: unknown,
 *   onOutbound: (message: Record<string, unknown>) => void,
 * }) => Promise<WorkerIncarnation>} start `debugName` is for diagnostics
 *   only — it must not influence engine behavior
 * @property {(ref: unknown) => Promise<void>} [releaseSnapshot] release a
 *   superseded snapshot ref (e.g. drop its content-addressed store root);
 *   called after a newer snapshot is durably recorded
 */

/**
 * One running incarnation of a worker.
 *
 * @typedef {object} WorkerIncarnation
 * @property {(message: Record<string, unknown>) => Promise<void>} deliver
 *   deliver one duct message and run the guest to quiescence; resolves
 *   after the guest's outbound effects have been emitted
 * @property {() => Promise<unknown>} snapshot capture the guest heap as
 *   a durable snapshot ref (engines with `canSnapshot: false` return
 *   null)
 * @property {() => Promise<void>} terminate kill the incarnation; the
 *   guest heap is recoverable only from a snapshot plus the journal
 */

export {};
