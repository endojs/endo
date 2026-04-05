/**
 * Provides {@link createWorkerParser}, which returns an async
 * `ParserImplementation` backed by a worker pool.
 *
 * @module
 */

/**
 * @import {WorkerParserOptions, WorkerResultMessage, TerminatableAsyncParserImplementation} from './external.types.js'
 * @import {AsyncParseFn} from '@endo/compartment-mapper'
 */

import { WorkerParserPool } from './worker-pool.js';

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
 * @param {string | URL} workerScript Path to the consumer-provided worker
 *   entry point. The worker script should call `runPipelineInWorker` from
 *   `@endo/parser-pipeline/worker`.
 * @param {WorkerParserOptions} [options]
 * @returns {TerminatableAsyncParserImplementation}
 */
export function createWorkerParser(workerScript, options = {}) {
  const { onModuleComplete, ...poolOptions } = options;

  const pool = new WorkerParserPool(workerScript, poolOptions);

  /**
   * @type {AsyncParseFn}
   */
  const parse = async (bytes, specifier, location, packageLocation) => {
    /** @type {WorkerResultMessage} */
    const result = await pool.dispatch(
      bytes,
      specifier,
      location,
      packageLocation,
    );

    if (onModuleComplete) {
      onModuleComplete({
        location,
        specifier,
        analyzerResults: result.analyzerResults,
      });
    }

    return {
      parser: 'mjs',
      bytes: result.bytes,
      record: result.record,
    };
  };

  parse.isSyncParser = false;

  return {
    parse,
    heuristicImports: false,
    synchronous: false,
    terminate: async () => pool.terminate(),
  };
}
