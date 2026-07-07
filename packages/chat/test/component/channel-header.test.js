// @ts-nocheck - Component test with happy-dom
/* global globalThis */

import '@endo/init/debug.js';

import test from 'ava';
import { Far } from '@endo/pass-style';
import { createChannelHeader } from '@endo/space-channel/channel-header.js';
import { createDOM, tick } from '../helpers/dom-setup.js';

// The channel header chrome, migrated from imperative DOM to a confined Preact
// component rendered through `renderConfined`. It composes the reused imperative
// heat SIMULATION (`heat-simulation.js`, a canvas + scenario buttons) as a HOST
// NODE bridged into a `data-heat-sim-anchor` slot after each render. This test
// exercises the confined chrome (menu, view-mode switch, members panel,
// attenuator modal), the host-node bridge, and the controller's `E()` calls
// against a mock channel / powers — no real daemon.

const {
  document: testDocument,
  window: testWindow,
  cleanup: cleanupDOM,
} = createDOM();

// Globals the component / renderConfined expect.
if (!globalThis.CSS) {
  globalThis.CSS = { escape: s => s };
}
// renderConfined and heat-simulation defer some idioms with
// requestAnimationFrame; dom-setup stubs setTimeout but not rAF, so provide a
// setTimeout-backed shim as a browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

// happy-dom does not implement window.prompt / window.alert; the controller
// calls them on the modal/link/invite paths. Record their interactions so the
// tests can assert without an interactive dialog. `prompt` returns a scripted
// value so the invite flow proceeds.
let promptResponses = [];
let promptCalls = [];
let alertCalls = [];
const resetDialogs = () => {
  promptResponses = [];
  promptCalls = [];
  alertCalls = [];
};
testWindow.prompt = (message, def) => {
  promptCalls.push({ message, def });
  return promptResponses.length > 0 ? promptResponses.shift() : null;
};
testWindow.alert = message => {
  alertCalls.push(message);
};

/**
 * Poll until `predicate()` is true (or a timeout elapses, in which case the
 * caller's assertion reports the real difference). Preact effect flushes and
 * the controller's async `E()` round-trips are async on slower runners, so a
 * fixed delay races; polling the actual condition is robust.
 *
 * @param {() => boolean} predicate
 * @param {{ timeout?: number, step?: number }} [opts]
 */
const waitFor = async (predicate, { timeout = 4000, step = 20 } = {}) => {
  await null; // safe-await-separator
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) return;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

/**
 * A controllable mock channel + powers recording every `E()` call.
 *
 * @param {object} [opts]
 * @param {MemberInfo[]} [opts.members]
 * @param {object | null} [opts.heatConfig]
 */
const makeMocks = ({ members = [], heatConfig = null } = {}) => {
  /** @type {Array<{ method: string, args: unknown[] }>} */
  const calls = [];

  const attenuator = Far('Attenuator', {
    getHeatConfig() {
      calls.push({ method: 'getHeatConfig', args: [] });
      if (heatConfig === null) {
        return Promise.reject(new Error('no config'));
      }
      return Promise.resolve(heatConfig);
    },
    setHeatConfig(config) {
      calls.push({ method: 'setHeatConfig', args: [config] });
      return Promise.resolve();
    },
    setInvitationValidity(valid) {
      calls.push({ method: 'setInvitationValidity', args: [valid] });
      return Promise.resolve();
    },
    temporaryBan(seconds) {
      calls.push({ method: 'temporaryBan', args: [seconds] });
      return Promise.resolve();
    },
  });

  const channel = Far('Channel', {
    createInvitation(name) {
      calls.push({ method: 'createInvitation', args: [name] });
      return Promise.resolve();
    },
    getMembers() {
      calls.push({ method: 'getMembers', args: [] });
      return Promise.resolve(members);
    },
    getAttenuator(invitedAs) {
      calls.push({ method: 'getAttenuator', args: [invitedAs] });
      return Promise.resolve(attenuator);
    },
  });

  const powers = Far('Powers', {
    locateWithHints(petName) {
      calls.push({ method: 'locateWithHints', args: [petName] });
      return Promise.resolve(`endo://localhost/?id=${petName}`);
    },
    locate(petName) {
      calls.push({ method: 'locate', args: [petName] });
      return Promise.resolve(`endo://localhost/?id=${petName}`);
    },
    send(...args) {
      calls.push({ method: 'send', args });
      return Promise.resolve();
    },
  });

  return { channel, powers, attenuator, calls };
};

/**
 * Mount the header exactly as chat.js does: createChannelHeader({ $container,
 * channel, powers, channelPetName, viewMode, onViewModeChange }).
 *
 * @param {object} [opts]
 */
const setup = (opts = {}) => {
  resetDialogs();
  testDocument.body.innerHTML = '';

  const $container = testDocument.createElement('div');
  $container.id = 'channel-header-actions';
  testDocument.body.appendChild($container);

  const { channel, powers, attenuator, calls } = makeMocks(opts);

  /** @type {string[]} */
  const viewModeChanges = [];

  const api = createChannelHeader({
    $container,
    channel,
    powers,
    channelPetName: opts.channelPetName ?? 'general',
    viewMode: opts.viewMode ?? 'chat',
    onViewModeChange: mode => viewModeChanges.push(mode),
  });

  const click = $el =>
    $el.dispatchEvent(new globalThis.Event('click', { bubbles: true }));

  return {
    $container,
    api,
    channel,
    powers,
    attenuator,
    calls,
    viewModeChanges,
    click,
  };
};

test.afterEach(() => {
  testDocument.body.innerHTML = '';
});

test.after(() => {
  cleanupDOM();
});

// ---- Menu button + dropdown ----

test.serial('renders a menu button into the container', async t => {
  const { $container } = setup();
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  t.truthy(
    $container.querySelector('.channel-menu-btn'),
    'menu button should be rendered',
  );
  t.falsy(
    $container.querySelector('.channel-menu'),
    'dropdown should be closed initially',
  );
});

test.serial('clicking the menu button toggles the dropdown', async t => {
  const { $container, click } = setup();
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));

  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));
  t.truthy($container.querySelector('.channel-menu'), 'dropdown should open');

  const items = $container.querySelectorAll('.channel-menu-item');
  t.true(
    items.length >= 6,
    `dropdown should have menu items, got ${items.length}`,
  );

  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !$container.querySelector('.channel-menu'));
  t.falsy($container.querySelector('.channel-menu'), 'dropdown should close');
});

test.serial('the active view mode item carries the active class', async t => {
  const { $container, click } = setup({ viewMode: 'forum' });
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));

  const $active = $container.querySelector('.view-mode-item.active');
  t.truthy($active, 'an active view mode item should exist');
  t.is(
    $active.dataset.action,
    'view-forum',
    'forum should be the active view mode',
  );
});

test.serial('selecting a view mode fires onViewModeChange', async t => {
  const { $container, click, viewModeChanges } = setup({ viewMode: 'chat' });
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));

  const $microblog = [...$container.querySelectorAll('.view-mode-item')].find(
    b => b.dataset.action === 'view-microblog',
  );
  t.truthy($microblog, 'microblog item should exist');
  click($microblog);

  await waitFor(() => viewModeChanges.length > 0);
  t.deepEqual(viewModeChanges, ['microblog'], 'should report the new mode');
  await waitFor(() => !$container.querySelector('.channel-menu'));
  t.falsy(
    $container.querySelector('.channel-menu'),
    'menu closes after switching',
  );
});

// ---- Invitation flow ----

test.serial(
  'Create Invitation calls createInvitation and opens delivery modal',
  async t => {
    const { $container, click, calls } = setup();
    promptResponses = ['Newcomer'];
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));

    const $invite = [...$container.querySelectorAll('.channel-menu-item')].find(
      b => b.dataset.action === 'invite',
    );
    t.truthy($invite, 'invite item should exist');
    click($invite);

    await waitFor(() => !!$container.querySelector('.invite-delivery-modal'));
    t.truthy(
      $container.querySelector('.invite-delivery-modal'),
      'delivery modal should open after creating the invitation',
    );
    t.true(
      calls.some(c => c.method === 'createInvitation'),
      'createInvitation should be called',
    );
    t.true(
      $container
        .querySelector('.invite-delivery-content h3')
        .textContent.includes('Newcomer'),
      'modal should name the invitee',
    );
  },
);

test.serial(
  'delivery modal Copy Link resolves a locator via powers',
  async t => {
    const { $container, click, calls } = setup();
    promptResponses = ['Newcomer'];
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));
    click(
      [...$container.querySelectorAll('.channel-menu-item')].find(
        b => b.dataset.action === 'invite',
      ),
    );
    await waitFor(() => !!$container.querySelector('.invite-delivery-modal'));

    click($container.querySelector('[data-action="link"]'));

    await waitFor(() => calls.some(c => c.method === 'locateWithHints'));
    t.true(
      calls.some(c => c.method === 'locateWithHints'),
      'should resolve a shareable locator',
    );
    await waitFor(() => !$container.querySelector('.invite-delivery-modal'));
    t.falsy(
      $container.querySelector('.invite-delivery-modal'),
      'modal closes after copying the link',
    );
  },
);

// ---- Members panel ----

const sampleMembers = [
  {
    proposedName: 'Alice',
    invitedAs: 'alice-invite',
    memberId: 'member-1',
    pedigree: [],
    active: true,
  },
  {
    proposedName: 'Bob',
    invitedAs: 'bob-invite',
    memberId: 'member-2',
    pedigree: ['Alice'],
    active: false,
  },
];

test.serial(
  'Manage Members opens the members panel listing invitations',
  async t => {
    const { $container, click } = setup({ members: sampleMembers });
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));

    click(
      [...$container.querySelectorAll('.channel-menu-item')].find(
        b => b.dataset.action === 'members',
      ),
    );

    await waitFor(() => !!$container.querySelector('.channel-members-panel'));
    const $entries = $container.querySelectorAll('.channel-member-entry');
    t.is($entries.length, 2, 'should list both invitations');
    t.true(
      $container
        .querySelector('.channel-members-panel')
        .textContent.includes('Alice'),
      'should show the first invitation name',
    );
    // The inactive member entry gets the disabled class.
    const $disabled = $container.querySelector(
      '.channel-member-entry.disabled',
    );
    t.truthy($disabled, 'inactive member should be marked disabled');
  },
);

test.serial('empty members panel shows the no-invitations message', async t => {
  const { $container, click } = setup({ members: [] });
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));
  click(
    [...$container.querySelectorAll('.channel-menu-item')].find(
      b => b.dataset.action === 'members',
    ),
  );

  await waitFor(() => !!$container.querySelector('.channel-members-panel'));
  const $empty = $container.querySelector('.channel-members-empty');
  t.truthy($empty, 'should show empty state');
  t.true(
    $empty.textContent.includes('No invitations'),
    'should say no invitations',
  );
});

test.serial(
  'closing the members panel returns to the menu button only',
  async t => {
    const { $container, click } = setup({ members: sampleMembers });
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));
    click(
      [...$container.querySelectorAll('.channel-menu-item')].find(
        b => b.dataset.action === 'members',
      ),
    );
    await waitFor(() => !!$container.querySelector('.channel-members-panel'));

    click($container.querySelector('.channel-members-close'));
    await waitFor(() => !$container.querySelector('.channel-members-panel'));
    t.falsy(
      $container.querySelector('.channel-members-panel'),
      'panel should close',
    );
    t.truthy(
      $container.querySelector('.channel-menu-btn'),
      'menu button should remain',
    );
  },
);

// ---- Attenuator modal + heat simulation host-node bridge ----

test.serial('Manage opens the attenuator modal with heat sliders', async t => {
  const { $container, click } = setup({
    members: sampleMembers,
    heatConfig: {
      burstLimit: 12,
      sustainedRate: 25,
      lockoutDurationMs: 15_000,
      postLockoutPct: 50,
    },
  });
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));
  click(
    [...$container.querySelectorAll('.channel-menu-item')].find(
      b => b.dataset.action === 'members',
    ),
  );
  await waitFor(() => !!$container.querySelector('.channel-member-entry'));

  const $manage = $container.querySelector('.member-manage-btn');
  t.truthy($manage, 'a manage button should exist');
  click($manage);

  await waitFor(() => !!$container.querySelector('.channel-attenuator-modal'));
  t.truthy(
    $container.querySelector('.channel-attenuator-modal'),
    'attenuator modal should open',
  );
  // The heading names the invitation.
  t.true(
    $container
      .querySelector('.channel-attenuator-header h3')
      .textContent.includes('alice-invite'),
    'heading names the invitation',
  );
  // The four heat sliders render.
  t.truthy($container.querySelector('.heat-burst-slider'), 'burst slider');
  t.truthy(
    $container.querySelector('.heat-sustained-slider'),
    'sustained slider',
  );
  t.truthy($container.querySelector('.heat-lockout-slider'), 'lockout slider');
  // Existing config seeds the readout.
  t.is(
    $container.querySelector('.heat-burst-val').textContent,
    '12',
    'burst readout reflects existing config',
  );
});

test.serial('heat simulation host node is bridged into the anchor', async t => {
  const { $container, click } = setup({
    members: sampleMembers,
    heatConfig: {
      burstLimit: 10,
      sustainedRate: 30,
      lockoutDurationMs: 10_000,
      postLockoutPct: 40,
    },
  });
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));
  click(
    [...$container.querySelectorAll('.channel-menu-item')].find(
      b => b.dataset.action === 'members',
    ),
  );
  await waitFor(() => !!$container.querySelector('.channel-member-entry'));
  click($container.querySelector('.member-manage-btn'));

  await waitFor(() => !!$container.querySelector('.channel-attenuator-modal'));
  // The imperative heat-simulation wrapper is re-parented into the anchor.
  await waitFor(
    () => !!$container.querySelector('.heat-sim-container .heat-sim-wrapper'),
  );
  t.truthy(
    $container.querySelector('.heat-sim-container .heat-sim-wrapper'),
    'heat simulation host node should be bridged into its anchor',
  );
  t.truthy(
    $container.querySelector('.heat-sim-wrapper .heat-sim-canvas'),
    'simulation canvas should be present',
  );
});

test.serial(
  'moving a heat slider persists config via the attenuator',
  async t => {
    const { $container, click, calls } = setup({
      members: sampleMembers,
      heatConfig: {
        burstLimit: 10,
        sustainedRate: 30,
        lockoutDurationMs: 10_000,
        postLockoutPct: 40,
      },
    });
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));
    click(
      [...$container.querySelectorAll('.channel-menu-item')].find(
        b => b.dataset.action === 'members',
      ),
    );
    await waitFor(() => !!$container.querySelector('.channel-member-entry'));
    click($container.querySelector('.member-manage-btn'));
    await waitFor(() => !!$container.querySelector('.heat-burst-slider'));

    const $burst = $container.querySelector('.heat-burst-slider');
    $burst.value = '20';
    $burst.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

    // The readout updates synchronously on re-render.
    await waitFor(
      () => $container.querySelector('.heat-burst-val').textContent === '20',
    );
    t.is(
      $container.querySelector('.heat-burst-val').textContent,
      '20',
      'burst readout should update',
    );

    // setHeatConfig is debounced (300ms); wait for it.
    await waitFor(() => calls.some(c => c.method === 'setHeatConfig'));
    const saved = calls.filter(c => c.method === 'setHeatConfig').pop();
    t.is(
      saved.args[0].burstLimit,
      20,
      'persisted config carries the new value',
    );
  },
);

test.serial(
  'toggling the enable checkbox calls setInvitationValidity',
  async t => {
    const { $container, click, calls } = setup({
      members: sampleMembers,
      heatConfig: {
        burstLimit: 10,
        sustainedRate: 30,
        lockoutDurationMs: 10_000,
        postLockoutPct: 40,
      },
    });
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));
    click(
      [...$container.querySelectorAll('.channel-menu-item')].find(
        b => b.dataset.action === 'members',
      ),
    );
    await waitFor(() => !!$container.querySelector('.channel-member-entry'));
    click($container.querySelector('.member-manage-btn'));
    await waitFor(() => !!$container.querySelector('.attenuator-valid'));

    const $checkbox = $container.querySelector('.attenuator-valid');
    $checkbox.checked = false;
    $checkbox.dispatchEvent(new globalThis.Event('change', { bubbles: true }));

    await waitFor(() => calls.some(c => c.method === 'setInvitationValidity'));
    const call = calls.find(c => c.method === 'setInvitationValidity');
    t.is(call.args[0], false, 'should push the new validity to the attenuator');
  },
);

test.serial(
  'Apply Ban calls temporaryBan with the entered duration',
  async t => {
    const { $container, click, calls } = setup({
      members: sampleMembers,
      heatConfig: {
        burstLimit: 10,
        sustainedRate: 30,
        lockoutDurationMs: 10_000,
        postLockoutPct: 40,
      },
    });
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    click($container.querySelector('.channel-menu-btn'));
    await waitFor(() => !!$container.querySelector('.channel-menu'));
    click(
      [...$container.querySelectorAll('.channel-menu-item')].find(
        b => b.dataset.action === 'members',
      ),
    );
    await waitFor(() => !!$container.querySelector('.channel-member-entry'));
    click($container.querySelector('.member-manage-btn'));
    await waitFor(() => !!$container.querySelector('.attenuator-ban-duration'));

    const $dur = $container.querySelector('.attenuator-ban-duration');
    $dur.value = '120';
    $dur.dispatchEvent(new globalThis.Event('input', { bubbles: true }));

    click($container.querySelector('.attenuator-ban-btn'));

    await waitFor(() => calls.some(c => c.method === 'temporaryBan'));
    const call = calls.find(c => c.method === 'temporaryBan');
    t.is(call.args[0], 120, 'should ban for the entered number of seconds');
  },
);

test.serial('closing the attenuator returns to the members panel', async t => {
  const { $container, click } = setup({
    members: sampleMembers,
    heatConfig: {
      burstLimit: 10,
      sustainedRate: 30,
      lockoutDurationMs: 10_000,
      postLockoutPct: 40,
    },
  });
  await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
  click($container.querySelector('.channel-menu-btn'));
  await waitFor(() => !!$container.querySelector('.channel-menu'));
  click(
    [...$container.querySelectorAll('.channel-menu-item')].find(
      b => b.dataset.action === 'members',
    ),
  );
  await waitFor(() => !!$container.querySelector('.channel-member-entry'));
  click($container.querySelector('.member-manage-btn'));
  await waitFor(() => !!$container.querySelector('.channel-attenuator-modal'));

  click($container.querySelector('.channel-attenuator-close'));

  await waitFor(() => !!$container.querySelector('.channel-members-panel'));
  t.truthy(
    $container.querySelector('.channel-members-panel'),
    'should return to the members panel',
  );
  t.falsy(
    $container.querySelector('.channel-attenuator-modal'),
    'attenuator modal should be gone',
  );
});

// ---- Teardown ----

test.serial(
  'dispose clears the confined header from the container',
  async t => {
    const { $container, api } = setup();
    await waitFor(() => !!$container.querySelector('.channel-menu-btn'));
    t.truthy($container.querySelector('.channel-menu-btn'), 'mounted');

    api.dispose();
    t.falsy(
      $container.querySelector('.channel-menu-btn'),
      'header removed after dispose',
    );
  },
);
