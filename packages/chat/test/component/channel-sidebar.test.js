// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { makeChannelSidebar } from '../../inventory/channel-sidebar.js';

const { document: testDocument } = createDOM();

// Build an inventory container with the header chrome the channel sidebar
// decorates (title + toggle), then mount the inventory in channel mode.
const setupChannels = async (opts = {}) => {
  const $parent = testDocument.createElement('div');
  $parent.className = 'inventory';
  const $header = testDocument.createElement('div');
  $header.className = 'inventory-header';
  const $title = testDocument.createElement('span');
  $title.className = 'inventory-title';
  $title.textContent = 'Inventory';
  const $toggle = testDocument.createElement('span');
  $toggle.className = 'inventory-toggle';
  $header.appendChild($title);
  $header.appendChild($toggle);
  const $list = testDocument.createElement('div');
  $list.className = 'pet-list';
  $parent.appendChild($header);
  $parent.appendChild($list);
  testDocument.body.appendChild($parent);

  const mock = makeMockPowers(opts.mock || {});
  const selected = [];

  const sidebar = makeChannelSidebar({
    powers: mock.powers,
    onSelectChannel: name => selected.push(name),
    onViewModeChange: () => {},
    viewMode: 'chat',
    bookmarks: opts.bookmarks,
    onSelectBookmark: () => {},
    onRemoveBookmark: () => {},
    ...(opts.config || {}),
  });

  const { inventoryComponent } = await import('../../inventory/inventory.js');
  inventoryComponent($parent, $header, mock.powers, {
    showValue: () => {},
    sidebar,
  });
  await tick(30);
  return { $parent, $header, $list, mock, selected };
};

test.serial('channel mode renders New and Join header buttons', async t => {
  const { $header } = await setupChannels({
    mock: {
      names: ['general'],
      locators: new Map([['general', 'endo://?type=channel&number=1']]),
    },
  });
  const btns = [...$header.querySelectorAll('.channel-action-btn')].map(
    b => b.textContent,
  );
  t.deepEqual(btns, ['New', 'Join'], 'New and Join buttons present');
  t.is(
    $header.querySelector('.inventory-title').textContent,
    'Channels',
    'title set to Channels',
  );
});

test.serial('channel-typed items become selectable channel items', async t => {
  const { $list, selected } = await setupChannels({
    mock: {
      names: ['general', 'note'],
      locators: new Map([
        ['general', 'endo://?type=channel&number=1'],
        ['note', 'endo://?type=readable-blob&number=2'],
      ]),
    },
  });

  const $channel = $list.querySelector('.channel-item[data-name="general"]');
  t.truthy($channel, 'channel item rendered and visible');
  t.is($channel.style.display, '', 'channel item is shown');

  const $name = $channel.querySelector('.pet-name');
  t.true($name.classList.contains('selectable'), 'channel name is selectable');
  $name.click();
  t.deepEqual(selected, ['general'], 'clicking the channel name selects it');

  // Non-channel items stay hidden in channel mode.
  const $note = $list.querySelector('.pet-item-wrapper:not(.channel-item)');
  t.is($note.style.display, 'none', 'non-channel item stays hidden');
});

test.serial('bookmarked threads render under their channel', async t => {
  const { $list } = await setupChannels({
    mock: {
      names: ['general'],
      locators: new Map([['general', 'endo://?type=channel&number=1']]),
    },
    bookmarks: [
      { key: '7', channelPetName: 'general', label: 'Pinned thread' },
    ],
  });
  const $bm = $list.querySelector('.bookmarked-thread-item');
  t.truthy($bm, 'bookmark item rendered');
  t.is($bm.dataset.channel, 'general');
  t.regex($bm.querySelector('.bookmark-label').textContent, /Pinned thread/);
});
