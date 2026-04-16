/* eslint-disable @endo/restrict-comparison-operands */
/* eslint-disable no-underscore-dangle */
import test from '@endo/ses-ava/prepare-endo.js';
import { MessageChannel } from 'node:worker_threads';
import { setTimeout } from 'node:timers';
import { runPipelineInWorker } from '../src/worker-runner.js';

/**
 * @import {WorkerPipelineConfig} from '../src/types/external.js'
 */

const textEncoder = new TextEncoder();
/** @type {(source: string) => Uint8Array} */
const encode = source => textEncoder.encode(source);

/**
 * Creates a minimal pipeline config for testing. The analyzer captures
 * identifiers; the transform is a no-op; buildRecord returns a stub.
 * @returns {WorkerPipelineConfig}
 */
const createTestConfig = () => ({
  createAnalyzerPasses: (_location, _specifier) => [
    {
      visitor: {
        Identifier(/** @type {any} */ path) {
          path.node._seen = true;
        },
      },
      getResults: () => ({ analyzed: true }),
    },
  ],
  createTransformPasses: (_location, _specifier) => ({
    passes: [],
    analyzerPass: {
      visitor: {},
      getResults: () => ({ moduleAnalysis: true }),
    },
    buildRecord: (/** @type {string} */ code, /** @type {string} */ _loc) => ({
      imports: [],
      exports: [],
      reexports: [],
      __syncModuleProgram__: code,
      __liveExportMap__: {},
      __fixedExportMap__: {},
      __reexportMap__: {},
    }),
  }),
});

/**
 * Sends a parse message and waits for the response.
 *
 * @param {import('node:worker_threads').MessagePort} port
 * @param {string} source
 * @param {string} [id]
 */
const sendAndReceive = (port, source, id = '1') =>
  new Promise(resolve => {
    port.once('message', resolve);
    port.postMessage({
      type: 'parse',
      id,
      bytes: encode(source),
      specifier: 'test-spec',
      location: 'file:///test.js',
      packageLocation: 'file:///',
    });
  });

test('runPipelineInWorker responds with a result message', async t => {
  await null;
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const /** @type {any} */ msg = await sendAndReceive(port2, 'const x = 1;');

    t.is(msg.type, 'result');
    t.is(msg.id, '1');
    t.truthy(msg.record);
    t.truthy(msg.bytes);
    t.true(msg.analyzerResults.length > 0);
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('result contains analyzer results from all passes', async t => {
  await null;
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const /** @type {any} */ msg = await sendAndReceive(port2, 'const x = 1;');

    t.deepEqual(msg.analyzerResults[0], { analyzed: true });
    t.deepEqual(msg.analyzerResults[1], { moduleAnalysis: true });
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('result record contains the generated code', async t => {
  await null;
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const /** @type {any} */ msg = await sendAndReceive(
        port2,
        'export const x = 1;',
      );

    t.is(typeof msg.record.__syncModuleProgram__, 'string');
    t.true(msg.record.__syncModuleProgram__.includes('const x'));
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('sourcePreprocessor is applied before parsing', async t => {
  await null;
  const { port1, port2 } = new MessageChannel();
  const config = {
    ...createTestConfig(),
    sourcePreprocessor: (/** @type {string} */ s) =>
      s.replace('#!shebang', '// shebang'),
  };
  const runner = runPipelineInWorker(port1, config);

  try {
    const /** @type {any} */ msg = await sendAndReceive(
        port2,
        '#!shebang\nconst x = 1;',
      );

    t.is(msg.type, 'result');
    t.true(msg.record.__syncModuleProgram__.includes('// shebang'));
  } finally {
    runner.removePipelineListener();
    port1.close();
    port2.close();
  }
});

test('responds with error message on parse failure', async t => {
  await null;
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const /** @type {any} */ msg = await sendAndReceive(
        port2,
        '))) totally invalid {{{{',
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
  await null;
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
  await null;
  const { port1, port2 } = new MessageChannel();
  const runner = runPipelineInWorker(port1, createTestConfig());

  try {
    const msg1 = /** @type {any} */ (
      await sendAndReceive(port2, 'const a = 1;', '10')
    );
    const msg2 = /** @type {any} */ (
      await sendAndReceive(port2, 'const b = 2;', '20')
    );

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
