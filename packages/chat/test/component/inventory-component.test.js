// @ts-nocheck - Component test with happy-dom

import 'ses';
import '@endo/eventual-send/shim.js';

import test from 'ava';
import harden from '@endo/harden';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';

const { document: testDocument } = createDOM();

/**
 * Set up an inventory container and import the component lazily. Returns the
 * mounted component plus the mock powers' call log so tests can assert on
 * the daemon-facing call shape.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.names]
 * @param {Map<string, unknown>} [opts.values]
 * @param {Map<string, string>} [opts.ids]
 * @param {Map<string, string>} [opts.locators]
 */
const setupInventory = async (opts = {}) => {
  const $parent = /** @type {HTMLElement} */ (
    testDocument.createElement('div')
  );
  $parent.className = 'inventory';
  const $list = testDocument.createElement('div');
  $list.className = 'pet-list';
  $parent.appendChild($list);
  testDocument.body.appendChild($parent);

  const mock = makeMockPowers(opts);

  const { inventoryComponent } = await import('../../inventory-component.js');

  // Fire-and-forget: inventoryComponent runs an infinite `for await` loop on
  // followNameChanges and only returns when the iterator does. The tests
  // exercise its side-effects on the DOM and the mock-powers call log.
  inventoryComponent(
    $parent,
    null,
    mock.powers,
    {
      showValue: () => {},
    },
    [],
  );

  // Let the followNameChanges + locate probes settle.
  await tick(30);

  return { $parent, $list, mock };
};

// ── harden ────────────────────────────────────────────────────────────

test.serial('inventoryComponent export is hardened', async t => {
  const { inventoryComponent } = await import('../../inventory-component.js');
  t.true(Object.isFrozen(inventoryComponent), 'inventoryComponent is frozen');
});

// ── rendering & hub-gating ────────────────────────────────────────────

test.serial('renders rows for each name from followNameChanges', async t => {
  const { $list } = await setupInventory({ names: ['alice', 'bob'] });

  const $rows = $list.querySelectorAll('.pet-item-row');
  t.is($rows.length, 2, 'two rows rendered');

  const labels = [
    .../** @type {NodeListOf<HTMLElement>} */ (
      $list.querySelectorAll('.pet-name')
    ),
  ].map(el => el.textContent);
  t.deepEqual(labels.sort(), ['alice', 'bob']);
});

test.serial('hub-typed rows accept drop; leaf-typed rows do not', async t => {
  const locators = new Map([
    ['inbox', 'endo://?type=directory&number=1'],
    ['note', 'endo://?type=readable-blob&number=2'],
  ]);
  const { $list } = await setupInventory({
    names: ['inbox', 'note'],
    locators,
  });

  // locate() runs asynchronously after each item is added; give it a beat
  // beyond the initial render tick to settle.
  await tick(30);

  const $inboxRow = /** @type {HTMLElement} */ (
    $list.querySelector('.pet-item-wrapper:nth-child(1) .pet-item-row')
  );
  const $noteRow = /** @type {HTMLElement} */ (
    $list.querySelector('.pet-item-wrapper:nth-child(2) .pet-item-row')
  );
  t.truthy($inboxRow, 'inbox row exists');
  t.truthy($noteRow, 'note row exists');

  // Fake a dragover on the inbox row carrying the endo-petname MIME.
  // happy-dom's Event doesn't expose dataTransfer; we synthesize it.
  const makeDragoverEvent = () => {
    const e = new testDocument.defaultView.Event('dragover', {
      bubbles: true,
      cancelable: true,
    });
    // Minimal DataTransfer shim: only what the handler reads.
    Object.defineProperty(e, 'dataTransfer', {
      value: {
        types: ['application/x-endo-petname'],
        dropEffect: '',
      },
    });
    return e;
  };

  $inboxRow.dispatchEvent(makeDragoverEvent());
  t.true(
    $inboxRow.classList.contains('drop-target'),
    'directory row accepts drop (highlighted)',
  );

  $noteRow.dispatchEvent(makeDragoverEvent());
  t.false(
    $noteRow.classList.contains('drop-target'),
    'readable-blob row does not accept drop',
  );
});

// ── cancel-spread regression (item 1) ────────────────────────────────

test.serial(
  'two-step cancel sends path as ONE argument to E(powers).cancel',
  async t => {
    const { $list, mock } = await setupInventory({
      names: ['alice'],
    });

    const $cancel = /** @type {HTMLButtonElement} */ (
      $list.querySelector('.cancel-button')
    );
    t.truthy($cancel, 'cancel button rendered');

    // First click: enter confirming state, do not send.
    $cancel.click();
    t.true($cancel.classList.contains('confirming'), 'confirm state entered');
    const beforeCalls = mock.calls.filter(c => c.method === 'cancel');
    t.is(beforeCalls.length, 0, 'no cancel call on first click');

    // Second click: send the cancel.
    $cancel.click();
    await tick(10);

    const cancelCalls = mock.calls.filter(c => c.method === 'cancel');
    t.is(cancelCalls.length, 1, 'one cancel call recorded');
    // Path-or-name argument is the first arg; second is the optional reason.
    t.deepEqual(
      cancelCalls[0].args[0],
      ['alice'],
      'path passed as a single array argument',
    );
  },
);

// Pin the path-as-one-array contract structurally rather than walking the
// nested-expansion path: read the source and assert the call site does NOT
// spread. The root-level click test above already exercises the runtime
// path; this test guards against a future regression that re-introduces the
// spread (which would silently break for any path of length >= 2 because
// the second segment would be forwarded as the optional Error reason).
test.serial(
  'cancel call site does not spread itemPath (would break nested cancel)',
  async t => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(
      new URL('../../inventory-component.js', import.meta.url),
      'utf8',
    );
    // The spread form `.cancel(...` would forward path[1] as the optional
    // reason and the M.error() guard on EndoHost.cancel would reject. The
    // correct call passes itemPath as one positional argument.
    t.notRegex(
      source,
      /\.cancel\(\s*\.\.\./,
      'no spread on E(powers).cancel call site',
    );
    t.regex(
      source,
      /\.cancel\(\s*\/\*\*\s*@type\s*\{[^}]+\}\s*\*\/\s*\(\s*itemPath\s*\)\s*\)/,
      'itemPath passed as single positional argument',
    );
    // harden(harden); // silence unused import warning on harden
    void harden;
  },
);

// ── drop-zone retract regression (item 3) ────────────────────────────

test.serial(
  'showDropMenu clears every lingering drop-target highlight',
  async t => {
    const { $parent, $list } = await setupInventory({
      names: ['inbox'],
      locators: new Map([['inbox', 'endo://?type=directory&number=1']]),
    });
    await tick(30);

    const $row = /** @type {HTMLElement} */ (
      $list.querySelector('.pet-item-row')
    );
    t.truthy($row, 'row exists');

    // Simulate two lingering highlights: the row class and the list class.
    // The browser bug the dispatch describes leaves these set when the inner
    // drop handler runs without clearing the outer ancestor.
    $row.classList.add('drop-target');
    $list.classList.add('drop-target-list');

    // Synthesize a drop on $row. The component-internal showDropMenu sweeps
    // both classes before opening the menu.
    const dropEvent = new testDocument.defaultView.Event('drop', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        types: ['application/x-endo-petname'],
        getData: () => JSON.stringify(['inbox']),
      },
    });
    Object.defineProperty(dropEvent, 'clientX', { value: 100 });
    Object.defineProperty(dropEvent, 'clientY', { value: 100 });

    // dropping inbox onto inbox is a self-drop and returns undefined from
    // dropTargetPath — but the row still calls showDropMenu via a different
    // source. For a clean regression check, drop a sibling source.
    Object.defineProperty(dropEvent.dataTransfer, 'getData', {
      value: () => JSON.stringify(['other']),
    });

    $row.dispatchEvent(dropEvent);

    // The drop-menu opens (document level) and showDropMenu clears the
    // lingering ancestor classes as a side-effect.
    const $menu = testDocument.querySelector('.inventory-drop-menu');
    t.truthy($menu, 'drop menu appeared');

    t.false(
      $row.classList.contains('drop-target'),
      'lingering row highlight cleared',
    );
    t.false(
      $list.classList.contains('drop-target-list'),
      'lingering list highlight cleared',
    );

    // Cleanup: dismiss the menu so subsequent tests start clean.
    /** @type {HTMLElement | null} */ ($menu).remove();
    void $parent;
  },
);

// ── drop-menu Link/Move semantics (item 6: contract pinning at component) ──

// The full daemon-integration test (open chat, drag from nested directory to
// root, pick "Move here", assert source name is gone and target name resolves
// to same identifier) requires standing up a forked Endo daemon (per project
// CLAUDE.md test discipline) and lives outside the surgical scope of this
// PR — see this PR's top-level summary for the next: assayer escalation.
// What this component-level test pins: the click handlers on "Link here"
// and "Move here" call E(rootPowers).copy and E(rootPowers).move with the
// (from, to) shape the PR's description claims, with both paths as whole
// arrays (no spread). This is the inventory-component side of the contract;
// the daemon side is already covered by packages/daemon/test/endo.test.js.

test.serial(
  '"Link here" menu item calls E(rootPowers).copy(from, to) as whole arrays',
  async t => {
    const { $list, mock } = await setupInventory({
      names: ['source', 'dest'],
      locators: new Map([
        ['source', 'endo://?type=directory&number=1'],
        ['dest', 'endo://?type=directory&number=2'],
      ]),
    });
    await tick(30);

    const $destRow = /** @type {HTMLElement} */ (
      $list.querySelector('.pet-item-wrapper:nth-child(2) .pet-item-row')
    );
    t.truthy($destRow, 'dest row exists');

    // Drop source onto dest.
    const dropEvent = new testDocument.defaultView.Event('drop', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        types: ['application/x-endo-petname'],
        getData: () => JSON.stringify(['source']),
      },
    });
    Object.defineProperty(dropEvent, 'clientX', { value: 100 });
    Object.defineProperty(dropEvent, 'clientY', { value: 100 });
    $destRow.dispatchEvent(dropEvent);

    // Click "Link here".
    const $items = /** @type {NodeListOf<HTMLButtonElement>} */ (
      testDocument.querySelectorAll('.inventory-drop-menu-item')
    );
    t.is($items.length, 2, 'two menu items (Link, Move)');
    const $link = [...$items].find(el => el.textContent === 'Link here');
    t.truthy($link, 'Link here item exists');
    $link.click();
    await tick(10);

    const copyCalls = mock.calls.filter(c => c.method === 'copy');
    t.is(copyCalls.length, 1, 'one copy call recorded');
    t.deepEqual(copyCalls[0].args[0], ['source'], 'from is a whole array');
    t.deepEqual(
      copyCalls[0].args[1],
      ['dest', 'source'],
      'to is dest + source-leaf, as a whole array',
    );
  },
);

test.serial(
  '"Move here" menu item calls E(rootPowers).move(from, to) as whole arrays',
  async t => {
    const { $list, mock } = await setupInventory({
      names: ['source', 'dest'],
      locators: new Map([
        ['source', 'endo://?type=directory&number=1'],
        ['dest', 'endo://?type=directory&number=2'],
      ]),
    });
    await tick(30);

    const $destRow = /** @type {HTMLElement} */ (
      $list.querySelector('.pet-item-wrapper:nth-child(2) .pet-item-row')
    );
    const dropEvent = new testDocument.defaultView.Event('drop', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: {
        types: ['application/x-endo-petname'],
        getData: () => JSON.stringify(['source']),
      },
    });
    Object.defineProperty(dropEvent, 'clientX', { value: 100 });
    Object.defineProperty(dropEvent, 'clientY', { value: 100 });
    $destRow.dispatchEvent(dropEvent);

    const $items = /** @type {NodeListOf<HTMLButtonElement>} */ (
      testDocument.querySelectorAll('.inventory-drop-menu-item')
    );
    const $move = [...$items].find(el => el.textContent === 'Move here');
    t.truthy($move, 'Move here item exists');
    $move.click();
    await tick(10);

    const moveCalls = mock.calls.filter(c => c.method === 'move');
    t.is(moveCalls.length, 1, 'one move call recorded');
    t.deepEqual(moveCalls[0].args[0], ['source'], 'from is a whole array');
    t.deepEqual(
      moveCalls[0].args[1],
      ['dest', 'source'],
      'to is dest + source-leaf, as a whole array',
    );
  },
);

// ── drop payload parse-error has a discernable location (kriskowal review) ──

test.serial(
  'malformed drag payload logs an error naming the MIME type and the destination',
  async t => {
    const { $list } = await setupInventory({
      names: ['inbox'],
      locators: new Map([['inbox', 'endo://?type=directory&number=1']]),
    });
    await tick(30);

    const $row = /** @type {HTMLElement} */ (
      $list.querySelector('.pet-item-row')
    );

    // Capture console.error during the malformed-payload drop.
    const captured = [];
    const realConsoleError = console.error;
    // eslint-disable-next-line no-global-assign
    console.error = (...args) => captured.push(args.join(' '));

    try {
      const dropEvent = new testDocument.defaultView.Event('drop', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: {
          types: ['application/x-endo-petname'],
          getData: () => '<<not json>>',
        },
      });
      Object.defineProperty(dropEvent, 'clientX', { value: 100 });
      Object.defineProperty(dropEvent, 'clientY', { value: 100 });
      $row.dispatchEvent(dropEvent);
    } finally {
      // eslint-disable-next-line no-global-assign
      console.error = realConsoleError;
    }

    t.true(captured.length >= 1, 'console.error was called');
    const message = captured.join('\n');
    t.regex(
      message,
      /application\/x-endo-petname/,
      'error names the MIME type',
    );
    t.regex(message, /inbox/, 'error names the destination row path');
  },
);
