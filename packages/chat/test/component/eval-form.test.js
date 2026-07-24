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
// BEFORE eval-form is dynamically imported. The stub implements the same
// MonacoEditorAPI surface eval-form uses, backed by a host <div> and a string
// buffer, and records created editors on globalThis.__monacoStubEditors__ so the
// test can assert dispose(). This is the same harness define-form.test.js uses;
// eval-form additionally embeds petNamePathAutocomplete as a host-node
// controller per endowment row, exercised here with a stub E/powers that lists
// no names. This covers the confined chrome, the host-node editor embedding, the
// per-row pet-name host nodes, and submit — everything except real Monaco
// rendering, which is covered by Playwright e2e.

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

// Dynamically imported AFTER the loader is registered so eval-form's
// `import { createMonacoEditor } from '@endo/monaco-wrapper'` resolves to the
// stub.
const { createEvalForm } = await import('@endo/spaces-util/eval-form.js');

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
 * Construct an eval form exactly as chat-bar-component.js does:
 * createEvalForm({ $container, E, powers, onSubmit, onClose, onShowWorker }).
 *
 * @param {object} [opts]
 * @param {(data: object) => Promise<void>} [opts.onSubmit]
 * @param {object} [opts.powers] - Override the powers ref handed to the form;
 *   the failure-path test supplies a daemon-shaped `diagnostics()` facet so the
 *   form's submit-catch can resolve a trace (stack + worker id) via
 *   resolveErrorTrace.
 * @param {(workerId: string) => void} [opts.onShowWorker] - Worker-chip click
 *   sink.
 */
const setupForm = async ({
  onSubmit = async () => {},
  powers: powersOverride = powers,
  onShowWorker = () => {},
} = {}) => {
  globalThis.__monacoStubEditors__ = [];
  testDocument.body.innerHTML = '';
  const $container = testDocument.createElement('div');
  $container.id = 'eval-form-container';
  testDocument.body.appendChild($container);

  /** @type {object[]} */
  const submits = [];
  let closed = 0;

  const form = await createEvalForm({
    $container,
    E,
    powers: powersOverride,
    onSubmit: async data => {
      submits.push(data);
      await onSubmit(data);
    },
    onClose: () => {
      closed += 1;
    },
    onShowWorker,
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
    'Evaluate JavaScript',
    'title text preserved',
  );
  t.truthy($container.querySelector('.eval-submit'), 'submit button rendered');
  t.truthy(
    $container.querySelector('.eval-add-endowment'),
    'add-endowment button rendered',
  );
  t.truthy(
    $container.querySelector('#eval-result-name'),
    'result-name option rendered',
  );
  t.truthy(
    $container.querySelector('#eval-worker-name'),
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
    $container.querySelector('.eval-submit').disabled,
    'submit disabled while source empty',
  );
});

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

    const $codeName = $container.querySelector('.eval-codename');
    t.truthy($codeName, 'code-name input rendered');

    // The per-row pet-name host node (input + autocomplete menu) is re-parented
    // into the row's anchor slot.
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

    // Controlled code-name input updates form state.
    $codeName.value = 'foo';
    $codeName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await waitFor(() => form.isDirty());

    t.true(form.isDirty(), 'editing an endowment marks the form dirty');
  },
);

test.serial('submit invokes onSubmit with the editor value', async t => {
  const { $container, form, submits, editor, getClosed } = await setupForm();
  t.teardown(() => {
    form.dispose();
    $container.remove();
  });

  await waitFor(() => !!$container.querySelector('.eval-form'));

  // Simulate the user typing into Monaco (drives the form's onChange seam).
  editor().__setValueFromUser('1 + 1');
  await waitFor(() => !$container.querySelector('.eval-submit').disabled);

  // Add a complete endowment so it is carried through.
  $container
    .querySelector('.eval-add-endowment')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
  await waitFor(() => !!$container.querySelector('.eval-codename'));

  const $codeName = $container.querySelector('.eval-codename');
  $codeName.value = 'power';
  $codeName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

  const $petName = $container.querySelector('.eval-petname');
  $petName.value = 'a-power';
  $petName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

  // Result and worker name options.
  const $resultName = $container.querySelector('#eval-result-name');
  $resultName.value = 'my-result';
  $resultName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  await waitFor(() => form.isDirty());

  // Submit via the Evaluate button.
  $container
    .querySelector('.eval-submit')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => submits.length > 0);

  t.is(submits.length, 1, 'onSubmit invoked once');
  t.is(submits[0].source, '1 + 1', 'submitted the editor value');
  t.deepEqual(
    submits[0].endowments,
    [{ codeName: 'power', petName: 'a-power' }],
    'submitted the completed endowment',
  );
  t.is(submits[0].resultName, 'my-result', 'submitted the result name');
  t.is(submits[0].workerName, '@main', 'submitted the default worker name');

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

  editor().__setValueFromUser('40 + 2');
  await waitFor(() => !$container.querySelector('.eval-submit').disabled);

  // Cmd+Enter in the real editor dispatches `monaco-submit` on the persistent
  // editor host node, on which the form has registered its listener.
  editor().__host.parentElement.dispatchEvent(
    new globalThis.CustomEvent('monaco-submit'),
  );

  await waitFor(() => submits.length > 0);
  t.is(submits.length, 1, 'monaco-submit triggers a single submit');
  t.is(submits[0].source, '40 + 2', 'editor value submitted');
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
    await waitFor(() => !$container.querySelector('.eval-submit').disabled);

    $container
      .querySelector('.eval-add-endowment')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    await waitFor(() => !!$container.querySelector('.eval-codename'));

    // Code name present, pet name left empty.
    const $codeName = $container.querySelector('.eval-codename');
    $codeName.value = 'orphan';
    $codeName.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await waitFor(() => form.isDirty());

    $container
      .querySelector('.eval-submit')
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

test.serial(
  'failed submit surfaces the daemon trace: message, stack, worker chip',
  async t => {
    // Acceptance criteria for `/js throw new Error("x")` (PR #58): the error
    // bubble must show (1) the message, (2) the full stack trace, and (3) a
    // clickable worker chip whose click opens Show Value for the worker. This
    // exercises the eval form's submit-catch wiring end to end: a rejected
    // evaluation, a daemon-shaped diagnostics().traces().lookup() that returns
    // the recorded stack and authoritative worker id, and the confined render.
    const STACK =
      'Error: x\n    at <eval>:1:7\n    at evaluate (worker.js:42:10)';
    const WORKER_ID = 'worker-formula-id-512';

    // A decoded CapTP error as @endo/marshal hands it to the client: the
    // wire-level errorId rides in the parenthesized SES error tag on `name`.
    const thrown = Error('x');
    thrown.name = 'Error (error:Endo#1)';

    // Daemon-shaped powers: diagnostics() -> traces() -> lookup(errorId). The
    // lookup is keyed by the de-parenthesized tag extractErrorId produces.
    const tracePowers = {
      list: async () => [],
      lookup: () => tracePowers,
      diagnostics: async () => ({
        traces: async () => ({
          lookup: async errorId =>
            errorId === 'error:Endo#1'
              ? { errorId, stack: STACK, workerId: WORKER_ID }
              : undefined,
        }),
      }),
    };

    /** @type {string[]} */
    const shownWorkers = [];

    const { $container, form, editor } = await setupForm({
      powers: tracePowers,
      onShowWorker: workerId => shownWorkers.push(workerId),
      onSubmit: async () => {
        throw thrown;
      },
    });
    t.teardown(() => {
      form.dispose();
      $container.remove();
    });

    await waitFor(() => !!$container.querySelector('.eval-form'));

    // Type a throwing source and submit.
    editor().__setValueFromUser('throw new Error("x")');
    await waitFor(() => !$container.querySelector('.eval-submit').disabled);
    $container
      .querySelector('.eval-submit')
      .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

    // Criterion 1: the message renders in the error bubble.
    await waitFor(
      () => $container.querySelector('.eval-error')?.textContent === 'x',
    );
    t.is(
      $container.querySelector('.eval-error').textContent,
      'x',
      'criterion 1: error message rendered',
    );

    // Criterion 2: the full daemon-side stack trace is surfaced alongside it.
    await waitFor(() => !!$container.querySelector('.eval-error-stack-text'));
    const $stack = $container.querySelector('.eval-error-stack-text');
    t.truthy($stack, 'criterion 2: stack-trace element rendered');
    t.is(
      $stack.textContent,
      STACK,
      'criterion 2: full daemon-side stack trace surfaced',
    );

    // Criterion 3: a clickable worker chip that opens Show Value for the worker.
    const $chip = $container.querySelector('.eval-error-worker-chip');
    t.truthy($chip, 'criterion 3: worker chip rendered');
    $chip.dispatchEvent(new globalThis.Event('click', { bubbles: true }));
    await waitFor(() => shownWorkers.length > 0);
    t.deepEqual(
      shownWorkers,
      [WORKER_ID],
      'criterion 3: chip click requests Show Value for the authoritative worker id',
    );
  },
);
