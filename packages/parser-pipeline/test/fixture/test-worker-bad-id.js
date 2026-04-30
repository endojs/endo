/**
 * Test worker that responds to a parse message with a result carrying a
 * completely different task ID, exercising the "unknown task" branch in
 * `#handleMessage`.
 *
 * @module
 */

import { isMainThread, parentPort } from 'node:worker_threads';

/**
 * @import {WorkerParseMessage} from '../../src/types/worker.js'
 */

if (isMainThread) {
  throw new Error('This module must be run as a worker thread');
}

if (!parentPort) {
  throw new Error('No parentPort found');
}

parentPort.on(
  'message',
  /**
   * @param {WorkerParseMessage} msg
   * @this {MessagePort}
   */
  function messageListener(msg) {
    if (msg.type === 'parse') {
      this.postMessage({
        type: 'result',
        id: 'not-a-valid-task-id-99999',
        record: {
          imports: [],
          exports: [],
          reexports: [],
          __syncModuleProgram__: '',
          __liveExportMap__: {},
          __fixedExportMap__: {},
          __reexportMap__: {},
        },
        bytes: new Uint8Array(),
        visitorResults: [],
      });
    }
  },
);
