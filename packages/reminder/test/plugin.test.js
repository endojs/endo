// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makeInMemoryFilesystem } from '@endo/platform/fs/extended';

import { make } from '../src/index.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Build the agent-shaped `powers` the plugin resolves by name: a store-root
 * directory and a subscriber capability that records delivered messages.
 */
const makePowers = async () => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const storeRoot = await E(root).makeDirectory('reminder-store', {});

  /** @type {any[]} */
  const received = [];
  const recipient = Far('Recipient', {
    /** @param {any} message */
    notify(message) {
      received.push(message);
    },
  });

  const powers = Far('Powers', {
    /** @param {string} name */
    lookup(name) {
      if (name === 'reminder-store') return storeRoot;
      if (name === 'reminder-recipient') return recipient;
      throw Error(`unknown power ${name}`);
    },
  });

  return { powers, received };
};

test('make() returns a ReminderService that delivers to the subscriber capability', async t => {
  const { powers, received } = await makePowers();
  const context = Far('Context', {
    // Never cancels during the test; whenCancelled just stays pending.
    whenCancelled: () => new Promise(() => {}),
  });

  const service = await make(powers, context, {
    env: { maxActive: '5', minPeriodMs: '1000' },
  });

  const scheduler = await E(service).scheduler();
  const control = await E(service).control();
  t.truthy(scheduler);
  t.truthy(control);

  // A reminder with an immediate first message and a long period, so exactly one
  // message is delivered within the test window.
  await E(scheduler).makeReminder('heartbeat', 30_000, { firstDelayMs: 0 });

  // Let the ambient timer (delay 0) fire and the eventual-send delivery settle.
  await delay(50);

  t.is(received.length, 1, 'the subscriber received one reminder message');
  t.is(received[0].type, 'reminder-message');
  t.is(received[0].label, 'heartbeat');
  t.is(received[0].messageNumber, 1);
  t.truthy(received[0].reminderResponse, 'the one-shot response is attached');

  // Resolving arms the next period (30s out — well past the test), so no further
  // delivery races the teardown.
  await E(received[0].reminderResponse).resolve();

  // The control facet works over the service.
  await E(control).pause();
  t.pass();
});

test('make() rejects a malformed env limit', async t => {
  const { powers } = await makePowers();
  const context = Far('Context', {
    whenCancelled: () => new Promise(() => {}),
  });
  await t.throwsAsync(
    () => make(powers, context, { env: { maxActive: 'lots' } }),
    { message: /maxActive must be a non-negative integer/ },
  );
});
