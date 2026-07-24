// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { createShareModal } from '@endo/space-channel/share-modal.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// renderConfined renders through Preact; some of its idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). Preact effect flushes and
 * the controller's re-renders are async on slower CI runners, so a fixed delay
 * races; polling the actual condition is robust. Copied from
 * inbox-shell.test.js — a fixed `tick` flakes on macOS CI.
 *
 * @param {() => boolean} predicate
 * @param {{ timeout?: number, step?: number }} [opts]
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

/**
 * Build mock root powers whose `lookup(name)` returns a persona namespace
 * exposing `list()` over a fixed set of pet names, and a `powers` capability
 * that records `makeChannel` / `post` calls.
 */
const makeSharePowers = () => {
  /** @type {Array<{ method: string, args: unknown[] }>} */
  const calls = [];

  const channelRef = Far('Channel', {
    post(...args) {
      calls.push({ method: 'post', args });
      return Promise.resolve();
    },
  });

  // The current persona's powers: makeChannel + lookup the new channel.
  const powers = Far('Powers', {
    makeChannel(petName, proposedName) {
      calls.push({ method: 'makeChannel', args: [petName, proposedName] });
      return Promise.resolve();
    },
    lookup(...path) {
      calls.push({ method: 'lookup', args: path });
      return Promise.resolve(channelRef);
    },
  });

  // A persona namespace reached via rootPowers.lookup(agentName).
  const personaNamespace = Far('Persona', {
    async *list() {
      yield 'general';
      yield 'random';
    },
    lookup(...path) {
      calls.push({ method: 'persona-lookup', args: path });
      return Promise.resolve(channelRef);
    },
  });

  const rootPowers = Far('RootPowers', {
    lookup(name) {
      calls.push({ method: 'root-lookup', args: [name] });
      return Promise.resolve(personaNamespace);
    },
    send(...args) {
      calls.push({ method: 'send', args });
      return Promise.resolve();
    },
  });

  return { powers, rootPowers, calls };
};

const baseTargets = [
  {
    id: 'space-1',
    name: 'Work',
    icon: '🤖',
    profilePath: ['work-agent'],
    channelPetName: 'general',
  },
];

const setupShareModal = () => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'share-modal-container';
  testDocument.body.appendChild($container);

  const modal = createShareModal($container);
  return { $container, modal };
};

test.serial(
  'show() renders the share form, preview, and navigator',
  async t => {
    const { $container, modal } = setupShareModal();
    const { powers, rootPowers } = makeSharePowers();
    t.teardown(() => {
      modal.hide();
      $container.remove();
    });

    modal.show({
      heritageChain: [],
      previewText: 'Hello World',
      powers,
      rootPowers,
      targets: baseTargets,
    });

    await waitFor(() => !!$container.querySelector('.share-modal'));

    t.is($container.style.display, 'flex', 'container shown');
    t.is(
      $container.querySelector('.share-title').textContent,
      'Share',
      'title rendered',
    );
    t.is(
      $container.querySelector('.share-preview').textContent,
      'Hello World',
      'preview text rendered',
    );

    const $name = $container.querySelector('.share-input');
    t.truthy($name, 'name input rendered');
    t.is($name.value, 'hello-world', 'default name derived from preview');

    t.is(
      $container.querySelectorAll('.share-policy-option').length,
      2,
      'edit + comment policy checkboxes',
    );

    // The navigator shows the space group at the root level.
    t.truthy($container.querySelector('.share-navigator'), 'navigator present');
    const $items = $container.querySelectorAll('.share-nav-item');
    t.is($items.length, 1, 'one space group at root');
    t.is(
      $items[0].querySelector('.share-nav-item-name').textContent,
      'Work',
      'space name rendered',
    );

    // Submit is disabled until a channel is selected.
    t.true(
      $container.querySelector('.share-submit').disabled,
      'submit disabled initially',
    );
  },
);

test.serial(
  'drilling into a space lists pet names and selecting one enables submit',
  async t => {
    const { $container, modal } = setupShareModal();
    const { powers, rootPowers } = makeSharePowers();
    t.teardown(() => {
      modal.hide();
      $container.remove();
    });

    modal.show({
      heritageChain: [],
      previewText: 'thread',
      powers,
      rootPowers,
      targets: baseTargets,
    });

    await waitFor(() => !!$container.querySelector('.share-nav-item'));

    // Enter the space group.
    $container
      .querySelector('.share-nav-item')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

    // Pet names are loaded asynchronously via list().
    await waitFor(
      () => $container.querySelectorAll('.share-nav-item').length === 2,
    );

    const names = [...$container.querySelectorAll('.share-nav-item-name')].map(
      n => n.textContent,
    );
    t.deepEqual(names, ['general', 'random'], 'pet names listed and sorted');

    // The breadcrumb shows the drilled-in path.
    t.truthy(
      $container.querySelector('.share-nav-crumb-current'),
      'current crumb present',
    );

    // Select a channel (click the item, not the chevron).
    const $general = [...$container.querySelectorAll('.share-nav-item')].find(
      item => item.textContent.includes('general'),
    );
    $general.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

    await waitFor(() => !$container.querySelector('.share-submit').disabled);
    t.false(
      $container.querySelector('.share-submit').disabled,
      'submit enabled after selecting a channel',
    );
    t.truthy(
      $container.querySelector('.share-nav-item.share-target-selected'),
      'selected item marked',
    );
  },
);

test.serial('submit creates the channel and fires onNavigate', async t => {
  const { $container, modal } = setupShareModal();
  const { powers, rootPowers, calls } = makeSharePowers();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  /** @type {string[]} */
  const navigations = [];

  modal.show({
    heritageChain: [{ type: 'package', strings: ['hi'], names: [], ids: [] }],
    previewText: 'my thread',
    powers,
    rootPowers,
    targets: baseTargets,
    onNavigate: name => navigations.push(name),
  });

  await waitFor(() => !!$container.querySelector('.share-nav-item'));

  // Enter the space and select the 'general' channel.
  $container
    .querySelector('.share-nav-item')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(
    () => $container.querySelectorAll('.share-nav-item').length === 2,
  );
  const $general = [...$container.querySelectorAll('.share-nav-item')].find(
    item => item.textContent.includes('general'),
  );
  $general.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => !$container.querySelector('.share-submit').disabled);

  // Submit the form.
  $container
    .querySelector('.share-form')
    .dispatchEvent(new globalThis.Event('submit', { bubbles: true }));

  await waitFor(() => navigations.length > 0);

  const makeChannelCall = calls.find(c => c.method === 'makeChannel');
  t.truthy(makeChannelCall, 'makeChannel called');
  t.is(makeChannelCall.args[0], 'my-thread', 'channel named from the label');
  t.is(navigations.length, 1, 'onNavigate fired once');
  t.is(navigations[0], 'my-thread', 'navigated to the new channel');

  // Modal closes after a successful share.
  t.is($container.style.display, 'none', 'container hidden after share');
  t.falsy($container.querySelector('.share-modal'), 'modal torn down');
});

test.serial('backdrop and close button hide the modal', async t => {
  const { $container, modal } = setupShareModal();
  const { powers, rootPowers } = makeSharePowers();
  t.teardown(() => {
    modal.hide();
    $container.remove();
  });

  modal.show({
    heritageChain: [],
    previewText: 'thread',
    powers,
    rootPowers,
    targets: baseTargets,
  });
  await waitFor(() => !!$container.querySelector('.share-close'));

  $container
    .querySelector('.share-close')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => !$container.querySelector('.share-modal'));
  t.is($container.style.display, 'none', 'container hidden after close');
  t.falsy($container.querySelector('.share-modal'), 'modal torn down');
});
