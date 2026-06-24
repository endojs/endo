// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, waitFor } from '../helpers/dom-setup.js';
import { createMessagePicker } from '../../message-picker.js';

const { document: testDocument } = createDOM();

/**
 * Build a small fake host message list shaped like the real chat DOM that the
 * picker reads imperatively: each `.message` carries a `.timestamp-num` of the
 * form `#N`.
 *
 * @param {Array<{ number: number, text: string }>} entries
 * @returns {HTMLElement}
 */
const makeMessagesContainer = entries => {
  const $container = testDocument.createElement('div');
  $container.id = 'messages';
  for (const { number, text } of entries) {
    const $message = testDocument.createElement('div');
    $message.className = 'message';

    const $num = testDocument.createElement('span');
    $num.className = 'timestamp-num';
    $num.textContent = `#${number}`;
    $message.appendChild($num);

    const $body = testDocument.createElement('span');
    $body.className = 'message-body';
    $body.textContent = text;
    $message.appendChild($body);

    $container.appendChild($message);
  }
  testDocument.body.appendChild($container);
  return $container;
};

const setupPicker = async () => {
  const $messagesContainer = makeMessagesContainer([
    { number: 1, text: 'first' },
    { number: 2, text: 'second' },
    { number: 3, text: 'third' },
  ]);

  /** @type {number[]} */
  const selected = [];
  const picker = createMessagePicker({
    $messagesContainer,
    onSelect: n => selected.push(n),
  });

  return { $messagesContainer, picker, selected };
};

// Each picker appends its own overlay to the shared body; the picker under test
// is always the most recently constructed one, so use the last overlay.
const getOverlay = () => {
  const all = testDocument.body.querySelectorAll('.message-picker-overlay');
  return all[all.length - 1] || null;
};

// Keyboard handling is scoped to the overlay's `.message-picker` element
// (onKeyDown), so dispatch keydown there rather than on the document.
const keydown = key => {
  const $picker = getOverlay().querySelector('.message-picker');
  $picker.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key,
      bubbles: true,
    }),
  );
};

// The number of rendered overlay items for the picker under test.
const overlayItemCount = () => {
  const $overlay = getOverlay();
  return $overlay
    ? $overlay.querySelectorAll('.message-picker-item').length
    : 0;
};

// Enable the picker and wait until its overlay has rendered its items. The
// root's mount effect wires the controller setter asynchronously, so a single
// `enable()` can land first and no-op (`syncOverlay` bails without a setter,
// and a second `enable()` is guarded out by `isActive`). Re-arm with
// disable/enable each poll until the overlay actually populates — robust on a
// loaded runner without racing a fixed warmup delay.
const enableAndWait = async picker => {
  await waitFor(() => {
    if (overlayItemCount() > 0) return true;
    if (picker.isActive()) picker.disable();
    picker.enable();
    return false;
  });
};

// Whether the overlay item at `index` currently carries the keyboard highlight.
const itemHighlighted = index => {
  const $items = getOverlay().querySelectorAll('.message-picker-item');
  return !!$items[index] && $items[index].classList.contains('highlighted');
};

test.serial('enable decorates host messages and renders overlay', async t => {
  const { $messagesContainer, picker } = await setupPicker();

  await enableAndWait(picker);

  t.true(picker.isActive(), 'picker is active');
  t.true(
    $messagesContainer.classList.contains('message-picking-mode'),
    'host container marked picking-mode',
  );

  const $items = getOverlay().querySelectorAll('.message-picker-item');
  t.is($items.length, 3, 'overlay lists all three messages');
  t.regex($items[0].textContent, /first/, 'first item shows its text');

  t.teardown(() => picker.disable());
});

test.serial(
  'arrow navigation + Enter fires onSelect with the highlighted message',
  async t => {
    const { picker, selected } = await setupPicker();

    await enableAndWait(picker);

    // Default highlight is the first row (#1). Arrow down twice -> #3, up -> #2.
    // Poll the rendered highlight between keystrokes so each keydown reads the
    // settled selectedIndex rather than racing the previous render.
    keydown('ArrowDown');
    await waitFor(() => itemHighlighted(1));
    keydown('ArrowDown');
    await waitFor(() => itemHighlighted(2));
    keydown('ArrowUp');
    await waitFor(() => itemHighlighted(1));

    keydown('Enter');
    await waitFor(() => selected.length >= 1);

    t.deepEqual(selected, [2], 'onSelect fired with the navigated message');
    t.is(picker.getSelected(), 2, 'selected number tracked');

    t.teardown(() => picker.disable());
  },
);

test.serial('clicking an overlay item fires onSelect', async t => {
  const { picker, selected } = await setupPicker();

  await enableAndWait(picker);

  const $items = getOverlay().querySelectorAll('.message-picker-item');
  $items[2].click();
  await waitFor(() => selected.length >= 1);

  t.deepEqual(selected, [3], 'onSelect fired with the clicked message');

  t.teardown(() => picker.disable());
});

test.serial('Escape closes the picker', async t => {
  const { $messagesContainer, picker, selected } = await setupPicker();

  await enableAndWait(picker);
  t.truthy(getOverlay(), 'overlay rendered');

  keydown('Escape');
  await waitFor(() => !picker.isActive());

  t.false(picker.isActive(), 'picker disabled by Escape');
  t.is(getOverlay().style.display, 'none', 'overlay hidden');
  t.is(
    getOverlay().querySelectorAll('.message-picker-item').length,
    0,
    'overlay items cleared',
  );
  t.false(
    $messagesContainer.classList.contains('message-picking-mode'),
    'host picking-mode class removed',
  );
  t.deepEqual(selected, [], 'no selection fired on Escape');
});

test.serial(
  'setSelected highlights the host message and disable cleans up',
  async t => {
    const { $messagesContainer, picker } = await setupPicker();

    await enableAndWait(picker);

    picker.setSelected(2);
    await waitFor(() =>
      $messagesContainer
        .querySelectorAll('.message')[1]
        .classList.contains('highlighted'),
    );
    t.is(picker.getSelected(), 2, 'selected number recorded');

    const $messages = $messagesContainer.querySelectorAll('.message');
    t.true(
      $messages[1].classList.contains('highlighted'),
      'host message #2 highlighted',
    );

    picker.disable();
    await waitFor(() => !picker.isActive());

    t.false(picker.isActive(), 'picker inactive after disable');
    t.is(getOverlay().style.display, 'none', 'overlay hidden after disable');
    for (const $message of $messages) {
      t.false(
        $message.classList.contains('selectable'),
        'selectable class removed from host messages',
      );
      t.false(
        $message.classList.contains('highlighted'),
        'highlighted class removed from host messages',
      );
    }
  },
);
