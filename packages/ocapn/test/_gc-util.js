// @ts-check
/* global globalThis, setTimeout, setImmediate, FinalizationRegistry */

import v8 from 'node:v8';
import vm from 'node:vm';

/**
 * Get the GC function, throwing if not available.
 * Uses Node.js v8 flags to expose GC if not already available.
 * @returns {() => void}
 */
const getEngineGC = () => {
  if (typeof globalThis.gc === 'function') {
    return globalThis.gc;
  }

  // Try to expose GC using v8 flags
  v8.setFlagsFromString('--expose_gc');
  const gc = vm.runInNewContext('gc');
  v8.setFlagsFromString('--no-expose_gc');

  if (typeof gc !== 'function') {
    throw new Error(
      'GC is not available. Run Node.js with --expose-gc flag or ensure v8.setFlagsFromString works.',
    );
  }

  return gc;
};

/**
 * The engine GC function.
 * Throws immediately on module load if GC is not available.
 */
const engineGC = getEngineGC();

/**
 * Trigger GC and wait for finalizers to run.
 * Based on packages/captp/test/gc-and-finalize.js
 * @returns {Promise<void>}
 */
const gcAndFinalize = async () => {
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  engineGC();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  await new Promise(setImmediate);
};

/** @type {FinalizationRegistry<() => void>} */
const sentinelRegistry = new FinalizationRegistry(callback => callback());

/**
 * Wait for GC to run by using a sentinel object.
 * Based on packages/promise-kit/test/promise-kit.test.js pattern.
 * @param {number} [timeoutMs] - Maximum time to wait for GC
 * @returns {Promise<void>}
 */
export const waitForSentinelGc = async (timeoutMs = 5000) => {
  await undefined;
  /** @type {object | null} */
  let sentinel = {};
  const collected = new Promise(resolve => {
    sentinelRegistry.register(sentinel, () => resolve(undefined));
  });
  // Make sentinel unreachable
  sentinel = null;

  // Trigger GC until sentinel is collected
  const endTime = Date.now() + timeoutMs;
  while (Date.now() < endTime) {
    // eslint-disable-next-line no-await-in-loop
    await gcAndFinalize();
    // Check if sentinel was collected by racing with a timeout
    // eslint-disable-next-line no-await-in-loop
    const result = await Promise.race([
      collected.then(() => 'collected'),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 50)),
    ]);
    if (result === 'collected') {
      return;
    }
  }
  // Even if we timeout, the sentinel may still get collected eventually
  // Just continue - the test will verify the actual behavior
};

/**
 * Start a background GC scheduler that continuously triggers GC.
 * Useful for the Python test server where GC must happen asynchronously.
 * @param {number} [intervalMs] - Interval between GC cycles
 * @returns {{ stop: () => void }} - Object with stop function to halt the scheduler
 */
export const startGcScheduler = (intervalMs = 100) => {
  let running = true;

  const runGc = async () => {
    await null;
    while (running) {
      // eslint-disable-next-line no-await-in-loop
      await gcAndFinalize();
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  };

  runGc();

  return {
    stop: () => {
      running = false;
    },
  };
};
