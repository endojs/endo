/**
 * Worker script with two ordered `VisitorPass`es:
 *
 * 1. Renames every `Identifier` named `original` to `renamed` (no `done()`).
 * 2. Collects every `Identifier` name it sees, via `done()`.
 *
 * Used to confirm that `done()` fires immediately after each pass's own
 * traversal, so pass 2 observes pass 1's mutation rather than the original
 * AST.
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
    }),
    () => {
      /** @type {string[]} */
      const names = [];
      return {
        visitor: {
          Identifier(path) {
            names.push(path.node.name);
          },
        },
        done() {
          return names;
        },
      };
    },
  ],
});
