// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';

import { createDOM, tick } from '../helpers/dom-setup.js';
import { ColumnsView } from '../../src/preact/ColumnsView.js';

const { document: testDocument } = createDOM();

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

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

// A no-op actions object whose methods record their calls.
const makeActions = () => {
  const calls = [];
  const rec =
    name =>
    (...args) =>
      calls.push([name, ...args]);
  const actions = {
    openDirInColumn: rec('openDirInColumn'),
    openFile: rec('openFile'),
    openGitEntry: rec('openGitEntry'),
    openGitEntryInColumn: rec('openGitEntryInColumn'),
    renameEntryAction: rec('renameEntryAction'),
    deleteEntryAction: rec('deleteEntryAction'),
    moveEntry: rec('moveEntry'),
  };
  return { actions, calls };
};

const mount = (t, props) => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  renderConfined(h(ColumnsView, props), container);
  t.teardown(() => {
    unmount(container);
    container.remove();
  });
  return container;
};

test.serial('renders one fx-column per column with head + rows', async t => {
  const { actions } = makeActions();
  const container = mount(t, {
    columns: [
      {
        path: [],
        loading: false,
        error: '',
        entries: [
          { name: 'src', type: 'directory' },
          { name: 'readme.md', type: 'file' },
        ],
      },
      {
        path: ['src'],
        loading: false,
        error: '',
        entries: [{ name: 'index.js', type: 'file' }],
      },
    ],
    activePath: ['src'],
    selectedFile: null,
    readOnly: false,
    actions,
  });

  await waitFor(() => container.querySelector('.fx-columns'));
  const cols = container.querySelectorAll('.fx-column');
  t.is(cols.length, 2, 'two columns');
  t.is(cols[0].getAttribute('data-column'), '0');
  t.is(cols[1].getAttribute('data-column'), '1');
  t.is(
    cols[0].querySelector('.fx-column-head').textContent,
    '/',
    'root column head is /',
  );
  t.is(
    cols[1].querySelector('.fx-column-head').textContent,
    'src',
    'child column head is last path segment',
  );
  t.is(
    cols[0].querySelectorAll('.fx-entry').length,
    2,
    'first column has two rows',
  );
  // The drilled-into directory is highlighted.
  t.truthy(
    cols[0].querySelector('.fx-entry.directory.fx-selected'),
    'drilled dir selected',
  );
});

test.serial('directory click drills, file click opens, git opens', async t => {
  const { actions, calls } = makeActions();
  const container = mount(t, {
    columns: [
      {
        path: ['proj'],
        loading: false,
        error: '',
        entries: [
          { name: 'lib', type: 'directory' },
          { name: 'main.js', type: 'file' },
          { name: 'repo', type: 'git' },
        ],
      },
    ],
    activePath: [],
    selectedFile: null,
    readOnly: false,
    actions,
  });
  await waitFor(() => container.querySelector('.fx-entry'));
  const rows = container.querySelectorAll('.fx-entry');

  rows[0].click(); // directory
  await tick(10);
  t.deepEqual(calls.at(-1), ['openDirInColumn', 0, 'lib']);

  rows[1].click(); // file
  await tick(10);
  t.deepEqual(calls.at(-1), ['openFile', ['proj'], 'main.js']);

  rows[2].click(); // git
  await tick(10);
  // A git workspace child continues the columns from its own column index,
  // rather than reopening at the top.
  t.deepEqual(calls.at(-1), ['openGitEntryInColumn', 0, 'repo']);
});

test.serial('rename / delete map to the right actions', async t => {
  const { actions, calls } = makeActions();
  const container = mount(t, {
    columns: [
      {
        path: ['p'],
        loading: false,
        error: '',
        entries: [{ name: 'd', type: 'directory' }],
      },
    ],
    activePath: [],
    selectedFile: null,
    readOnly: false,
    actions,
  });
  await waitFor(() => container.querySelector('.fx-entry-rename'));
  container.querySelector('.fx-entry-rename').click();
  await tick(10);
  t.deepEqual(calls.at(-1), ['renameEntryAction', ['p'], 'd', 'directory']);
  container.querySelector('.fx-entry-delete').click();
  await tick(10);
  t.deepEqual(calls.at(-1), ['deleteEntryAction', ['p'], 'd', 'directory']);
});

test.serial('loading / empty / error states render their regions', async t => {
  const { actions } = makeActions();
  const container = mount(t, {
    columns: [
      { path: [], loading: true, error: '', entries: [] },
      { path: ['a'], loading: false, error: 'boom', entries: [] },
      { path: ['b'], loading: false, error: '', entries: [] },
    ],
    activePath: [],
    selectedFile: null,
    readOnly: false,
    actions,
  });
  await waitFor(() => container.querySelector('.fx-columns'));
  const cols = container.querySelectorAll('.fx-column');
  t.truthy(cols[0].querySelector('.fx-loading-row'), 'loading row');
  t.truthy(cols[0].querySelector('.fx-spinner'), 'spinner');
  const $err = cols[1].querySelector('.fx-empty-col.fx-col-error');
  t.truthy($err, 'error region');
  t.is($err.textContent, 'boom', 'error text shown');
  const $empty = cols[2].querySelector('.fx-empty-col');
  t.is($empty.textContent, 'empty', 'empty placeholder');
});

test.serial('read-only hides per-row mutation affordances', async t => {
  const { actions } = makeActions();
  const container = mount(t, {
    columns: [
      {
        path: [],
        loading: false,
        error: '',
        entries: [{ name: 'f', type: 'file' }],
      },
    ],
    activePath: [],
    selectedFile: null,
    readOnly: true,
    actions,
  });
  await waitFor(() => container.querySelector('.fx-entry'));
  t.falsy(
    container.querySelector('.fx-entry-actions'),
    'no rename/delete in read-only',
  );
});

test.serial(
  'selectedFile highlights its row in the matching column',
  async t => {
    const { actions } = makeActions();
    const container = mount(t, {
      columns: [
        {
          path: ['dir'],
          loading: false,
          error: '',
          entries: [
            { name: 'a.txt', type: 'file' },
            { name: 'b.txt', type: 'file' },
          ],
        },
      ],
      activePath: [],
      selectedFile: { name: 'b.txt', parentPath: ['dir'] },
      readOnly: false,
      actions,
    });
    await waitFor(() => container.querySelector('.fx-entry'));
    const selected = container.querySelectorAll('.fx-entry.fx-selected');
    t.is(selected.length, 1, 'exactly one selected row');
    t.is(
      selected[0].querySelector('.fx-entry-name').textContent,
      'b.txt',
      'the selected file row is highlighted',
    );
  },
);
