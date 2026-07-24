// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';

import { createDOM, tick } from '../helpers/dom-setup.js';
import { TreeView } from '../../src/preact/TreeView.js';

const { document: testDocument } = createDOM();

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

// Must match the component's separator so Set/Map keys line up.
const KEY_SEP = '\u0000';
const pathKey = path => path.join(KEY_SEP);

/**
 * @param {() => unknown} predicate
 * @param {number} [timeoutMs]
 */
const waitFor = async (predicate, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  let value = predicate();
  while (!value && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await tick(20);
    value = predicate();
  }
  return value;
};

const makeActions = () => {
  const calls = [];
  const rec =
    name =>
    (...args) =>
      calls.push([name, ...args]);
  const actions = {
    toggleTreeDir: rec('toggleTreeDir'),
    openFile: rec('openFile'),
    openGitEntry: rec('openGitEntry'),
    renameEntryAction: rec('renameEntryAction'),
    deleteEntryAction: rec('deleteEntryAction'),
    moveEntry: rec('moveEntry'),
  };
  return { actions, calls };
};

const mount = (t, props) => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  renderConfined(h(TreeView, props), container);
  t.teardown(() => {
    unmount(container);
    container.remove();
  });
  return container;
};

const baseProps = overrides => ({
  activeSource: { label: 'my-fs', readOnly: false },
  expandedDirs: new Set(),
  treeChildren: new Map(),
  treeLoadingDirs: new Set(),
  treeCurrentDir: [],
  selectedFile: null,
  ...overrides,
});

test.serial(
  'collapsed root: shows label, twisty, and toggles on click',
  async t => {
    const { actions, calls } = makeActions();
    const container = mount(
      t,
      baseProps({
        treeCurrentDir: [],
        actions,
      }),
    );
    const $tree = await waitFor(() => container.querySelector('.fx-tree'));
    t.truthy($tree, 'tree rendered');
    const $root = container.querySelector('.fx-entry.directory');
    t.is($root.getAttribute('data-name'), '', 'root has empty data-name');
    t.is(
      $root.querySelector('.fx-entry-name').textContent,
      'my-fs',
      'root shows the source label',
    );
    t.is(
      $root.querySelector('.fx-twisty').textContent,
      '▸',
      'collapsed twisty',
    );
    // Root is selected when treeCurrentDir === [].
    t.true($root.classList.contains('fx-selected'), 'root selected');
    // No children rendered while collapsed.
    t.is(
      container.querySelectorAll('.fx-entry').length,
      1,
      'only the root row',
    );

    $root.click();
    await tick(10);
    t.deepEqual(calls.at(-1), ['toggleTreeDir', []], 'root toggles []');
  },
);

test.serial(
  'expanded root renders cached children with depth indent',
  async t => {
    const { actions } = makeActions();
    const treeChildren = new Map([
      [
        pathKey([]),
        [
          { name: 'lib', type: 'directory' },
          { name: 'app.js', type: 'file' },
        ],
      ],
    ]);
    const container = mount(
      t,
      baseProps({
        expandedDirs: new Set([pathKey([])]),
        treeChildren,
        actions,
      }),
    );
    await waitFor(() => container.querySelectorAll('.fx-entry').length >= 3);
    const rows = container.querySelectorAll('.fx-entry');
    t.is(rows.length, 3, 'root + two children');
    // Children sit at depth 1 → padding-left 24px.
    const $lib = [...rows].find(
      r => r.querySelector('.fx-entry-name').textContent === 'lib',
    );
    t.regex($lib.getAttribute('style') || '', /padding-left:\s*24px/);
    t.is($lib.querySelector('.fx-twisty').textContent, '▸', 'dir child twisty');
  },
);

test.serial(
  'child events: dir toggles its own path, file opens, git opens',
  async t => {
    const { actions, calls } = makeActions();
    const treeChildren = new Map([
      [
        pathKey([]),
        [
          { name: 'lib', type: 'directory' },
          { name: 'app.js', type: 'file' },
          { name: 'repo', type: 'git' },
        ],
      ],
    ]);
    const container = mount(
      t,
      baseProps({
        expandedDirs: new Set([pathKey([])]),
        treeChildren,
        actions,
      }),
    );
    await waitFor(() => container.querySelectorAll('.fx-entry').length >= 4);
    const byName = name =>
      [...container.querySelectorAll('.fx-entry')].find(
        r => r.querySelector('.fx-entry-name')?.textContent === name,
      );

    byName('lib').click();
    await tick(10);
    t.deepEqual(
      calls.at(-1),
      ['toggleTreeDir', ['lib']],
      'dir toggles selfPath',
    );

    byName('app.js').click();
    await tick(10);
    t.deepEqual(
      calls.at(-1),
      ['openFile', [], 'app.js'],
      'file opens at parent',
    );

    byName('repo').click();
    await tick(10);
    t.deepEqual(calls.at(-1), ['openGitEntry', [], 'repo'], 'git opens');
  },
);

test.serial('nested expanded dir + loading row render correctly', async t => {
  const { actions } = makeActions();
  const treeChildren = new Map([
    [pathKey([]), [{ name: 'lib', type: 'directory' }]],
    [pathKey(['lib']), [{ name: 'inner.js', type: 'file' }]],
  ]);
  const container = mount(
    t,
    baseProps({
      expandedDirs: new Set([pathKey([]), pathKey(['lib'])]),
      treeChildren,
      treeLoadingDirs: new Set([pathKey(['lib'])]),
      actions,
    }),
  );
  await waitFor(() => container.querySelector('.fx-loading-row'));
  // Open dir twisty is the down glyph.
  const $lib = [...container.querySelectorAll('.fx-entry')].find(
    r => r.querySelector('.fx-entry-name').textContent === 'lib',
  );
  t.is($lib.querySelector('.fx-twisty').textContent, '▾', 'open dir twisty');
  // Loading row appears indented under lib (depth 2 → 40px).
  const $loading = container.querySelector('.fx-loading-row');
  t.truthy($loading.querySelector('.fx-spinner'), 'spinner');
  t.regex($loading.getAttribute('style') || '', /padding-left:\s*40px/);
  // Nested file at depth 2.
  const $inner = [...container.querySelectorAll('.fx-entry')].find(
    r => r.querySelector('.fx-entry-name').textContent === 'inner.js',
  );
  t.regex($inner.getAttribute('style') || '', /padding-left:\s*40px/);
});

test.serial('selected file highlights its tree row', async t => {
  const { actions } = makeActions();
  const treeChildren = new Map([
    [pathKey([]), [{ name: 'note.txt', type: 'file' }]],
  ]);
  const container = mount(
    t,
    baseProps({
      expandedDirs: new Set([pathKey([])]),
      treeChildren,
      selectedFile: { name: 'note.txt', parentPath: [] },
      treeCurrentDir: ['somewhere'], // root not selected
      actions,
    }),
  );
  await waitFor(() => container.querySelector('.fx-entry.file'));
  const $file = container.querySelector('.fx-entry.file');
  t.true($file.classList.contains('fx-selected'), 'selected file highlighted');
  t.false(
    container
      .querySelector('.fx-entry.directory')
      .classList.contains('fx-selected'),
    'root not selected',
  );
});

test.serial('no active source: root label falls back to /', async t => {
  const { actions } = makeActions();
  const container = mount(
    t,
    baseProps({
      activeSource: null,
      actions,
    }),
  );
  await waitFor(() => container.querySelector('.fx-entry-name'));
  t.is(
    container.querySelector('.fx-entry-name').textContent,
    '/',
    'fallback root label',
  );
});
