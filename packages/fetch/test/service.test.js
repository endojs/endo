// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { setTimeout } from 'node:timers';

import { E } from '@endo/eventual-send';
import { makeInMemoryFilesystem } from '@endo/platform/fs/extended';

import { makeFetchStore } from '../src/store.js';
import { makeFetchService } from '../src/service.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
/** Let the fire-and-forget persistence write-chain settle. */
const flush = () => delay(10);

const ALLOWED = 'https://api.example.com';
const ALLOWED_URL = `${ALLOWED}/data`;
const OTHER = 'https://other.example.com';
const OTHER_URL = `${OTHER}/data`;

/**
 * A fake `FetchLike` transport that echoes the requested URL and records calls.
 *
 * @param {string} [body]
 */
const makeFakeFetch = (body = 'ok') => {
  /** @type {string[]} */
  const calls = [];
  const fetch = async (url, _options = {}) => {
    calls.push(String(url));
    const bytes = new TextEncoder().encode(body);
    return harden({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: {},
      url: String(url),
      body: harden({
        getReader: () => {
          let done = false;
          return harden({
            read: async () => {
              if (done) return harden({ done: true });
              done = true;
              return harden({ done: false, value: bytes });
            },
            cancel: async () => {
              done = true;
            },
            releaseLock: () => {},
          });
        },
      }),
    });
  };
  return { fetch, calls };
};

/**
 * A store over a fresh in-memory filesystem, plus a `reopen` that builds a new
 * store adapter over the SAME directory - modelling a daemon restart that reads
 * the persisted documents back.
 */
const makeStoreFixture = async () => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const directory = await E(root).makeDirectory('fetch-store', {});
  let counter = 0;
  const makeId = async () => `${(counter += 1)}`;
  const open = () => makeFetchStore(directory, makeId);
  // `directory` is exposed so a test can seed a corrupt document directly,
  // modelling a torn write the crash-safe read guards must survive.
  return { open, directory };
};

test('client fetches an allowed origin, denies others, seeds the store', async t => {
  const { open } = await makeStoreFixture();
  const store = await open();
  const { fetch } = makeFakeFetch('hello');

  const { service, client, control } = await makeFetchService({
    store,
    fetch,
    now: () => 1000,
    allowedOrigins: [ALLOWED],
    maxResponseBytes: 1000,
  });

  t.is(await E(service).client(), client);
  t.is(await E(service).control(), control);

  const response = await client.fetch(ALLOWED_URL);
  t.is(response.status(), 200);
  t.is(await response.text(), 'hello');

  await t.throwsAsync(() => client.fetch(OTHER_URL), {
    message: /not in the allowed-origin list|Policy refuses/,
  });

  // The first-run seed wrote config.json.
  await flush();
  const config = await store.readConfig();
  t.deepEqual(config.allowedOrigins, [ALLOWED]);
  t.is(config.maxResponseBytes, 1000);
  t.is(config.revoked, false);
});

test('reconstitutes identical policy across a restart', async t => {
  const { open } = await makeStoreFixture();
  const { fetch } = makeFakeFetch();

  const first = await makeFetchService({
    store: await open(),
    fetch,
    now: () => 1000,
    allowedOrigins: [ALLOWED],
    maxResponseBytes: 1000,
  });
  // A control change becomes the authoritative state the store persists.
  first.control.addAllowedOrigin(OTHER);
  first.control.setMaxResponseBytes(2048);
  await flush();

  // Restart: a fresh service over the same store.
  const second = await makeFetchService({ store: await open(), fetch });
  const inspected = second.control.inspect();
  t.deepEqual([...inspected.allowedOrigins].sort(), [ALLOWED, OTHER].sort());
  t.is(inspected.maxResponseBytes, 2048);

  // The revived client can reach the origin added before the restart.
  const response = await second.client.fetch(OTHER_URL);
  t.is(response.status(), 200);
});

test('a service revoked before restart revives revoked', async t => {
  const { open } = await makeStoreFixture();
  const { fetch } = makeFakeFetch();

  const first = await makeFetchService({
    store: await open(),
    fetch,
    now: () => 1000,
    allowedOrigins: [ALLOWED],
  });
  first.control.revoke();
  await flush();

  const second = await makeFetchService({ store: await open(), fetch });
  t.true(second.control.isRevoked());
  await t.throwsAsync(() => second.client.fetch(ALLOWED_URL), {
    message: /revoked/,
  });
});

test('a trust-on-first-bind pin survives a restart and stays revocable', async t => {
  const { open } = await makeStoreFixture();
  const { fetch } = makeFakeFetch();

  const first = await makeFetchService({
    store: await open(),
    fetch,
    now: () => 1000,
    policyMode: 'tofu-auto',
  });
  // tofu-auto pins a first-seen origin as allow at request time.
  const response = await first.client.fetch(OTHER_URL);
  t.is(response.status(), 200);
  const firstBindings = first.control.listBindings();
  t.is(firstBindings.length, 1);
  t.is(firstBindings[0].target, OTHER);
  t.is(firstBindings[0].state, 'Pinned-Allow');
  await flush();

  // Restart: the pin is reconstituted from bindings.json.
  const second = await makeFetchService({ store: await open(), fetch });
  const revivedBindings = second.control.listBindings();
  t.is(revivedBindings.length, 1);
  t.is(revivedBindings[0].target, OTHER);
  t.is(revivedBindings[0].state, 'Pinned-Allow');
  // The pin is honoured without a fresh decision.
  const revived = await second.client.fetch(OTHER_URL);
  t.is(revived.status(), 200);

  // It remains revocable through the control facet, and the revocation is
  // durable across a further restart.
  second.control.revokeBinding(OTHER);
  await t.throwsAsync(() => second.client.fetch(OTHER_URL), {
    message: /Policy refuses|not in the allowed-origin/,
  });
  await flush();

  const third = await makeFetchService({ store: await open(), fetch });
  const thirdBindings = third.control.listBindings();
  t.is(thirdBindings.length, 1);
  t.is(thirdBindings[0].state, 'Revoked');
  await t.throwsAsync(() => third.client.fetch(OTHER_URL), {
    message: /Policy refuses|not in the allowed-origin/,
  });
});

test('the persisted store outranks a conflicting env on restart', async t => {
  const { open } = await makeStoreFixture();
  const { fetch } = makeFakeFetch();

  // First provisioning: env seeds allowedOrigins=[ALLOWED], maxResponseBytes=1000.
  await makeFetchService({
    store: await open(),
    fetch,
    now: () => 1000,
    allowedOrigins: [ALLOWED],
    maxResponseBytes: 1000,
  });
  await flush();

  // Restart with a CONFLICTING env: a different allowlist and a different byte
  // cap. The store - not env - is authoritative across restarts, so the
  // persisted values must win. This pins the ordering, not mere durability:
  // flipping the service's `pick` to env-first reddens exactly this assertion,
  // whereas the sibling reconstitution test (which restarts with no env) would
  // stay green.
  const second = await makeFetchService({
    store: await open(),
    fetch,
    now: () => 2000,
    allowedOrigins: [OTHER],
    maxResponseBytes: 4096,
  });
  const inspected = second.control.inspect();
  t.deepEqual([...inspected.allowedOrigins], [ALLOWED]);
  t.is(inspected.maxResponseBytes, 1000);

  // The revived client honours the persisted allowlist, not the env one.
  const response = await second.client.fetch(ALLOWED_URL);
  t.is(response.status(), 200);
  await t.throwsAsync(() => second.client.fetch(OTHER_URL), {
    message: /not in the allowed-origin list|Policy refuses/,
  });
});

test('a corrupt bindings.json degrades to no pins without bricking revival', async t => {
  const { open, directory } = await makeStoreFixture();
  const { fetch } = makeFakeFetch();

  // First provisioning pins a first-seen origin under tofu-auto.
  const first = await makeFetchService({
    store: await open(),
    fetch,
    now: () => 1000,
    policyMode: 'tofu-auto',
  });
  await first.client.fetch(OTHER_URL);
  t.is(first.control.listBindings().length, 1);
  await flush();

  // A torn write leaves bindings.json unparseable.
  await E(directory).write('bindings.json', '{ not valid json');

  // Revival must not brick: the read guard treats the corrupt document as absent
  // and the service comes up with no reconstituted pins (only its static
  // allowlist, which fails closed) rather than throwing out of makeFetchService.
  const second = await makeFetchService({ store: await open(), fetch });
  t.deepEqual(second.control.listBindings(), []);
});

test('a corrupt config.json degrades to the env policy without bricking revival', async t => {
  const { open, directory } = await makeStoreFixture();
  const { fetch } = makeFakeFetch();

  // First provisioning persists a tofu-auto policy with no static allowlist.
  await makeFetchService({
    store: await open(),
    fetch,
    now: () => 1000,
    policyMode: 'tofu-auto',
  });
  await flush();

  // A torn write leaves config.json unparseable.
  await E(directory).write('config.json', 'not-json');

  // Revival adopts the env initials (the corrupt store is treated as absent)
  // rather than throwing: a strict policy with a static allowlist, fail-closed
  // for every other origin.
  const second = await makeFetchService({
    store: await open(),
    fetch,
    allowedOrigins: [ALLOWED],
    policyMode: 'strict',
  });
  const inspected = second.control.inspect();
  t.deepEqual([...inspected.allowedOrigins], [ALLOWED]);
  t.is(inspected.policyMode, 'strict');

  const response = await second.client.fetch(ALLOWED_URL);
  t.is(response.status(), 200);
  await t.throwsAsync(() => second.client.fetch(OTHER_URL), {
    message: /not in the allowed-origin list|Policy refuses/,
  });
});
