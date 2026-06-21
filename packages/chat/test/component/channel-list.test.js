// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick, waitFor } from '../helpers/dom-setup.js';
import { makeMockPowers } from '../helpers/mock-powers.js';
import { channelListComponent } from '../../channel-list.js';

const { document: testDocument } = createDOM();

// Mount the standalone channel list into a bare container and let its
// followNameChanges subscription + per-name locate probes settle.
const setupChannels = async (opts = {}) => {
  const $container = testDocument.createElement('div');
  $container.className = 'pet-list';
  testDocument.body.appendChild($container);

  const mock = makeMockPowers(opts.mock || {});
  const selected = [];
  const viewModes = [];

  const api = channelListComponent($container, mock.powers, {
    onSelectChannel: name => selected.push(name),
    onViewModeChange: mode => viewModes.push(mode),
    viewMode: 'chat',
    bookmarks: opts.bookmarks,
    onSelectBookmark: () => {},
    onRemoveBookmark: () => {},
    ...(opts.config || {}),
  });

  // Let the followNameChanges loop + per-name locate probes + Preact effects
  // settle. Generous because the first test pays SES/Preact warmup.
  await tick(80);
  return { $container, mock, selected, viewModes, api };
};

test.serial('only channel-typed names render as channel rows', async t => {
  const { $container } = await setupChannels({
    mock: {
      names: ['general', 'note'],
      locators: new Map([
        ['general', 'endo://?type=channel&number=1'],
        ['note', 'endo://?type=readable-blob&number=2'],
      ]),
    },
  });

  const rows = [...$container.querySelectorAll('.channel-list-row')];
  t.is(rows.length, 1, 'exactly one channel row (the non-channel is excluded)');
  t.regex(rows[0].textContent, /general/, 'the channel name is shown');
});

test.serial('clicking a channel name selects it', async t => {
  const { $container, selected } = await setupChannels({
    mock: {
      names: ['general'],
      locators: new Map([['general', 'endo://?type=channel&number=1']]),
    },
  });

  const $name = $container.querySelector('.channel-list-name');
  t.truthy($name, 'channel name rendered');
  $name.click();
  t.deepEqual(selected, ['general'], 'onSelectChannel fired with the name');
});

test.serial('the active channel gets the active class', async t => {
  const { $container } = await setupChannels({
    mock: {
      names: ['general'],
      locators: new Map([['general', 'endo://?type=channel&number=1']]),
    },
    config: { activeChannelPetName: 'general' },
  });

  const $row = $container.querySelector('.channel-list-row');
  t.true(
    $row.classList.contains('active'),
    'active channel row is highlighted',
  );
});

test.serial('setActiveChannel updates the highlight live', async t => {
  const { $container, api } = await setupChannels({
    mock: {
      names: ['a', 'b'],
      locators: new Map([
        ['a', 'endo://?type=channel&number=1'],
        ['b', 'endo://?type=channel&number=2'],
      ]),
    },
    config: { activeChannelPetName: 'a' },
  });

  api.setActiveChannel('b');
  await waitFor(() => {
    const active = [...$container.querySelectorAll('.channel-list-row')].filter(
      r => r.classList.contains('active'),
    );
    return active.length === 1 && /b/.test(active[0].textContent);
  });

  const rows = [...$container.querySelectorAll('.channel-list-row')];
  const active = rows.filter(r => r.classList.contains('active'));
  t.is(active.length, 1, 'exactly one active row');
  t.regex(active[0].textContent, /b/, 'the newly-selected channel is active');
});

test.serial('bookmarked threads render under their channel', async t => {
  const { $container } = await setupChannels({
    mock: {
      names: ['general'],
      locators: new Map([['general', 'endo://?type=channel&number=1']]),
    },
    bookmarks: [
      { key: '7', channelPetName: 'general', label: 'Pinned thread' },
    ],
  });

  const $bm = $container.querySelector('.channel-bookmark');
  t.truthy($bm, 'bookmark row rendered');
  t.regex(
    $bm.querySelector('.channel-bookmark-label').textContent,
    /Pinned thread/,
  );
});
