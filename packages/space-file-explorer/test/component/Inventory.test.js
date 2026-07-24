// @ts-nocheck - Component test with happy-dom
import '@endo/init/debug.js';
import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { Inventory } from '../../src/preact/Inventory.js';

const { document: testDocument } = createDOM();

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
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

const click = $el =>
  $el.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

const mountInventory = items => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  const opened = [];
  const onOpen = item => opened.push(item);
  renderConfined(h(Inventory, { items, onOpen }), container);
  return { container, opened };
};

test.serial('renders the header and one row per item', async t => {
  const items = new Map([
    [
      'mem',
      {
        name: 'mem',
        status: 'ready',
        kind: 'filesystem',
        cap: {},
        title: 'Open filesystem "mem"',
      },
    ],
    ['scan', { name: 'scan', status: 'classifying', title: 'Classifying…' }],
  ]);
  const { container } = mountInventory(items);
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => container.querySelectorAll('.fx-inv-item').length === 2);

  t.is(
    container.querySelector('.fx-inv-header').textContent,
    'Inventory',
    'header label',
  );
  t.truthy(container.querySelector('.fx-inv-list'), 'list container renders');
  const rows = container.querySelectorAll('.fx-inv-item');
  t.is(rows.length, 2, 'one row per item');
  t.is(rows[0].getAttribute('data-name'), 'mem', 'data-name attribute');
  t.is(rows[0].getAttribute('title'), 'Open filesystem "mem"', 'tooltip title');
});

test.serial(
  'a ready row is clickable and invokes onOpen with the item',
  async t => {
    const item = {
      name: 'mem',
      status: 'ready',
      kind: 'filesystem',
      cap: { tag: 'cap' },
      title: 'Open filesystem "mem"',
    };
    const items = new Map([['mem', item]]);
    const { container, opened } = mountInventory(items);
    t.teardown(() => {
      unmount(container);
      container.remove();
    });

    await waitFor(() => !!container.querySelector('.fx-inv-item'));
    const $row = container.querySelector('.fx-inv-item');
    t.false(
      $row.classList.contains('fx-inv-disabled'),
      'ready row not disabled',
    );

    click($row);
    await waitFor(() => opened.length > 0);
    t.is(opened.length, 1, 'onOpen fired once');
    t.is(opened[0].name, 'mem', 'onOpen receives the item');
    t.is(opened[0].kind, 'filesystem', 'item carries its resolved kind');
  },
);

test.serial(
  'a classifying row is disabled and does not invoke onOpen',
  async t => {
    const items = new Map([
      ['scan', { name: 'scan', status: 'classifying', title: 'Classifying…' }],
    ]);
    const { container, opened } = mountInventory(items);
    t.teardown(() => {
      unmount(container);
      container.remove();
    });

    await waitFor(() => !!container.querySelector('.fx-inv-item'));
    const $row = container.querySelector('.fx-inv-item');
    t.true(
      $row.classList.contains('fx-inv-disabled'),
      'classifying row disabled',
    );

    click($row);
    await tick(60);
    t.is(opened.length, 0, 'disabled row does not invoke onOpen');
  },
);

test.serial('a disabled row is inert', async t => {
  const items = new Map([
    [
      'weird',
      {
        name: 'weird',
        status: 'disabled',
        title: 'Not an endo-fs Filesystem, Layer, or Mount',
      },
    ],
  ]);
  const { container, opened } = mountInventory(items);
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-inv-item'));
  const $row = container.querySelector('.fx-inv-item');
  t.true($row.classList.contains('fx-inv-disabled'), 'disabled row greyed');
  t.is(
    $row.getAttribute('title'),
    'Not an endo-fs Filesystem, Layer, or Mount',
    'explanatory tooltip',
  );

  click($row);
  await tick(60);
  t.is(opened.length, 0, 'disabled row does not invoke onOpen');
});
