// @ts-nocheck - Component test with happy-dom
/* eslint-disable no-underscore-dangle */

import '@endo/init/debug.js';

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';

// Monaco cannot run under happy-dom and `monaco-editor` is not installed in this
// workspace, so this test redirects the `./monaco-wrapper.js` specifier to a
// stub (test/helpers/monaco-wrapper-stub.js) via a Node loader registered below
// BEFORE define-form is dynamically imported. The stub implements the same
// MonacoEditorAPI surface define-form uses, backed by a host <div> and a string
// buffer, and records created editors on globalThis.__monacoStubEditors__ so the
// test can assert dispose(). This exercises the confined chrome, the host-node
// editor embedding, and submit — everything except real Monaco rendering, which
// is covered by Playwright e2e.

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

// Dynamically imported AFTER the loader is registered so define-form's
// `import { createMonacoEditor } from '@endo/monaco-wrapper'` resolves to the
// stub.
const { createDefineForm } = await import('@endo/spaces-util/define-form.js');

const { document: testDocument } = createDOM();

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
 * caller's assertion reports the real difference). Preact effect flushes and
 * the controller's re-renders are async on slower CI runners, so a fixed delay
 * races; polling the actual condition is robust. Copied from inbox-shell.test.js
 * — a fixed `tick` flakes on macOS CI.
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

/**
 * Construct a define form exactly as chat-bar-component.js does:
 * createDefineForm({ $container, onSubmit, onClose }).
 *
 * @param {object} [opts]
 * @param {(data: object) => Promise<void>} [opts.onSubmit]
 */
const setupForm = async ({ onSubmit = async () => {} } = {}) => {
  globalThis.__monacoStubEditors__ = [];
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'define-form-container';
  testDocument.body.appendChild($container);

  /** @type {object[]} */
  const submits = [];
  let closed = 0;

  const form = await createDefineForm({
    $container,
    onSubmit: async data => {
      submits.push(data);
      await onSubmit(data);
    },
    onClose: () => {
      closed += 1;
    },
  });

  const editor = () => globalThis.__monacoStubEditors__[0];

  return {
    $container,
    form,
    submits,
    editor,
    getClosed: () => closed,
  };
};

test.serial('mounts chrome and the editor host node in its anchor', async t => {
  const { $container, form, editor } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-form'));

  // Confined chrome rendered.
  t.truthy($container.querySelector('.eval-form'), 'form chrome rendered');
  t.truthy($container.querySelector('.eval-title'), 'title rendered');
  t.is(
    $container.querySelector('.eval-title').textContent,
    'Define Program',
    'title text preserved',
  );
  t.truthy($container.querySelector('.eval-submit'), 'submit button rendered');
  t.truthy(
    $container.querySelector('.eval-add-endowment'),
    'add-slot button rendered',
  );

  // The editor anchor is present and the imperative editor host node is
  // re-parented into it (host-node embedding under confinement).
  const $anchor = $container.querySelector('[data-editor-anchor="true"]');
  t.truthy($anchor, 'editor anchor slot rendered by confined chrome');
  t.truthy(editor(), 'one Monaco editor created');
  t.truthy(
    $anchor.querySelector('.monaco-editor-mount'),
    'editor host node placed inside the anchor',
  );

  // Submit is disabled while the source is empty.
  t.true(
    $container.querySelector('.eval-submit').disabled,
    'submit disabled while source empty',
  );
});

test.serial('add-slot renders a controlled slot row', async t => {
  const { $container, form } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-add-endowment'));

  $container
    .querySelector('.eval-add-endowment')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => !!$container.querySelector('.eval-endowment-row'));

  const $codeName = $container.querySelector('.eval-codename');
  const $label = $container.querySelector('.eval-petname');
  t.truthy($codeName, 'code-name input rendered');
  t.truthy($label, 'label input rendered');

  // Controlled inputs update form state.
  $codeName.value = 'foo';
  $codeName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  $label.value = 'a foo';
  $label.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  await waitFor(() => form.isDirty());

  t.true(form.isDirty(), 'editing a slot marks the form dirty');
});

test.serial('submit invokes onSubmit with the editor value', async t => {
  const { $container, form, submits, editor, getClosed } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-form'));

  // Simulate the user typing into Monaco (drives the form's onChange seam).
  editor().__setValueFromUser('export const make = () => 42;');
  await waitFor(() => !$container.querySelector('.eval-submit').disabled);

  // Add a complete slot so it is carried through.
  $container
    .querySelector('.eval-add-endowment')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => !!$container.querySelector('.eval-codename'));

  const $codeName = $container.querySelector('.eval-codename');
  const $label = $container.querySelector('.eval-petname');
  $codeName.value = 'power';
  $codeName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  $label.value = 'a power';
  $label.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  // Ensure the slot edits have registered into form state before submitting, so
  // the completed slot is carried through.
  await waitFor(() => form.isDirty());

  // Submit via the Define button.
  $container
    .querySelector('.eval-submit')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => submits.length > 0);

  t.is(submits.length, 1, 'onSubmit invoked once');
  t.is(
    submits[0].source,
    'export const make = () => 42;',
    'submitted the editor value',
  );
  t.deepEqual(
    submits[0].slots,
    [{ codeName: 'power', label: 'a power' }],
    'submitted the completed slot',
  );

  await waitFor(() => getClosed() > 0);
  t.true(getClosed() >= 1, 'onClose called after successful submit');
  t.false(form.isVisible(), 'form hidden after submit');
});

test.serial('submit via monaco-submit event also fires onSubmit', async t => {
  const { $container, form, submits, editor } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-form'));

  editor().__setValueFromUser('1 + 1');
  await waitFor(() => !$container.querySelector('.eval-submit').disabled);

  // Cmd+Enter in the real editor dispatches `monaco-submit` on the persistent
  // editor host node, on which the form has registered its listener.
  editor().__host.parentElement.dispatchEvent(
    new globalThis.CustomEvent('monaco-submit'),
  );

  await waitFor(() => submits.length > 0);
  t.is(submits.length, 1, 'monaco-submit triggers a single submit');
  t.is(submits[0].source, '1 + 1', 'editor value submitted');
});

test.serial('empty source blocks submit with a validation error', async t => {
  const { $container, form, submits, editor } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-form'));

  // Force submit while source is empty via the monaco-submit seam (the button
  // is disabled, so go through the editor event). The form listens on the
  // persistent editor host node, which is the stub mount's parent.
  editor().__host.parentElement.dispatchEvent(
    new globalThis.CustomEvent('monaco-submit'),
  );
  await waitFor(() => !!$container.querySelector('.eval-error').textContent);

  t.is(submits.length, 0, 'onSubmit not invoked for empty source');
  t.is(
    $container.querySelector('.eval-error').textContent,
    'Source code is required',
    'validation error shown',
  );
});

test.serial('dispose tears down and disposes the editor', async t => {
  const { $container, form, editor } = await setupForm();

  await waitFor(() => !!$container.querySelector('.eval-form'));
  const editorApi = editor();
  t.false(editorApi.__isDisposed(), 'editor live before dispose');

  form.dispose();

  t.true(editorApi.__isDisposed(), 'editor disposed on teardown');
  t.falsy(
    $container.querySelector('.eval-form'),
    'confined chrome unmounted from container',
  );
  t.falsy(
    $container.querySelector('.monaco-editor-mount'),
    'editor host node removed',
  );

  $container.remove();
});
