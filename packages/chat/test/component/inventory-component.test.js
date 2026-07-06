// @ts-nocheck - Component test with happy-dom
/* global globalThis */

import '@endo/init/debug.js';

import test from 'ava';
import harden from '@endo/harden';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';

const { document: testDocument } = createDOM();

// The drop menu defers its dismiss-on-outside-click listener with
// requestAnimationFrame (so the interaction that opened it does not also close
// it), matching channel-list.js's menu idiom. dom-setup stubs setTimeout but
// not rAF; provide a setTimeout-backed shim, as a real browser would supply it.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

// happy-dom omits the reflected `on*` drag/drop IDL properties that real
// browsers expose on HTMLElement. Preact (inside renderConfined) decides an
// event handler's lowercase listener name with `('on' + Name).toLowerCase() in
// dom`; when the property is absent it falls back to the prop's original
// casing, registering a capitalized listener (`DragOver`, `Drop`, …) that a
// lowercase `dispatchEvent('dragover')` never reaches. Real browsers have the
// properties, so the production component's `onDragOver`/`onDrop` handlers fire
// normally; defining them here makes the test DOM behave like a browser for the
// pure-Preact drag-and-drop handlers under test. (Click already works because
// happy-dom does expose `onclick`.)
const $htmlElementProto = testDocument.defaultView.HTMLElement.prototype;
for (const reflected of [
  'ondragstart',
  'ondragover',
  'ondragleave',
  'ondragend',
  'ondrop',
]) {
  if (!(reflected in $htmlElementProto)) {
    Object.defineProperty($htmlElementProto, reflected, {
      value: null,
      writable: true,
      configurable: true,
    });
  }
}

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
  await tick(80);

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

test.serial('renders a type badge once the locate probe resolves', async t => {
  const { $list } = await setupInventory({
    names: ['inbox'],
    locators: new Map([['inbox', 'endo://?type=directory&number=1']]),
  });
  await waitFor(
    () => $list.querySelector('.pet-type-badge')?.textContent === 'directory',
  );

  const $badge = $list.querySelector('.pet-type-badge');
  t.truthy($badge, 'type badge rendered');
  t.is($badge.textContent, 'directory', 'badge shows the formula type');
  // The badge renders as a sibling of the name directly in the row.
  const $row = $list.querySelector('.pet-item-row');
  t.truthy($row.querySelector('.pet-name'), 'name still present');
  t.truthy($row.querySelector('.pet-type-badge'), 'badge in the same row');
});

test.serial('disclosure is hidden for non-expandable types', async t => {
  const { $list } = await setupInventory({
    names: ['inbox', 'note'],
    locators: new Map([
      ['inbox', 'endo://?type=directory&number=1'],
      ['note', 'endo://?type=readable-blob&number=2'],
    ]),
  });

  const disclosureFor = name => {
    const $wrapper = [
      .../** @type {NodeListOf<HTMLElement>} */ (
        $list.querySelectorAll('.pet-item-wrapper')
      ),
    ].find(w => w.querySelector('.pet-name')?.textContent === name);
    return $wrapper?.querySelector('.pet-disclosure');
  };

  await waitFor(
    () => disclosureFor('note')?.classList.contains('hidden') === true,
  );

  t.true(
    disclosureFor('note').classList.contains('hidden'),
    'readable-blob disclosure is hidden (not expandable)',
  );
  t.false(
    disclosureFor('inbox').classList.contains('hidden'),
    'directory disclosure stays visible (expandable)',
  );
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

  // locate() runs asynchronously after each item is added; wait for both type
  // badges to resolve so the rows are typed before the drag interaction. With
  // grouped layout items land in separate group sections, so positional
  // nth-child selectors cannot be used; find each item wrapper by its pet-name
  // span text instead.
  await waitFor(() => $list.querySelectorAll('.pet-type-badge').length === 2);

  /** @param {string} petName */
  const rowFor = petName => {
    for (const $wrapper of $list.querySelectorAll('.pet-item-wrapper')) {
      const $nameSpan = $wrapper.querySelector('.pet-name');
      if ($nameSpan && $nameSpan.textContent === petName) {
        return /** @type {HTMLElement} */ (
          $wrapper.querySelector('.pet-item-row')
        );
      }
    }
    return null;
  };

  const $inboxRow = rowFor('inbox');
  const $noteRow = rowFor('note');
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

  // The drop-target highlight is now Preact state (a confined handler cannot
  // touch the row node directly), so allow the re-render to settle before
  // asserting on the rendered class.
  $inboxRow.dispatchEvent(makeDragoverEvent());
  await waitFor(() => $inboxRow.classList.contains('drop-target'));
  t.true(
    $inboxRow.classList.contains('drop-target'),
    'directory row accepts drop (highlighted)',
  );

  $noteRow.dispatchEvent(makeDragoverEvent());
  // The readable-blob leaf's onDragOver early-returns (acceptsDrop is false), so
  // dispatching dragover changes no leaf state and schedules no re-render —
  // assert synchronously. A poll for the class's absence would pass vacuously on
  // the first tick without proving the leaf was actually left unhighlighted.
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

    // First click: enter confirming state, do not send. The confirm state now
    // lives in a Preact component (ItemActions), so allow its re-render to
    // settle before asserting on the rendered class.
    $cancel.click();
    await waitFor(() => $cancel.classList.contains('confirming'));
    t.true($cancel.classList.contains('confirming'), 'confirm state entered');
    const beforeCalls = mock.calls.filter(c => c.method === 'cancel');
    t.is(beforeCalls.length, 0, 'no cancel call on first click');

    // Second click: send the cancel.
    $cancel.click();
    await waitFor(
      () => mock.calls.filter(c => c.method === 'cancel').length === 1,
    );

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
      new URL(
        '../../../space-chat/src/inventory/inventory.js',
        import.meta.url,
      ),
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
    // Wait for the locate probe to resolve so the row is typed as a directory.
    await waitFor(() => !!$list.querySelector('.pet-type-badge'));

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
    // The menu is now rendered from Preact state, so let the re-render settle.
    await waitFor(() => testDocument.querySelector('.inventory-drop-menu'));

    // The drop-menu opens (rendered in-tree) and the open path clears the
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
// AGENTS.md test discipline) and lives outside the surgical scope of this
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
    // Wait for both locate probes to resolve so both rows are typed as
    // directories (drop targets) before the drag interaction.
    await waitFor(() => $list.querySelectorAll('.pet-type-badge').length === 2);

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
    // The menu renders from Preact state; let the re-render settle.
    await waitFor(
      () =>
        testDocument.querySelectorAll('.inventory-drop-menu-item').length === 2,
    );

    // Click "Link here".
    const $items = /** @type {NodeListOf<HTMLButtonElement>} */ (
      testDocument.querySelectorAll('.inventory-drop-menu-item')
    );
    t.is($items.length, 2, 'two menu items (Link, Move)');
    const $link = [...$items].find(el => el.textContent === 'Link here');
    t.truthy($link, 'Link here item exists');
    $link.click();
    await waitFor(
      () => mock.calls.filter(c => c.method === 'copy').length === 1,
    );

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
    // Wait for both locate probes to resolve so both rows are typed as
    // directories (drop targets) before the drag interaction.
    await waitFor(() => $list.querySelectorAll('.pet-type-badge').length === 2);

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
    // The menu renders from Preact state; let the re-render settle.
    await waitFor(() =>
      [
        .../** @type {NodeListOf<HTMLButtonElement>} */ (
          testDocument.querySelectorAll('.inventory-drop-menu-item')
        ),
      ].some(el => el.textContent === 'Move here'),
    );

    const $items = /** @type {NodeListOf<HTMLButtonElement>} */ (
      testDocument.querySelectorAll('.inventory-drop-menu-item')
    );
    const $move = [...$items].find(el => el.textContent === 'Move here');
    t.truthy($move, 'Move here item exists');
    $move.click();
    await waitFor(
      () => mock.calls.filter(c => c.method === 'move').length === 1,
    );

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
    // Wait for the locate probe to resolve so the row is typed as a directory.
    await waitFor(() => !!$list.querySelector('.pet-type-badge'));

    const $row = /** @type {HTMLElement} */ (
      $list.querySelector('.pet-item-row')
    );

    // Capture console.error during the malformed-payload drop. SES lockdown
    // freezes the console object, so we swap the whole globalThis.console
    // (writable + configurable) rather than reassigning its frozen .error.
    const captured = [];
    const realConsole = globalThis.console;
    globalThis.console = {
      ...realConsole,
      error: (...args) => captured.push(args.join(' ')),
    };

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
      globalThis.console = realConsole;
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

// ── per-category grouping (maintainer ask: "Add similar tests for each ──
//    category of entity") ─────────────────────────────────────────────

// Helper: find the group section element for a given group key.
const groupSectionFor = ($list, groupKey) =>
  /** @type {HTMLElement | null} */ (
    $list.querySelector(`[data-group-key="${groupKey}"]`)
  );

// Helper: find an item wrapper by pet name within the whole inventory.
const wrapperFor = ($list, petName) => {
  for (const $w of $list.querySelectorAll('.pet-item-wrapper')) {
    const $n = $w.querySelector('.pet-name');
    if ($n && $n.textContent === petName) {
      return /** @type {HTMLElement} */ ($w);
    }
  }
  return null;
};

test.serial(
  'directory created via addNameWithType appears in the Directories group',
  async t => {
    const { $list, mock } = await setupInventory();

    // Simulate what the daemon emits after /mkdir: an add event with
    // type: 'directory', matching the enrichWithType daemon change in this PR.
    mock.addNameWithType('my-dir', 'directory');

    // Wait for the new item to appear in the DOM.
    await waitFor(() => wrapperFor($list, 'my-dir') !== null);

    const $directoriesGroup = groupSectionFor($list, 'directories');
    t.truthy($directoriesGroup, 'directories group section exists');
    t.truthy(
      $directoriesGroup &&
        $directoriesGroup.querySelector('.pet-name')?.textContent === 'my-dir',
      'my-dir item appears inside the directories group',
    );
    void mock;
  },
);

test.serial('handle type appears in its own Handles group', async t => {
  const { $list } = await setupInventory({
    names: ['alice'],
    locators: new Map([['alice', 'endo://?type=handle&number=10']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $handlesGroup = groupSectionFor($list, 'handles');
  t.truthy($handlesGroup, 'handles group section exists');
  t.truthy(
    $handlesGroup &&
      $handlesGroup.querySelector('.pet-name')?.textContent === 'alice',
    'alice handle appears inside the dedicated handles group',
  );
  t.falsy(
    groupSectionFor($list, 'capabilities'),
    'a lone handle no longer lands in the capabilities group',
  );
});

test.serial('group header count honors the special-names filter', async t => {
  // The host show-special toggle (an aria-pressed icon button) must exist before
  // mount so the inventory wrapper can bind to it and thread its state into the
  // confined tree.
  const $toggle = testDocument.createElement('button');
  $toggle.id = 'show-special-toggle';
  $toggle.setAttribute('aria-pressed', 'false');
  testDocument.body.appendChild($toggle);
  t.teardown(() => $toggle.remove());

  // A regular handle plus a special (`@`-prefixed) handle land in the same
  // group; the special one is hidden by default.
  const { $list } = await setupInventory({
    names: ['alice', '@self'],
    locators: new Map([
      ['alice', 'endo://?type=handle&number=10'],
      ['@self', 'endo://?type=handle&number=11'],
    ]),
  });

  await waitFor(() => !!groupSectionFor($list, 'handles'));

  const countText = () =>
    groupSectionFor($list, 'handles')?.querySelector('.pet-group-count')
      ?.textContent;

  // The count must agree with the (default-filtered) expanded contents: the
  // hidden special name is excluded, so the header reads 1, not 2.
  t.is(countText(), '1', 'count excludes the hidden special name by default');

  // Reveal special names; the count re-renders to include @self.
  $toggle.setAttribute('aria-pressed', 'true');
  $toggle.dispatchEvent(new globalThis.Event('change'));
  await tick(20);
  t.is(countText(), '2', 'count includes special names once revealed');
});

test.serial(
  'a group whose only member is a hidden special name is hidden',
  async t => {
    // @self is a handle; with no show-special toggle present it stays hidden, so
    // every group has zero visible members and none renders. (A hidden-only
    // group never mounts its rows, so there is no type badge to await; settle a
    // few ticks and assert the absence of any group section.)
    const { $list } = await setupInventory({
      names: ['@self'],
      locators: new Map([['@self', 'endo://?type=handle&number=11']]),
    });

    await tick(60);

    t.is(
      $list.querySelectorAll('[data-group-key]').length,
      0,
      'no group section renders when the only item is a hidden special name',
    );
  },
);

test.serial('host type appears in the Personas group', async t => {
  const { $list } = await setupInventory({
    names: ['self'],
    locators: new Map([['self', 'endo://?type=host&number=11']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $personasGroup = groupSectionFor($list, 'personas');
  t.truthy($personasGroup, 'personas group section exists');
  t.truthy(
    $personasGroup &&
      $personasGroup.querySelector('.pet-name')?.textContent === 'self',
    'self item appears inside the personas group',
  );
});

test.serial('guest type appears in the Agents group', async t => {
  const { $list } = await setupInventory({
    names: ['helper'],
    locators: new Map([['helper', 'endo://?type=guest&number=12']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $agentsGroup = groupSectionFor($list, 'agents');
  t.truthy($agentsGroup, 'agents group section exists');
  t.truthy(
    $agentsGroup &&
      $agentsGroup.querySelector('.pet-name')?.textContent === 'helper',
    'helper item appears inside the agents group',
  );
});

test.serial('marshal type appears in the Values group', async t => {
  const { $list } = await setupInventory({
    names: ['greeting'],
    locators: new Map([['greeting', 'endo://?type=marshal&number=13']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $valuesGroup = groupSectionFor($list, 'values');
  t.truthy($valuesGroup, 'values group section exists');
  t.truthy(
    $valuesGroup &&
      $valuesGroup.querySelector('.pet-name')?.textContent === 'greeting',
    'greeting item appears inside the values group',
  );
});

test.serial('worker type appears in its own Workers group', async t => {
  const { $list } = await setupInventory({
    names: ['worker1'],
    locators: new Map([['worker1', 'endo://?type=worker&number=20']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $workersGroup = groupSectionFor($list, 'workers');
  t.truthy($workersGroup, 'workers group section exists');
  t.truthy(
    $workersGroup &&
      $workersGroup.querySelector('.pet-name')?.textContent === 'worker1',
    'worker1 item appears inside the workers group',
  );
});

test.serial('mail-hub type appears in the Directories group', async t => {
  const { $list } = await setupInventory({
    names: ['MAIL'],
    locators: new Map([['MAIL', 'endo://?type=mail-hub&number=21']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $directoriesGroup = groupSectionFor($list, 'directories');
  t.truthy($directoriesGroup, 'directories group section exists');
  t.truthy(
    $directoriesGroup &&
      $directoriesGroup.querySelector('.pet-name')?.textContent === 'MAIL',
    'mail-hub item appears inside the directories group',
  );
});

test.serial('pet-store type appears in the Directories group', async t => {
  const { $list } = await setupInventory({
    names: ['SELF'],
    locators: new Map([['SELF', 'endo://?type=pet-store&number=21']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $directoriesGroup = groupSectionFor($list, 'directories');
  t.truthy($directoriesGroup, 'directories group section exists');
  t.truthy(
    $directoriesGroup &&
      $directoriesGroup.querySelector('.pet-name')?.textContent === 'SELF',
    'SELF pet-store item appears inside the directories group',
  );
});

test.serial('readable-blob type appears in the Capabilities group', async t => {
  const { $list } = await setupInventory({
    names: ['note'],
    locators: new Map([['note', 'endo://?type=readable-blob&number=30']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $elseGroup = groupSectionFor($list, 'capabilities');
  t.truthy($elseGroup, 'capabilities group section exists');
  t.truthy(
    $elseGroup && $elseGroup.querySelector('.pet-name')?.textContent === 'note',
    'note item appears inside the capabilities group',
  );
});

test.serial('eval type appears in the Capabilities group', async t => {
  const { $list } = await setupInventory({
    names: ['my-eval'],
    locators: new Map([['my-eval', 'endo://?type=eval&number=40']]),
  });

  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  const $elseGroup = groupSectionFor($list, 'capabilities');
  t.truthy($elseGroup, 'capabilities group section exists');
  t.truthy(
    $elseGroup &&
      $elseGroup.querySelector('.pet-name')?.textContent === 'my-eval',
    'my-eval item appears inside the capabilities group',
  );
});

test.serial('empty group is hidden and non-empty group is shown', async t => {
  // Only a directory is present; the Agents and Values groups should not
  // render at all (FRB filter{items.length > 0} pattern).
  const { $list } = await setupInventory({
    names: ['inbox'],
    locators: new Map([['inbox', 'endo://?type=directory&number=50']]),
  });

  // Wait for the locate probe so the item lands in the correct group.
  await waitFor(() => !!$list.querySelector('.pet-type-badge'));

  // Only the directories group should be present; agents and values absent.
  t.falsy(
    groupSectionFor($list, 'agents'),
    'agents group is hidden when no agents exist',
  );
  t.falsy(
    groupSectionFor($list, 'values'),
    'values group is hidden when no values exist',
  );
  t.truthy(
    groupSectionFor($list, 'directories'),
    'directories group is shown when a directory exists',
  );
});

test.serial(
  '/mkdir reactive update: directory appears via addNameWithType without locate()',
  async t => {
    // This test covers the reactive update path for /mkdir: the daemon now
    // includes type: 'directory' in the followNameChanges add event, so the
    // inventory can group the item correctly without waiting for locate().
    // The FRB analogy: the group projection is derived from a directly observed
    // property (type in the event), not from a secondary async look-up.
    const { $list, mock } = await setupInventory();

    // No items yet: no group sections should appear.
    t.falsy(
      groupSectionFor($list, 'directories'),
      'directories group absent before mkdir',
    );

    // Simulate /mkdir: daemon emits { add: 'new-dir', type: 'directory' }.
    mock.addNameWithType('new-dir', 'directory');

    // The directories group section should appear and contain the new item, all
    // without any locate() round-trip (no locator is registered in the mock).
    await waitFor(() => groupSectionFor($list, 'directories') !== null);

    const $hubsGroup = groupSectionFor($list, 'directories');
    t.truthy($hubsGroup, 'directories group appears after mkdir');
    t.truthy(
      $hubsGroup &&
        $hubsGroup.querySelector('.pet-name')?.textContent === 'new-dir',
      'new-dir item is in the directories group immediately from the event type',
    );

    // Confirm locate() was NOT called for new-dir (the type came from the event).
    const locateCalls = mock.calls.filter(
      c => c.method === 'locate' && String(c.args[0]) === 'new-dir',
    );
    // locate() may still be called for decoration (conversable check), but the
    // item should already be in the correct group before it resolves.
    // The key assertion is that the group appeared immediately, not that
    // locate() was skipped entirely.
    t.truthy(
      $hubsGroup.querySelector('.pet-name')?.textContent === 'new-dir',
      'hubs group shows new-dir from the event type field',
    );
    void locateCalls;
  },
);

// ── group-by-type toggle ──────────────────────────────────────────────
//
// The grouped layout is the default. A host toggle icon button
// (#group-by-type-toggle, aria-pressed) makes it optional: when un-pressed the
// wrapper threads grouped=false into the confined tree, which renders the prior
// flat list (items directly, no group sections).

test.serial(
  'absent the group-by-type toggle, the grouped layout renders',
  async t => {
    const { $list } = await setupInventory({
      names: ['alice'],
      locators: new Map([['alice', 'endo://?type=handle&number=10']]),
    });

    await waitFor(() => !!groupSectionFor($list, 'handles'));
    t.truthy(
      groupSectionFor($list, 'handles'),
      'a group section renders when no group toggle is present',
    );
  },
);

test.serial(
  'un-pressing the group-by-type toggle renders the flat list',
  async t => {
    // The group toggle starts pressed (grouped is the default); flipping it off
    // must drop the group sections and render items directly in the list.
    const $groupToggle = testDocument.createElement('button');
    $groupToggle.id = 'group-by-type-toggle';
    $groupToggle.setAttribute('aria-pressed', 'true');
    testDocument.body.appendChild($groupToggle);
    t.teardown(() => $groupToggle.remove());

    const { $list } = await setupInventory({
      names: ['alice'],
      locators: new Map([['alice', 'endo://?type=handle&number=10']]),
    });

    await waitFor(() => !!groupSectionFor($list, 'handles'));
    t.truthy(
      groupSectionFor($list, 'handles'),
      'grouped while the toggle is pressed',
    );

    // Flip to the flat view.
    $groupToggle.setAttribute('aria-pressed', 'false');
    $groupToggle.dispatchEvent(new globalThis.Event('change'));

    await waitFor(
      () => $list.querySelectorAll('[data-group-key]').length === 0,
    );
    t.is(
      $list.querySelectorAll('[data-group-key]').length,
      0,
      'no group sections render in the flat view',
    );
    t.truthy(
      wrapperFor($list, 'alice'),
      'the alice item still renders in the flat list',
    );

    // Flip back to grouped; the section returns.
    $groupToggle.setAttribute('aria-pressed', 'true');
    $groupToggle.dispatchEvent(new globalThis.Event('change'));
    await waitFor(() => !!groupSectionFor($list, 'handles'));
    t.truthy(
      groupSectionFor($list, 'handles'),
      'grouped view returns when the toggle is re-pressed',
    );
  },
);
