/**
 * Tests for `WorkerParserPool` and `createWorkerParser`.
 *
 * These tests run in serial because AVA already runs tests in worker threads.
 */

/**
 * @import {ModuleCompleteData} from '../src/types/external.js'
 */

/* eslint-disable @jessie.js/safe-await-separator */
import test from '@endo/ses-ava/prepare-endo.js';
import { WorkerParserPool } from '../src/worker-pool.js';
import { createWorkerParser } from '../src/worker-parser.js';

const textEncoder = new TextEncoder();

/**
 * @param {string} source
 * @returns {Uint8Array}
 */
const encode = source => textEncoder.encode(source);

const workerScript = new URL('./test-worker.js', import.meta.url);

test.serial('WorkerParserPool dispatches and receives results', async t => {
  const pool = new WorkerParserPool(workerScript, {
    maxWorkers: 1,
  });
  try {
    const result = await pool.dispatch(
      encode('export const x = 1;'),
      'test-spec',
      'file:///test.js',
      'file:///',
    );
    t.is(result.type, 'result');
    t.truthy(result.record);
    t.truthy(result.bytes);
    t.true(result.analyzerResults.length > 0);
  } finally {
    await pool.terminate();
  }
});

test.serial(
  'WorkerParserPool handles multiple concurrent dispatches',
  async t => {
    const pool = new WorkerParserPool(workerScript, {
      maxWorkers: 2,
    });
    try {
      const results = await Promise.all([
        pool.dispatch(
          encode('export const a = 1;'),
          'a',
          'file:///a.js',
          'file:///',
        ),
        pool.dispatch(
          encode('export const b = 2;'),
          'b',
          'file:///b.js',
          'file:///',
        ),
        pool.dispatch(
          encode('export const c = 3;'),
          'c',
          'file:///c.js',
          'file:///',
        ),
      ]);
      t.like(results, [
        { type: 'result' },
        { type: 'result' },
        { type: 'result' },
      ]);
    } finally {
      await pool.terminate();
    }
  },
);

test.serial('WorkerParserPool queues tasks when at capacity', async t => {
  const pool = new WorkerParserPool(workerScript, { maxWorkers: 1 });
  try {
    const results = await Promise.all([
      pool.dispatch(
        encode('export const x = 1;'),
        'x',
        'file:///x.js',
        'file:///',
      ),
      pool.dispatch(
        encode('export const y = 2;'),
        'y',
        'file:///y.js',
        'file:///',
      ),
    ]);
    t.like(results, [{ type: 'result' }, { type: 'result' }]);
  } finally {
    await pool.terminate();
  }
});

test.serial('WorkerParserPool.terminate rejects pending tasks', async t => {
  const pool = new WorkerParserPool(workerScript, { maxWorkers: 1 });
  const promise = pool.dispatch(
    encode('export const x = 1;'),
    'x',
    'file:///x.js',
    'file:///',
  );
  await pool.terminate();
  await t.throwsAsync(promise, { message: /terminated/i });
});

test.serial(
  'createWorkerParser returns an async ParserImplementation',
  async t => {
    const parser = createWorkerParser(workerScript);
    try {
      t.is(typeof parser.parse, 'function');
      t.is(parser.synchronous, false);
      t.is(parser.heuristicImports, false);
      t.is(typeof parser.terminate, 'function');
    } finally {
      await parser.terminate();
    }
  },
);

test.serial('createWorkerParser.parse resolves with ParseResult', async t => {
  const parser = createWorkerParser(workerScript);
  try {
    const result = await parser.parse(
      encode('export const x = 1;'),
      'test-spec',
      'file:///test.js',
      'file:///',
    );
    t.truthy(result);
    t.is(result.parser, 'mjs');
    t.truthy(result.bytes);
    t.truthy(result.record);
  } finally {
    await parser.terminate();
  }
});

test.serial(
  'createWorkerParser fires onModuleComplete with analyzer results',
  async t => {
    /** @type {ModuleCompleteData<unknown[]> | undefined} */
    let completionData;
    const parser = createWorkerParser(workerScript, {
      onModuleComplete: data => {
        completionData = data;
      },
    });
    try {
      await parser.parse(
        encode('export const x = 1;'),
        'my-spec',
        'file:///my.js',
        'file:///',
      );
      t.is(completionData?.location, 'file:///my.js');
      t.is(completionData?.specifier, 'my-spec');
      t.true(!!completionData?.analyzerResults.length);
    } finally {
      await parser.terminate();
    }
  },
);
