// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { makePromiseKit } from '@endo/promise-kit';
import { markdownToVnodes } from '@endo/spaces-util/markdown-vnodes.js';
import { prepareTextWithPlaceholders } from '@endo/spaces-util/markdown-render.js';
import { idFromLocator } from '@endo/spaces-util/locator.js';
import { inboxComponent } from '../../inbox-component.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

/**
 * Poll until `predicate()` is true (or a timeout elapses). The async message
 * pipeline (rAF + reverseLocate + Preact effect flushes) races a fixed delay on
 * slower CI runners, so poll the actual condition instead.
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
 * Build a mock powers object that yields a single package message.
 *
 * @param {object} opts
 * @param {string} opts.selfId
 * @param {object} opts.message
 */
const makePackagePowers = ({ selfId, message }) => {
  /** @type {Array<{method: string, args: unknown[]}>} */
  const calls = [];

  const powers = Far('MockPowers', {
    locate(...path) {
      calls.push({ method: 'locate', args: path });
      if (path.length === 1 && path[0] === '@self') {
        return `endo://localhost/${selfId}?type=handle`;
      }
      return undefined;
    },

    async reverseLocate(locator) {
      calls.push({ method: 'reverseLocate', args: [locator] });
      if (locator.includes('host-handle-id')) return ['@host'];
      if (
        locator.includes(
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        )
      )
        return ['greeting'];
      return [];
    },

    async lookupByLocator(locator) {
      calls.push({ method: 'lookupByLocator', args: [locator] });
      return { hello: 'world' };
    },

    followMessages() {
      let delivered = false;
      return readerFromIterator(
        Far('MessageIterator', {
          next() {
            if (!delivered) {
              delivered = true;
              return Promise.resolve({ value: message, done: false });
            }
            return new Promise(() => {});
          },
        }),
      );
    },

    dismiss(number) {
      calls.push({ method: 'dismiss', args: [number] });
      return Promise.resolve();
    },
  });

  return { powers, calls };
};

const createInboxDOM = () => {
  testDocument.body.innerHTML = '';
  const $parent = testDocument.createElement('div');
  $parent.id = 'inbox';
  $parent.scrollTo = () => {};
  Object.defineProperty($parent, 'scrollTop', { value: 0, writable: true });
  Object.defineProperty($parent, 'scrollHeight', { value: 100 });
  Object.defineProperty($parent, 'clientHeight', { value: 100 });
  testDocument.body.appendChild($parent);

  const $end = testDocument.createElement('div');
  $end.id = 'inbox-end';
  $parent.appendChild($end);

  return { $parent, $end };
};

test('markdownToVnodes: bold, inline code, and a code fence produce vnode shapes', t => {
  const { nodes, firstBlockKind } = markdownToVnodes(
    'Hello **world** and `code`\n\n```js\nconst x = 1;\n```',
  );
  t.is(firstBlockKind, 'paragraph');
  // First node is a paragraph vnode.
  t.is(nodes[0].type, 'p');
  t.is(nodes[0].props.class, 'md-paragraph');
  // Second node is the code fence <pre>.
  const fence = nodes[1];
  t.is(fence.type, 'pre');
  t.is(fence.props.class, 'md-code-fence');
});

test('markdownToVnodes: placeholders invoke renderToken with monotonic indices', t => {
  const text = prepareTextWithPlaceholders(['a ', ' b ', ' c']);
  /** @type {number[]} */
  const seen = [];
  const { placeholderCount } = markdownToVnodes(text, {
    renderToken: index => {
      seen.push(index);
      return null;
    },
  });
  t.is(placeholderCount, 2);
  t.deepEqual(seen, [0, 1]);
});

test('markdownToVnodes: placeholder inside a code fence advances the shared counter', t => {
  // One placeholder inside a fenced code block, then another in the paragraph
  // after it. The in-fence placeholder must be substituted and counted, so the
  // after-fence chip keeps index 1 (regression: the fence used to emit raw text
  // without advancing the counter, shifting every later chip by one).
  const text = prepareTextWithPlaceholders([
    '```js\nconst x = ',
    ';\n```\n\nthen ',
    ' done',
  ]);
  /** @type {number[]} */
  const seen = [];
  const { nodes, placeholderCount } = markdownToVnodes(text, {
    renderToken: index => {
      seen.push(index);
      return null;
    },
  });
  // Both placeholders counted; indices monotonic across the fence boundary.
  t.is(placeholderCount, 2);
  t.deepEqual(seen, [0, 1]);
  // The fence is still a real pre.md-code-fence.
  const fence = nodes.find(node => node && node.type === 'pre');
  t.truthy(fence, 'code fence present');
  t.is(fence.props.class, 'md-code-fence');
});

test.serial(
  'package message renders markdown as real elements (not escaped, not innerHTML)',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const dismissedKit = makePromiseKit();

    const message = {
      type: 'package',
      number: 1n,
      date: new Date().toISOString(),
      from: 'endo://localhost/host-handle-id?type=handle',
      to: 'endo://localhost/guest-handle-id?type=handle',
      dismissed: dismissedKit.promise,
      strings: [
        'Here is **bold** text and a fence:\n\n```js\nconst x = 1;\n```',
      ],
      names: [],
      ids: [],
    };

    const { powers } = makePackagePowers({
      selfId: 'guest-handle-id',
      message,
    });

    globalThis.requestAnimationFrame = fn => {
      fn(0);
      return 0;
    };

    inboxComponent($parent, $end, powers, { showValue: () => {} });
    await waitFor(() => $parent.querySelector('strong'));

    // **bold** rendered as a real <strong> element, not literal asterisks.
    const $strong = $parent.querySelector('strong');
    t.truthy($strong, 'bold should render as <strong>');
    t.is($strong.textContent, 'bold');
    t.false(
      $parent.textContent.includes('**bold**'),
      'asterisks should not survive as plain text',
    );

    // Code fence rendered as a real pre.md-code-fence with a <code> child.
    const $fence = $parent.querySelector('pre.md-code-fence');
    t.truthy($fence, 'code fence should render as pre.md-code-fence');
    const $code = $fence.querySelector('code');
    t.truthy($code, 'fence should contain a <code> element');
    t.true($code.textContent.includes('const x = 1;'));
  },
);

test.serial(
  'package token placeholder renders a .token chip and click opens the value',
  async t => {
    const { $parent, $end } = createInboxDOM();
    const dismissedKit = makePromiseKit();

    const message = {
      type: 'package',
      number: 7n,
      date: new Date().toISOString(),
      from: 'endo://localhost/host-handle-id?type=handle',
      to: 'endo://localhost/guest-handle-id?type=handle',
      dismissed: dismissedKit.promise,
      strings: ['Check out ', ' please'],
      names: ['greeting'],
      ids: [
        'endo://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?type=eval',
      ],
    };

    const { powers, calls } = makePackagePowers({
      selfId: 'guest-handle-id',
      message,
    });

    /** @type {Array<{value: unknown, id: unknown, messageContext: unknown}>} */
    const showValueCalls = [];

    globalThis.requestAnimationFrame = fn => {
      fn(0);
      return 0;
    };

    inboxComponent($parent, $end, powers, {
      showValue: (value, id, petNamePath, messageContext) => {
        showValueCalls.push({ value, id, petNamePath, messageContext });
      },
    });
    await waitFor(() => $parent.querySelector('.token'));

    // The placeholder rendered an interactive .token chip with @greeting.
    const $token = $parent.querySelector('.token');
    t.truthy($token, 'a .token chip should be rendered');
    t.is($token.getAttribute('role'), 'button');
    t.is($token.textContent, '@greeting');

    // Clicking the chip looks the value up by locator and opens it.
    $token.click();
    await waitFor(() => calls.find(c => c.method === 'lookupByLocator'));

    const lookupCall = calls.find(c => c.method === 'lookupByLocator');
    t.truthy(lookupCall, 'lookupByLocator should be called');
    t.is(
      lookupCall.args[0],
      'endo://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?type=eval',
    );

    t.is(showValueCalls.length, 1, 'showValue should have been called once');
    t.deepEqual(showValueCalls[0].value, { hello: 'world' });
    // idFromLocator derives the formula id from the locator for name display.
    t.is(
      showValueCalls[0].id,
      idFromLocator(
        'endo://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?type=eval',
      ),
    );
    t.deepEqual(showValueCalls[0].messageContext, {
      number: 7n,
      edgeName: 'greeting',
    });
  },
);
