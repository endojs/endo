/* eslint-disable @jessie.js/safe-await-separator */
/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { MessageChannel } from 'node:worker_threads';
import { setTimeout } from 'node:timers';
import { runPipelineInWorker } from '../src/worker-runner.js';
import { once } from 'node:events';

/**
 * @import {PipelineConfig} from '../src/types/pipeline.js'
 * @import {WorkerResultMessage, WorkerErrorMessage} from '../src/types/worker.js'
 * @import {MessagePort} from 'node:worker_threads'
 * @import {PrecompiledModuleSource} from 'ses'
 */

const textEncoder = new TextEncoder();

/** @type {(source: string) => Uint8Array} */
const encode = source => textEncoder.encode(source);

/**
 * Creates a minimal pipeline config for testing.
 *
 * Two visitor factories are registered so tests can verify that results from
 * multiple passes are collected and returned in order.
 *
 * @returns {PipelineConfig<[
 *   { analyzed: true; },
 *   { moduleAnalysis: true; },
 * ]>}
 */
const createTestConfig = () => ({
  visitorFactories: [
    (_location, _specifier) => ({
      visitor: {},
      done: () => ({ analyzed: true }),
    }),
    (_location, _specifier) => ({
      visitor: {},
      done: () => ({ moduleAnalysis: true }),
    }),
  ],
});

/**
 * Sends a parse message and waits for the response.
 *
 * @param {MessagePort} port
 * @param {string} source
 * @param {string} [id]
 * @returns {Promise<WorkerResultMessage|WorkerErrorMessage>}
 */
const sendAndReceive = async (port, source, id = '1') => {
  const promise = once(port, 'message');
  port.postMessage({
    type: 'parse',
    id,
    bytes: encode(source),
    specifier: 'test-spec',
    location: 'file:///test.js',
    packageLocation: 'file:///',
  });
  const [result] = await promise;
  return result;
};

test('runPipelineInWorker responds with a result message', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const msg = /** @type {WorkerResultMessage} */ (
      await sendAndReceive(port2, 'const x = 1;')
    );
    t.is(msg.type, 'result');
    t.is(msg.id, '1');
    t.truthy(msg.record);
    t.truthy(msg.bytes);
    t.true(msg.visitorResults.length > 0);
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('result contains analyzer results from all passes', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const msg = /** @type {WorkerResultMessage} */ (
      await sendAndReceive(port2, 'const x = 1;')
    );

    t.deepEqual(msg.visitorResults[0], { analyzed: true });
    t.deepEqual(msg.visitorResults[1], { moduleAnalysis: true });
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('result record contains the generated code', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const msg = /** @type {WorkerResultMessage<'mjs'>} */ (
      await sendAndReceive(port2, 'export const x = 1;')
    );

    const record = /** @type {PrecompiledModuleSource} */ (msg.record);
    t.is(typeof record.__syncModuleProgram__, 'string');
    t.true(record.__syncModuleProgram__.includes('const x'));
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('responds with error message on parse failure', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const msg = /** @type {WorkerErrorMessage} */ (
      await sendAndReceive(port2, '))) totally invalid {{{{')
    );

    t.is(msg.type, 'error');
    t.is(msg.id, '1');
    t.truthy(msg.error, 'error property should be present');
    t.is(typeof msg.error.message, 'string');
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('ignores non-parse messages', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    let gotResponse = false;
    port2.on('message', () => {
      gotResponse = true;
    });

    port2.postMessage({ type: 'not-a-parse', id: '99' });

    await new Promise(resolve => setTimeout(resolve, 50));
    t.false(gotResponse, 'should not respond to non-parse messages');
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('removePipelineListener() removes the message listener', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  runner.removePipelineListener();

  let gotResponse = false;
  port2.on('message', () => {
    gotResponse = true;
  });

  port2.postMessage({
    type: 'parse',
    id: '1',
    bytes: encode('const x = 1;'),
    specifier: 'test',
    location: 'file:///test.js',
    packageLocation: 'file:///',
  });

  await new Promise(resolve => setTimeout(resolve, 50));
  t.false(gotResponse, 'should not respond after removePipelineListener()');

  port1.close();
  port2.close();
});

test('handles multiple sequential messages', async t => {
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const msg1 = await sendAndReceive(port2, 'const a = 1;', '10');
    const msg2 = await sendAndReceive(port2, 'const b = 2;', '20');

    t.is(msg1.type, 'result');
    t.is(msg1.id, '10');
    t.is(msg2.type, 'result');
    t.is(msg2.id, '20');
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});
