// @ts-nocheck - Component test with happy-dom
/* eslint-disable no-underscore-dangle */

import '@endo/init/debug.js';

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';

import { createDOM, tick } from '../helpers/dom-setup.js';

// Monaco cannot run under happy-dom and `monaco-editor` is not installed in this
// workspace, so this test redirects the `@endo/monaco-wrapper` specifier to a
// stub (test/helpers/monaco-wrapper-stub.js) via a Node loader registered below
// BEFORE Viewer is dynamically imported. The stub's `colorize` returns the text
// unchanged, so the Viewer's colorize path falls back to plain text — exactly
// the behavior the real component degrades to when highlighting is unavailable.

const here = dirname(fileURLToPath(import.meta.url));
const stubUrl = pathToFileURL(
  resolvePath(here, '../helpers/monaco-wrapper-stub.js'),
).href;

register(
  new URL(
    `data:text/javascript,${encodeURIComponent(`
      const stubUrl = ${JSON.stringify(stubUrl)};
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === '@endo/monaco-wrapper' || specifier.endsWith('/monaco-wrapper.js') || specifier === './monaco-wrapper.js') {
          return { url: stubUrl, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      }
    `)}`,
  ),
);

// Dynamically imported AFTER the loader is registered so Viewer's lazy
// `import('@endo/monaco-wrapper')` resolves to the stub.
const { Viewer } = await import('../../src/preact/Viewer.js');

const { document: testDocument, cleanup } = createDOM();

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
 * caller's assertion reports the real difference). Preact effect flushes are
 * async, so a fixed delay races; polling the actual condition is robust.
 *
 * @param {() => boolean} predicate
 * @param {{ timeout?: number, step?: number }} [opts]
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  await null;
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

const baseState = () => ({
  sources: [],
  activeSourceId: 's1',
  viewMode: 'columns',
  viewerCollapsed: false,
  viewerWidth: 440,
  activePath: [],
  columns: [],
  expandedDirs: new Set(),
  treeChildren: new Map(),
  treeLoadingDirs: new Set(),
  treeCurrentDir: [],
  selectedFile: null,
  editing: false,
  viewerLoading: false,
  layerDiff: null,
  viewerMode: 'file',
  status: { message: '', kind: '' },
  busy: false,
  invItems: new Map(),
  dialog: null,
});

const makeActions = () => ({
  setViewerCollapsed: () => {},
  setEditing: () => {},
  saveSelectedFile: () => {},
  setViewerWidth: () => {},
});

const spy = () => {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
  };
  fn.calls = calls;
  return fn;
};

const mountViewer = (props, $container) => {
  renderConfined(h(Viewer, props), $container);
};

const newContainer = () => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);
  return $container;
};

test.after.always(() => cleanup());

test.serial('file mode renders the file name, meta, and text', async t => {
  const $container = newContainer();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  const state = {
    ...baseState(),
    selectedFile: {
      cap: {},
      name: 'hello.txt',
      parentPath: ['dir'],
      text: 'hello world',
      binary: false,
      size: 11,
      truncated: false,
    },
  };
  const activeSource = { id: 's1', readOnly: false };

  mountViewer({ state, activeSource, actions: makeActions() }, $container);

  await waitFor(() => !!$container.querySelector('.fx-viewer'));

  t.truthy($container.querySelector('.fx-viewer'), 'viewer pane rendered');
  t.truthy($container.querySelector('.fx-splitter'), 'splitter rendered');
  t.is(
    $container.querySelector('.fx-viewer-title').textContent,
    'hello.txt',
    'file name in title',
  );
  t.regex(
    $container.querySelector('.fx-viewer-meta').textContent,
    /11 B/,
    'meta shows the size',
  );
  await waitFor(() =>
    /hello world/.test($container.querySelector('.fx-code').textContent),
  );
  t.regex(
    $container.querySelector('.fx-code').textContent,
    /hello world/,
    'file text rendered in the code block',
  );
});

test.serial('edit toggles a controlled textarea', async t => {
  const $container = newContainer();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  const file = {
    cap: {},
    name: 'a.js',
    parentPath: [],
    text: 'const x = 1;',
    binary: false,
    size: 12,
    truncated: false,
  };
  const actions = { ...makeActions() };
  const setEditing = spy();
  actions.setEditing = setEditing;

  // Not editing: shows an Edit button (canEdit is true).
  mountViewer(
    {
      state: { ...baseState(), selectedFile: file, editing: false },
      activeSource: { id: 's1', readOnly: false },
      actions,
    },
    $container,
  );

  await waitFor(() => !!$container.querySelector('.fx-viewer-edit'));
  t.truthy($container.querySelector('.fx-viewer-edit'), 'Edit button shown');
  t.falsy(
    $container.querySelector('.fx-editor'),
    'no textarea while not editing',
  );

  $container
    .querySelector('.fx-viewer-edit')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => setEditing.calls.length > 0);
  t.deepEqual(setEditing.calls[0], [true], 'Edit click sets editing=true');

  // Re-render in editing mode: a textarea appears, seeded with the text.
  mountViewer(
    {
      state: { ...baseState(), selectedFile: file, editing: true },
      activeSource: { id: 's1', readOnly: false },
      actions,
    },
    $container,
  );

  await waitFor(() => !!$container.querySelector('.fx-editor'));
  const $editor = $container.querySelector('.fx-editor');
  t.truthy($editor, 'textarea rendered in edit mode');
  await waitFor(() => $editor.value === 'const x = 1;');
  t.is($editor.value, 'const x = 1;', 'textarea seeded with file text');
});

test.serial('save invokes actions.saveSelectedFile', async t => {
  const $container = newContainer();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  const actions = { ...makeActions() };
  const saveSelectedFile = spy();
  actions.saveSelectedFile = saveSelectedFile;

  mountViewer(
    {
      state: {
        ...baseState(),
        editing: true,
        selectedFile: {
          cap: {},
          name: 'a.js',
          parentPath: [],
          text: 'x',
          binary: false,
          size: 1,
          truncated: false,
        },
      },
      activeSource: { id: 's1', readOnly: false },
      actions,
    },
    $container,
  );

  await waitFor(() => !!$container.querySelector('.fx-viewer-save'));
  $container
    .querySelector('.fx-viewer-save')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => saveSelectedFile.calls.length > 0);
  t.is(saveSelectedFile.calls.length, 1, 'saveSelectedFile invoked once');
});

test.serial('collapsed hides the pane entirely', async t => {
  const $container = newContainer();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  mountViewer(
    {
      state: { ...baseState(), viewerCollapsed: true },
      activeSource: { id: 's1', readOnly: false },
      actions: makeActions(),
    },
    $container,
  );

  // Give effects a chance to run, then assert nothing rendered.
  await tick(40);
  t.falsy(
    $container.querySelector('.fx-viewer'),
    'viewer pane absent when collapsed',
  );
  t.falsy(
    $container.querySelector('.fx-splitter'),
    'splitter absent when collapsed',
  );
});

test.serial('layer-diff mode renders the diff content', async t => {
  const $container = newContainer();
  t.teardown(() => {
    unmount($container);
    $container.remove();
  });

  mountViewer(
    {
      state: {
        ...baseState(),
        viewerMode: 'layer-diff',
        layerDiff: { layerLabel: 'my-layer', content: '+added line' },
      },
      activeSource: { id: 's1', readOnly: false },
      actions: makeActions(),
    },
    $container,
  );

  await waitFor(() => !!$container.querySelector('.fx-viewer-title'));
  t.regex(
    $container.querySelector('.fx-viewer-title').textContent,
    /Layer diff: my-layer/,
    'diff title shows the layer label',
  );
  await waitFor(() =>
    /\+added line/.test($container.querySelector('.fx-code').textContent),
  );
  t.regex(
    $container.querySelector('.fx-code').textContent,
    /\+added line/,
    'diff content rendered',
  );
});
