// @ts-check
/* global setTimeout */

import test from '@endo/ses-ava/prepare-endo.js';
import { E } from '@endo/eventual-send';
import { makeGenyHost } from '../index.js';

/**
 * Helper to wait for a condition to become true.
 *
 * @param {() => boolean | Promise<boolean>} fn - The condition function
 * @param {number} [timeoutMs] - Maximum time to wait
 * @param {number} [delayMs] - Delay between checks
 * @returns {Promise<void>}
 */
const waitUntilTrue = async (fn, timeoutMs = 5000, delayMs = 50) => {
  await null;
  const endTime = Date.now() + timeoutMs;
  while (Date.now() < endTime) {
    // eslint-disable-next-line no-await-in-loop
    if (await fn()) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, delayMs);
    });
  }
  throw Error('waitUntilTrue timed out');
};

test('spawn a child and eval code', async t => {
  const host = await makeGenyHost({ verbose: false });

  try {
    const child = await host.spawn();
    t.truthy(child, 'Child was spawned');
    t.truthy(child.control, 'Child has control object');

    // Evaluate code that returns a simple value
    const result = await E(child.control).eval('1 + 2', {});
    t.is(result, 3, 'Eval returns correct value');

    // Shut down the child (use sendOnly since connection closes before response)
    E.sendOnly(child.control).shutdown();

    // Wait for the child to exit
    await waitUntilTrue(() => !child.process.connected);
  } finally {
    host.shutdown();
  }
});

test('eval code with Far and E exposed', async t => {
  const host = await makeGenyHost({ verbose: false });

  try {
    const child = await host.spawn();

    // Create a Far object in the child
    const counter = await E(child.control).eval(
      `
      (() => {
        let value = 0;
        return Far('counter', {
          increment() { value += 1; return value; },
          getValue() { return value; },
        });
      })()
      `,
      {},
    );

    t.truthy(counter, 'Counter object was created');

    // Call methods on the counter
    // @ts-expect-error - dynamically created remote object
    const v1 = await E(counter).increment();
    t.is(v1, 1, 'First increment returns 1');

    // @ts-expect-error - dynamically created remote object
    const v2 = await E(counter).increment();
    t.is(v2, 2, 'Second increment returns 2');

    // @ts-expect-error - dynamically created remote object
    const value = await E(counter).getValue();
    t.is(value, 2, 'getValue returns 2');

    E.sendOnly(child.control).shutdown();
  } finally {
    host.shutdown();
  }
});

test('eval code with endowments', async t => {
  const host = await makeGenyHost({ verbose: false });

  try {
    const child = await host.spawn();

    // Pass endowments to eval
    const result = await E(child.control).eval(
      `
      endowments.a + endowments.b
      `,
      { a: 10, b: 20 },
    );

    t.is(result, 30, 'Endowments are accessible');

    E.sendOnly(child.control).shutdown();
  } finally {
    host.shutdown();
  }
});

test('spawn two children and pass object between them', async t => {
  const host = await makeGenyHost({ verbose: false });

  try {
    // Spawn two children
    const child1 = await host.spawn({ discriminator: 'child1' });
    const child2 = await host.spawn({ discriminator: 'child2' });

    t.truthy(child1, 'Child 1 was spawned');
    t.truthy(child2, 'Child 2 was spawned');

    // Create a counter in child1
    const counter = await E(child1.control).eval(
      `
      (() => {
        let value = 0;
        return Far('counter', {
          increment() { value += 1; return value; },
          getValue() { return value; },
        });
      })()
      `,
      {},
    );

    t.truthy(counter, 'Counter was created in child1');

    // Pass the counter to child2 and have it increment the counter
    const incrementer = await E(child2.control).eval(
      `
      (() => {
        return Far('incrementer', {
          async doIncrement() {
            const result = await E(endowments.counter).increment();
            return result;
          },
        });
      })()
      `,
      { counter },
    );

    t.truthy(incrementer, 'Incrementer was created in child2');

    // Have child2 increment the counter (which lives in child1)
    // @ts-expect-error - dynamically created remote object
    const v1 = await E(incrementer).doIncrement();
    t.is(v1, 1, 'First increment via child2 returns 1');

    // @ts-expect-error - dynamically created remote object
    const v2 = await E(incrementer).doIncrement();
    t.is(v2, 2, 'Second increment via child2 returns 2');

    // Verify the counter in child1 has the updated value
    // @ts-expect-error - dynamically created remote object
    const value = await E(counter).getValue();
    t.is(value, 2, 'Counter in child1 reflects increments from child2');

    // Shut down both children
    E.sendOnly(child1.control).shutdown();
    E.sendOnly(child2.control).shutdown();
  } finally {
    host.shutdown();
  }
});

test('integration: counter object in child1, increment from child2', async t => {
  const host = await makeGenyHost({ verbose: false });

  try {
    // Step 1: Spawn two children
    const child1 = await host.spawn({ discriminator: 'counterHost' });
    const child2 = await host.spawn({ discriminator: 'counterUser' });

    // Step 2: Eval a counter object in child1
    const counter = await E(child1.control).eval(
      `
      (() => {
        let count = 0;
        return Far('counter', {
          increment() {
            count += 1;
            return count;
          },
          getCount() {
            return count;
          },
        });
      })()
      `,
      {},
    );

    // Verify initial state
    // @ts-expect-error - dynamically created remote object
    const initialCount = await E(counter).getCount();
    t.is(initialCount, 0, 'Counter starts at 0');

    // Step 3: Pass the counter to child2 and increment it from there
    const result = await E(child2.control).eval(
      `
      (async () => {
        // Increment the counter 3 times
        await E(endowments.counter).increment();
        await E(endowments.counter).increment();
        const finalValue = await E(endowments.counter).increment();
        return finalValue;
      })()
      `,
      { counter },
    );

    t.is(result, 3, 'Child2 incremented counter 3 times');

    // Step 4: Verify the counter in child1 reflects the changes
    // @ts-expect-error - dynamically created remote object
    const finalCount = await E(counter).getCount();
    t.is(
      finalCount,
      3,
      'Counter in child1 shows 3 after increments from child2',
    );

    // Clean up
    E.sendOnly(child1.control).shutdown();
    E.sendOnly(child2.control).shutdown();
  } finally {
    host.shutdown();
  }
});
