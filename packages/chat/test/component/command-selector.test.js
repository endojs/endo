// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { commandSelectorComponent } from '../../command-selector.js';

const { document: testDocument } = createDOM();

// Mount the command selector exactly how chat-bar-component.js does:
// commandSelectorComponent({ $menu, onSelect, onCancel, getContext }). The
// $menu is the external container the host owns; the selector renders its
// dropdown body confined into it and toggles the container's `.visible` class
// imperatively. Navigation is driven through the returned API, mirroring the
// host's input keydown handler.
const setupSelector = async (overrides = {}) => {
  const $menu = testDocument.createElement('div');
  $menu.className = 'token-menu';
  $menu.id = 'command-menu';
  testDocument.body.appendChild($menu);

  const selected = [];
  const cancels = [];
  const options = {
    $menu,
    onSelect: name => selected.push(name),
    onCancel: () => cancels.push(true),
    getContext: () => 'inbox',
    ...overrides,
  };

  const selector = commandSelectorComponent(options);

  // Let the root component's mount effect (which wires the controller setter)
  // settle. Generous because the first test pays SES/Preact warmup.
  await tick(80);

  return { $menu, selector, selected, cancels };
};

test.serial('show renders the command list and the hint footer', async t => {
  const { $menu, selector } = await setupSelector();

  selector.show();
  await tick(20);

  t.true(selector.isVisible(), 'selector reports visible');
  t.true($menu.classList.contains('visible'), 'container has visible class');

  const $items = $menu.querySelectorAll('.token-menu-item');
  t.true($items.length > 0, 'command rows rendered');

  // First row is selected by default.
  const $first = $items[0];
  t.true($first.classList.contains('selected'), 'first row selected initially');
  t.is(
    $first.querySelector('.token-prefix').textContent,
    '/',
    'row shows the slash prefix',
  );

  const $hint = $menu.querySelector('.token-menu-hint');
  t.truthy($hint, 'hint footer rendered');
  t.regex($hint.textContent, /navigate/, 'hint mentions navigate');
  t.true($hint.querySelectorAll('kbd').length >= 3, 'hint has kbd elements');

  t.teardown(() => selector.hide());
});

test.serial('filter narrows the command list', async t => {
  const { $menu, selector } = await setupSelector();

  selector.show();
  await tick(20);
  const totalCount = $menu.querySelectorAll('.token-menu-item').length;

  selector.filter('mk');
  await tick(20);

  const $items = $menu.querySelectorAll('.token-menu-item');
  t.true($items.length > 0, 'filtered rows present');
  t.true($items.length < totalCount, 'filter narrowed the list');
  for (const $item of $items) {
    // Each remaining row's name should start with the prefix.
    const name = $item.querySelector('span:nth-child(2)').textContent;
    t.true(name.startsWith('mk'), `row "${name}" matches prefix`);
  }

  // The currently selected command is one of the filtered ones.
  t.true(
    $menu.querySelectorAll('.token-menu-item').length > 0 &&
      selector.getSelected().startsWith('mk'),
    'selected command matches the filter',
  );

  t.teardown(() => selector.hide());
});

test.serial('filter with no matches shows the empty state', async t => {
  const { $menu, selector } = await setupSelector();

  selector.show();
  await tick(20);

  selector.filter('zzzznotacommand');
  await tick(20);

  t.is($menu.querySelectorAll('.token-menu-item').length, 0, 'no command rows');
  const $empty = $menu.querySelector('.token-menu-empty');
  t.truthy($empty, 'empty-state rendered');
  t.is($empty.textContent, 'No matching commands', 'matching empty label');
  t.is(selector.getSelected(), null, 'nothing selected');

  t.teardown(() => selector.hide());
});

test.serial(
  'arrow-key navigation through the host bridge moves the selection',
  async t => {
    const { $menu, selector } = await setupSelector();

    // A fake host input that routes keydown to the selector API exactly as
    // chat-bar-component.js does, proving the API drives selection from real
    // keyboard events without any DOM node crossing into the confined tree.
    const $input = testDocument.createElement('div');
    $input.setAttribute('contenteditable', 'true');
    testDocument.body.appendChild($input);
    $input.addEventListener('keydown', event => {
      if (!selector.isVisible()) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          selector.selectNext();
          break;
        case 'ArrowUp':
          event.preventDefault();
          selector.selectPrev();
          break;
        case 'Enter':
          event.preventDefault();
          selector.confirmSelection();
          break;
        default:
          break;
      }
    });

    selector.show();
    await tick(20);

    const firstName = selector.getSelected();

    const dispatchKey = key =>
      $input.dispatchEvent(
        new testDocument.defaultView.KeyboardEvent('keydown', {
          key,
          bubbles: true,
        }),
      );

    dispatchKey('ArrowDown');
    await tick(20);
    const secondName = selector.getSelected();
    t.not(secondName, firstName, 'ArrowDown advanced the selection');

    // The selected class follows the new index.
    const $items = $menu.querySelectorAll('.token-menu-item');
    t.true(
      $items[1].classList.contains('selected'),
      'second row has selected class',
    );
    t.false(
      $items[0].classList.contains('selected'),
      'first row no longer selected',
    );

    dispatchKey('ArrowUp');
    await tick(20);
    t.is(selector.getSelected(), firstName, 'ArrowUp returned to first');

    t.teardown(() => selector.hide());
  },
);

test.serial(
  'Enter confirms the highlighted command via onSelect and closes',
  async t => {
    const { $menu, selector, selected } = await setupSelector();

    selector.show();
    await tick(20);

    selector.selectNext();
    await tick(20);
    const expected = selector.getSelected();
    t.truthy(expected, 'a command is highlighted');

    selector.confirmSelection();
    await tick(20);

    t.deepEqual(
      selected,
      [expected],
      'onSelect fired with the highlighted name',
    );
    t.false(selector.isVisible(), 'selector hidden after confirm');
    t.false(
      $menu.classList.contains('visible'),
      'container visible class removed',
    );
    t.is(
      $menu.querySelectorAll('.token-menu-item').length,
      0,
      'dropdown emptied after confirm',
    );
  },
);

test.serial('selectFirst and selectLast jump to the ends', async t => {
  const { selector } = await setupSelector();

  selector.show();
  await tick(20);
  const firstName = selector.getSelected();

  selector.selectLast();
  await tick(20);
  const lastName = selector.getSelected();
  t.not(lastName, firstName, 'selectLast moved off the first item');

  selector.selectFirst();
  await tick(20);
  t.is(selector.getSelected(), firstName, 'selectFirst returned to the top');

  t.teardown(() => selector.hide());
});

test.serial('clicking a row selects that command and closes', async t => {
  const { $menu, selector, selected } = await setupSelector();

  selector.show();
  await tick(20);

  const $items = $menu.querySelectorAll('.token-menu-item');
  const $target = $items[2];
  const targetName = $target.querySelector('span:nth-child(2)').textContent;

  $target.click();
  await tick(20);

  t.deepEqual(selected, [targetName], 'onSelect fired with the clicked name');
  t.false(selector.isVisible(), 'selector hidden after click');

  t.teardown(() => selector.hide());
});

test.serial('hide closes the menu and empties the dropdown', async t => {
  const { $menu, selector } = await setupSelector();

  selector.show();
  await tick(20);
  t.true(
    $menu.querySelectorAll('.token-menu-item').length > 0,
    'rows present while shown',
  );

  selector.hide();
  await tick(20);

  t.false(selector.isVisible(), 'not visible after hide');
  t.false($menu.classList.contains('visible'), 'visible class removed');
  t.is(
    $menu.querySelectorAll('.token-menu-item').length,
    0,
    'dropdown emptied after hide',
  );
});

test.serial(
  'getContext filters out commands not available in the context',
  async t => {
    // In the channel context, inbox-only commands (e.g. /request) are hidden
    // and channel-only commands (e.g. /dm) appear.
    const { $menu, selector } = await setupSelector({
      getContext: () => 'channel',
    });

    selector.show();
    await tick(20);

    const names = [...$menu.querySelectorAll('.token-menu-item')].map(
      $item => $item.querySelector('span:nth-child(2)').textContent,
    );
    t.true(names.includes('dm'), 'channel-only command present');
    t.false(names.includes('request'), 'inbox-only command hidden');

    t.teardown(() => selector.hide());
  },
);
