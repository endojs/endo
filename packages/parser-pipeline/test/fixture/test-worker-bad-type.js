/**
 * Test worker that responds with an unrecognized message type, exercising the
 * `else` branch in `#handleMessage`.
 *
 * @module
 */

/** @import {WorkerParseMessage} from '../../src/types/worker.js' */

import { isMainThread, parentPort } from 'node:worker_threads';

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
        type: 'unexpected-response-type',
        id: msg.id,
      });
    }
  },
);
