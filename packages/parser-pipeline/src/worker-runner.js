/**
 * Provides {@link runPipelineInWorker}, a utility for worker scripts that runs
 * the composed AST pipeline in response to messages from the main thread.
 *
 * @module
 */

/**
 * @import {WorkerParseMessage, WorkerResultMessage, WorkerErrorMessage, WorkerPipelineConfig} from './external.types.js'
 * @import {MessagePort} from 'node:worker_threads'
 */

import { parse as parseBabel } from '@babel/parser';
import { generate as generateBabel } from '@babel/generator';
import traverse from '@babel/traverse';

const { default: traverseBabel } = traverse;

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * Starts listening for parse messages on the given `MessagePort` and runs the
 * composed pipeline for each one.
 *
 * This is the main entry point for consumer-provided worker scripts. The
 * worker script imports its own visitor modules, builds a
 * {@link WorkerPipelineConfig}, and calls this function.
 *
 * @param {MessagePort} port The worker's `parentPort`.
 * @param {WorkerPipelineConfig} config Pipeline configuration with visitor
 *   factories.
 * @returns {{removePipelineListener: () => void}} An object with a `stop` method to stop listening for messages.
 */
export function runPipelineInWorker(
  port,
  { createAnalyzerPasses, createTransformPasses, sourcePreprocessor },
) {
  /**
   * @param {WorkerParseMessage} msg
   * @returns {void}
   */
  const messageListener = msg => {
    if (msg.type !== 'parse') return;

    const { id, bytes, specifier, location } = msg;

    try {
      let source = textDecoder.decode(bytes);

      if (sourcePreprocessor) {
        source = sourcePreprocessor(source);
      }

      const ast = parseBabel(source, {
        sourceType: 'module',
        tokens: true,
        createParenthesizedExpressions: true,
        allowReturnOutsideFunction: true,
        errorRecovery: true,
      });

      const analyzerPasses = createAnalyzerPasses(location, specifier);
      const {
        passes: transformPasses,
        analyzerPass: moduleSourceAnalyzer,
        buildRecord,
      } = createTransformPasses(location, specifier);

      for (const pass of analyzerPasses) {
        traverseBabel(ast, pass.visitor);
      }

      traverseBabel(ast, moduleSourceAnalyzer.visitor);

      for (const pass of transformPasses) {
        traverseBabel(ast, pass.visitor);
      }

      const { code: transformedSource } = generateBabel(
        ast,
        {
          sourceMaps: false,
          // @ts-expect-error undocumented
          experimental_preserveFormat: true,
          preserveFormat: true,
          retainLines: true,
          verbatim: true,
        },
        source,
      );

      const record = buildRecord(transformedSource, location);
      const resultBytes = textEncoder.encode(transformedSource);

      /** @type {unknown[]} */
      const analyzerResults = [
        ...analyzerPasses.map(p => p.getResults()),
        moduleSourceAnalyzer.getResults(),
      ];

      /** @type {WorkerResultMessage} */
      const result = {
        type: 'result',
        id,
        record,
        bytes: resultBytes,
        analyzerResults,
      };

      port.postMessage(result);
    } catch (err) {
      /** @type {WorkerErrorMessage} */
      const errMsg = {
        type: 'error',
        id,
        error:
          err instanceof Error
            ? err
            : new Error('Unknown error', { cause: err }),
      };
      port.postMessage(errMsg);
    }
  };
  port.on('message', messageListener);

  return {
    removePipelineListener: () => {
      port.removeListener('message', messageListener);
    },
  };
}
