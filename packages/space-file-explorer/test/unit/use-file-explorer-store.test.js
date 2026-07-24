// @ts-nocheck - Store hook test with happy-dom + the confined renderer.

// Drives the `useFileExplorer` store hook through `@endo/preact-container`'s
// confined renderer (the hook depends on `preact/hooks`, so it has to run inside
// a render). A tiny harness component mounts the hook and hands the latest
// `FileExplorerStore` back out through a callback; the test then exercises a
// couple of actions against an in-memory filesystem source and asserts the
// resulting reactive state.
//
// The fs/host plumbing reuses the `makeMemoryFilesystem` + mock-host idiom from
// `file-explorer-fs.test.js`: a real in-memory endo-fs Filesystem behind a Far
// host that serves `lookup` + a never-emitting `followNameChanges`.

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import { renderConfined, unmount, h } from '@endo/preact-container/renderer';

import { createDOM, tick } from '../helpers/dom-setup.js';
import { useFileExplorer } from '../../src/preact/use-file-explorer.js';
import {
  makeMemoryFilesystem,
  createFile,
  writeFileText,
} from '../../src/file-explorer-fs.js';

const { document: testDocument } = createDOM();

// The confined renderer defers some effect idioms with requestAnimationFrame;
// dom-setup stubs setTimeout but not rAF, so provide a setTimeout-backed shim.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is truthy or the timeout elapses; return its value.
 * Preact effects flush async, so polling the real condition is robust.
 *
 * @param {() => unknown} predicate
 * @param {number} [timeoutMs]
 */
const waitFor = async (predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  let value = predicate();
  while (!value && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await tick(15);
    value = predicate();
  }
  return value;
};

/**
 * A host that exposes a single in-memory Filesystem under a pet name and a
 * `followNameChanges` reader that blocks forever (no inventory churn during the
 * test).
 *
 * @param {Record<string, unknown>} names
 */
const makeMockHost = names =>
  Far('MockHost', {
    lookup(name) {
      if (name in names) return Promise.resolve(names[name]);
      return Promise.reject(Error(`no such name: ${name}`));
    },
    followNameChanges() {
      return readerFromIterator(
        Far('NameChangeIterator', {
          // Block forever after start: the sidebar stays empty.
          next() {
            return new Promise(() => {});
          },
        }),
      );
    },
  });

/**
 * Mount the hook through the confined renderer and return a handle that always
 * resolves the latest store snapshot plus a teardown.
 *
 * @param {unknown} powers
 */
const mountStore = powers => {
  const $parent = testDocument.createElement('div');
  testDocument.body.appendChild($parent);

  /** @type {{ current: import('../../src/preact/types.js').FileExplorerStore | null }} */
  const ref = { current: null };

  const Harness = props => {
    const store = useFileExplorer(props.powers, []);
    // Capture the latest snapshot for the test to inspect. Harness side-effect
    // during render is fine in a test driver.
    props.sink(store);
    return null;
  };

  renderConfined(
    h(Harness, { powers, sink: store => (ref.current = store) }),
    $parent,
  );

  return {
    get store() {
      return ref.current;
    },
    teardown: () => {
      unmount($parent);
      $parent.remove();
    },
  };
};

test.serial(
  'opens an in-memory filesystem source and lists its root',
  async t => {
    const fs = makeMemoryFilesystem();
    const root = await E(fs).root();
    await E(root).mkdir('docs', {});
    await createFile(root, 'readme.txt');
    await writeFileText(await E(root).lookup('readme.txt'), 'hello\n');

    const host = makeMockHost({ scratch: fs });
    const handle = mountStore(host);
    t.teardown(handle.teardown);

    // Initial mount: no source, the seed status message.
    await waitFor(
      () => handle.store && handle.store.state.status.message !== '',
    );
    t.is(handle.store.state.activeSourceId, null);

    // Open the in-memory fs as a 'filesystem' source.
    handle.store.actions.openFsCap('scratch', fs, 'filesystem', 'scratch');

    // The source becomes active and its root column lists directories first.
    await waitFor(
      () => handle.store.activeSource && handle.store.state.columns.length > 0,
    );
    const { activeSource } = handle.store;
    t.is(activeSource.kind, 'lookup');
    t.is(activeSource.label, 'scratch');
    t.false(activeSource.readOnly);

    await waitFor(() => handle.store.state.columns[0].entries.length === 2);
    const rootEntries = handle.store.state.columns[0].entries;
    t.deepEqual(
      rootEntries.map(e => `${e.type}:${e.name}`),
      ['directory:docs', 'file:readme.txt'],
    );
  },
);

test.serial('newFolder action creates a directory via the dialog', async t => {
  const fs = makeMemoryFilesystem();
  const host = makeMockHost({ scratch: fs });
  const handle = mountStore(host);
  t.teardown(handle.teardown);

  await waitFor(() => handle.store);
  handle.store.actions.openFsCap('scratch', fs, 'filesystem', 'scratch');
  await waitFor(() => handle.store.activeSource);

  // Kick the action — it opens a dialog and parks on the returned promise.
  handle.store.actions.newFolder();
  await waitFor(() => handle.store.state.dialog !== null);
  t.is(handle.store.state.dialog.options.title, 'New folder');

  // Answer the prompt; the store resolves it, creates the dir, and refreshes.
  handle.store.actions.submitDialog('created-dir');

  await waitFor(() =>
    handle.store.state.columns[0].entries.some(
      e => e.name === 'created-dir' && e.type === 'directory',
    ),
  );
  t.is(handle.store.state.dialog, null, 'dialog cleared after submit');
  t.regex(handle.store.state.status.message, /Created folder created-dir/);

  // It really landed in the underlying filesystem, not just the UI snapshot.
  const root = await E(fs).root();
  const child = await E(root).lookup('created-dir');
  t.truthy(child, 'directory exists on the backing filesystem');
});

test.serial('openFile loads file text into the viewer state', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  await createFile(root, 'note.txt');
  await writeFileText(await E(root).lookup('note.txt'), 'the body\n');

  const host = makeMockHost({ scratch: fs });
  const handle = mountStore(host);
  t.teardown(handle.teardown);

  await waitFor(() => handle.store);
  handle.store.actions.openFsCap('scratch', fs, 'filesystem', 'scratch');
  await waitFor(
    () =>
      handle.store.state.columns.length > 0 &&
      handle.store.state.columns[0].entries.length === 1,
  );

  handle.store.actions.openFile([], 'note.txt');

  const selected = await waitFor(() => handle.store.state.selectedFile);
  t.is(selected.name, 'note.txt');
  t.is(selected.text, 'the body\n');
  t.false(selected.binary);
  t.false(handle.store.state.viewerCollapsed, 'viewer expands on open');
});

test.serial('setViewMode flips between columns and tree', async t => {
  const fs = makeMemoryFilesystem();
  const root = await E(fs).root();
  await E(root).mkdir('sub', {});

  const host = makeMockHost({ scratch: fs });
  const handle = mountStore(host);
  t.teardown(handle.teardown);

  await waitFor(() => handle.store);
  handle.store.actions.openFsCap('scratch', fs, 'filesystem', 'scratch');
  await waitFor(() => handle.store.activeSource);

  t.is(handle.store.state.viewMode, 'columns');
  handle.store.actions.setViewMode('tree');

  // Tree mode loads the root listing into treeChildren keyed by '' (root).
  await waitFor(
    () =>
      handle.store.state.viewMode === 'tree' &&
      handle.store.state.treeChildren.has(''),
  );
  const rootKids = handle.store.state.treeChildren.get('');
  t.deepEqual(
    rootKids.map(e => e.name),
    ['sub'],
  );
});

test.serial(
  'opening a file in columns mode collapses deeper columns and resets the drill path',
  async t => {
    const fs = makeMemoryFilesystem();
    const root = await E(fs).root();
    await E(root).mkdir('a', {});
    await E(await E(root).lookup('a')).mkdir('b', {});
    await createFile(root, 'note.txt');
    await writeFileText(await E(root).lookup('note.txt'), 'hi\n');

    const host = makeMockHost({ scratch: fs });
    const handle = mountStore(host);
    t.teardown(handle.teardown);

    await waitFor(() => handle.store);
    handle.store.actions.openFsCap('scratch', fs, 'filesystem', 'scratch');
    await waitFor(() => handle.store.activeSource);
    await waitFor(() => handle.store.state.columns[0].entries.length === 2);

    // Drill into `a` — a second column appears and the drill path advances.
    handle.store.actions.openDirInColumn(0, 'a');
    await waitFor(() => handle.store.state.columns.length === 2);
    t.deepEqual(handle.store.state.activePath, ['a']);

    // Open the root-level file `note.txt` (parent column 0). The deeper `a`
    // column must collapse and the drill path reset to the file's column.
    handle.store.actions.openFile([], 'note.txt');
    await waitFor(() => handle.store.state.selectedFile);
    t.is(handle.store.state.columns.length, 1, 'deeper column collapsed');
    t.deepEqual(handle.store.state.activePath, [], 'drill path reset');
    t.is(handle.store.state.selectedFile.name, 'note.txt');
  },
);
