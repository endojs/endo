// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/far';
import { createDOM, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// Minimal powers: the autocomplete-free flows exercised here (choose, new
// profile, files, peers) never touch the daemon except through the submit
// handlers we drive to their validation branch or to `onSubmit`.
const makePowers = () =>
  Far('MockPowers', {
    has: async () => false,
    list: async () => [],
    lookup: async () => {
      throw new Error('not found');
    },
    provideHost: async () => {},
  });

const setup = async ({ existingChannelSpaces = [] } = {}) => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);

  /** @type {Array<Record<string, unknown>>} */
  const submitted = [];
  let closed = 0;

  const { createAddSpaceModal } = await import('../../add-space-modal.js');
  const modal = createAddSpaceModal({
    $container,
    powers: makePowers(),
    getUsedIcons: () => new Set(),
    onSubmit: async data => {
      submitted.push(data);
    },
    onClose: () => {
      closed += 1;
    },
    getExistingChannelSpaces: () => existingChannelSpaces,
  });

  modal.show();
  await waitFor(() => !!$container.querySelector('.add-space-modal'));

  return {
    $container,
    modal,
    submitted,
    getClosed: () => closed,
  };
};

const fireInput = ($input, value) => {
  $input.value = value;
  $input.dispatchEvent(new Event('input', { bubbles: true }));
};

const submitForm = $container => {
  const $form = $container.querySelector('.add-space-form');
  $form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.serial('choose screen lists all nine space types', async t => {
  const { $container } = await setup();
  const modes = [...$container.querySelectorAll('.space-type-card')].map(c =>
    c.getAttribute('data-mode'),
  );
  t.deepEqual(modes, [
    'new-agent',
    'existing',
    'new-channel',
    'connect-channel',
    'whylip',
    'graph',
    'peers',
    'files',
    'floot',
  ]);
});

test.serial(
  'selecting a card opens its form; back returns to chooser',
  async t => {
    const { $container } = await setup();

    $container.querySelector('[data-mode="peers"]').click();
    await waitFor(() => !!$container.querySelector('.add-space-form'));
    t.is(
      $container.querySelector('.add-space-title').textContent,
      'Known Peers',
    );

    $container.querySelector('.add-space-back').click();
    await waitFor(() => !!$container.querySelector('.add-space-choose'));
    t.is($container.querySelectorAll('.space-type-card').length, 9);
  },
);

test.serial(
  'new profile auto-populates the agent name from the handle',
  async t => {
    const { $container } = await setup();
    $container.querySelector('[data-mode="new-agent"]').click();
    await waitFor(() => !!$container.querySelector('#handle-name'));

    fireInput($container.querySelector('#handle-name'), 'clark');
    t.is(
      $container.querySelector('#agent-name').value,
      'profile-for-clark',
      'agent name follows the handle',
    );
  },
);

test.serial('typed values are injection-safe (no markup breakout)', async t => {
  const { $container } = await setup();
  $container.querySelector('[data-mode="new-agent"]').click();
  await waitFor(() => !!$container.querySelector('#handle-name'));

  const payload = '"><img src=x onerror=alert(1)>';
  fireInput($container.querySelector('#handle-name'), payload);
  // Force a structural re-render that re-includes the handle value (toggle the
  // icon tab). The old string-template path interpolated the value unescaped
  // into `value="..."`; the confined view must not.
  $container.querySelector('.icon-tab[data-tab="letter"]').click();
  await waitFor(() => !!$container.querySelector('#letter-icon'));

  t.is(
    $container.querySelector('img'),
    null,
    'no injected <img> element from the payload',
  );
  t.is(
    $container.querySelector('#handle-name').value,
    payload,
    'the payload survives as a literal input value',
  );
});

test.serial('files form submits with the files layout', async t => {
  const { $container, submitted } = await setup();
  $container.querySelector('[data-mode="files"]').click();
  await waitFor(() => !!$container.querySelector('.add-space-form'));

  submitForm($container);
  await waitFor(() => submitted.length > 0);
  t.is(submitted[0].layout, 'files');
  t.is(submitted[0].name, 'files');
});

test.serial('peers form submits with the peers layout', async t => {
  const { $container, submitted } = await setup();
  $container.querySelector('[data-mode="peers"]').click();
  await waitFor(() => !!$container.querySelector('.add-space-form'));

  submitForm($container);
  await waitFor(() => submitted.length > 0);
  t.is(submitted[0].layout, 'peers');
});

test.serial('an empty handle shows a validation error', async t => {
  const { $container, submitted } = await setup();
  $container.querySelector('[data-mode="new-agent"]').click();
  await waitFor(() => !!$container.querySelector('#handle-name'));

  submitForm($container);
  await waitFor(() => !!$container.querySelector('.add-space-error'));
  t.regex($container.querySelector('.add-space-error').textContent, /handle/i);
  t.is(submitted.length, 0, 'no space created on a validation failure');
});
