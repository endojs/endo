// @ts-check

import '@endo/init/debug.js';

import test from 'ava';

import { E } from '@endo/eventual-send';

import { makeAppsNameHub, normalizeVirtualHostName } from '../index.js';

test('normalizeVirtualHostName lowercases', t => {
  t.is(normalizeVirtualHostName('Chat.Example.COM'), 'chat.example.com');
});

test('normalizeVirtualHostName strips a port', t => {
  // The Host header may carry a port; the routing table keys on
  // host name only.
  t.is(normalizeVirtualHostName('chat.example.com:8080'), 'chat.example.com');
});

test('normalizeVirtualHostName rejects an empty name', t => {
  t.throws(() => normalizeVirtualHostName(''), {
    message: /non-empty string/,
  });
});

test('normalizeVirtualHostName rejects invalid characters', t => {
  t.throws(() => normalizeVirtualHostName('chat example.com'), {
    message: /invalid characters/,
  });
  t.throws(() => normalizeVirtualHostName('chat/example.com'), {
    message: /invalid characters/,
  });
});

test('normalizeVirtualHostName rejects oversize hostnames', t => {
  const oversize = `${'a'.repeat(254)}.example.com`;
  t.throws(() => normalizeVirtualHostName(oversize), {
    message: /exceeds 253 octets/,
  });
});

test('AppsNameHub bind+lookup round-trips', async t => {
  const apps = makeAppsNameHub();
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  const id = await E(apps).lookup('chat.example.com');
  t.is(id, 'weblet-id-abc');
});

test('AppsNameHub lookup is case-insensitive', async t => {
  const apps = makeAppsNameHub();
  await E(apps).bind('Chat.Example.COM', 'weblet-id-abc');
  t.is(await E(apps).lookup('chat.example.com'), 'weblet-id-abc');
  t.is(await E(apps).lookup('CHAT.EXAMPLE.COM'), 'weblet-id-abc');
});

test('AppsNameHub lookup throws for an unbound name', async t => {
  const apps = makeAppsNameHub();
  await t.throwsAsync(() => E(apps).lookup('chat.example.com'), {
    message: /No virtual host bound for/,
  });
});

test('AppsNameHub has reflects the binding', async t => {
  const apps = makeAppsNameHub();
  const beforeBind = await E(apps).has('chat.example.com');
  t.false(beforeBind);
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  t.true(await E(apps).has('chat.example.com'));
  t.true(await E(apps).has('Chat.Example.COM'));
});

test('AppsNameHub unbind removes the entry', async t => {
  const apps = makeAppsNameHub();
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  await E(apps).unbind('chat.example.com');
  t.false(await E(apps).has('chat.example.com'));
  await t.throwsAsync(() => E(apps).lookup('chat.example.com'), {
    message: /No virtual host bound for/,
  });
});

test('AppsNameHub rejects rebind to a different id (first-bind-wins)', async t => {
  // Per the design's Open Question 3: first-bind-wins is the
  // default; the operator-allowlist override is a follow-on. If a
  // future refactor silently allows rebind to a different id,
  // this assertion fails.
  const apps = makeAppsNameHub();
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  await t.throwsAsync(() => E(apps).bind('chat.example.com', 'weblet-id-xyz'), {
    message: /already bound to .* \(first-bind-wins\)/,
  });
});

test('AppsNameHub allows rebind to the same id (idempotent)', async t => {
  // A repeated bind to the same formula id is a normal startup
  // shape (the host agent re-asserts its bindings on restart).
  const apps = makeAppsNameHub();
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  await E(apps).bind('chat.example.com', 'weblet-id-abc');
  t.is(await E(apps).lookup('chat.example.com'), 'weblet-id-abc');
});

test('AppsNameHub list enumerates current bindings', async t => {
  const apps = makeAppsNameHub();
  await E(apps).bind('chat.example.com', 'weblet-chat');
  await E(apps).bind('inbox.example.com', 'weblet-inbox');
  const entries = await E(apps).list();
  const names = entries.map(e => e.name).sort();
  t.deepEqual(names, ['chat.example.com', 'inbox.example.com']);
  const chat = entries.find(e => e.name === 'chat.example.com');
  t.is(chat && chat.webletFormulaId, 'weblet-chat');
});

test('AppsNameHub bind rejects a non-string weblet id', async t => {
  const apps = makeAppsNameHub();
  await t.throwsAsync(
    // @ts-expect-error intentional: testing input validation
    () => E(apps).bind('chat.example.com', 42),
    { message: /Must be a string/ },
  );
});

test('AppsNameHub bind rejects an empty weblet id', async t => {
  const apps = makeAppsNameHub();
  await t.throwsAsync(() => E(apps).bind('chat.example.com', ''), {
    message: /non-empty string/,
  });
});
