/**
 * Test worker that throws an uncaught exception when it receives a parse
 * message, causing the Worker to emit an 'error' event in the parent thread.
 *
 * @module
 */

import { isMainThread, parentPort } from 'node:worker_threads';

if (isMainThread) {
  throw new Error('This module must be run as a worker thread');
}

if (!parentPort) {
  throw new Error('No parentPort found');
}

parentPort.on('message', msg => {
  if (msg.type === 'parse') {
    throw new Error('intentional worker crash for testing');
  }
});
