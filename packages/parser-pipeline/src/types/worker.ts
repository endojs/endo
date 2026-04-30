/**
 * Internal types for the worker pool infrastructure.
 *
 * These types describe the pool, IPC message shapes, and pool-task records.
 *
 * @module
 * @internal
 */

import type { ParseError } from '@babel/parser';
import type { Worker } from 'node:worker_threads';
import type { LogFn, PipelineLanguage, PipelineRecord } from './pipeline.js';

/**
 * Options for creating a worker pool.
 *
 * @internal
 */
export interface WorkerParserPoolOptions {
  /**
   * Maximum number of concurrent workers.
   *
   * @defaultValue `os.availableParallelism() - 1` (minimum 1)
   */
  maxWorkers?: number;

  /**
   * How long (ms) idle workers survive before termination.
   *
   * @defaultValue 1000
   */
  idleTimeout?: number;

  /**
   * Data passed to each worker at spawn time via `workerData`.
   *
   * Must be structuredClone-able. Use this for serializable configuration.
   */
  workerData?: unknown;

  /**
   * Optional function to log messages.
   */
  log?: LogFn;
}

/**
 * Function type that terminates a worker pool.
 *
 * @returns A promise that resolves when the pool is terminated.
 * @internal
 */
export type TerminateFn = () => Promise<void>;

/**
 * Base interface for all worker messages.
 *
 * @template TType The `type` property of the message.
 * @internal
 */
export interface BaseWorkerMessage<TType extends string = string> {
  type: TType;
  id: string;
}

/**
 * Message sent from the main thread to a worker to request parsing.
 * @internal
 */
export interface WorkerParseMessage extends BaseWorkerMessage<'parse'> {
  bytes: Uint8Array;
  specifier: string;
  location: string;
  packageLocation: string;
  language: PipelineLanguage;
}

/**
 * Message sent from a worker back to the main thread with parse results.
 *
 * `record` is {@link PipelineRecord} because workers cannot produce
 * non-serializable closures. The main thread converts it via `finalizeRecord`.
 * @internal
 */
export interface WorkerResultMessage<
  TLanguage extends PipelineLanguage = PipelineLanguage,
  TVisitorResults extends readonly any[] = unknown[],
> extends BaseWorkerMessage<'result'> {
  record: PipelineRecord<TLanguage>;
  bytes: Uint8Array<ArrayBuffer>;
  visitorResults: TVisitorResults;
  parseErrors?: ParseError[];
}

/**
 * Message sent from a worker back to the main thread on error.
 * @internal
 */
export interface WorkerErrorMessage extends BaseWorkerMessage<'error'> {
  error: Error;
}

/**
 * Discriminated union of all messages a worker can send back.
 * @internal
 */
export type WorkerResponseMessage =
  | WorkerResultMessage<any, any>
  | WorkerErrorMessage;

/**
 * @internal
 */
export interface BaseWorkerPoolTask<
  TVisitorResults extends readonly any[] = unknown[],
> {
  resolve: (
    value: WorkerResultMessage<PipelineLanguage, TVisitorResults>,
  ) => void;
  reject: (reason: Error) => void;
}

/**
 * @internal
 */
export interface PendingWorkerPoolTask<
  TVisitorResults extends readonly any[] = unknown[],
> extends BaseWorkerPoolTask<TVisitorResults> {
  worker: Worker;
}

/**
 * @internal
 */
export interface EnqueuedWorkerPoolTask<
  TVisitorResults extends readonly any[] = unknown[],
> extends BaseWorkerPoolTask<TVisitorResults> {
  message: WorkerParseMessage;
}
