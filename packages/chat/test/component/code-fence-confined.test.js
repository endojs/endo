// @ts-nocheck - Component test with happy-dom
import '@endo/init/debug.js';

import test from 'ava';
import { h, renderConfined } from '@endo/preact-container/renderer';
import { markdownToVnodes } from '@endo/spaces-util/markdown-vnodes.js';
import { createDOM, waitFor } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// renderConfined defers through requestAnimationFrame; dom-setup stubs
// setTimeout but not rAF — provide a setTimeout-backed shim as a real browser
// would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

const mountFence = (source, colorize) => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);
  const { nodes } = markdownToVnodes(source, { colorize });
  renderConfined(h('div', null, ...nodes), $container);
  return $container;
};

test.serial(
  'code fence renders plain then swaps in Monaco token spans',
  async t => {
    // A fake colorizer returning Monaco-style token HTML.
    const colorize = async () =>
      '<span class="mtk1">const</span> <span class="mtk5">x</span>';
    const $container = mountFence('```js\nconst x\n```', colorize);
    t.teardown(() => $container.remove());

    // The fence is present immediately as a real <pre class="md-code-fence">.
    await waitFor(() => !!$container.querySelector('pre.md-code-fence'));
    t.truthy($container.querySelector('pre.md-code-fence'), 'fence rendered');

    // After the async colorize resolves, token spans appear.
    await waitFor(() => !!$container.querySelector('code .mtk1'));
    t.is(
      $container.querySelector('code .mtk1').textContent,
      'const',
      'colorized token span swapped in',
    );
    t.is($container.querySelector('code .mtk5').textContent, 'x');
  },
);

test.serial('code fence stays plain when colorize rejects', async t => {
  const colorize = async () => {
    throw new Error('monaco unavailable');
  };
  const $container = mountFence('```js\nconst y = 2\n```', colorize);
  t.teardown(() => $container.remove());

  await waitFor(() => !!$container.querySelector('pre.md-code-fence'));
  // Give the rejected colorize a chance to settle; the plain source remains and
  // no token spans are ever inserted.
  await waitFor(() =>
    $container.querySelector('code').textContent.includes('const y = 2'),
  );
  t.is($container.querySelector('code .mtk1'), null, 'no token spans');
  t.true(
    $container.querySelector('code').textContent.includes('const y = 2'),
    'plain source preserved',
  );
});
