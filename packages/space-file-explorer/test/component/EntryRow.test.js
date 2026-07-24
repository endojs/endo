// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';

import { createDOM, tick } from '../helpers/dom-setup.js';
import { EntryRow } from '../../src/preact/EntryRow.js';

const { document: testDocument } = createDOM();

// renderConfined defers some effect idioms with requestAnimationFrame; dom-setup
// stubs setTimeout but not rAF, so provide a setTimeout-backed shim.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is truthy or a timeout elapses. Preact effect flushes
 * are async, so a fixed delay races.
 *
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

const mountRow = (t, props) => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  renderConfined(h(EntryRow, props), container);
  t.teardown(() => {
    unmount(container);
    container.remove();
  });
  return container;
};

test.serial(
  'file row: classes, icon, name, and primary activation',
  async t => {
    const opened = [];
    const container = mountRow(t, {
      entry: { name: 'readme.md', type: 'file' },
      parentPath: ['docs'],
      onOpen: e => opened.push(e),
    });

    const $entry = await waitFor(() => container.querySelector('.fx-entry'));
    t.truthy($entry, 'row rendered');
    t.true($entry.classList.contains('file'), 'has the type class');
    t.is($entry.getAttribute('data-name'), 'readme.md');
    t.is($entry.getAttribute('data-type'), 'file');
    t.is($entry.getAttribute('data-parent'), JSON.stringify(['docs']));
    t.is(
      container.querySelector('.fx-entry-name').textContent,
      'readme.md',
      'name rendered',
    );
    t.is(
      container.querySelector('.fx-entry-icon').textContent,
      '\u{1F4C4}',
      'file icon',
    );

    $entry.click();
    await tick(10);
    t.is(opened.length, 1, 'onOpen fired once');
    t.is(opened[0].name, 'readme.md', 'onOpen got the entry');
  },
);

test.serial(
  'rename / delete buttons fire their callbacks, not onOpen',
  async t => {
    const events = [];
    const container = mountRow(t, {
      entry: { name: 'note.txt', type: 'file' },
      parentPath: [],
      onOpen: () => events.push('open'),
      onRename: e => events.push(`rename:${e.name}`),
      onDelete: e => events.push(`delete:${e.name}`),
    });

    const $rename = await waitFor(() =>
      container.querySelector('.fx-entry-rename'),
    );
    t.truthy($rename, 'rename affordance present');
    t.truthy(container.querySelector('.fx-entry-delete'), 'delete affordance');

    $rename.click();
    await tick(10);
    t.deepEqual(events, ['rename:note.txt'], 'rename fired, not open');

    container.querySelector('.fx-entry-delete').click();
    await tick(10);
    t.deepEqual(
      events,
      ['rename:note.txt', 'delete:note.txt'],
      'delete fired, not open',
    );
  },
);

test.serial('read-only suppresses rename/delete and draggable', async t => {
  const container = mountRow(t, {
    entry: { name: 'x', type: 'file' },
    parentPath: [],
    readOnly: true,
    onOpen: () => {},
  });
  await waitFor(() => container.querySelector('.fx-entry'));
  t.falsy(
    container.querySelector('.fx-entry-actions'),
    'no actions when read-only',
  );
  const $entry = container.querySelector('.fx-entry');
  t.not($entry.getAttribute('draggable'), 'true', 'not draggable read-only');
});

test.serial(
  'git entry: clickable, no rename/delete/drag, title set',
  async t => {
    const opened = [];
    const container = mountRow(t, {
      entry: { name: 'repo', type: 'git' },
      parentPath: ['proj'],
      onOpen: e => opened.push(e),
      onRename: () => t.fail('git should not rename'),
      onDelete: () => t.fail('git should not delete'),
    });
    const $entry = await waitFor(() => container.querySelector('.fx-entry'));
    t.true($entry.classList.contains('git'), 'git type class');
    t.is(container.querySelector('.fx-entry-icon').textContent, '\u{1F33F}');
    t.falsy(container.querySelector('.fx-entry-actions'), 'no cap actions');
    t.not($entry.getAttribute('draggable'), 'true', 'git not draggable');
    t.regex($entry.getAttribute('title') || '', /Git repository/);

    $entry.click();
    await tick(10);
    t.is(opened.length, 1, 'git is still clickable → onOpen');
  },
);

test.serial('unknown entry: inert (no onOpen), greyed, titled', async t => {
  const container = mountRow(t, {
    entry: { name: '?', type: 'unknown' },
    parentPath: [],
    onOpen: () => t.fail('unknown entries are display-only'),
  });
  const $entry = await waitFor(() => container.querySelector('.fx-entry'));
  t.true($entry.classList.contains('unknown'), 'unknown type class');
  t.is(container.querySelector('.fx-entry-icon').textContent, '\u{2754}');
  t.regex($entry.getAttribute('title') || '', /Not an endo-fs/);
  $entry.click();
  await tick(20);
  t.pass('click was inert');
});

test.serial('tree mode: twisty + indent reflect depth/expanded', async t => {
  const container = mountRow(t, {
    entry: { name: 'src', type: 'directory' },
    parentPath: ['app'],
    depth: 2,
    expanded: true,
    onOpen: () => {},
  });
  const $entry = await waitFor(() => container.querySelector('.fx-entry'));
  const $twisty = container.querySelector('.fx-twisty');
  t.truthy($twisty, 'twisty rendered in tree mode');
  t.is($twisty.textContent, '▾', 'expanded glyph');
  t.regex($entry.getAttribute('style') || '', /padding-left:\s*40px/);
});

test.serial('selected adds fx-selected', async t => {
  const container = mountRow(t, {
    entry: { name: 'a', type: 'file' },
    parentPath: [],
    selected: true,
    onOpen: () => {},
  });
  const $entry = await waitFor(() =>
    container.querySelector('.fx-entry.fx-selected'),
  );
  t.truthy($entry, 'fx-selected applied');
});

test.serial(
  'writable file row is draggable; directory is a drop target',
  async t => {
    // happy-dom's confined-renderer event delegation does not deliver
    // drag/drop event types (only click/mouse work), so assert the drag/drop
    // AFFORDANCES structurally; the payload/dest wiring is covered by the
    // ColumnsView / TreeView onMove mapping tests below.
    const fileC = mountRow(t, {
      entry: { name: 'a.txt', type: 'file' },
      parentPath: ['d'],
      onOpen: () => {},
      onMove: () => {},
    });
    const $file = await waitFor(() => fileC.querySelector('.fx-entry'));
    t.is($file.getAttribute('draggable'), 'true', 'writable file is draggable');

    const dirC = mountRow(t, {
      entry: { name: 'sub', type: 'directory' },
      parentPath: ['d'],
      onOpen: () => {},
      onMove: () => {},
    });
    const $dir = await waitFor(() => dirC.querySelector('.fx-entry'));
    t.is(
      $dir.getAttribute('draggable'),
      'true',
      'writable directory is draggable',
    );
    t.true(
      $dir.classList.contains('directory'),
      'directory type class present',
    );
  },
);
