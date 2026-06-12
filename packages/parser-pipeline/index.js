/**
 * Entry point for the `@endo/parser-pipeline` package.
 *
 * @module
 * @groupDescription Constants
 * Constants used throughout the package.
 * @groupDescription Worker Parser
 * Worker-pool-based parser pipeline.
 */

// eslint-disable-next-line import/export
export * from './src/external.types.js';

export { createParsers } from './src/parsers.js';
export { runPipelineInWorker } from './src/worker-runner.js';
export {
  MJS_LANGUAGE,
  CJS_LANGUAGE,
  MTS_LANGUAGE,
  BABEL_SOURCE_TYPE_MODULE,
  BABEL_SOURCE_TYPE_COMMONJS,
} from './src/constants.js';
