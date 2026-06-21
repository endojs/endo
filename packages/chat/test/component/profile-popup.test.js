// @ts-nocheck - Component test with happy-dom

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import { createProfilePopup } from '../../profile-popup.js';

const { document: testDocument } = createDOM();

// Mount the profile popup into a bare container, matching how channel-utils.js
// and channel-component.js use it: createProfilePopup($container) then
// show({...})/hide().
const setupPopup = async () => {
  const $container = testDocument.createElement('div');
  $container.id = 'channel-profile-popup';
  testDocument.body.appendChild($container);

  const popup = createProfilePopup($container);

  // Let the root component's mount effect (which wires the controller setter)
  // settle. Generous because the first test pays SES/Preact warmup.
  await tick(80);
  return { $container, popup };
};

// A realistic argument shape matching both call sites.
const makeShowArgs = (overrides = {}) => {
  const assigned = [];
  const args = {
    proposedName: 'alice',
    pedigree: ['root', 'bob'],
    pedigreeMemberIds: ['id-root', 'id-bob'],
    nameMap: new Map([['id-bob', 'Bobby']]),
    yourName: '',
    onAssignName: name => assigned.push(name),
    anchorElement: testDocument.createElement('span'),
    ...overrides,
  };
  return { args, assigned };
};

test.serial('show renders the popup with the proposed name', async t => {
  const { $container, popup } = await setupPopup();
  const { args } = makeShowArgs();

  popup.show(args);
  await tick(20);

  const $popup = $container.querySelector('.profile-popup');
  t.truthy($popup, 'popup card rendered');
  t.is($container.style.display, 'flex', 'container shown');

  const $name = $container.querySelector('.profile-proposed-name');
  t.regex($name.textContent, /alice/, 'proposed name shown');

  const $field = $container.querySelector('.profile-field-value');
  t.is($field.textContent, 'alice', 'proposed name field value');

  t.teardown(() => popup.hide());
});

test.serial('pedigree renders assigned and proposed names', async t => {
  const { $container, popup } = await setupPopup();
  const { args } = makeShowArgs();

  popup.show(args);
  await tick(20);

  const $chain = $container.querySelector('.pedigree-chain');
  t.truthy($chain, 'invitation chain rendered');
  // root has no assigned name -> scare quotes; bob -> assigned "Bobby".
  t.regex($chain.textContent, /“root”/, 'unassigned pedigree entry in quotes');
  t.regex($chain.textContent, /Bobby/, 'assigned pedigree entry by pet name');
  t.regex($chain.textContent, /“alice”/, 'self entry at the end');

  const $named = $chain.querySelector('.pedigree-name.named');
  t.truthy($named, 'assigned entry has named class');

  t.teardown(() => popup.hide());
});

test.serial('empty pedigree renders the channel-creator marker', async t => {
  const { $container, popup } = await setupPopup();
  const { args } = makeShowArgs({ pedigree: [], pedigreeMemberIds: [] });

  popup.show(args);
  await tick(20);

  const $creator = $container.querySelector('.pedigree-creator');
  t.truthy($creator, 'creator marker rendered');
  t.regex($creator.textContent, /Channel Creator/);

  t.teardown(() => popup.hide());
});

test.serial('hide removes the popup and hides the container', async t => {
  const { $container, popup } = await setupPopup();
  const { args } = makeShowArgs();

  popup.show(args);
  await tick(20);
  t.truthy($container.querySelector('.profile-popup'), 'popup shown');

  popup.hide();
  await tick(20);
  t.falsy(
    $container.querySelector('.profile-popup'),
    'popup removed after hide',
  );
  t.is($container.style.display, 'none', 'container hidden');
});

test.serial('Save button fires onAssignName with the typed name', async t => {
  const { $container, popup } = await setupPopup();
  const { args, assigned } = makeShowArgs();

  popup.show(args);
  await tick(20);

  const $input = $container.querySelector('.profile-assign-name');
  t.truthy($input, 'assign-name input rendered');
  $input.value = 'Ally';
  $input.dispatchEvent(new testDocument.defaultView.Event('input'));
  await tick(10);

  const $save = $container.querySelector('.profile-save-btn');
  $save.click();
  await tick(20);

  t.deepEqual(assigned, ['Ally'], 'onAssignName called with trimmed name');
  t.falsy(
    $container.querySelector('.profile-popup'),
    'popup closes after save',
  );
});

test.serial('clicking the backdrop closes the popup', async t => {
  const { $container, popup } = await setupPopup();
  const { args, assigned } = makeShowArgs();

  popup.show(args);
  await tick(20);

  const $backdrop = $container.querySelector('.profile-popup-backdrop');
  t.truthy($backdrop, 'backdrop rendered');
  $backdrop.click();
  await tick(20);

  t.falsy(
    $container.querySelector('.profile-popup'),
    'popup closed via backdrop',
  );
  t.deepEqual(assigned, [], 'no name assigned on backdrop close');
});

test.serial('Escape closes the popup', async t => {
  const { $container, popup } = await setupPopup();
  const { args, assigned } = makeShowArgs();

  popup.show(args);
  await tick(20);

  // Escape is handled declaratively by a wrapper's onKeyDown (the keydown
  // bubbles up from the autofocused input), not a document-level listener.
  const $input = $container.querySelector('.profile-assign-name');
  t.truthy($input, 'name input rendered');
  $input.dispatchEvent(
    new testDocument.defaultView.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    }),
  );
  await tick(20);

  t.falsy(
    $container.querySelector('.profile-popup'),
    'popup closed via Escape',
  );
  t.deepEqual(assigned, [], 'no name assigned on Escape close');

  t.teardown(() => popup.hide());
});

test.serial('close button closes the popup', async t => {
  const { $container, popup } = await setupPopup();
  const { args } = makeShowArgs();

  popup.show(args);
  await tick(20);

  const $close = $container.querySelector('.profile-popup-close');
  t.truthy($close, 'close button rendered');
  $close.click();
  await tick(20);

  t.falsy(
    $container.querySelector('.profile-popup'),
    'popup closed via close button',
  );

  t.teardown(() => popup.hide());
});
