/**
 * Worker script exercising a `VisitorPass` that omits `done()`.
 *
 * The visitor mutates every `Identifier` named `original` to `renamed`, so
 * tests can confirm the traversal actually ran (by inspecting the generated
 * code) even though `visitorResults` records `undefined` for this pass.
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
      visitor: {
        Identifier(path) {
          if (path.node.name === 'original') {
            path.node.name = 'renamed';
          }
        },
      },
      // Intentionally no done().
    }),
  ],
});
