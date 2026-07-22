/**
 * Tests for `WorkerParserPool` and `createWorkerParser`.
 *
 * These tests run in serial because AVA already runs tests in worker threads.
 */

/* eslint-disable @jessie.js/safe-await-separator */
import test from '@endo/ses-ava/prepare-endo.js';
import {
  WorkerParserPool,
  createWorkerParserPool,
} from '../src/worker-pool.js';

const textEncoder = new TextEncoder();

/**
 * @param {string} source
 * @returns {Uint8Array}
 */
const encode = source => textEncoder.encode(source);

const workerScript = new URL('./fixture/test-worker.js', import.meta.url);
const crashWorkerScript = new URL(
  './fixture/test-worker-crash.js',
  import.meta.url,
);
const exitWorkerScript = new URL(
  './fixture/test-worker-exit.js',
  import.meta.url,
);
const badIdWorkerScript = new URL(
  './fixture/test-worker-bad-id.js',
  import.meta.url,
);
const badTypeWorkerScript = new URL(
  './fixture/test-worker-bad-type.js',
  import.meta.url,
);
const errorResponseWorkerScript = new URL(
  './fixture/test-worker-error-response.js',
  import.meta.url,
);

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
    t.true(!!result.visitorResults.length);
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

test.serial('WorkerParserPool property getters and setters', t => {
  const pool = new WorkerParserPool(workerScript, {
    maxWorkers: 2,
    idleTimeout: 500,
  });

  t.is(pool.maxWorkers, 2);
  t.is(pool.idleTimeout, 500);
  t.deepEqual(pool.workerScript, workerScript);

  pool.maxWorkers = 4;
  t.is(pool.maxWorkers, 4);

  pool.idleTimeout = 2000;
  t.is(pool.idleTimeout, 2000);

  // Minimum of 1 is enforced
  pool.maxWorkers = 0;
  t.is(pool.maxWorkers, 1);
});

test.serial('createWorkerParserPool returns a WorkerParserPool', t => {
  const pool = createWorkerParserPool(workerScript);
  t.true(pool instanceof WorkerParserPool);
});

test.serial(
  'WorkerParserPool reuses workers from the available pool',
  async t => {
    const pool = new WorkerParserPool(workerScript, { maxWorkers: 1 });
    try {
      // First dispatch completes and the worker goes into #available with an
      // idle timeout. The second dispatch immediately retrieves it from
      // #available, clearing the timeout.
      const r1 = await pool.dispatch(
        encode('export const x = 1;'),
        'x',
        'file:///x.js',
        'file:///',
      );
      const r2 = await pool.dispatch(
        encode('export const y = 2;'),
        'y',
        'file:///y.js',
        'file:///',
      );
      t.is(r1.type, 'result');
      t.is(r2.type, 'result');
    } finally {
      await pool.terminate();
    }
  },
);

test.serial(
  'WorkerParserPool terminates idle workers after timeout',
  async t => {
    /** @type {(value?: unknown) => void} */
    let resolveTimeout;
    const timeoutFired = new Promise(r => {
      resolveTimeout = r;
    });

    const pool = new WorkerParserPool(workerScript, {
      maxWorkers: 1,
      idleTimeout: 50,
      log: (...args) => {
        if (String(args[0]).includes('timed out')) resolveTimeout();
      },
    });

    try {
      await pool.dispatch(
        encode('export const x = 1;'),
        'x',
        'file:///x.js',
        'file:///',
      );
      await timeoutFired;
      t.pass('idle timeout fired and worker was terminated');
    } finally {
      await pool.terminate();
    }
  },
);

test.serial('WorkerParserPool.terminate rejects queued tasks', async t => {
  const pool = new WorkerParserPool(workerScript, { maxWorkers: 1 });
  // With maxWorkers:1, the second dispatch goes into #queue immediately.
  const p1 = pool.dispatch(
    encode('export const x = 1;'),
    'x',
    'file:///x.js',
    'file:///',
  );
  const p2 = pool.dispatch(
    encode('export const y = 2;'),
    'y',
    'file:///y.js',
    'file:///',
  );
  await pool.terminate();
  await t.throwsAsync(p1, { message: /terminated/i });
  await t.throwsAsync(p2, { message: /terminated/i });
});

test.serial(
  'WorkerParserPool rejects dispatch when worker crashes',
  async t => {
    // Errors thrown in a worker thread cross a realm boundary, so we can't use
    // t.throwsAsync (which requires instanceof Error). Use try/catch instead.
    t.plan(1);
    const pool = new WorkerParserPool(crashWorkerScript, { maxWorkers: 1 });
    try {
      await pool.dispatch(
        encode('export const x = 1;'),
        'x',
        'file:///x.js',
        'file:///',
      );
    } catch {
      t.pass('dispatch rejected when worker crashes');
    } finally {
      await pool.terminate();
    }
  },
);

test.serial(
  'WorkerParserPool rejects dispatch when worker exits unexpectedly',
  async t => {
    const pool = new WorkerParserPool(exitWorkerScript, { maxWorkers: 1 });
    try {
      await t.throwsAsync(
        pool.dispatch(
          encode('export const x = 1;'),
          'x',
          'file:///x.js',
          'file:///',
        ),
        { message: /exited/ },
      );
    } finally {
      await pool.terminate();
    }
  },
);

test.serial(
  'WorkerParserPool rejects dispatch on error response from worker',
  async t => {
    const pool = new WorkerParserPool(errorResponseWorkerScript, {
      maxWorkers: 1,
    });
    try {
      await t.throwsAsync(
        pool.dispatch(
          encode('export const x = 1;'),
          'x',
          'file:///x.js',
          'file:///',
        ),
        { instanceOf: Error, message: /test worker error response/ },
      );
    } finally {
      await pool.terminate();
    }
  },
);

test.serial(
  'WorkerParserPool handles response with unknown task id',
  async t => {
    /** @type {(value?: unknown) => void} */
    let resolveUnknown;
    const unknownSeen = new Promise(r => {
      resolveUnknown = r;
    });

    const pool = new WorkerParserPool(badIdWorkerScript, {
      maxWorkers: 1,
      log: (...args) => {
        if (String(args[0]).includes('Unknown task')) resolveUnknown();
      },
    });

    const dispatchPromise = pool.dispatch(
      encode('export const x = 1;'),
      'x',
      'file:///x.js',
      'file:///',
    );

    await unknownSeen;
    await pool.terminate();
    await t.throwsAsync(dispatchPromise, { message: /terminated/i });
  },
);

test.serial(
  'WorkerParserPool handles response with unexpected message type',
  async t => {
    /** @type {(value?: unknown) => void} */
    let resolveUnexpected;
    const unexpectedSeen = new Promise(r => {
      resolveUnexpected = r;
    });

    const pool = new WorkerParserPool(badTypeWorkerScript, {
      maxWorkers: 1,
      log: (...args) => {
        if (String(args[0]).includes('Unexpected message')) resolveUnexpected();
      },
    });

    const dispatchPromise = pool.dispatch(
      encode('export const x = 1;'),
      'x',
      'file:///x.js',
      'file:///',
    );

    await unexpectedSeen;
    await pool.terminate();
    await t.throwsAsync(dispatchPromise, { message: /terminated/i });
  },
);
