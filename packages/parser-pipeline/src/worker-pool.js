/* eslint-disable no-shadow */
/**
 * Provides {@link WorkerParserPool}, a worker thread pool for parallelizing
 * AST parsing.
 *
 * @module
 */

/** @import {WorkerParseMessage, WorkerResultMessage, WorkerErrorMessage, WorkerResponseMessage, WorkerParserOptions} from './external.types.js' */

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { clearTimeout, setTimeout } from 'node:timers';

const DEFAULT_IDLE_TIMEOUT = 1000;
const DEFAULT_MAX_WORKERS = Math.max(1, availableParallelism() - 1);

let nextTaskId = 0;
let nextWorkerId = 0;

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
 */
export class WorkerParserPool {
  /** @type {string | URL} */
  #workerScript;

  /** @type {number} */
  #maxWorkers;

  /** @type {number} */
  #idleTimeout;

  /** @type {unknown} */
  #workerData;

  /** @type {Set<Worker>} */
  #available = new Set();

  /** @type {Set<Worker>} */
  #all = new Set();

  /** @type {Map<Worker, NodeJS.Timeout>} */
  #timeouts = new Map();

  /**
   * Pending tasks keyed by task ID. Resolved when the worker posts a result.
   *
   * @type {Map<string, { worker: Worker, resolve: Function, reject: Function }>}
   */
  #pending = new Map();

  /**
   * Tasks waiting for an available worker.
   *
   * @type {{ message: WorkerParseMessage, resolve: Function, reject: Function }[]}
   */
  #queue = [];

  /** @type {(...args: unknown[]) => void} */
  #log;

  /** @type {WeakMap<Worker, number>} */
  #workerIds = new WeakMap();

  /**
   * @param {string | URL} workerScript Path to the worker entry point.
   * @param {WorkerParserOptions} [options]
   */
  constructor(workerScript, options = {}) {
    const {
      maxWorkers = DEFAULT_MAX_WORKERS,
      idleTimeout = DEFAULT_IDLE_TIMEOUT,
      workerData,
      log = () => {},
    } = options;
    this.#workerScript = workerScript;
    this.#maxWorkers = Math.max(1, maxWorkers);
    this.#idleTimeout = idleTimeout;
    this.#workerData = workerData;
    this.#log = log;
  }

  /**
   * Dispatches a parse task to the worker pool.
   *
   * @param {Uint8Array} bytes Source bytes.
   * @param {string} specifier Module specifier.
   * @param {string} location Module file URL.
   * @param {string} packageLocation Package root URL.
   * @returns {Promise<WorkerResultMessage>}
   */
  async dispatch(bytes, specifier, location, packageLocation) {
    nextTaskId += 1;
    const id = String(nextTaskId);

    /** @type {WorkerParseMessage} */
    const message = {
      type: 'parse',
      id,
      bytes,
      specifier,
      location,
      packageLocation,
    };

    return new Promise((resolve, reject) => {
      const worker = this.#getWorker();
      if (!worker) {
        this.#log('Worker pool is at capacity, queuing task', message);
        this.#queue.push({ message, resolve, reject });
        return;
      }
      this.#log('Worker pool is dispatching task', message);
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

    await Promise.all(
      [...this.#all].map(w => {
        w.removeAllListeners();
        return w.terminate();
      }),
    );
    this.#all.clear();
    this.#available.clear();
    this.#workerIds = new WeakMap();
    nextWorkerId = 0;
    nextTaskId = 0;

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
      nextWorkerId += 1;
      this.#workerIds.set(worker, nextWorkerId);
      this.#all.add(worker);
      const boundWorker = worker;
      worker.on(
        'message',
        /** @param {WorkerResponseMessage} msg */ msg => {
          this.#log('Worker message', this.#workerIds.get(boundWorker), msg);
          this.#handleMessage(boundWorker, msg);
        },
      );
      worker.on('error', error => {
        this.#log(
          'Worker error event',
          this.#workerIds.get(boundWorker),
          error,
        );
        this.#handleError(boundWorker, error);
      });
      worker.on('exit', code => {
        this.#log(
          'Worker exited with code',
          this.#workerIds.get(boundWorker),
          code,
        );
        this.#handleExit(boundWorker, code);
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
      this.#log('Unexpected message', msg);
    }
    // Ignore unexpected message types (e.g., progress/debug messages)
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
          new Error(`Worker exited with code ${code} before responding`),
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
    worker.terminate().then(
      () => {
        this.#log('Terminated worker', this.#workerIds.get(worker));
      },
      error => {
        this.#log(
          'Error terminating worker',
          this.#workerIds.get(worker),
          error,
        );
      },
    );
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
    const timeout = setTimeout(() => {
      if (this.#available.delete(worker)) {
        this.#log('Worker timed out', this.#workerIds.get(worker));
        this.#timeouts.delete(worker);
        this.#all.delete(worker);
        worker.removeAllListeners();

        worker.terminate().then(
          () => {
            this.#log('Terminated worker', this.#workerIds.get(worker));
          },
          error => {
            this.#log(
              'Error terminating worker',
              this.#workerIds.get(worker),
              error,
            );
          },
        );
      }
    }, this.#idleTimeout);
    timeout.unref();

    this.#timeouts.set(worker, timeout);
  }
}
