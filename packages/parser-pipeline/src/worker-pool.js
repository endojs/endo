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
 *   WorkerRawResultMessage,
 *   WorkerResponseMessage,
 *   ClonedParseError,
 *   WorkerParserPoolOptions,
 *   PendingWorkerPoolTask,
 *   EnqueuedWorkerPoolTask
 * } from './types/worker.js'
 * @import { BabelParseError,LogFn, PipelineLanguage } from './types/pipeline.js'
 */

import { availableParallelism } from 'node:os';
import { clearTimeout, setTimeout } from 'node:timers';
import { Worker } from 'node:worker_threads';
import { MJS_LANGUAGE, noop } from './constants.js';

const { assign } = Object;

/**
 * Reconstitutes a plain-object-encoded parse error (see
 * {@link ClonedParseError}) into a real {@link Error} instance with
 * `code`/`reasonCode` restored.
 *
 * Complements {@link makeClonedParseError}; the `structuredClone` algorithm
 * does not preserve arbitrary own-properties on `Error` instances, so
 * worker-side code sends plain data instead. This reverses that encoding on
 * receipt.
 *
 * Babel 8 types `ParseError` with `loc` and `pos`, which
 * {@link ClonedParseError} does not carry across the worker boundary, so the
 * revived error is a {@link BabelParseError} only by assertion.
 *
 * @param {ClonedParseError} clonedError
 * @returns {BabelParseError}
 */
const reviveParseError = ({ message, stack, code, reasonCode }) =>
  /** @type {BabelParseError} */ (
    assign(new Error(message), { code, reasonCode, stack })
  );

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
 * @template {readonly any[]} [TVisitorResults=unknown[]] - The type of the visitor results array returned by the worker.
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
   * @type {Map<string, PendingWorkerPoolTask<TVisitorResults>>}
   */
  #pending = new Map();

  /**
   * Tasks waiting for an available worker.
   *
   * @type {Array<EnqueuedWorkerPoolTask<TVisitorResults>>}
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
   * The returned promise carries the broad `PipelineLanguage` because the
   * pool itself is language-agnostic. Callers that know the requested language
   * statically (e.g. {@link createAsyncParserFromConfig}) may narrow the
   * resulting `record` to a `PipelineRecord<TLanguage>` at the call site.
   *
   * @param {Uint8Array} bytes Source bytes.
   * @param {string} specifier Module specifier.
   * @param {string} location Module file URL.
   * @param {string} packageLocation Package root URL.
   * @param {PipelineLanguage} [language] Module language (e.g. `'mjs'` or `'cjs'`).
   * @returns {Promise<WorkerResultMessage<PipelineLanguage, TVisitorResults>>}
   */
  async dispatch(
    bytes,
    specifier,
    location,
    packageLocation,
    language = MJS_LANGUAGE,
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
        this.#log(
          `Worker pool is at capacity, enqueuing message ${message.id}`,
        );
        this.#queue.push({ message, resolve, reject });
        return;
      }
      this.#log(
        `Sending message "${message.type}" to worker ${this.#getWorkerId(worker)}:`,
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
      /* c8 ignore start */
    } catch {
      // ignore
      /* c8 ignore end */
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
            this.#log(`Worker ${workerId} received message "${msg.type}"`);
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
   * Handles any message from a worker.
   *
   * - If the message is a successful result, resolves the task with the result.
   *   `parseErrors`, if present, are revived from their clonable wire format
   *   (see {@link WorkerRawResultMessage}) into real `Error` instances via
   *   {@link reviveParseError}.
   * - If the message is an error, rejects the task with the error.
   * - If the message is unexpected, logs an error.
   *
   * @param {Worker} worker
   * @param {WorkerResponseMessage} msg
   * @returns {void}
   */
  #handleMessage(worker, msg) {
    const task = this.#pending.get(msg.id);
    if (!task) {
      this.#log('Unknown task', msg.id);
      return;
    }

    this.#pending.delete(msg.id);
    switch (msg.type) {
      case 'result': {
        const revived = msg.parseErrors?.length
          ? { ...msg, parseErrors: msg.parseErrors.map(reviveParseError) }
          : msg;
        task.resolve(
          /** @type {WorkerResultMessage<PipelineLanguage, TVisitorResults>} */ (
            /** @type {unknown} */ (revived)
          ),
        );
        break;
      }
      case 'error': {
        task.reject(msg.error);
        break;
      }
      default: {
        this.#log('Unexpected message:', msg);
        task.reject(
          // @ts-expect-error - msg.type is "never"
          new Error(`Unexpected message type: ${msg.type}`, { cause: msg }),
        );
        break;
      }
    }
    this.#returnWorker(worker);
  }

  /**
   * Handles a worker exiting without sending a response. Rejects any pending
   * tasks for this worker and removes it from the pool.
   *
   * @param {Worker} worker
   * @param {number} code Exit code.
   * @returns {void}
   */
  #handleExit(worker, code) {
    for (const [id, task] of this.#pending) {
      if (task.worker === worker) {
        this.#pending.delete(id);
        task.reject(
          new Error(
            `Worker ${this.#getWorkerId(worker)} exited with code ${code} before responding to message ${id}`,
          ),
        );
      }
    }

    this.#terminateWorker(worker);
  }

  /**
   * Handles a worker emitting an error.
   *
   * Finds the worker within the pending tasks and rejects the task with the
   * error, then terminates the worker.
   * @param {Worker} worker
   * @param {Error} error
   * @returns {void}
   */
  #handleError(worker, error) {
    for (const [id, task] of this.#pending.entries()) {
      if (task.worker === worker) {
        this.#pending.delete(id);
        task.reject(error);
      }
    }

    this.#terminateWorker(worker);
  }

  /**
   * Returns a worker to the pool of available workers for a new task.
   * @param {Worker} worker
   * @returns {void}
   */
  #returnWorker(worker) {
    const queued = this.#queue.shift();
    if (queued) {
      this.#pending.set(queued.message.id, {
        worker,
        resolve: queued.resolve,
        reject: queued.reject,
      });
      worker.postMessage(queued.message);
      this.#log(`Returning worker to pool for message ${queued.message.id}`);
      return;
    }

    this.#available.add(worker);
    this.#log('Adding worker to available pool');
    const idleTimeout = setTimeout(() => {
      if (this.#available.delete(worker)) {
        const workerId = `#${this.#workerIds.get(worker) ?? '(unknown)'}`;
        this.#log(`Worker ${workerId} timed out in ${this.#idleTimeout}ms`);
        this.#terminateWorker(worker);
      }
    }, this.#idleTimeout).unref();

    this.#timeouts.set(worker, idleTimeout);
  }

  /**
   * Gets the ID of a worker or `(unknown)` if not found.
   *
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
   * @returns {void} The termination promise is tracked in `#pendingTerminations`
   */
  #terminateWorker(worker) {
    this.#available.delete(worker);

    const timeout = this.#timeouts.get(worker);
    if (timeout) {
      clearTimeout(timeout);
      this.#timeouts.delete(worker);
    }

    worker.removeAllListeners();
    this.#all.delete(worker);

    this.#pendingTerminations.push(
      worker.terminate().then(
        () => {
          this.#log(`Worker ${this.#getWorkerId(worker)} terminated`);
        },
        /* c8 ignore start */
        error => {
          this.#log(
            `Error terminating worker ${this.#getWorkerId(worker)}:`,
            error,
          );
        },
        /* c8 ignore end */
      ),
    );
  }
}

/**
 * Factory for a {@link WorkerParserPool} instance.
 *
 * @template {readonly any[]} [TVisitorResults=unknown[]] - The type of the visitor results array returned by the worker.
 * @param {string | URL} workerScript Path to the worker entry point.
 * @param {WorkerParserPoolOptions} [options] Options for the worker pool.
 * @returns {WorkerParserPool<TVisitorResults>} Newly-instantiated worker pool.
 * @group Worker Parser
 */
export const createWorkerParserPool = (workerScript, options) => {
  return new WorkerParserPool(workerScript, options);
};
