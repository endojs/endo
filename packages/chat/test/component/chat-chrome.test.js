// @ts-nocheck - Component test with happy-dom
/* global globalThis */

import '@endo/init/debug.js';

import test from 'ava';
import { createDOM, tick } from '../helpers/dom-setup.js';
import {
  renderProfileBar,
  mountMentionNotifyArea,
  mountInboxSection,
} from '../../chat-chrome.js';

const { document: testDocument, window: testWindow } = createDOM();

// renderConfined flushes effects across Preact's requestAnimationFrame-backed
// scheduler; dom-setup stubs setTimeout but not rAF. Back it with setTimeout,
// as a real browser would.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = fn =>
    globalThis.setTimeout(() => fn(0), 0);
  globalThis.cancelAnimationFrame = id => globalThis.clearTimeout(id);
}

/**
 * Poll until `predicate()` is truthy or a timeout elapses; renderConfined's
 * effects flush asynchronously, so a fixed delay races on slow runners.
 */
const waitFor = async (predicate, { timeout = 3000, step = 20 } = {}) => {
  const start = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() - start > timeout) return value;
    // eslint-disable-next-line no-await-in-loop
    await tick(step);
  }
};

const makeMount = () => {
  const $mount = testDocument.createElement('div');
  testDocument.body.appendChild($mount);
  return $mount;
};

// ---------------------------------------------------------------------------
// ProfileBar
// ---------------------------------------------------------------------------

test.serial('ProfileBar renders Home plus path crumbs', async t => {
  const $bar = makeMount();
  renderProfileBar($bar, ['alice', 'bob'], () => {});
  await waitFor(
    () => $bar.querySelectorAll('.profile-breadcrumb').length === 3,
  );

  const crumbs = [...$bar.querySelectorAll('.profile-breadcrumb')];
  t.deepEqual(
    crumbs.map(c => c.textContent),
    ['Home', 'alice', 'bob'],
  );
  // Only the last crumb is "current".
  t.is($bar.querySelectorAll('.profile-breadcrumb.current').length, 1);
  t.true(crumbs[2].classList.contains('current'));
  // Two separators between three crumbs.
  t.is($bar.querySelectorAll('.profile-separator').length, 2);
});

test.serial('ProfileBar marks Home current when path is empty', async t => {
  const $bar = makeMount();
  renderProfileBar($bar, [], () => {});
  await waitFor(() => !!$bar.querySelector('.profile-breadcrumb'));
  const home = $bar.querySelector('.profile-breadcrumb');
  t.is(home.textContent, 'Home');
  t.true(home.classList.contains('current'));
});

test.serial('ProfileBar click navigates to the crumb depth', async t => {
  const $bar = makeMount();
  const depths = [];
  renderProfileBar($bar, ['alice', 'bob'], depth => depths.push(depth));
  await waitFor(
    () => $bar.querySelectorAll('.profile-breadcrumb').length === 3,
  );

  const crumbs = [...$bar.querySelectorAll('.profile-breadcrumb')];
  crumbs[0].dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  crumbs[1].dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  crumbs[2].dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  t.deepEqual(depths, [0, 1, 2]);
});

test.serial('ProfileBar renders a malicious segment as text', async t => {
  const $bar = makeMount();
  const evil = '<img src=x onerror=alert(1)>';
  renderProfileBar($bar, [evil], () => {});
  await waitFor(
    () => $bar.querySelectorAll('.profile-breadcrumb').length === 2,
  );
  // No <img> smuggled into the DOM; the payload is escaped text.
  t.is($bar.querySelector('img'), null);
  t.is($bar.querySelectorAll('.profile-breadcrumb')[1].textContent, evil);
});

// ---------------------------------------------------------------------------
// Mention notify area
// ---------------------------------------------------------------------------

test.serial('mention invite prompt escapes the pet name', async t => {
  const $area = makeMount();
  const controller = mountMentionNotifyArea($area);
  await waitFor(() => !!controller.showInvitePrompt);

  const evil = '<img src=x onerror=alert(1)>';
  controller.showInvitePrompt({ petName: evil, onYes: async () => {} });
  await waitFor(() => !!$area.querySelector('.mention-notify-prompt'));

  t.is($area.querySelector('img'), null);
  t.is($area.querySelector('strong').textContent, `@${evil}`);
});

test.serial('mention invite "No" dismisses the prompt', async t => {
  const $area = makeMount();
  const controller = mountMentionNotifyArea($area);
  await waitFor(() => !!controller.showInvitePrompt);

  controller.showInvitePrompt({ petName: 'alice', onYes: async () => {} });
  await waitFor(() => !!$area.querySelector('.mention-notify-no'));

  $area
    .querySelector('.mention-notify-no')
    .dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  await waitFor(() => !$area.querySelector('.mention-notify-prompt'));
  t.is($area.querySelector('.mention-notify-prompt'), null);
});

test.serial(
  'mention invite "Yes" runs onYes and shows confirmation',
  async t => {
    const $area = makeMount();
    const controller = mountMentionNotifyArea($area);
    await waitFor(() => !!controller.showInvitePrompt);

    let called = 0;
    controller.showInvitePrompt({
      petName: 'alice',
      onYes: async () => {
        called += 1;
      },
    });
    await waitFor(() => !!$area.querySelector('.mention-notify-yes'));

    $area
      .querySelector('.mention-notify-yes')
      .dispatchEvent(new testWindow.Event('click', { bubbles: true }));

    await waitFor(() => !!$area.querySelector('.mention-notify-sent'));
    t.is(called, 1);
    t.regex(
      $area.querySelector('.mention-notify-sent').textContent,
      /Notification sent/,
    );
  },
);

test.serial('mention toast shows and its dismiss removes it', async t => {
  const $area = makeMount();
  const controller = mountMentionNotifyArea($area);
  await waitFor(() => !!controller.showToast);

  const dismiss = controller.showToast('alice');
  await waitFor(() => !!$area.querySelector('.mention-notify-sent'));
  t.regex($area.querySelector('.mention-notify-sent').textContent, /Notified/);

  dismiss();
  await waitFor(() => !$area.querySelector('.mention-notify-prompt'));
  t.is($area.querySelector('.mention-notify-prompt'), null);
});

// ---------------------------------------------------------------------------
// Inbox section
// ---------------------------------------------------------------------------

const noopHandlers = overrides => ({
  loadEntries: async () => ({ entries: [], totalCount: 0 }),
  onAdopt: async () => false,
  onJoin: async () => false,
  ...overrides,
});

test.serial('inbox starts collapsed and loads lazily on expand', async t => {
  const $mount = makeMount();
  let loads = 0;
  mountInboxSection(
    $mount,
    noopHandlers({
      loadEntries: async () => {
        loads += 1;
        return {
          totalCount: 1,
          entries: [{ number: 1n, text: 'hello', names: ['gift'] }],
        };
      },
    }),
  );
  await waitFor(() => !!$mount.querySelector('.sidebar-inbox-header'));

  // Collapsed: body hidden, not yet loaded.
  t.is(loads, 0);
  t.regex(
    $mount.querySelector('.sidebar-inbox-body').getAttribute('style') || '',
    /display:\s*none/,
  );

  $mount
    .querySelector('.sidebar-inbox-header')
    .dispatchEvent(new testWindow.Event('click', { bubbles: true }));

  await waitFor(() => !!$mount.querySelector('.inbox-adopt-btn'));
  t.is(loads, 1);
  t.is($mount.querySelector('.sidebar-inbox-text').textContent, 'hello');
  t.is($mount.querySelector('.inbox-adopt-btn').textContent, 'Adopt “gift”');
});

test.serial('inbox shows "no messages" vs "no adoptable" empties', async t => {
  const $a = makeMount();
  mountInboxSection($a, noopHandlers()); // totalCount 0
  await waitFor(() => !!$a.querySelector('.sidebar-inbox-header'));
  $a.querySelector('.sidebar-inbox-header').dispatchEvent(
    new testWindow.Event('click', { bubbles: true }),
  );
  await waitFor(() => !!$a.querySelector('.sidebar-inbox-empty'));
  t.is(
    $a.querySelector('.sidebar-inbox-empty').textContent,
    'No messages yet.',
  );

  const $b = makeMount();
  mountInboxSection(
    $b,
    noopHandlers({
      loadEntries: async () => ({ entries: [], totalCount: 5 }),
    }),
  );
  await waitFor(() => !!$b.querySelector('.sidebar-inbox-header'));
  $b.querySelector('.sidebar-inbox-header').dispatchEvent(
    new testWindow.Event('click', { bubbles: true }),
  );
  await waitFor(() => !!$b.querySelector('.sidebar-inbox-empty'));
  t.is(
    $b.querySelector('.sidebar-inbox-empty').textContent,
    'No adoptable values.',
  );
});

test.serial('inbox adopt callback reloads on success', async t => {
  const $mount = makeMount();
  let loads = 0;
  const adopted = [];
  mountInboxSection(
    $mount,
    noopHandlers({
      loadEntries: async () => {
        loads += 1;
        return {
          totalCount: 1,
          entries: [{ number: 7n, text: '', names: ['gift'] }],
        };
      },
      onAdopt: async (number, name) => {
        adopted.push([number, name]);
        return true; // signals a reload
      },
    }),
  );
  await waitFor(() => !!$mount.querySelector('.sidebar-inbox-header'));
  $mount
    .querySelector('.sidebar-inbox-header')
    .dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  await waitFor(() => !!$mount.querySelector('.inbox-adopt-btn'));
  t.is(loads, 1);

  $mount
    .querySelector('.inbox-adopt-btn')
    .dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  await waitFor(() => loads === 2);
  t.deepEqual(adopted, [[7n, 'gift']]);
  t.is(loads, 2);
});

test.serial('inbox entry text is rendered as text, not HTML', async t => {
  const $mount = makeMount();
  const evil = '<script>alert(1)</script>';
  mountInboxSection(
    $mount,
    noopHandlers({
      loadEntries: async () => ({
        totalCount: 1,
        entries: [{ number: 1n, text: evil, names: [] }],
      }),
    }),
  );
  await waitFor(() => !!$mount.querySelector('.sidebar-inbox-header'));
  $mount
    .querySelector('.sidebar-inbox-header')
    .dispatchEvent(new testWindow.Event('click', { bubbles: true }));
  await waitFor(() => !!$mount.querySelector('.sidebar-inbox-text'));
  t.is($mount.querySelector('script'), null);
  t.is($mount.querySelector('.sidebar-inbox-text').textContent, evil);
});
