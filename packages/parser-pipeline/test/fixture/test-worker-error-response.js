/**
 * Test worker that always responds with a `type: 'error'` message, exercising
 * the error-response branch in `#handleMessage`.
 *
 * @module
 */

import { isMainThread, parentPort } from 'node:worker_threads';

/** @import {WorkerParseMessage} from '../../src/types/worker.js' */

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
   */ function messageListener(msg) {
    if (msg.type === 'parse') {
      this.postMessage({
        type: 'error',
        id: msg.id,
        error: new Error('test worker error response'),
      });
    }
  },
);
