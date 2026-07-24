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
// BEFORE counter-proposal-form is dynamically imported. The stub implements the
// same MonacoEditorAPI surface the form uses, backed by a host <div> and a
// string buffer, and records created editors on globalThis.__monacoStubEditors__
// so the test can assert dispose(). This is the same harness define-form.test.js
// / eval-form.test.js use; the counter-proposal form additionally embeds
// petNamePathAutocomplete as a host-node controller per endowment row, exercised
// here with a stub E/powers that lists no names. This covers the confined
// chrome, the host-node editor embedding, the per-row pet-name host nodes, and
// submit — everything except real Monaco rendering, which is covered by
// Playwright e2e.

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

// Dynamically imported AFTER the loader is registered so the form's
// `import { createMonacoEditor } from '@endo/monaco-wrapper'` resolves to the
// stub.
const { createCounterProposalForm } =
  await import('../../counter-proposal-form.js');

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
 * races; polling the actual condition is robust. Copied from
 * inbox-shell.test.js — a fixed `tick` flakes on macOS CI.
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

// Minimal eventual-send + powers stand-in for petNamePathAutocomplete, which is
// composed into each endowment row. It only ever calls E(powers).list() /
// E(target).lookup(); returning an empty name list keeps the dropdown silent.
const E = target => {
  const methods = {
    list: async () => [],
    lookup: () => methods,
  };
  return methods;
};
const powers = { list: async () => [], lookup: () => powers };

/**
 * Construct a counter-proposal form with its exact options shape:
 * createCounterProposalForm({ $container, E, powers, onSubmit, onClose }).
 *
 * @param {object} [opts]
 * @param {(data: object) => Promise<void>} [opts.onSubmit]
 */
const setupForm = async ({ onSubmit = async () => {} } = {}) => {
  globalThis.__monacoStubEditors__ = [];
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'counter-proposal-form-container';
  testDocument.body.appendChild($container);

  /** @type {object[]} */
  const submits = [];
  let closed = 0;

  const form = await createCounterProposalForm({
    $container,
    E,
    powers,
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

  // Confined chrome rendered, with the counter-proposal-specific class names.
  t.truthy($container.querySelector('.eval-form'), 'form chrome rendered');
  t.truthy(
    $container.querySelector('.counter-proposal-form'),
    'counter-proposal-form class preserved',
  );
  t.is(
    $container.querySelector('.eval-title').textContent,
    'Counter-propose Evaluation',
    'title text preserved',
  );
  t.truthy(
    $container.querySelector('.counter-submit'),
    'counter-submit button rendered',
  );
  t.is(
    $container.querySelector('.counter-submit').textContent,
    'Counter-propose Evaluate',
    'submit button label preserved',
  );
  t.truthy(
    $container.querySelector('#counter-result-name'),
    'result-name option rendered',
  );
  t.truthy(
    $container.querySelector('#counter-worker-name'),
    'worker-name option rendered',
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
    $container.querySelector('.counter-submit').disabled,
    'submit disabled while source empty',
  );
});

test.serial(
  'setProposal seeds source, endowments, options, and message number',
  async t => {
    const { $container, form, submits, editor } = await setupForm();
    t.teardown(() => {
      form.dispose();
      $container.remove();
    });

    await waitFor(() => !!$container.querySelector('.eval-form'));

    form.setProposal({
      messageNumber: 42n,
      source: 'E(power).run()',
      endowments: [{ codeName: 'power', petName: 'a-power' }],
      resultName: 'seeded-result',
      workerName: '@worker',
    });

    // The seeded endowment row renders with its pet-name host re-parented.
    await waitFor(() => !!$container.querySelector('.eval-codename'));
    const $codeName = $container.querySelector('.eval-codename');
    t.is($codeName.value, 'power', 'seeded code name applied');

    const $anchor = $container.querySelector('[data-petname-anchor="0"]');
    t.truthy($anchor, 'pet-name anchor rendered for seeded row');
    await waitFor(() => !!$anchor.querySelector('.eval-petname'));
    t.is(
      $anchor.querySelector('.eval-petname').value,
      'a-power',
      'seeded pet name applied to host input',
    );

    t.is(
      $container.querySelector('#counter-result-name').value,
      'seeded-result',
      'seeded result name applied',
    );
    t.is(
      $container.querySelector('#counter-worker-name').value,
      '@worker',
      'seeded worker name applied',
    );

    // Editor value seeded enables submit.
    await waitFor(() => !$container.querySelector('.counter-submit').disabled);

    // Submit carries the seeded message number and data through.
    $container
      .querySelector('.counter-submit')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    await waitFor(() => submits.length > 0);

    t.is(submits.length, 1, 'onSubmit invoked once');
    t.is(submits[0].messageNumber, 42n, 'message number preserved on submit');
    t.is(submits[0].source, 'E(power).run()', 'source preserved on submit');
    t.deepEqual(
      submits[0].endowments,
      [{ codeName: 'power', petName: 'a-power' }],
      'endowment carried through',
    );
    t.is(submits[0].resultName, 'seeded-result', 'result name carried through');
    t.is(submits[0].workerName, '@worker', 'worker name carried through');
    // editor() unused beyond construction; reference to keep destructuring tidy.
    t.truthy(editor(), 'editor exists');
  },
);

test.serial(
  'add-endowment renders a row with a pet-name autocomplete sub-mount',
  async t => {
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

    const $anchor = $container.querySelector('[data-petname-anchor="0"]');
    t.truthy($anchor, 'pet-name anchor slot rendered');
    await waitFor(() => !!$anchor.querySelector('.eval-petname'));
    t.truthy(
      $anchor.querySelector('.eval-petname'),
      'pet-name input host node re-parented into its anchor',
    );
    t.truthy(
      $anchor.querySelector('.eval-petname-menu'),
      'autocomplete menu sub-mount present in the row',
    );
  },
);

test.serial('submit via monaco-submit event fires onSubmit', async t => {
  const { $container, form, submits, editor } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-form'));

  editor().__setValueFromUser('1 + 1');
  await waitFor(() => !$container.querySelector('.counter-submit').disabled);

  // Cmd+Enter in the real editor dispatches `monaco-submit` on the persistent
  // editor host node, on which the form has registered its listener.
  editor().__host.parentElement.dispatchEvent(
    new globalThis.CustomEvent('monaco-submit'),
  );

  await waitFor(() => submits.length > 0);
  t.is(submits.length, 1, 'monaco-submit triggers a single submit');
  t.is(submits[0].source, '1 + 1', 'editor value submitted');
  t.is(submits[0].workerName, '@main', 'default worker name submitted');
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

test.serial(
  'incomplete endowment (code name without pet name) blocks submit',
  async t => {
    const { $container, form, submits, editor } = await setupForm();
    t.teardown(() => {
      form.dispose();
      $container.remove();
    });

    await waitFor(() => !!$container.querySelector('.eval-form'));

    editor().__setValueFromUser('1 + 1');
    await waitFor(() => !$container.querySelector('.counter-submit').disabled);

    $container
      .querySelector('.eval-add-endowment')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    await waitFor(() => !!$container.querySelector('.eval-codename'));

    // Code name present, pet name left empty.
    const $codeName = $container.querySelector('.eval-codename');
    $codeName.value = 'orphan';
    $codeName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    // Settle the code-name update into form state between interactions; no
    // positive condition to poll until the submit drives the validation error.
    await tick(20);

    $container
      .querySelector('.counter-submit')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    await waitFor(() => !!$container.querySelector('.eval-error').textContent);

    t.is(submits.length, 0, 'onSubmit not invoked for incomplete endowment');
    t.is(
      $container.querySelector('.eval-error').textContent,
      'Pet name required for "orphan"',
      'validation error names the offending code name',
    );
  },
);

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
