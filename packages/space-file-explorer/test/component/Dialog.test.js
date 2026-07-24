// @ts-nocheck - Component test with happy-dom
import '@endo/init/debug.js';
import test from 'ava';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { h } from 'preact';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { Dialog } from '../../src/preact/Dialog.js';

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

const mountDialog = options => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  const calls = [];
  const onSubmit = value => calls.push(value);
  const dialog = { options, resolve: () => {} };
  renderConfined(h(Dialog, { dialog, onSubmit }), container);
  return { container, calls };
};

test.serial('renders nothing when dialog is null', async t => {
  const container = testDocument.createElement('div');
  testDocument.body.appendChild(container);
  t.teardown(() => {
    unmount(container);
    container.remove();
  });
  renderConfined(h(Dialog, { dialog: null, onSubmit: () => {} }), container);
  await tick(40);
  t.falsy(container.querySelector('.fx-dialog-overlay'), 'no overlay rendered');
});

test.serial(
  'renders title, message, and the OK confirm by default',
  async t => {
    const { container } = mountDialog({
      title: 'Heads up',
      message: 'Something happened',
    });
    t.teardown(() => {
      unmount(container);
      container.remove();
    });

    await waitFor(() => !!container.querySelector('.fx-dialog'));
    t.is(
      container.querySelector('.fx-dialog-title').textContent,
      'Heads up',
      'title text',
    );
    t.is(
      container.querySelector('.fx-dialog-message').textContent,
      'Something happened',
      'message text',
    );
    const $confirm = container.querySelector('.fx-dialog-confirm');
    t.is($confirm.textContent, 'OK', 'default confirm label');
    t.true($confirm.classList.contains('fx-primary'), 'confirm is primary');
    t.false($confirm.classList.contains('fx-danger'), 'not danger by default');
  },
);

test.serial('input dialog submits the trimmed value on confirm', async t => {
  const { container, calls } = mountDialog({
    title: 'Rename',
    input: { label: 'New name', value: '  hello.txt  ' },
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-dialog-input'));
  const $input = container.querySelector('.fx-dialog-input');
  // The input is controlled, so drive it with an `input` event; a bare
  // `.value =` assignment is never read back. Wait for the controlled
  // re-render to reflect it before confirming.
  $input.value = '  renamed.txt  ';
  $input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  await waitFor(
    () =>
      container.querySelector('.fx-dialog-input').value.trim() ===
      'renamed.txt',
  );

  click(container.querySelector('.fx-dialog-confirm'));
  await waitFor(() => calls.length > 0);
  t.deepEqual(calls, ['renamed.txt'], 'trimmed input value submitted');
});

test.serial('cancel button submits null', async t => {
  const { container, calls } = mountDialog({
    title: 'Rename',
    input: { label: 'New name' },
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-dialog-cancel'));
  click(container.querySelector('.fx-dialog-cancel'));
  await waitFor(() => calls.length > 0);
  t.deepEqual(calls, [null], 'cancel resolves null');
});

test.serial('backdrop click submits null; inner click does not', async t => {
  const { container, calls } = mountDialog({ title: 'Plain' });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-dialog-overlay'));

  // Clicking the dialog body must NOT cancel (propagation stopped).
  click(container.querySelector('.fx-dialog'));
  await tick(40);
  t.is(calls.length, 0, 'inner click does not cancel');

  // Clicking the overlay backdrop cancels.
  click(container.querySelector('.fx-dialog-overlay'));
  await waitFor(() => calls.length > 0);
  t.deepEqual(calls, [null], 'backdrop click resolves null');
});

test.serial('choices dialog submits the checked radio value', async t => {
  const { container, calls } = mountDialog({
    title: 'Pick one',
    choices: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(
    () => container.querySelectorAll('.fx-dialog-choice').length === 2,
  );

  // First choice is checked by default → confirm submits 'a'.
  click(container.querySelector('.fx-dialog-confirm'));
  await waitFor(() => calls.length > 0);
  t.deepEqual(calls, ['a'], 'first choice checked by default');
});

test.serial('choices dialog submits a later checked value', async t => {
  const { container, calls } = mountDialog({
    title: 'Pick one',
    choices: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
  });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(
    () =>
      container.querySelectorAll('input[name="fx-dialog-choice"]').length === 2,
  );

  const radios = container.querySelectorAll('input[name="fx-dialog-choice"]');
  // Controlled radios: select the second by dispatching a `change` event so the
  // component updates its state, then wait for the re-render.
  radios[1].checked = true;
  radios[1].dispatchEvent(new globalThis.Event('change', { bubbles: true }));
  await waitFor(
    () =>
      container.querySelectorAll('input[name="fx-dialog-choice"]')[1].checked,
  );

  click(container.querySelector('.fx-dialog-confirm'));
  await waitFor(() => calls.length > 0);
  t.deepEqual(calls, ['b'], 'second checked choice submitted');
});

test.serial(
  'danger flag adds fx-danger and confirmLabel overrides OK',
  async t => {
    const { container } = mountDialog({
      title: 'Delete',
      danger: true,
      confirmLabel: 'Delete',
    });
    t.teardown(() => {
      unmount(container);
      container.remove();
    });

    await waitFor(() => !!container.querySelector('.fx-dialog-confirm'));
    const $confirm = container.querySelector('.fx-dialog-confirm');
    t.true($confirm.classList.contains('fx-danger'), 'danger class present');
    t.is($confirm.textContent, 'Delete', 'custom confirm label');
  },
);

test.serial('plain confirm submits an empty string', async t => {
  const { container, calls } = mountDialog({ title: 'Confirm?' });
  t.teardown(() => {
    unmount(container);
    container.remove();
  });

  await waitFor(() => !!container.querySelector('.fx-dialog-confirm'));
  click(container.querySelector('.fx-dialog-confirm'));
  await waitFor(() => calls.length > 0);
  t.deepEqual(calls, [''], 'plain confirm resolves empty string');
});
