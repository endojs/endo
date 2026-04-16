/**
 * Minimal test worker for WorkerParserPool tests.
 *
 * Echoes back a result with the specifier and location from the parse message.
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

const textEncoder = new TextEncoder();
const decoder = new TextDecoder();

parentPort.on('message', function messageListener(msg) {
  if (msg.type !== 'parse') {
    console.warn('test-worker: Unexpected message:', msg);
    return;
  }

  try {
    const source = decoder.decode(msg.bytes);
    const resultBytes = textEncoder.encode(`/* processed */ ${source}`);

    this.postMessage(
      {
        type: 'result',
        id: msg.id,
        record: {
          imports: [],
          exports: [],
          reexports: [],
          __syncModuleProgram__: source,
          __liveExportMap__: {},
          __fixedExportMap__: {},
          __reexportMap__: {},
        },
        bytes: resultBytes,
        analyzerResults: [new Map([['testGlobal', 'read']]), new Set(['fs'])],
      },
      [resultBytes.buffer],
    );
  } catch (err) {
    this.postMessage({
      type: 'error',
      id: msg.id,
      error:
        err instanceof Error ? err : new Error('Unknown error', { cause: err }),
    });
  }
});
