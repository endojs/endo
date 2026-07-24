// @ts-nocheck - App composition test with happy-dom + the confined renderer.

// Mounts the whole `FileExplorerApp` shell through `@endo/preact-container`'s
// confined renderer and asserts the composition wires up: the toolbar, the body
// (inventory sidebar + browser + viewer), and the status bar all render, the
// empty-state shows when no source is open, and clicking an empty-state button
// drives a store action all the way to the dialog overlay. The per-component
// behavior is covered by the sibling `*.test.js`; this is the integration smoke.

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import { renderConfined, unmount, h } from '@endo/preact-container/renderer';

import { createDOM, tick } from '../helpers/dom-setup.js';
import { FileExplorerApp } from '../../src/preact/FileExplorerApp.js';

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

// A host with no pet names and a never-emitting follow stream: the inventory
// pump starts and parks, so the sidebar stays empty.
const makeEmptyHost = () =>
  Far('MockHost', {
    lookup(name) {
      return Promise.reject(Error(`no such name: ${name}`));
    },
    followNameChanges() {
      return readerFromIterator(
        Far('NameChangeIterator', {
          next() {
            return new Promise(() => {});
          },
        }),
      );
    },
  });

const mountApp = powers => {
  const $parent = testDocument.createElement('div');
  testDocument.body.appendChild($parent);
  renderConfined(h(FileExplorerApp, { powers, profilePath: [] }), $parent);
  return {
    $parent,
    teardown: () => {
      unmount($parent);
      $parent.remove();
    },
  };
};

test.serial('renders the shell: toolbar, body, inventory, status', async t => {
  const app = mountApp(makeEmptyHost());
  t.teardown(app.teardown);

  const root = await waitFor(() => app.$parent.querySelector('.fx-root'));
  t.truthy(root, 'fx-root mounts');
  t.truthy(root.querySelector('.fx-toolbar'), 'toolbar present');
  t.truthy(root.querySelector('.fx-body'), 'body present');
  t.truthy(root.querySelector('.fx-inventory'), 'inventory sidebar present');
  t.truthy(root.querySelector('.fx-browser'), 'browser pane present');
  t.truthy(root.querySelector('.fx-status'), 'status bar present');
  // No source open → the empty state, not a columns/tree view.
  t.truthy(
    root.querySelector('.fx-emptystate'),
    'empty state shown with no source',
  );
  t.is(
    root.querySelector('.fx-emptystate-title').textContent,
    'No filesystem open',
  );
});

test.serial(
  'clicking "Open by pet name" drives the store to open a dialog',
  async t => {
    const app = mountApp(makeEmptyHost());
    t.teardown(app.teardown);

    const openBtn = await waitFor(() =>
      app.$parent.querySelector('.fx-empty-open'),
    );
    t.truthy(openBtn, 'empty-state open-by-pet-name button present');

    openBtn.click();

    // The action calls openDialog → state.dialog set → <Dialog> renders.
    const overlay = await waitFor(() =>
      app.$parent.querySelector('.fx-dialog-overlay'),
    );
    t.truthy(overlay, 'dialog overlay appears');
    t.is(
      overlay.querySelector('.fx-dialog-title').textContent,
      'Open filesystem by pet name',
    );
  },
);
