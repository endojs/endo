/**
 * Worker script for async-parser.test.js.
 *
 * Mirrors the visitorFactories used in the equivalent sync test so that
 * round-tripping through the worker pool produces the same visitorResults.
 *
 * @module
 */

import { isMainThread, parentPort } from 'node:worker_threads';
import { runPipelineInWorker } from '../../src/worker-runner.js';

if (isMainThread) {
  throw new Error('This module must be run as a worker thread');
}

if (!parentPort) {
  throw new Error('No parentPort found');
}

runPipelineInWorker(parentPort, {
  visitorFactories: [
    () => ({
      visitor: {},
      done: () => 'user-result',
    }),
  ],
});
