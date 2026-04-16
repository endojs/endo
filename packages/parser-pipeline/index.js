/**
 * Entry point for the `@endo/parser-pipeline` package.
 *
 * @module
 * @groupDescription Composed Parser
 * Used with the synchronous composed parser pipeline.
 * @groupDescription Worker Parser
 * Used with the asynchronous worker-pool-based parser pipeline.
 * @groupDescription Common Types
 * Types common to both the worker-based and composed parser pipelines.
 * @groupDescription Constants
 * Constants used throughout the package.
 */

// eslint-disable-next-line import/export
export * from './src/external.types.js';

export { createComposedParser } from './src/composed-parser.js';
export { createWorkerParser } from './src/worker-parser.js';
export { WorkerParserPool, createWorkerParserPool } from './src/worker-pool.js';
export { runPipelineInWorker } from './src/worker-runner.js';
export {
  BABEL_SOURCE_TYPE_MODULE,
  BABEL_SOURCE_TYPE_COMMONJS,
  MJS_SOURCE_TYPE,
  CJS_SOURCE_TYPE,
} from './src/constants.js';
