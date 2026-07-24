// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { h } from 'preact';
import { renderConfined } from '@endo/preact-container/renderer';
import { FormulaView, humanizeName } from '@endo/spaces-util/formula-view.js';

import { createDOM, tick } from '../helpers/dom-setup.js';

const { document: testDocument } = createDOM();

// renderConfined defers reconciliation with requestAnimationFrame; dom-setup
// stubs setTimeout but not rAF, so provide a setTimeout-backed shim as a real
// browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference).
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
 * Mount a fresh container and render a record through the confined renderer.
 * Returns the container and an array that captures every reference-button click.
 *
 * @param {object} record
 * @param {number} [stackDepth]
 */
const renderInto = async (record, stackDepth = 1) => {
  const $container = testDocument.createElement('div');
  testDocument.body.appendChild($container);

  /** @type {Array<{ id: string, label: string }>} */
  const navCalls = [];

  renderConfined(
    h(FormulaView, {
      record,
      onNavigateReference: (id, label) => {
        navCalls.push({ id, label });
      },
      stackDepth,
    }),
    $container,
  );
  await waitFor(() => !!$container.querySelector('#formula-view-title'));

  return { $container, navCalls };
};

test.serial(
  'eval record renders header, identifier, and ordered properties',
  async t => {
    const record = {
      type: 'eval',
      number: 'abc123',
      properties: {
        source: { kind: 'literal', value: 'E(x).foo()' },
        worker: { kind: 'reference', identifier: 'worker-id' },
        endowments: {
          kind: 'reference-list',
          entries: { x: 'x-id', y: 'y-id' },
        },
      },
    };
    const { $container } = await renderInto(record);

    // The human-facing title names the type once; there is no redundant
    // raw-type chip (it does not correspond to a capability).
    t.falsy(
      $container.querySelector('.formula-view-badge'),
      'no redundant type chip',
    );

    const $title = $container.querySelector('#formula-view-title');
    t.is($title.textContent, 'Evaluation');

    const $id = $container.querySelector('.formula-view-identifier');
    t.is($id.textContent, 'abc123');

    // Labeled rows appear in the registry's declared order with
    // human-facing names. `worker` is a single reference, so it renders
    // as a solo button (below) rather than a labeled row.
    const $dts = [
      ...$container.querySelectorAll('.formula-view-property-name'),
    ];
    const labels = $dts.map(el => el.textContent);
    t.deepEqual(labels, ['Source', 'Endowments']);

    // The single `worker` reference is a solo, human-named button with
    // no separate label cell (no stutter).
    const $solo = $container.querySelector('.formula-view-reference-solo');
    t.truthy($solo);
    t.is($solo.textContent, 'Worker');
  },
);

test.serial(
  'reference buttons fire onNavigateReference with id and schema label',
  async t => {
    const record = {
      type: 'lookup',
      number: 'lookup-1',
      properties: {
        hub: { kind: 'reference', identifier: 'hub-id' },
        path: { kind: 'literal', value: ['a', 'b'] },
      },
    };
    const { $container, navCalls } = await renderInto(record);

    const $hubButton = $container.querySelector('.formula-view-reference');
    // The button reads as a human name; the navigation label stays raw
    // for back-stack breadcrumbs.
    t.is($hubButton.textContent, 'Hub');
    $hubButton.click();
    await tick(10);

    t.deepEqual(navCalls, [{ id: 'hub-id', label: 'hub' }]);
  },
);

test.serial(
  'reference-list entries label by entry key, not by target pet name',
  async t => {
    const record = {
      type: 'eval',
      number: 'eval-1',
      properties: {
        source: { kind: 'literal', value: 'noop' },
        worker: { kind: 'reference', identifier: 'w-id' },
        endowments: {
          kind: 'reference-list',
          entries: { codeName1: 'id-1', codeName2: 'id-2' },
        },
      },
    };
    const { $container, navCalls } = await renderInto(record);

    const $endowmentsList = $container.querySelector(
      '.formula-view-reference-list',
    );
    const buttons = [...$endowmentsList.querySelectorAll('button')];
    t.deepEqual(
      buttons.map(b => b.textContent),
      ['codeName1', 'codeName2'],
    );

    buttons[1].click();
    await tick(10);
    t.deepEqual(navCalls, [{ id: 'id-2', label: 'endowments -> codeName2' }]);
  },
);

test.serial(
  'keypair record renders publicKey but explicitly suppresses privateKey',
  async t => {
    const record = {
      type: 'keypair',
      number: 'kp-1',
      properties: {
        publicKey: { kind: 'literal', value: '0xabcdef' },
        // The daemon's formula schema may carry privateKey; the back
        // face must never render it as a literal row.
        privateKey: { kind: 'literal', value: '0xSECRET' },
      },
    };
    const { $container } = await renderInto(record);

    const text = $container.textContent;
    t.true(text.includes('0xabcdef'), 'public key is visible');
    t.false(
      text.includes('0xSECRET'),
      'private key value is not rendered anywhere',
    );
    t.true(
      text.includes('Private key not displayed'),
      'an explicit suppression note replaces the private key',
    );
  },
);

test.serial('empty-state types render the empty-state message', async t => {
  const record = { type: 'worker', number: 'w-1', properties: {} };
  const { $container } = await renderInto(record);

  const $empty = $container.querySelector('.formula-view-empty');
  t.truthy($empty);
  t.true(
    ($empty.textContent || '').toLowerCase().includes('leaf') ||
      ($empty.textContent || '').toLowerCase().includes('no '),
  );
});

test.serial('stack depth > 1 renders a stack hint', async t => {
  const record = {
    type: 'worker',
    number: 'w-1',
    properties: {},
  };
  const { $container } = await renderInto(record, 3);
  const $stack = $container.querySelector('.formula-view-stack');
  t.truthy($stack, 'stack hint rendered when stack depth > 1');
  t.regex($stack.textContent, /stack 3\/3/);
});

test.serial(
  'unknown formula type falls back to the type name as header',
  async t => {
    const record = {
      type: 'future-type',
      number: 'fut-1',
      properties: { strange: { kind: 'literal', value: 'data' } },
    };
    const { $container } = await renderInto(record);
    const $title = $container.querySelector('#formula-view-title');
    t.is($title.textContent, 'future-type');
    // The strange property still renders even though it is not in the
    // registry, because the renderer falls through additive properties.
    // Its label is humanized ("strange" -> "Strange").
    t.true(($container.textContent || '').includes('Strange'));
  },
);

test('humanizeName title-cases camelCase and kebab/snake', t => {
  t.is(humanizeName('petStore'), 'Pet Store');
  t.is(humanizeName('mailboxStore'), 'Mailbox Store');
  t.is(humanizeName('make-unconfined'), 'Make Unconfined');
  t.is(humanizeName('mail_hub'), 'Mail Hub');
  t.is(humanizeName('worker'), 'Worker');
});

test.serial(
  'properties present on the record but absent from the spec still render',
  async t => {
    // Forward-compatibility: if the daemon ships a new property on
    // an existing formula type, the back face must surface it (in the
    // remainder slot) rather than silently dropping it.
    const record = {
      type: 'eval',
      number: 'eval-2',
      properties: {
        source: { kind: 'literal', value: 'x' },
        worker: { kind: 'reference', identifier: 'w-id' },
        endowments: { kind: 'reference-list', entries: {} },
        futureExtension: { kind: 'literal', value: 'newvalue' },
      },
    };
    const { $container } = await renderInto(record);
    const labels = [
      ...$container.querySelectorAll('.formula-view-property-name'),
    ].map(el => el.textContent);
    t.true(
      labels.includes('Future Extension'),
      'additive property rendered (humanized)',
    );
  },
);

test.serial(
  'consecutive single references share one horizontal flow row',
  async t => {
    // `make-unconfined` declares specifier (literal), powers (reference),
    // worker (reference). The two references are adjacent, so they group
    // into a single `.formula-view-reference-row` and flow horizontally
    // rather than each spanning a full-width grid row.
    const record = {
      type: 'make-unconfined',
      number: 'mu-1',
      properties: {
        specifier: { kind: 'literal', value: '@endo/example' },
        powers: { kind: 'reference', identifier: 'powers-id' },
        worker: { kind: 'reference', identifier: 'worker-id' },
      },
    };
    const { $container } = await renderInto(record);

    const $rows = [
      ...$container.querySelectorAll('.formula-view-reference-row'),
    ];
    t.is($rows.length, 1, 'the two adjacent references share one row');

    const buttons = [...$rows[0].querySelectorAll('.formula-view-reference')];
    t.deepEqual(
      buttons.map(el => el.textContent),
      ['Powers', 'Worker'],
      'both reference buttons live in the same flow row',
    );
  },
);

test.serial(
  'a labeled property between references starts a fresh flow row',
  async t => {
    // A literal (or reference-list) breaks a reference run: references on
    // either side land in separate rows, preserving declared order.
    const record = {
      type: 'custom',
      number: 'c-1',
      properties: {
        first: { kind: 'reference', identifier: 'a-id' },
        divider: { kind: 'literal', value: 'x' },
        second: { kind: 'reference', identifier: 'b-id' },
      },
    };
    const { $container } = await renderInto(record);

    const $rows = [
      ...$container.querySelectorAll('.formula-view-reference-row'),
    ];
    t.is(
      $rows.length,
      2,
      'the intervening literal splits the run into two rows',
    );
  },
);
