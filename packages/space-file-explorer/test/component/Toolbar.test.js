// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';
import { createDOM, tick } from '../helpers/dom-setup.js';

import { Toolbar } from '../../src/preact/Toolbar.js';

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
 * Poll until `predicate()` is true (or a timeout elapses). Preact effect
 * flushes and re-renders are async on slower CI runners, so a fixed delay
 * races; polling the actual condition is robust.
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
 * Build a mock `FileExplorerStore`: plain data + `ava`-spy actions. No real
 * powers. `overrides` patches the default ready-source state/features.
 *
 * @param {object} [overrides]
 */
const makeStore = (overrides = {}) => {
  /** @type {Array<{ name: string, args: unknown[] }>} */
  const calls = [];
  const spy =
    name =>
    (...args) =>
      calls.push({ name, args });
  const actionNames = [
    'selectSource',
    'selectGitRevision',
    'setViewMode',
    'toggleViewCache',
    'refreshActive',
    'addMemoryFilesystem',
    'openByPetName',
    'saveReadOnlyView',
    'saveLayer',
    'newFolder',
    'newFile',
    'viewLayerDiff',
    'applyActiveLayer',
    'revertActiveLayer',
  ];
  const actions = {};
  for (const name of actionNames) actions[name] = spy(name);

  const activeSource = overrides.activeSource ?? {
    id: 's1',
    label: 'workspace',
    kind: 'lookup',
    filesystem: {},
    readOnly: false,
    useCache: false,
  };

  const state = {
    sources: overrides.sources ?? (activeSource ? [activeSource] : []),
    activeSourceId: activeSource ? activeSource.id : null,
    viewMode: overrides.viewMode ?? 'columns',
    ...overrides.state,
  };

  const features = overrides.features ?? {
    canMintMemory: true,
    canSaveReadOnly: true,
    canSaveLayer: true,
  };

  return {
    store: { state, activeSource, actions, features },
    calls,
  };
};

test.serial('renders the view controls and action clusters', async t => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);
  const { store } = makeStore();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  renderConfined(h(Toolbar, { store }), $container);
  await waitFor(() => !!$container.querySelector('.fx-toolbar'));

  t.truthy($container.querySelector('.fx-toolbar'), 'toolbar root');
  t.truthy($container.querySelector('.fx-source-select'), 'source select');
  t.is(
    $container.querySelectorAll('.fx-seg').length,
    2,
    'two segmented toggle buttons',
  );
  t.truthy(
    $container.querySelector('.fx-seg.fx-seg-on'),
    'active view mode marked',
  );
  t.truthy($container.querySelector('.fx-act-cache'), 'CAS cache checkbox');
  t.truthy($container.querySelector('.fx-act-refresh'), 'refresh button');
  t.truthy($container.querySelector('.fx-act-memory'), 'memory button');
  t.truthy($container.querySelector('.fx-act-open'), 'open button');
  t.truthy($container.querySelector('.fx-act-readonly'), 'readonly button');
  t.truthy($container.querySelector('.fx-act-layer'), 'layer button');
  t.truthy($container.querySelector('.fx-act-newfolder'), 'new folder button');
  t.truthy($container.querySelector('.fx-act-newfile'), 'new file button');

  // No active layer ⇒ no layer subgroup, no git picker.
  t.falsy($container.querySelector('.fx-layer-group'), 'no layer group');
  t.falsy($container.querySelector('.fx-group-git'), 'no git picker');
});

test.serial('clicking a view-toggle segment invokes setViewMode', async t => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);
  const { store, calls } = makeStore({ viewMode: 'columns' });
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  renderConfined(h(Toolbar, { store }), $container);
  await waitFor(() => !!$container.querySelector('.fx-seg[data-view="tree"]'));

  const $tree = $container.querySelector('.fx-seg[data-view="tree"]');
  $tree.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => calls.some(c => c.name === 'setViewMode'));

  const call = calls.find(c => c.name === 'setViewMode');
  t.truthy(call, 'setViewMode fired');
  t.is(call.args[0], 'tree', 'switched to tree');
});

test.serial('clicking New folder invokes the newFolder action', async t => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);
  const { store, calls } = makeStore();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  renderConfined(h(Toolbar, { store }), $container);
  await waitFor(() => !!$container.querySelector('.fx-act-newfolder'));

  const $btn = $container.querySelector('.fx-act-newfolder');
  $btn.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => calls.some(c => c.name === 'newFolder'));

  t.is(
    calls.filter(c => c.name === 'newFolder').length,
    1,
    'newFolder fired once',
  );
});

test.serial(
  'feature flags disable the save buttons with a tooltip',
  async t => {
    const $container = testDocument.createElement('div');
    testDocument.body.appendChild($container);
    const { store } = makeStore({
      features: {
        canMintMemory: false,
        canSaveReadOnly: false,
        canSaveLayer: false,
      },
    });
    t.teardown(() => {
      unmount($container);
      $container.remove();
    });

    renderConfined(h(Toolbar, { store }), $container);
    await waitFor(() => !!$container.querySelector('.fx-act-memory'));

    const $memory = $container.querySelector('.fx-act-memory');
    t.true($memory.disabled, 'memory button disabled without the module');
    t.regex(
      $memory.getAttribute('title') || '',
      /Vite dev server/,
      'memory button explains why it is disabled',
    );
    t.true(
      $container.querySelector('.fx-act-readonly').disabled,
      'readonly disabled',
    );
    t.true(
      $container.querySelector('.fx-act-layer').disabled,
      'layer disabled',
    );
  },
);

test.serial('read-only source disables the mutation buttons', async t => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);
  const { store } = makeStore({
    activeSource: {
      id: 's1',
      label: 'frozen',
      kind: 'lookup',
      filesystem: {},
      readOnly: true,
      useCache: false,
    },
  });
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  renderConfined(h(Toolbar, { store }), $container);
  await waitFor(() => !!$container.querySelector('.fx-act-newfile'));

  t.true(
    $container.querySelector('.fx-act-newfolder').disabled,
    'new folder disabled on read-only source',
  );
  t.true(
    $container.querySelector('.fx-act-newfile').disabled,
    'new file disabled on read-only source',
  );
});

test.serial(
  'a layer source shows the layer subgroup and wires its actions',
  async t => {
    const $container = testDocument.createElement('div');
    testDocument.body.appendChild($container);
    const { store, calls } = makeStore({
      activeSource: {
        id: 's1',
        label: 'my-layer',
        kind: 'layer',
        filesystem: {},
        layer: {},
        readOnly: false,
        useCache: false,
      },
    });
    t.teardown(() => {
      unmount($container);
      $container.remove();
    });

    renderConfined(h(Toolbar, { store }), $container);
    await waitFor(() => !!$container.querySelector('.fx-layer-group'));

    t.truthy($container.querySelector('.fx-act-changes'), 'view-diff button');
    t.truthy($container.querySelector('.fx-act-apply'), 'apply button');
    t.truthy($container.querySelector('.fx-act-revert'), 'revert button');

    $container
      .querySelector('.fx-act-changes')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    await waitFor(() => calls.some(c => c.name === 'viewLayerDiff'));
    t.is(
      calls.filter(c => c.name === 'viewLayerDiff').length,
      1,
      'viewLayerDiff fired',
    );
  },
);

test.serial(
  'a git source shows the revision picker with the worktree sentinel',
  async t => {
    const $container = testDocument.createElement('div');
    testDocument.body.appendChild($container);
    const { store, calls } = makeStore({
      activeSource: {
        id: 's1',
        label: 'repo',
        kind: 'lookup',
        filesystem: {},
        git: {},
        gitRef: ' worktree',
        gitRefsLoaded: true,
        gitRefs: {
          branches: [{ name: 'main' }],
          commits: [{ oid: 'abcdef1234567', summary: 'first' }],
        },
        readOnly: false,
        useCache: false,
      },
    });
    t.teardown(() => {
      unmount($container);
      $container.remove();
    });

    renderConfined(h(Toolbar, { store }), $container);
    await waitFor(() => !!$container.querySelector('.fx-git-ref'));

    const $picker = $container.querySelector('.fx-git-ref');
    t.truthy($picker, 'git revision picker present');
    t.is(
      $picker.querySelectorAll('optgroup').length,
      2,
      'branches + commits optgroups',
    );

    // The first option is the worktree sentinel ("Working tree").
    const $first = $picker.querySelector('option');
    t.is($first.textContent, 'Working tree', 'worktree option label');

    $picker.value = 'main';
    $picker.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    await waitFor(() => calls.some(c => c.name === 'selectGitRevision'));
    const call = calls.find(c => c.name === 'selectGitRevision');
    t.is(call.args[0], 'main', 'selectGitRevision got the chosen ref');
  },
);
