// @ts-nocheck - Component test with happy-dom
import '@endo/init/debug.js';
import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { StatusBar } from '../../src/preact/StatusBar.js';

const { document: testDocument } = createDOM();

// renderConfined defers some work with requestAnimationFrame; dom-setup stubs
// setTimeout but not rAF, so back it with setTimeout as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (Preact effect flushes are async; a fixed
 * tick flakes on slower runners).
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

const mount = props => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  renderConfined(h(StatusBar, props), container);
  return container;
};

test.serial(
  'renders the message in fx-status-text with the info kind',
  async t => {
    const container = mount({
      status: { message: 'Saved file.txt', kind: 'info' },
      busy: false,
    });
    t.teardown(() => {
      unmount(container);
      container.remove();
    });

    await waitFor(() => !!container.querySelector('.fx-status-text'));

    const $status = container.querySelector('.fx-status');
    t.truthy($status, 'fx-status wrapper renders');
    t.true($status.classList.contains('fx-status-info'), 'info kind class');
    t.is(
      container.querySelector('.fx-status-text').textContent,
      'Saved file.txt',
      'message text rendered',
    );
    t.falsy(container.querySelector('.fx-spinner'), 'no spinner when idle');
  },
);

test.serial('applies the error kind class', async t => {
  const container = mount({
    status: { message: 'Boom', kind: 'error' },
    busy: false,
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-status-text'));
  t.true(
    container.querySelector('.fx-status').classList.contains('fx-status-error'),
    'error kind class',
  );
});

test.serial('omits the kind modifier when kind is empty', async t => {
  const container = mount({
    status: { message: 'Ready', kind: '' },
    busy: false,
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-status-text'));
  const cls = container.querySelector('.fx-status').className;
  t.false(/fx-status-/.test(cls), 'no fx-status-<kind> modifier');
});

test.serial('shows the spinner while busy', async t => {
  const container = mount({
    status: { message: 'Working…', kind: 'info' },
    busy: true,
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-spinner'));
  t.truthy(
    container.querySelector('.fx-spinner'),
    'spinner rendered when busy',
  );
});
