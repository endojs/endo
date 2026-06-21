// @ts-nocheck - Component test with happy-dom
/* global globalThis */

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/far';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { createInlineEval } from '../../inline-eval.js';

// Confined-conversion coverage for inline-eval: the source expression input and
// each endowment row's code-name input now render through `renderConfined`,
// while each row's pet-name field stays a host-node input owned by
// `petNamePathAutocomplete` (a host-node controller mounted imperatively into the
// row's host `$menu`). These tests pin the migrated behavior — the form mounts
// (the confined source input plus, after `@`, an endowment row with a pet-name
// input and a confined code-name sub-mount), entering an expression and pressing
// Enter invokes `onSubmit` with the parsed data, and Escape invokes `onCancel` —
// using a `waitFor` poll (NOT a fixed delay, which races on CI) because Preact
// flushes asynchronously.

const { document: testDocument } = createDOM();

// renderConfined defers through requestAnimationFrame; dom-setup stubs setTimeout
// but not rAF. Install a setTimeout-backed shim (as a browser would) so the
// confined tree's effects flush.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). Copied from
 * inbox-shell.test.js: the confined render flushes asynchronously (rAF + effect
 * flushes), so a fixed delay races on slower CI runners; polling the actual
 * condition is robust.
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

const fireInput = ($el, value) => {
  $el.value = value;
  $el.dispatchEvent(new testDocument.defaultView.Event('input'));
};

const fireKeyDown = ($el, key, init = {}) => {
  $el.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
};

/**
 * Mount inline-eval into a bare container, matching how inline-command-form.js
 * uses it: createInlineEval({ $container, E, powers, onSubmit, onExpand,
 * onCancel, onValidityChange }) then focus()/isValid()/setDisabled()/dispose().
 */
const setupEval = async (overrides = {}) => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.className = 'inline-eval-container';
  testDocument.body.appendChild($container);

  const { powers } = makeMockPowers({ names: ['alice', 'bob'] });

  const events = { submit: [], expand: [], cancel: 0, validity: [] };

  const api = createInlineEval({
    $container,
    E,
    powers,
    onSubmit: data => events.submit.push(data),
    onExpand: data => events.expand.push(data),
    onCancel: () => {
      events.cancel += 1;
    },
    onValidityChange: valid => events.validity.push(valid),
    ...overrides,
  });

  // Let the source Root's mount effect (which wires the controller) settle.
  await waitFor(() => !!$container.querySelector('.inline-eval-input'), {
    timeout: 200,
  });
  await tick(40);
  return { $container, api, events };
};

test.serial('mounts the source input wrapper', async t => {
  const { $container, api } = await setupEval();

  t.truthy(
    $container.querySelector('.inline-eval-wrapper'),
    'wrapper rendered',
  );
  const $source = $container.querySelector('.inline-eval-input');
  t.truthy($source, 'confined source input rendered');
  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    0,
    'no endowment rows initially',
  );
  t.false(api.isValid(), 'empty source is invalid');

  t.teardown(() => api.dispose());
});

test.serial(
  'typing @ spawns an endowment row with autocomplete + code-name sub-mount',
  async t => {
    const { $container, api } = await setupEval();

    const $source = $container.querySelector('.inline-eval-input');
    fireInput($source, '@');

    await waitFor(
      () =>
        $container.querySelectorAll('.inline-eval-endowment-group').length ===
        1,
      { timeout: 500 },
    );

    t.is(
      $container.querySelectorAll('.inline-eval-endowment-group').length,
      1,
      'one endowment row created',
    );
    // The pet-name host input owned by the autocomplete controller.
    t.truthy(
      $container.querySelector('.inline-eval-petname'),
      'pet-name host input present',
    );
    // The autocomplete menu host node.
    t.truthy(
      $container.querySelector('.inline-petname-menu'),
      'autocomplete menu host node present',
    );
    // The confined code-name input rendered into its dedicated sub-mount.
    await waitFor(() => !!$container.querySelector('.inline-eval-codename'), {
      timeout: 500,
    });
    const $codeName = $container.querySelector(
      '.inline-eval-codename-wrapper .inline-eval-codename',
    );
    t.truthy($codeName, 'confined code-name input in sub-mount');
    // The @ is stripped from the source.
    t.is(
      $container.querySelector('.inline-eval-input').value,
      '',
      'leading @ stripped from source',
    );

    t.teardown(() => api.dispose());
  },
);

test.serial(
  'entering an expression and pressing Enter invokes onSubmit',
  async t => {
    const { $container, api, events } = await setupEval();

    const $source = $container.querySelector('.inline-eval-input');
    fireInput($source, '1 + 1');
    await tick(40);

    t.deepEqual(
      api.getData(),
      { source: '1 + 1', endowments: [] },
      'getData reflects source',
    );
    t.true(api.isValid(), 'non-empty source is valid');
    t.true(events.validity.includes(true), 'onValidityChange fired with true');

    fireKeyDown($source, 'Enter');
    await waitFor(() => events.submit.length === 1, { timeout: 500 });

    t.is(events.submit.length, 1, 'onSubmit fired once');
    t.deepEqual(events.submit[0], { source: '1 + 1', endowments: [] });

    t.teardown(() => api.dispose());
  },
);

test.serial('an endowment feeds the submitted data', async t => {
  const { $container, api, events } = await setupEval();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, '@');
  await waitFor(() => !!$container.querySelector('.inline-eval-petname'), {
    timeout: 500,
  });

  const $petName = $container.querySelector('.inline-eval-petname');
  fireInput($petName, 'alice');
  await tick(40);

  const $source2 = $container.querySelector('.inline-eval-input');
  fireInput($source2, 'alice');
  await tick(40);

  fireKeyDown($source2, 'Enter');
  await waitFor(() => events.submit.length === 1, { timeout: 500 });

  t.deepEqual(
    api.getData(),
    { source: 'alice', endowments: [{ petName: 'alice', codeName: 'alice' }] },
    'getData includes the endowment with inferred code name',
  );
  t.deepEqual(events.submit[0], {
    source: 'alice',
    endowments: [{ petName: 'alice', codeName: 'alice' }],
  });

  t.teardown(() => api.dispose());
});

test.serial('Cmd-Enter expands with a cursor position', async t => {
  const { $container, api, events } = await setupEval();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, 'expr');
  await tick(40);
  fireKeyDown($source, 'Enter', { metaKey: true });
  await waitFor(() => events.expand.length === 1, { timeout: 500 });

  t.is(events.expand.length, 1, 'onExpand fired once');
  t.is(events.expand[0].source, 'expr');
  t.is(
    typeof events.expand[0].cursorPosition,
    'number',
    'cursorPosition present',
  );

  t.teardown(() => api.dispose());
});

test.serial('Escape on the source cancels', async t => {
  const { $container, api, events } = await setupEval();

  const $source = $container.querySelector('.inline-eval-input');
  fireKeyDown($source, 'Escape');
  await waitFor(() => events.cancel === 1, { timeout: 500 });

  t.is(events.cancel, 1, 'onCancel fired');

  t.teardown(() => api.dispose());
});

test.serial('setData populates source and endowments', async t => {
  const { $container, api } = await setupEval();

  api.setData({
    source: 'compose(a, b)',
    endowments: [
      { petName: 'alice', codeName: 'a' },
      { petName: 'bob', codeName: 'b' },
    ],
  });

  await waitFor(
    () =>
      $container.querySelectorAll('.inline-eval-endowment-group').length === 2,
    { timeout: 500 },
  );

  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    2,
    'two endowment rows from setData',
  );
  await waitFor(
    () =>
      $container.querySelector('.inline-eval-input').value === 'compose(a, b)',
    { timeout: 500 },
  );
  t.is(
    $container.querySelector('.inline-eval-input').value,
    'compose(a, b)',
    'source set',
  );
  t.deepEqual(api.getData(), {
    source: 'compose(a, b)',
    endowments: [
      { petName: 'alice', codeName: 'a' },
      { petName: 'bob', codeName: 'b' },
    ],
  });

  t.teardown(() => api.dispose());
});

test.serial('setDisabled disables the source and row inputs', async t => {
  const { $container, api } = await setupEval();

  api.setData({
    source: 'x',
    endowments: [{ petName: 'alice', codeName: 'a' }],
  });
  await waitFor(() => !!$container.querySelector('.inline-eval-petname'), {
    timeout: 500,
  });

  api.setDisabled(true);
  await waitFor(
    () => $container.querySelector('.inline-eval-input').disabled === true,
    { timeout: 500 },
  );

  t.true(
    $container.querySelector('.inline-eval-input').disabled,
    'source disabled',
  );
  t.true(
    $container.querySelector('.inline-eval-petname').disabled,
    'pet-name disabled',
  );
  await waitFor(
    () => $container.querySelector('.inline-eval-codename').disabled === true,
    { timeout: 500 },
  );
  t.true(
    $container.querySelector('.inline-eval-codename').disabled,
    'code-name disabled',
  );

  api.setDisabled(false);
  await waitFor(
    () => $container.querySelector('.inline-eval-input').disabled === false,
    { timeout: 500 },
  );
  t.false(
    $container.querySelector('.inline-eval-input').disabled,
    're-enabled',
  );

  t.teardown(() => api.dispose());
});

test.serial('clear empties source and endowments', async t => {
  const { $container, api } = await setupEval();

  api.setData({
    source: 'x',
    endowments: [{ petName: 'alice', codeName: 'a' }],
  });
  await waitFor(
    () =>
      $container.querySelectorAll('.inline-eval-endowment-group').length === 1,
    { timeout: 500 },
  );

  api.clear();
  await waitFor(
    () =>
      $container.querySelectorAll('.inline-eval-endowment-group').length === 0,
    { timeout: 500 },
  );

  t.is(
    $container.querySelectorAll('.inline-eval-endowment-group').length,
    0,
    'endowments cleared',
  );
  await waitFor(
    () => $container.querySelector('.inline-eval-input').value === '',
    {
      timeout: 500,
    },
  );
  t.is(
    $container.querySelector('.inline-eval-input').value,
    '',
    'source cleared',
  );
  t.deepEqual(api.getData(), { source: '', endowments: [] });
  t.false(api.isValid());

  t.teardown(() => api.dispose());
});

test.serial('dispose unmounts the view', async t => {
  const { $container, api } = await setupEval();

  const $source = $container.querySelector('.inline-eval-input');
  fireInput($source, 'x');
  await tick(40);

  api.dispose();
  await tick(40);

  t.falsy(
    $container.querySelector('.inline-eval-input'),
    'view removed after dispose',
  );
  t.falsy(
    $container.querySelector('.inline-eval-wrapper'),
    'wrapper removed after dispose',
  );
});
