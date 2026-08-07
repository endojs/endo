/**
 * Test worker that exits immediately when it receives a parse message without
 * posting a response, causing the Worker to emit an 'exit' event in the parent.
 *
 * @module
 */

import { exit } from 'node:process';
import { isMainThread, parentPort } from 'node:worker_threads';

if (isMainThread) {
  throw new Error('This module must be run as a worker thread');
}

if (!parentPort) {
  throw new Error('No parentPort found');
}

parentPort.on('message', msg => {
  if (msg.type === 'parse') {
    exit(1);
  }
});
