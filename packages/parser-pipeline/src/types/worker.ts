/**
 * Types for the worker-based parser pipeline.
 *
 * @module
 */

import type {
  AsyncParserImplementation,
  ParseOptions,
} from '@endo/compartment-mapper';
import type { Worker } from 'worker_threads';
import type { CjsModuleSourceRecord } from '@endo/module-source';
import type { FinalStaticModuleType } from 'ses';
import type {
  LogFn,
  ModuleCompleteData,
  SourceType,
  AnalyzerPass,
  TransformPass,
} from './common.js';

/**
 * Creates analyzer passes for a given module. Called once per parse task.
 *
 * The `language` parameter (e.g. `'mjs'`, `'cjs'`) can be used to select
 * language-specific passes if needed.
 *
 * @param location The module's file URL.
 * @param specifier The module specifier.
 * @param language The module language.
 * @returns An array of analyzer passes.
 * @group Worker Parser
 */
export type CreateAnalyzerPassesFn = (
  location: string,
  specifier: string,
  language: string,
) => AnalyzerPass<unknown>[];

/**
 * Creates transform passes for a given module. Called once per parse task
 * inside a **worker thread**.
 *
 * Must return:
 * - `passes` – mutating transform visitors.
 * - `analyzerPass` – the module-source analyzer (shares state with the
 *   transform).
 * - `buildRecord` – a {@link WorkerRecordBuilder} whose output is
 *   structuredClone-compatible so it can be sent back via `postMessage`.
 *
 * The `language` parameter (e.g. `'mjs'`, `'cjs'`) selects language-specific
 * passes.
 *
 * @param location The module's file URL.
 * @param specifier The module specifier.
 * @param language The module language.
 * @returns An object containing the transform passes, the module-source
 * analyzer pass, and the record builder.
 * @group Worker Parser
 */
export type CreateTransformPassesFn = (
  location: string,
  specifier: string,
  language: string,
) => {
  /**
   * The transform passes.
   */
  passes: TransformPass[];
  /**
   * The module-source analyzer pass.
   */
  analyzerPass: AnalyzerPass<unknown>;
  /**
   * The record builder.
   */
  buildRecord: WorkerRecordBuilder;
};

/**
 * Options for creating a {@link WorkerParserPool}.
 *
 * @group Worker Parser
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
 * Options for {@link createWorkerParser}.
 *
 * @template TAnalyzerResults The type of the analyzer results array returned
 * by the worker. A tuple, defined by the caller.
 * @group Worker Parser
 */
export interface WorkerParserOptions<
  TAnalyzerResults extends readonly any[] = unknown[],
> extends WorkerParserPoolOptions {
  /**
   * Called after each module is fully processed in a worker.
   *
   * @param data Info about the module that has been fully processed, including user-defined analyzer results.
   */
  onModuleComplete?: (data: ModuleCompleteData<TAnalyzerResults>) => void;

  /**
   * The module language to use for all parse tasks dispatched by this parser
   * (e.g. `'mjs'` or `'cjs'`). This is baked into each `WorkerParseMessage`
   * and forwarded to the factory callbacks inside the worker.
   *
   * @defaultValue mjs
   */
  language?: SourceType;

  /**
   * An existing pool to reuse instead of creating a new one. Useful when
   * creating multiple parser facades that share a single underlying pool (e.g.
   * one for `mjs` and one for `cjs`).
   *
   * When a pool is provided, the {@link maxWorkers}, {@link idleTimeout},
   * {@link workerData}, and {@link log} options are ignored (they apply only at
   * pool-creation time).
   */
  pool?: WorkerParserPoolLike<TAnalyzerResults>;

  /**
   * Converts a raw {@link WorkerRecord} received from the worker into a
   * {@link ses!FinalStaticModuleType | FinalStaticModuleType} suitable for
   * `ParseResult.record`.
   *
   * This is the main-thread complement to the worker's `buildRecord`. It is
   * called **after** the `WorkerResultMessage` is received and runs in the main
   * thread, so it has full access to `readPowers` and may create closures.
   *
   * - For **ESM** this can be omitted (the worker already produces a
   *   {@link ses!FinalStaticModuleType | FinalStaticModuleType}.
   * - For **CJS** this should call
   *   {@link @endo/compartment-mapper!buildCjsExecuteRecord | buildCjsExecuteRecord}
   *   to attach an `execute` closure and satisfy the
   *   {@link ses!FinalStaticModuleType | FinalStaticModuleType} contract.
   *
   * @param workerRecord The raw record returned by the worker.
   * @param location The module's file URL.
   * @param parseOptions The original parse options (may include
   * `readPowers`).
   * @returns A {@link ses!FinalStaticModuleType | FinalStaticModuleType}
   */
  buildFinalRecord?: (
    workerRecord: WorkerRecord,
    location: string,
    parseOptions?: ParseOptions,
  ) => FinalStaticModuleType;
}

/**
 * Minimal interface for a worker parser pool, as required by
 * {@link WorkerParserOptions.pool}. Allows consumers to pass in a
 * {@link WorkerParserPool} or any compatible implementation.
 *
 * @template TAnalyzerResults The type of the analyzer results array returned
 * by the worker. A tuple, defined by the caller.
 * @group Worker Parser
 */

export interface WorkerParserPoolLike<
  TAnalyzerResults extends readonly any[] = unknown[],
> {
  /**
   * Dispatches a parse task to the worker pool.
   *
   * @param bytes The module source code as a UTF-8 encoded byte array.
   * @param specifier The module specifier.
   * @param location The module's file URL.
   * @param packageLocation The module's package location (directory URL).
   * @param language The module language.
   * @returns A `Promise` that resolves to a message containing the parse result.
   */
  dispatch(
    bytes: Uint8Array,
    specifier: string,
    location: string,
    packageLocation: string,
    language?: string,
  ): Promise<WorkerResultMessage<TAnalyzerResults>>;

  /**
   * Terminates the worker pool.
   *
   * Unused if a shared pool is provided.
   */
  terminate?: TerminateFn;
}

/**
 * Function type that terminates a worker pool.
 *
 * @returns A promise that resolves when the pool is terminated.
 * @group Worker Parser
 */
export type TerminateFn = () => Promise<void>;

/**
 * Configuration for {@link runPipelineInWorker}.
 *
 * The worker script provides these callbacks to wire up its visitor pipeline.
 * @group Worker Parser
 */
export interface WorkerPipelineConfig {
  /**
   * Creates analyzer passes for a given module. Called once per parse task.
   */
  createAnalyzerPasses: CreateAnalyzerPassesFn;

  /**
   * Creates transform passes for a given module. Called once per parse task.
   *
   * Must also return the analyzer pass from `@endo/module-source` (which shares state with
   * the transform) and the record builder.
   */
  createTransformPasses: CreateTransformPassesFn;

  /**
   * Optional pre-parse source string transform.
   *
   * Use this for lightweight string-based transforms that must happen _before_
   * AST parsing.
   *
   * @param source The source string to pre-process.
   */
  sourcePreprocessor?: (source: string) => string;

  /**
   * Optional logger
   */
  log?: LogFn;
}

/**
 * Base interface for all worker messages.
 *
 * @template TType The `type` property of the message.
 * @group Worker Parser
 */
export interface BaseWorkerMessage<TType extends string = string> {
  /**
   * Message type
   */
  type: TType;
  /**
   * A unique identifier for the message.
   */
  id: string;
}

/**
 * Message sent from the main thread to a worker to request parsing.
 * @group Worker Parser
 */
export interface WorkerParseMessage extends BaseWorkerMessage<'parse'> {
  /**
   * The module source code as a UTF-8 encoded byte array.
   */
  bytes: Uint8Array;
  /**
   * The module specifier.
   */
  specifier: string;
  /**
   * The module's file URL.
   */
  location: string;
  /**
   * The module's package location (directory URL).
   */
  packageLocation: string;
  /**
   * The module language, e.g. `'mjs'` or `'cjs'`. Used to select the right
   * Babel `sourceType` and visitor passes.
   */
  language: SourceType;
}

/**
 * Message sent from a worker back to the main thread with parse results.
 *
 * `record` is typed as {@link WorkerRecord} rather than
 * {@link FinalStaticModuleType} because workers cannot produce non-serializable
 * closures. The main thread must convert a {@link CjsModuleSourceRecord} to a
 * full {@link FinalStaticModuleType} before returning a `ParseResult`.
 * @group Worker Parser
 */
export interface WorkerResultMessage<
  TAnalyzerResults extends readonly any[] = unknown[],
> extends BaseWorkerMessage<'result'> {
  /**
   * The worker record, which might need massaging into a {@link ses!FinalStaticModuleType | FinalStaticModuleType}.
   */
  record: WorkerRecord;

  /**
   * The module source code as a UTF-8 encoded byte array.
   */
  bytes: Uint8Array;

  /**
   * The analyzer results.
   */
  analyzerResults: TAnalyzerResults;
}

/**
 * Message sent from a worker back to the main thread on error.
 *
 * The {@link error} property is the original `Error` instance (or a wrapper),
 * preserved via the `structuredClone` algorithm.
 *
 * Note that `@babel/parser` errors specifically contain non-cloneable objects
 * (e.g., function references in code frame context) and must be distilled prior
 * to transmission.
 * @group Worker Parser
 */
export interface WorkerErrorMessage extends BaseWorkerMessage<'error'> {
  error: Error;
}

/**
 * Discriminated union of all messages a worker can send back.
 *
 * @group Worker Parser
 */
export type WorkerResponseMessage =
  | WorkerResultMessage<any>
  | WorkerErrorMessage;

/**
 * A parser implementation that can be {@link terminate | terminated}.
 *
 * @privateRemarks This should probably instead use {@link Disposable} when we are
 * guaranteed support.
 * @group Worker Parser
 */
export interface TerminatableAsyncParserImplementation
  extends AsyncParserImplementation {
  /**
   * Terminates the parser.
   */
  terminate: TerminateFn;
}

/**
 * `structuredClone`-compatible objects that a worker may produce and send back over the IPC
 * channel.
 *
 * @group Worker Parser
 */
export type WorkerRecord = FinalStaticModuleType | CjsModuleSourceRecord;

/**
 * A function which builds a {@link WorkerRecord} from generated code inside a
 * worker thread.
 *
 * Unlike {@link RecordBuilder}, the result **must** be structuredClone-able so
 * it can be sent via `MessagePort.postMessage()`. Non-serializable closures
 * (e.g. {@link FinalStaticModuleType.execute | execute}) must therefore be
 * excluded; use a plain string functor instead.
 *
 * Also unlike {@link RecordBuilder}, it does not receive {@link ParseOptions}
 * as an optional final parameter (which is not itself structuredClone-able).
 *
 * @param source - The generated code.
 * @param location - The module's file URL.
 * @returns A {@link WorkerRecord}.
 * @group Worker Parser
 */
export type WorkerRecordBuilder = (
  source: string,
  location: string,
) => WorkerRecord;

/**
 * A base task in the worker pool.
 *
 * @template TAnalyzerResults The type of the analyzer results array returned by the worker. A tuple, defined by the caller.
 * @internal
 */
export interface BaseWorkerPoolTask<
  TAnalyzerResults extends readonly any[] = unknown[],
> {
  /**
   * A function to resolve the task.
   */
  resolve: (value: WorkerResultMessage<TAnalyzerResults>) => void;
  /**
   * A function to reject the task.
   */
  reject: (reason: Error) => void;
}

/**
 * A task in the worker pool that is currently being processed by a worker.
 *
 * @template TAnalyzerResults The type of the analyzer results array returned by the worker. A tuple, defined by the caller.
 * @internal
 */
export interface PendingWorkerPoolTask<
  TAnalyzerResults extends readonly any[] = unknown[],
> extends BaseWorkerPoolTask<TAnalyzerResults> {
  /**
   * The worker that will process the task.
   */
  worker: Worker;
}

/**
 * A task in the worker pool that is waiting for an available worker.
 *
 * @template TAnalyzerResults The type of the analyzer results array returned by the worker. A tuple, defined by the caller.
 * @internal
 */
export interface EnqueuedWorkerPoolTask<
  TAnalyzerResults extends readonly any[] = unknown[],
> extends BaseWorkerPoolTask<TAnalyzerResults> {
  /**
   * The message that will be sent to the worker.
   */
  message: WorkerParseMessage;
}
