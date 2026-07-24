// @ts-nocheck - Component test with happy-dom
/* eslint-disable no-underscore-dangle */

import '@endo/init/debug.js';

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';

// Monaco cannot run under happy-dom and `monaco-editor` is not installed in this
// workspace, so this test redirects the `./monaco-wrapper.js` specifier to the
// shared stub (test/helpers/monaco-wrapper-stub.js) via a Node loader registered
// below BEFORE blob-viewer is dynamically imported. The stub implements the same
// MonacoEditorAPI surface blob-viewer uses, backed by a host <div> and a string
// buffer, and records created editors on globalThis.__monacoStubEditors__ so the
// test can assert dispose(). This exercises the confined chrome, the host-node
// editor embedding, the markdown-as-vnodes preview, and save — everything except
// real Monaco rendering, which is covered by Playwright e2e.

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

// Dynamically imported AFTER the loader is registered so blob-viewer's (and
// markdown-preview's) `import ... from '@endo/monaco-wrapper'` resolve to the
// stub.
const { createBlobViewer } = await import('@endo/spaces-util/blob-viewer.js');

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
 * races; polling the actual condition is robust.
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
 * Construct a blob viewer exactly as chat-bar-component.js does:
 * createBlobViewer({ $container, $backdrop, powers, onClose }), with a fake
 * `powers` whose readText/writeText are controllable.
 *
 * @param {object} [opts]
 * @param {(path: string[]) => Promise<string>} [opts.readText]
 * @param {(path: string[], content: string) => Promise<void>} [opts.writeText]
 */
const setupViewer = ({
  readText = async () => '',
  writeText = async () => {},
} = {}) => {
  globalThis.__monacoStubEditors__ = [];
  testDocument.body.innerHTML = '';

  const $backdrop = testDocument.createElement('div');
  $backdrop.id = 'blob-viewer-backdrop';
  testDocument.body.appendChild($backdrop);

  const $container = testDocument.createElement('div');
  $container.id = 'blob-viewer-container';
  testDocument.body.appendChild($container);

  /** @type {Array<{ path: string[], content: string }>} */
  const writes = [];
  let closed = 0;

  const powers = {
    readText: async path => readText(path),
    writeText: async (path, content) => {
      writes.push({ path, content });
      await writeText(path, content);
    },
  };

  const viewer = createBlobViewer({
    $container,
    $backdrop,
    powers,
    onClose: () => {
      closed += 1;
    },
  });

  const editor = () => globalThis.__monacoStubEditors__[0];

  return {
    $container,
    $backdrop,
    viewer,
    writes,
    editor,
    getClosed: () => closed,
  };
};

test.serial('mounts chrome and the editor host node in its anchor', async t => {
  const { $container, viewer, editor } = setupViewer({
    readText: async () => 'const x = 1;\n',
  });
  t.teardown(() => {
    viewer.dispose();
    $container.remove();
  });

  // Open a non-markdown file in edit mode -> full Monaco editor pane.
  await viewer.open('code/example.js', false);
  await waitFor(() => !!$container.querySelector('.blob-viewer'));

  // Confined chrome rendered.
  t.truthy($container.querySelector('.blob-viewer'), 'viewer chrome rendered');
  t.is(
    $container.querySelector('.blob-viewer-title').textContent,
    'code/example.js',
    'title text reflects the pet name path',
  );
  t.is(
    $container.querySelector('.blob-viewer-language').textContent,
    'javascript',
    'language badge rendered',
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
});

test.serial(
  'markdown preview renders **bold** as a real <strong> vnode',
  async t => {
    const { $container, viewer } = setupViewer({
      readText: async () => 'Hello **world** and more',
    });
    t.teardown(() => {
      viewer.dispose();
      $container.remove();
    });

    // Read-only markdown -> rendered preview pane.
    await viewer.open('docs/readme.md', true);
    await waitFor(() => !!$container.querySelector('.blob-viewer-md-preview'));

    const $preview = $container.querySelector('.blob-viewer-md-preview');
    t.truthy($preview, 'markdown preview pane rendered');

    // The bold span is a real <strong> ELEMENT (vnodes), NOT an HTML string in
    // innerHTML.
    const $strong = $preview.querySelector('strong');
    t.truthy($strong, 'bold rendered as a real <strong> element');
    t.is($strong.textContent, 'world', 'strong contains the emphasized text');

    // It is genuine DOM structure: a paragraph with the reused md-* class.
    t.truthy(
      $preview.querySelector('.md-paragraph'),
      'reused .md-paragraph class applied',
    );
  },
);

test.serial('Source toggle switches to the raw <pre> source view', async t => {
  const { $container, viewer } = setupViewer({
    readText: async () => 'Hello **world**',
  });
  t.teardown(() => {
    viewer.dispose();
    $container.remove();
  });

  await viewer.open('docs/readme.md', true);
  await waitFor(() => !!$container.querySelector('.blob-viewer-md-preview'));

  // Click the "Source" segment of the markdown toggle.
  const $sourceSeg = $container.querySelector(
    '.md-toggle-seg[data-seg="source"]',
  );
  t.truthy($sourceSeg, 'source toggle button rendered');
  $sourceSeg.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => !!$container.querySelector('.blob-viewer-pre'));
  const $pre = $container.querySelector('.blob-viewer-pre');
  t.truthy($pre, 'raw source <pre> pane shown after toggle');
  t.is(
    $pre.textContent,
    'Hello **world**',
    'raw markdown source shown verbatim (deferred colorize, plain text)',
  );
});

test.serial('Save invokes writeText with the editor value', async t => {
  const { $container, viewer, writes, editor, getClosed } = setupViewer({
    readText: async () => 'original',
  });
  t.teardown(() => {
    viewer.dispose();
    $container.remove();
  });

  // Non-markdown edit mode -> full editor + Save button.
  await viewer.open('code/example.js', false);
  await waitFor(() => !!$container.querySelector('.blob-viewer'));
  t.truthy(editor(), 'editor created in edit mode');

  // Simulate the user editing in Monaco; this marks dirty and enables Save.
  editor().__setValueFromUser('edited content');
  await waitFor(() => {
    const $save = $container.querySelector('.blob-viewer-save');
    return $save && !$save.disabled;
  });

  // Click Save.
  $container
    .querySelector('.blob-viewer-save')
    .dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  await waitFor(() => writes.length > 0);
  t.is(writes.length, 1, 'writeText invoked once');
  t.deepEqual(writes[0].path, ['code', 'example.js'], 'path split correctly');
  t.is(writes[0].content, 'edited content', 'saved the editor value');

  // Status reflects the save.
  await waitFor(
    () =>
      $container.querySelector('.blob-viewer-status').textContent === 'Saved',
  );
  t.is(
    $container.querySelector('.blob-viewer-status').textContent,
    'Saved',
    'status shows Saved',
  );
  t.is(getClosed(), 0, 'save alone does not close the viewer');
});

test.serial('dispose tears down and disposes the editor', async t => {
  const { $container, viewer, editor } = setupViewer({
    readText: async () => 'const x = 1;',
  });

  await viewer.open('code/example.js', false);
  await waitFor(() => !!$container.querySelector('.blob-viewer'));
  const editorApi = editor();
  t.false(editorApi.__isDisposed(), 'editor live before dispose');

  viewer.dispose();

  t.true(editorApi.__isDisposed(), 'editor disposed on teardown');
  t.falsy(
    $container.querySelector('.blob-viewer'),
    'confined chrome unmounted from container',
  );
  t.falsy(
    $container.querySelector('.monaco-editor-mount'),
    'editor host node removed',
  );

  $container.remove();
});
