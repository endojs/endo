// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { createFormBuilder } from '@endo/spaces-util/form-builder.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// renderConfined renders through Preact; its menu/effect idioms defer with
// requestAnimationFrame. dom-setup stubs setTimeout but not rAF; provide a
// setTimeout-backed shim, as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

// Poll until `predicate()` is true (or a timeout elapses, in which case the
// caller's assertion reports the real difference). Preact effect flushes and
// the controller's re-renders are async on slower CI runners, so a fixed delay
// races; polling the actual condition is robust. Copied from inbox-shell.test.js.
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

/**
 * Mock powers providing a name registry for the recipient autocomplete.
 * @param root0
 * @param root0.names
 */
const makePowers = ({ names = ['alice', 'bob'] } = {}) => {
  const powers = Far('MockPowers', {
    list() {
      return Promise.resolve(names);
    },
    lookup() {
      return powers;
    },
  });
  return powers;
};

const createBuilderDOM = () => {
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.className = 'form-builder-container';
  testDocument.body.appendChild($container);
  return { $container };
};

test.serial(
  'form mounts with recipient autocomplete sub-mount and fields',
  async t => {
    const { $container } = createBuilderDOM();
    const powers = makePowers();

    const builder = createFormBuilder({
      $container,
      E,
      powers,
      onSubmit: async () => {},
      onClose: () => {},
    });
    t.teardown(() => builder.hide());

    builder.show();
    await waitFor(() => $container.querySelector('.form-builder'));

    t.truthy($container.querySelector('.form-builder'), 'form chrome renders');
    // Recipient input + autocomplete menu are the host-node controller's
    // persistent nodes, re-parented into the confined anchor.
    t.truthy(
      $container.querySelector('.form-builder-recipient'),
      'recipient input mounted in anchor',
    );
    t.truthy(
      $container.querySelector('.form-builder-recipient-menu.token-menu'),
      'recipient autocomplete sub-mount present',
    );
    t.truthy(
      $container.querySelector('.form-builder-description'),
      'description field',
    );
    t.truthy(
      $container.querySelector('.form-builder-add-field'),
      'add-field button',
    );
    t.true(builder.isVisible(), 'builder reports visible');
    t.is($container.style.display, 'block', 'container shown');

    // Add a field row.
    $container.querySelector('.form-builder-add-field').click();
    await waitFor(
      () => $container.querySelectorAll('.form-builder-field-row').length >= 1,
    );
    t.is(
      $container.querySelectorAll('.form-builder-field-row').length,
      1,
      'one field row added',
    );
  },
);

test.serial(
  'validation blocks submit until required fields filled',
  async t => {
    const { $container } = createBuilderDOM();
    const powers = makePowers();

    const submits = [];
    const builder = createFormBuilder({
      $container,
      E,
      powers,
      onSubmit: async data => {
        submits.push(data);
      },
      onClose: () => {},
    });
    t.teardown(() => builder.hide());

    builder.show();
    await waitFor(() => $container.querySelector('.form-builder-submit'));

    // Submit disabled with no recipient/description/fields.
    t.true(
      $container.querySelector('.form-builder-submit').disabled,
      'submit disabled initially',
    );

    // Clicking submit with empty recipient shows an error and does not call onSubmit.
    $container.querySelector('.form-builder-submit').click();
    // Settle before a NEGATIVE assertion (onSubmit must NOT fire); no positive
    // condition to poll.
    await tick(30);
    t.is(submits.length, 0, 'onSubmit not called while invalid');
  },
);

test.serial(
  'filling the form and submitting invokes onSubmit with data',
  async t => {
    const { $container } = createBuilderDOM();
    const powers = makePowers();

    const submits = [];
    let closed = false;
    const builder = createFormBuilder({
      $container,
      E,
      powers,
      onSubmit: async data => {
        submits.push(data);
      },
      onClose: () => {
        closed = true;
      },
    });
    t.teardown(() => builder.hide());

    builder.show();
    await waitFor(() => $container.querySelector('.form-builder-recipient'));

    // Fill recipient (host input).
    const $recipient = $container.querySelector('.form-builder-recipient');
    $recipient.value = 'alice';
    $recipient.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

    // Fill description.
    const $description = $container.querySelector('.form-builder-description');
    $description.value = 'a survey';
    $description.dispatchEvent(
      new globalThis.Event('input', { bubbles: true }),
    );
    // Settle the description input update between interactions; no positive DOM
    // condition to poll yet (the field row is added by the next click).
    await tick(20);

    // Add a field and fill its name + label.
    $container.querySelector('.form-builder-add-field').click();
    await waitFor(
      () => $container.querySelectorAll('.form-builder-field-row').length >= 1,
    );

    const $name = $container.querySelector('.form-builder-field-name');
    $name.value = 'color';
    $name.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    const $label = $container.querySelector('.form-builder-field-label');
    $label.value = 'Favorite color';
    $label.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

    await waitFor(
      () => !$container.querySelector('.form-builder-submit').disabled,
    );
    t.false(
      $container.querySelector('.form-builder-submit').disabled,
      'submit enabled once valid',
    );
    t.true(builder.isDirty(), 'form is dirty after edits');

    $container.querySelector('.form-builder-submit').click();
    await waitFor(() => submits.length >= 1);

    t.is(submits.length, 1, 'onSubmit invoked once');
    t.is(submits[0].recipient, 'alice');
    t.is(submits[0].description, 'a survey');
    t.deepEqual(
      submits[0].fields.map(f => ({ ...f })),
      [{ name: 'color', label: 'Favorite color' }],
    );
    t.true(closed, 'onClose invoked after successful submit');
    // After submit the form resets and hides.
    await waitFor(() => !builder.isVisible());
    t.false(builder.isVisible(), 'builder hidden after submit');
  },
);

test.serial('close button resets, hides, and calls onClose', async t => {
  const { $container } = createBuilderDOM();
  const powers = makePowers();

  let closed = false;
  const builder = createFormBuilder({
    $container,
    E,
    powers,
    onSubmit: async () => {},
    onClose: () => {
      closed = true;
    },
  });
  t.teardown(() => builder.hide());

  builder.show();
  await waitFor(() => $container.querySelector('.form-builder-close'));

  // Make it dirty.
  const $description = $container.querySelector('.form-builder-description');
  $description.value = 'something';
  $description.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  await waitFor(() => builder.isDirty());
  t.true(builder.isDirty(), 'dirty after typing');

  $container.querySelector('.form-builder-close').click();
  await waitFor(() => !builder.isVisible());

  t.true(closed, 'onClose invoked');
  t.false(builder.isVisible(), 'hidden after close');
  t.false(builder.isDirty(), 'reset clears dirty flag');
});
