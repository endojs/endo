/**
 * Provides {@link runPipelineInWorker}, a utility for worker scripts that runs
 * the composed AST pipeline in response to messages from the main thread.
 *
 * @module
 */

/**
 * @import {WorkerParseMessage, WorkerResultMessage, WorkerErrorMessage, WorkerPipelineConfig} from './types/external.js'
 * @import {MessagePort} from 'node:worker_threads'
 */

import { parse as parseBabel } from '@babel/parser';
import { generate as generateBabel } from '@babel/generator';
import traverse from '@babel/traverse';
import { MJS_SOURCE_TYPE, noop } from './constants.js';
import { getBabelSourceType } from './source-type.js';

const { default: traverseBabel } = traverse;

const { stringify: q } = JSON;

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
 * @returns {{removePipelineListener: () => void}} An object with a `removePipelineListener` method to stop listening for messages.
 * @group Worker Parser
 */
export function runPipelineInWorker(
  port,
  {
    createAnalyzerPasses,
    createTransformPasses,
    sourcePreprocessor,
    log = noop,
  },
) {
  /**
   * @param {WorkerParseMessage} msg
   * @returns {void}
   */
  const parseMessageListener = msg => {
    if (msg.type !== 'parse') {
      log(`Ignoring unexpected message w/ type: ${q(msg.type)}`);
      return;
    }

    const { id, bytes, specifier, location, language = MJS_SOURCE_TYPE } = msg;

    try {
      let source = textDecoder.decode(bytes);

      if (sourcePreprocessor) {
        source = sourcePreprocessor(source);
      }

      const babelSourceType = getBabelSourceType(language);

      const ast = parseBabel(source, {
        sourceType: babelSourceType,
        tokens: true,
        createParenthesizedExpressions: true,
        errorRecovery: true,
      });

      if (ast.errors?.length) {
        throw ast.errors[0] instanceof Error
          ? ast.errors[0]
          : new SyntaxError(ast.errors.map(error => String(error)).join('\n'));
      }

      const analyzerPasses = createAnalyzerPasses(
        location,
        specifier,
        language,
      );
      const {
        passes: transformPasses,
        analyzerPass: moduleSourceAnalyzer,
        buildRecord,
      } = createTransformPasses(location, specifier, language);

      for (const pass of analyzerPasses) {
        traverseBabel(ast, pass.visitor);
      }

      traverseBabel(ast, moduleSourceAnalyzer.visitor);

      // Collect analyzer results BEFORE transforms mutate the AST.
      // Some analyzers (e.g. globals) lazily call inspectGlobals on the
      // captured AST reference in getResults(); calling them now ensures they
      // see the original, untransformed AST.
      /** @type {unknown[]} */
      const analyzerResults = [
        ...analyzerPasses.map(p => p.getResults()),
        moduleSourceAnalyzer.getResults(),
      ];

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

      /** @type {WorkerResultMessage} */
      const result = {
        type: 'result',
        id,
        record,
        bytes: resultBytes,
        analyzerResults,
      };

      port.postMessage(result, [resultBytes.buffer]);
    } catch (err) {
      // Babel errors (and some other errors) contain non-cloneable objects
      // (e.g., function references in code frame context). Sanitize the error
      // into a plain Error before sending via postMessage.
      const clonableError =
        err instanceof Error ? new Error(err.message) : new Error(String(err));

      if (err instanceof Error && err.stack) {
        clonableError.stack = err.stack;
      }

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
