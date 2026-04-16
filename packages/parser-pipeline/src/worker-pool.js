/**
 * Provides {@link WorkerParserPool}, a worker thread pool for parallelizing
 * AST parsing.
 *
 * @module
 */

/**
 * @import {
 *   WorkerParseMessage,
 *   WorkerResultMessage,
 *   WorkerResponseMessage,
 *   WorkerParserPoolOptions,
 *   SourceType,
 *   LogFn,
 PendingWorkerPoolTask,
 EnqueuedWorkerPoolTask
 * } from './types/external.js'
 */

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { clearTimeout, setTimeout } from 'node:timers';
import { MJS_SOURCE_TYPE, noop } from './constants.js';

/**
 * Default idle timeout for workers.
 */
const DEFAULT_IDLE_TIMEOUT = 1000;

/**
 * Default maximum number of workers.
 */
const DEFAULT_MAX_WORKERS = Math.max(1, availableParallelism() - 1);

/**
 * Removes and returns an arbitrary element from a Set, or `undefined` if empty.
 *
 * @template T
 * @param {Set<T>} set
 * @returns {T | undefined}
 */
const setShift = set => {
  const { value, done } = set.values().next();
  if (done) return undefined;
  set.delete(value);
  return value;
};

/**
 * A pool of worker threads that parse modules via the composed pipeline.
 *
 * Each worker runs a consumer-provided script that imports its own visitor
 * modules. The pool dispatches parse tasks and routes responses back to the
 * caller.
 *
 * @template {readonly any[]} [TAnalyzerResults=unknown[]] - The type of the analyzer results array returned by the worker.
 * @group Worker Parser
 */
export class WorkerParserPool {
  /**
   * Path to the worker module.
   * @type {string | URL}
   * @readonly
   */
  #workerScript;

  /**
   * Maximum number of workers.
   * @type {number}
   */
  #maxWorkers;

  /**
   * Idle timeout for workers.
   * @type {number}
   */
  #idleTimeout;

  /**
   * Worker data.
   * @type {unknown}
   */
  #workerData;

  /**
   * Available workers.
   * @type {Set<Worker>}
   */
  #available = new Set();

  /**
   * All workers.
   * @type {Set<Worker>}
   */
  #all = new Set();

  /**
   * Idle timeouts for workers.
   * @type {Map<Worker, NodeJS.Timeout>}
   */
  #timeouts = new Map();

  /**
   * Pending tasks keyed by task ID. Resolved when the worker posts a result.
   *
   * @type {Map<string, PendingWorkerPoolTask<TAnalyzerResults>>}
   */
  #pending = new Map();

  /**
   * Tasks waiting for an available worker.
   *
   * @type {Array<EnqueuedWorkerPoolTask<TAnalyzerResults>>}
   */
  #queue = [];

  /**
   * Logger function.
   * @type {LogFn}
   */
  #log;

  /**
   * Mapping of worker to unique ID; used for logging purposes.
   *
   * @type {WeakMap<Worker, number>}
   */
  #workerIds = new WeakMap();

  /**
   * Next task ID.
   * @type {number}
   */
  #nextTaskId = 0;

  /**
   * Next worker ID.
   * @type {number}
   */
  #nextWorkerId = 0;

  /**
   * Pending worker terminations.
   *
   * Worker termination is async, but we don't really need to wait for it to
   * complete unless we're terminating the pool.
   *
   * @type {Promise<void>[]}
   */
  #pendingTerminations = [];

  /**
   * @param {string | URL} workerScript Path to the worker entry point.
   * @param {WorkerParserPoolOptions} [options]
   */
  constructor(
    workerScript,
    {
      maxWorkers = DEFAULT_MAX_WORKERS,
      idleTimeout = DEFAULT_IDLE_TIMEOUT,
      workerData,
      log = noop,
    } = {},
  ) {
    this.#workerScript = workerScript;
    this.#maxWorkers = Math.max(1, maxWorkers);
    this.#idleTimeout = idleTimeout;
    this.#workerData = workerData;
    this.#log = log;
  }

  set maxWorkers(maxWorkers) {
    this.#maxWorkers = Math.max(1, maxWorkers);
  }

  get maxWorkers() {
    return this.#maxWorkers;
  }

  set idleTimeout(idleTimeout) {
    this.#idleTimeout = idleTimeout;
  }

  get idleTimeout() {
    return this.#idleTimeout;
  }

  get workerScript() {
    return this.#workerScript;
  }

  /**
   * Dispatches a parse task to the worker pool.
   *
   * @param {Uint8Array} bytes Source bytes.
   * @param {string} specifier Module specifier.
   * @param {string} location Module file URL.
   * @param {string} packageLocation Package root URL.
   * @param {SourceType} [language] Module language (e.g. `'mjs'` or `'cjs'`).
   * @returns {Promise<WorkerResultMessage<TAnalyzerResults>>}
   */
  async dispatch(
    bytes,
    specifier,
    location,
    packageLocation,
    language = MJS_SOURCE_TYPE,
  ) {
    this.#nextTaskId += 1;
    const id = String(this.#nextTaskId);

    /** @type {WorkerParseMessage} */
    const message = {
      type: 'parse',
      id,
      bytes,
      specifier,
      location,
      packageLocation,
      language,
    };

    return new Promise((resolve, reject) => {
      const worker = this.#getWorker();
      if (!worker) {
        this.#log('Worker pool is at capacity, enqueuing message:', message);
        this.#queue.push({ message, resolve, reject });
        return;
      }
      this.#log(
        `Sending message to worker ${this.#getWorkerId(worker)}:`,
        message,
      );
      this.#pending.set(id, { worker, resolve, reject });
      worker.postMessage(message);
    });
  }

  /**
   * Terminates all workers and rejects pending/queued tasks.
   *
   * Resolves once every worker thread has fully exited.
   *
   * @returns {Promise<void>}
   */
  async terminate() {
    await null;

    for (const timeout of this.#timeouts.values()) {
      clearTimeout(timeout);
    }
    this.#timeouts.clear();

    const err = new Error('Worker pool terminated');

    for (const task of this.#pending.values()) {
      task.reject(err);
    }
    this.#pending.clear();

    for (const task of this.#queue) {
      task.reject(err);
    }
    this.#queue.length = 0;

    for (const worker of this.#all) {
      this.#terminateWorker(worker);
    }

    try {
      // these "shouldn't" fail, but just in case
      await Promise.allSettled(this.#pendingTerminations);
    } catch {
      // ignore
    } finally {
      this.#pendingTerminations.length = 0;
    }

    this.#all.clear();
    this.#available.clear();
    this.#workerIds = new WeakMap();
    // don't reset counters here for purposes of uniqueness

    this.#log('Worker pool terminated');
  }

  /**
   * Gets or creates a worker, returning `undefined` when at capacity.
   *
   * @returns {Worker | undefined}
   */
  #getWorker() {
    let worker = setShift(this.#available);
    if (!worker) {
      if (this.#all.size >= this.#maxWorkers) {
        return undefined;
      }
      worker = new Worker(this.#workerScript, {
        workerData: this.#workerData,
      });
      this.#nextWorkerId += 1;
      this.#workerIds.set(worker, this.#nextWorkerId);
      this.#all.add(worker);

      const scopedWorker = worker;
      const workerId = `#${this.#workerIds.get(scopedWorker) ?? '(unknown)'}`;
      worker
        .on(
          'message',
          /** @param {WorkerResponseMessage} msg */ msg => {
            this.#log(`Worker ${workerId} received message`, msg);
            this.#handleMessage(scopedWorker, msg);
          },
        )
        .on('error', error => {
          this.#log(`Worker ${workerId} emitted error:`, error);
          this.#handleError(scopedWorker, error);
        })
        .on('exit', code => {
          this.#log(`Worker ${workerId} exited with code ${code}`);
          this.#handleExit(scopedWorker, code);
        });
    }

    const timeout = this.#timeouts.get(worker);
    if (timeout) {
      clearTimeout(timeout);
      this.#timeouts.delete(worker);
    }
    return worker;
  }

  /**
   * @param {Worker} worker
   * @param {WorkerResponseMessage} msg
   */
  #handleMessage(worker, msg) {
    const task = this.#pending.get(msg.id);
    if (!task) {
      this.#log('Unknown task', msg.id);
      return;
    }

    if (msg.type === 'result') {
      this.#pending.delete(msg.id);
      task.resolve(msg);
      this.#returnWorker(worker);
    } else if (msg.type === 'error') {
      this.#pending.delete(msg.id);
      task.reject(msg.error);
      this.#returnWorker(worker);
    } else {
      this.#log('Unexpected message:', msg);
    }
  }

  /**
   * Handles a worker exiting without sending a response. Rejects any pending
   * tasks for this worker and removes it from the pool.
   *
   * @param {Worker} worker
   * @param {number} code Exit code.
   */
  #handleExit(worker, code) {
    for (const [id, task] of this.#pending.entries()) {
      if (task.worker === worker) {
        this.#pending.delete(id);
        task.reject(
          new Error(
            `Worker ${this.#getWorkerId(worker)} exited with code ${code} before responding to message ${id}`,
          ),
        );
      }
    }

    this.#available.delete(worker);

    const timeout = this.#timeouts.get(worker);
    if (timeout) {
      clearTimeout(timeout);
      this.#timeouts.delete(worker);
    }

    this.#all.delete(worker);
    worker.removeAllListeners();
  }

  /**
   * @param {Worker} worker
   * @param {Error} error
   */
  #handleError(worker, error) {
    for (const [id, task] of this.#pending.entries()) {
      if (task.worker === worker) {
        this.#pending.delete(id);
        task.reject(error);
      }
    }

    this.#available.delete(worker);

    const timeout = this.#timeouts.get(worker);
    if (timeout) {
      clearTimeout(timeout);
      this.#timeouts.delete(worker);
    }

    this.#all.delete(worker);
    worker.removeAllListeners();
    const workerId = `#${this.#workerIds.get(worker) ?? '(unknown)'}`;
    worker.terminate().then(noop, err => {
      this.#log(`Error terminating worker ${workerId}:`, err);
    });
  }

  /** @param {Worker} worker */
  #returnWorker(worker) {
    const queued = this.#queue.shift();
    if (queued) {
      this.#pending.set(queued.message.id, {
        worker,
        resolve: queued.resolve,
        reject: queued.reject,
      });
      worker.postMessage(queued.message);
      this.#log('Returning worker to pool', queued.message);
      return;
    }

    this.#available.add(worker);
    this.#log('Adding worker to available pool');
    const workerId = `#${this.#workerIds.get(worker) ?? '(unknown)'}`;
    const idleTimeout = setTimeout(() => {
      if (this.#available.delete(worker)) {
        this.#log(`Worker ${workerId} timed out in ${this.#idleTimeout}ms`);
        this.#timeouts.delete(worker);
        this.#all.delete(worker);
        this.#terminateWorker(worker);
      }
    }, this.#idleTimeout).unref();

    this.#timeouts.set(worker, idleTimeout);
  }

  /**
   * Gets the ID of a worker or `(unknown)` if not found.
   * @param {Worker} worker
   * @returns {string} Worker ID (e.g. `#1`) or `(unknown)` if not found
   */
  #getWorkerId(worker) {
    return `#${this.#workerIds.get(worker) ?? '(unknown)'}`;
  }

  /**
   * Enqueues a worker for termination.
   *
   * @param {Worker} worker Worker to terminate
   * @returns {void} Promise that resolves when the worker is terminated (or fails to terminate)
   */
  #terminateWorker(worker) {
    this.#pendingTerminations.push(
      new Promise((resolve, reject) => {
        worker.removeAllListeners();
        worker.terminate().then(resolve, reject);
      }).then(
        () => {
          this.#log(`Worker ${this.#getWorkerId(worker)} terminated`);
        },
        error => {
          this.#log(
            `Error terminating worker ${this.#getWorkerId(worker)}:`,
            error,
          );
        },
      ),
    );
  }
}

/**
 * Factory for a {@link WorkerParserPool} instance.
 *
 * @template {readonly any[]} [TAnalyzerResults=unknown[]] - The type of the analyzer results array returned by the worker.
 * @param {string | URL} workerScript Path to the worker entry point.
 * @param {WorkerParserPoolOptions} [options] Options for the worker pool.
 * @returns {WorkerParserPool<TAnalyzerResults>} Newly-instantiated worker pool.
 * @group Worker Parser
 */
export const createWorkerParserPool = (workerScript, options) => {
  return new WorkerParserPool(workerScript, options);
};
