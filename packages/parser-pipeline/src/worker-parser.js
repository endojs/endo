/**
 * Provides {@link createWorkerParser}, which returns an
 * `AsyncParserImplementation` backed by a worker pool.
 *
 * @module
 */

import { CJS_SOURCE_TYPE, identity, MJS_SOURCE_TYPE, noop } from './constants.js';
import { createWorkerParserPool } from './worker-pool.js';

/**
 * @import {WorkerParserPool} from './worker-pool.js'
 * @import {WorkerParserOptions, TerminatableAsyncParserImplementation} from './types/external.js'
 * @import {FinalStaticModuleType} from 'ses'
 * @import {AsyncParseFn} from '@endo/compartment-mapper'
 */

/**
 * Creates an async `parserForLanguage`-compatible parser backed by a worker
 * pool.
 *
 * Each call to `parse()` dispatches the source bytes to a worker thread, which
 * runs the full pipeline (parse + visitors + generate + buildRecord) and
 * returns the serializable results. This allows multiple modules to be parsed
 * in parallel across worker threads.
 *
 * The returned parser has `synchronous: false`, which causes
 * compartment-mapper's `makeMapParsers` to use the async trampoline. The async
 * trampoline implicitly awaits the Promise returned by `parse()`.
 *
 * To share a single pool between multiple parser facades (e.g. one for `mjs`
 * and one for `cjs`), pass the same `pool` instance in `options`. When `pool`
 * is provided, `terminate()` on the returned parser is a no-op — **the caller is
 * responsible for terminating the shared pool directly.**
 *
 * @template {readonly any[]} [TAnalyzerResults=unknown[]] - The type of the analyzer results array returned by the worker.
 * @param {string | URL} workerScript Path to the consumer-provided worker
 *   entry point. The worker script should call `runPipelineInWorker` from
 *   `@endo/parser-pipeline/worker-runner.js`. Ignored when `options.pool` is
 *   provided.
 * @param {WorkerParserOptions<TAnalyzerResults>} [options]
 * @returns {TerminatableAsyncParserImplementation}
 * @group Worker Parser
 */
export function createWorkerParser(workerScript, options = {}) {
  const {
    onModuleComplete = noop,
    onModuleStart = noop,
    pool: sharedPool,
    language = MJS_SOURCE_TYPE,
    buildFinalRecord = identity,
    log = noop,
    ...poolOptions
  } = options;

  const pool = /** @type {WorkerParserPool<TAnalyzerResults>} */ (
    sharedPool ?? createWorkerParserPool(workerScript, { log, ...poolOptions })
  );

  /**
   * @type {AsyncParseFn}
   */
  const parse = async (
    bytes,
    specifier,
    location,
    packageLocation,
    parseOptions,
  ) => {
    await onModuleStart(location);

    const { analyzerResults, record } = await pool.dispatch(
      bytes,
      specifier,
      location,
      packageLocation,
      language,
    );

    await onModuleComplete({
      location,
      specifier,
      analyzerResults,
    });

    const finalRecord = /** @type {FinalStaticModuleType} */ (
      buildFinalRecord(record, location, parseOptions)
    );

    return {
      parser: language,
      bytes,
      record: finalRecord,
    };
  };

  parse.isSyncParser = false;

  const terminate = sharedPool
    ? async () => {
        log('Shared pool attempted termination; this is a no-op');
      }
    : async () => {
        log('Terminating worker pool');
        return pool.terminate();
      };

  return {
    parse,
    heuristicImports: language === CJS_SOURCE_TYPE,
    synchronous: false,
    // When using a shared pool, the caller owns termination.
    terminate,
  };
}
