// @ts-check
/* global process, setTimeout, performance */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import url from 'url';
import path from 'path';
import fs from 'fs';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  start,
  stop,
  purge,
  makeEndoClient,
} from '../index.js';

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

// ---------------------------------------------------------------------------
// Config helpers (adapted from endo.test.js)
// ---------------------------------------------------------------------------

const makeConfig = (...root) => ({
  statePath: path.join(dirname, ...root, 'state'),
  ephemeralStatePath: path.join(dirname, ...root, 'run'),
  cachePath: path.join(dirname, ...root, 'cache'),
  sockPath: path.join(dirname, ...root, 'endo.sock'),
  address: '127.0.0.1:0',
  pets: new Map(),
  values: new Map(),
});

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} label
 * @param {() => Promise<void>} fn
 * @param {number} [iterations]
 * @returns {Promise<{label: string, totalMs: number, avgMs: number, iterations: number}>}
 */
const bench = async (label, fn, iterations = 1) => {
  // Warm-up (1 call).
  await fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
  const elapsed = performance.now() - start;
  return {
    label,
    totalMs: elapsed,
    avgMs: elapsed / iterations,
    iterations,
  };
};

/**
 * @param {string} label
 * @param {() => Promise<void>} fn
 * @returns {Promise<{label: string, totalMs: number, avgMs: number, iterations: number}>}
 */
const benchOnce = (label, fn) => bench(label, fn, 1);

// ---------------------------------------------------------------------------
// Benchmark scenarios
// ---------------------------------------------------------------------------

/**
 * @param {string} variant - "node" | "rust-xs"
 * @param {ReturnType<makeConfig>} config
 * @param {Promise<never>} cancelled
 */
const runBenchmarks = async (variant, config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'bench-client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  const results = [];

  // ---- ping (baseline round-trip) ----
  results.push(
    await bench(
      'ping',
      async () => {
        await E(bootstrap).ping();
      },
      100,
    ),
  );

  // ---- provideWorker (spawn latency) ----
  {
    let workerIdx = 0;
    results.push(
      await bench(
        'provideWorker',
        async () => {
          workerIdx += 1;
          await E(host).provideWorker(`bench-worker-${workerIdx}`);
        },
        5,
      ),
    );
  }

  // ---- evaluate (cold: new worker per eval) ----
  {
    let coldIdx = 0;
    results.push(
      await bench(
        'eval_cold',
        async () => {
          coldIdx += 1;
          await E(host).evaluate(
            `cold-${coldIdx}`,
            '"hello"',
            [],
            [],
            `cold-result-${coldIdx}`,
          );
        },
        3,
      ),
    );
  }

  // ---- evaluate (warm: reuse same worker) ----
  {
    const warmWorkerName = 'bench-warm-worker';
    await E(host).provideWorker(warmWorkerName);
    results.push(
      await bench(
        'eval_warm',
        async () => {
          await E(host).evaluate(warmWorkerName, '1+1', [], []);
        },
        20,
      ),
    );
  }

  // ---- evaluate with string result ----
  {
    const strWorker = 'bench-str-worker';
    await E(host).provideWorker(strWorker);
    results.push(
      await bench(
        'eval_string_result',
        async () => {
          await E(host).evaluate(
            strWorker,
            '"x".repeat(1000)',
            [],
            [],
          );
        },
        10,
      ),
    );
  }

  // ---- list workers / pet names ----
  results.push(
    await bench(
      'list',
      async () => {
        await E(host).list();
      },
      20,
    ),
  );

  // ---- store + lookup round-trip ----
  {
    let storeIdx = 0;
    results.push(
      await bench(
        'storeValue_lookup',
        async () => {
          storeIdx += 1;
          const name = `bench-val-${storeIdx}`;
          await E(host).storeValue(`value-${storeIdx}`, name);
          await E(host).lookup(name);
        },
        10,
      ),
    );
  }

  // ---- cancel worker (worker teardown latency) ----
  {
    let cancelIdx = 0;
    results.push(
      await bench(
        'cancel_worker',
        async () => {
          cancelIdx += 1;
          const name = `cancel-worker-${cancelIdx}`;
          await E(host).provideWorker(name);
          await E(host).cancel(name);
        },
        3,
      ),
    );
  }

  // ---- cancel + re-provision (Node.js equivalent of suspend/resume) ----
  {
    let recycleIdx = 0;
    results.push(
      await bench(
        'cancel_reprovision',
        async () => {
          recycleIdx += 1;
          const name = `recycle-worker-${recycleIdx}`;
          await E(host).provideWorker(name);
          // Evaluate to ensure worker is fully up.
          await E(host).evaluate(name, '1+1', [], []);
          await E(host).cancel(name);
          // Re-provision with a new name (cancelled workers can't be reused).
          const newName = `recycle-worker-${recycleIdx}-b`;
          await E(host).provideWorker(newName);
          await E(host).evaluate(newName, '1+1', [], []);
        },
        3,
      ),
    );
  }

  return results;
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/**
 * @param {string} variant
 * @param {Array<{label: string, totalMs: number, avgMs: number, iterations: number}>} results
 */
const printResults = (variant, results) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${variant}`);
  console.log('='.repeat(60));
  console.log(
    `  ${'Operation'.padEnd(25)} ${'Avg (ms)'.padStart(10)} ${'Total (ms)'.padStart(12)} ${'N'.padStart(5)}`,
  );
  console.log(`  ${'-'.repeat(55)}`);
  for (const r of results) {
    console.log(
      `  ${r.label.padEnd(25)} ${r.avgMs.toFixed(1).padStart(10)} ${r.totalMs.toFixed(0).padStart(12)} ${String(r.iterations).padStart(5)}`,
    );
  }
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const endorBin = process.env.ENDO_BIN || path.resolve(dirname, '../../target/release/endor');
  const hasEndor = fs.existsSync(endorBin);

  // Determine which variants to run.
  const runNode = !process.argv.includes('--rust-only');
  const runRust = !process.argv.includes('--node-only') && hasEndor;

  if (!hasEndor && !process.argv.includes('--node-only')) {
    console.log(`  [note] endor binary not found at ${endorBin}, skipping Rust+XS`);
    console.log(`  [note] build with: cargo build -p endo --release`);
  }

  /** @type {Array<[string, Array<{label: string, totalMs: number, avgMs: number, iterations: number}>]>} */
  const allResults = [];

  // ---- Node.js daemon ----
  if (runNode) {
    console.log('\n--- Starting Node.js daemon ---');
    const config = makeConfig('tmp', 'bench-node');
    const { reject: cancel, promise: cancelled } = makePromiseKit();
    try {
      await purge(config);
      delete process.env.ENDO_BIN;
      await start(config);
      const results = await runBenchmarks('Node.js', config, cancelled);
      allResults.push(['Node.js daemon', results]);
      printResults('Node.js daemon', results);
    } finally {
      cancel(Error('done'));
      await stop(config).catch(() => {});
    }
  }

  // ---- Rust supervisor + XS workers ----
  if (runRust) {
    console.log('\n--- Starting Rust+XS daemon ---');
    const config = makeConfig('tmp', 'bench-rust');
    const { reject: cancel, promise: cancelled } = makePromiseKit();
    try {
      await purge(config);
      process.env.ENDO_BIN = endorBin;
      delete process.env.ENDO_DEFAULT_PLATFORM;
      delete process.env.ENDO_NODE_WORKER_BIN;
      await start(config);
      const results = await runBenchmarks('Rust+XS', config, cancelled);
      allResults.push(['Rust+XS workers', results]);
      printResults('Rust+XS workers', results);
    } finally {
      cancel(Error('done'));
      delete process.env.ENDO_BIN;
      await stop(config).catch(() => {});
    }
  }

  // ---- Rust supervisor + Node.js workers ----
  if (runRust) {
    console.log('\n--- Starting Rust+Node workers daemon ---');
    const config = makeConfig('tmp', 'bench-rust-node');
    const { reject: cancel, promise: cancelled } = makePromiseKit();
    try {
      await purge(config);
      process.env.ENDO_BIN = endorBin;
      process.env.ENDO_DEFAULT_PLATFORM = 'node';
      // Tell the XS manager how to spawn Node.js workers.
      const workerScript = path.resolve(
        dirname,
        'src',
        'bus-worker-node-raw.js',
      );
      process.env.ENDO_NODE_WORKER_BIN = `${process.execPath} ${workerScript}`;
      await start(config);
      const results = await runBenchmarks('Rust+Node', config, cancelled);
      allResults.push(['Rust+Node workers', results]);
      printResults('Rust+Node workers', results);
    } finally {
      cancel(Error('done'));
      delete process.env.ENDO_BIN;
      delete process.env.ENDO_DEFAULT_PLATFORM;
      delete process.env.ENDO_NODE_WORKER_BIN;
      await stop(config).catch(() => {});
    }
  }

  // ---- Comparison table (N-column) ----
  if (allResults.length >= 2) {
    const colWidth = 14;
    const opWidth = 25;
    const totalWidth =
      opWidth + allResults.length * (colWidth + 2) + 2;
    console.log(`\n${'='.repeat(totalWidth)}`);
    console.log('  Comparison (avg ms)');
    console.log('='.repeat(totalWidth));

    // Header row
    let header = `  ${'Operation'.padEnd(opWidth)}`;
    for (const [name] of allResults) {
      header += ` ${name.slice(0, colWidth).padStart(colWidth)}`;
    }
    console.log(header);
    console.log(`  ${'-'.repeat(totalWidth - 2)}`);

    // Data rows
    const [, baseResults] = allResults[0];
    for (const baseRow of baseResults) {
      let line = `  ${baseRow.label.padEnd(opWidth)}`;
      for (const [, results] of allResults) {
        const r = results.find(x => x.label === baseRow.label);
        if (r) {
          line += ` ${(r.avgMs.toFixed(1) + 'ms').padStart(colWidth)}`;
        } else {
          line += ` ${'—'.padStart(colWidth)}`;
        }
      }
      console.log(line);
    }

    console.log('');
  }

  console.log('\nDone.');
};

main().catch(err => {
  console.error(err);
  process.exit(1);
});
