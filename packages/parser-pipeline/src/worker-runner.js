/**
 * Provides {@link runPipelineInWorker}, a utility for worker scripts that runs
 * the composed AST pipeline in response to messages from the main thread.
 *
 * @module
 */

/**
 * @import {
 *   WorkerParseMessage,
 *   WorkerRawResultMessage,
 *   ClonedParseError,
 *   WorkerErrorMessage,
 * } from './types/worker.js'
 * @import {WorkerPipelineConfig, BabelParseError} from './types/pipeline.js'
 * @import {MessagePort} from 'node:worker_threads'
 * @import {RunPipelineInWorkerOptions} from './types/pipeline.js'
 */

import { MJS_LANGUAGE, noop } from './constants.js';
import { definePipelineConfig } from './pipeline-config.js';
import { runPipeline } from './run-pipeline.js';

const { stringify: q } = JSON;

/**
 * Returns `true` if the value is an `Error`.
 *
 * Uses platform `Error.isError` if available, otherwise falls back to `instanceof`.
 */
const { isError = value => value instanceof Error } = Error;

/**
 * Removes cruft from an error (hopefully an `Error`) which may not be serializable.
 *
 * @param {unknown} error
 * @returns {Error}
 */
const makeClonableError = error => {
  const clonableError = isError(error)
    ? new Error(error.message)
    : new Error(String(error));

  if (isError(error) && error.stack) {
    clonableError.stack = error.stack;
  }

  return clonableError;
};

/**
 * Encodes a {@link BabelParseError} as a plain, `structuredClone`-safe object,
 * preserving its `code`/`reasonCode` alongside `message` and `stack`.
 *
 * `structuredClone` — used internally by `worker_threads` message passing —
 * only preserves the standard `Error` fields (`message`, roughly `stack`,
 * `name`, `cause`); it drops arbitrary own-properties like Babel's
 * `code`/`reasonCode`. Sending plain data instead (and reviving it in
 * `worker-pool.js`) keeps those properties intact across the thread boundary.
 *
 * @param {BabelParseError} error
 * @returns {ClonedParseError}
 */
const makeClonedParseError = error => ({
  message: error.message,
  stack: error.stack,
  code: error.code,
  reasonCode: error.reasonCode,
});

/**
 * Starts listening for parse messages on the given `MessagePort` and runs the
 * composed pipeline for each one.
 *
 * Accepts a {@link WorkerPipelineConfig} — a restricted subset of
 * {@link PipelineConfig} containing only the Babel options and factory arrays
 * that workers consume.
 *
 * When a `'parse'` message arrives the appropriate per-language config is
 * looked up by the `language` field.
 *
 * The pipeline for each message:
 * 1. Parses the source with Babel.
 * 2. Runs the implicit module-source analyze pass (read-only).
 * 3. Runs user-defined analyzer passes.
 * 4. Collects user analyzer results **before** transforms mutate the AST.
 * 5. Runs user-defined transform passes.
 * 6. Runs the implicit module-source transform pass.
 * 7. Generates code.
 * 8. Calls `ctx.buildRecord(code, location)` to produce the module record.
 * 9. Posts `{ type: 'result', record, bytes, visitorResults }` back.
 *    `visitorResults` contains only user-defined results (not module-source).
 *    `finalizeRecord` is NOT applied in the worker; it runs on the main thread.
 *
 * @param {MessagePort} port The worker's `parentPort`.
 * @param {WorkerPipelineConfig} config
 *   Worker-scoped pipeline configuration. Only Babel options and factory arrays
 *   are accepted; lifecycle hooks, loggers, and record finalizers are
 *   main-thread concerns and have no effect inside a worker.
 * @param {RunPipelineInWorkerOptions} [options]
 * @returns {{ removePipelineListener: () => void }}
 * @group Worker Parser
 */
export function runPipelineInWorker(
  port,
  config,
  { log = noop, sourceMapHook } = {},
) {
  // Merge shared and per-language config once at startup.
  const configs = definePipelineConfig(config);

  /**
   * @param {WorkerParseMessage} msg
   * @returns {void}
   */
  const parseMessageListener = msg => {
    if (msg.type !== 'parse') {
      log(`Ignoring unexpected message w/ type: ${q(msg.type)}`);
      return;
    }

    const { id, bytes, specifier, location, language = MJS_LANGUAGE } = msg;

    try {
      const langConfig = configs[language];
      if (!langConfig) {
        throw new Error(
          `No pipeline config found for language "${language}". ` +
            `Available: ${Object.keys(configs).join(', ')}`,
        );
      }

      const {
        visitorFactories = [],
        babelGeneratorOptions,
        babelParserOptions,
      } = langConfig;

      // finalizeRecord is NOT called here; it runs on the main thread.
      const { transformedBytes, visitorResults, record, errors } = runPipeline({
        bytes,
        specifier,
        location,
        language,
        visitorFactories,
        babelParserOptions,
        babelGeneratorOptions,
        sourceMapHook,
      });

      /** @type {WorkerRawResultMessage} */
      const result = {
        type: 'result',
        id,
        record,
        bytes: transformedBytes,
        visitorResults,
      };

      if (errors?.length) {
        result.parseErrors = errors.map(makeClonedParseError);
      }

      port.postMessage(result, [transformedBytes.buffer]);
    } catch (err) {
      const clonableError = makeClonableError(err);

      /** @type {WorkerErrorMessage} */
      const errMsg = {
        type: 'error',
        id,
        error: clonableError,
      };
      port.postMessage(errMsg);
    }
  };

  port.on('message', parseMessageListener);

  return {
    removePipelineListener: () => {
      port.removeListener('message', parseMessageListener);
    },
  };
}
