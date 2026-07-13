// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makeInMemoryFilesystem } from '@endo/platform/fs/extended';

import { make } from '../src/index.js';

const ALLOWED = 'https://api.example.com';
const ALLOWED_URL = `${ALLOWED}/data`;
const OTHER = 'https://other.example.com';
const OTHER_URL = `${OTHER}/data`;

const makeFakeFetch = (body = 'ok') => {
  const fetch = async (url, _options = {}) => {
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
  return { fetch };
};

/**
 * Build the agent-shaped `powers` the plugin resolves by name: a store-root
 * directory and an optional policy authority. A name the map omits throws, so
 * the plugin's optional lookup degrades gracefully.
 *
 * @param {{ policyAuthority?: any }} [options]
 */
const makePowers = async ({ policyAuthority } = {}) => {
  const fs = makeInMemoryFilesystem();
  const root = await E(fs).root();
  const storeRoot = await E(root).makeDirectory('fetch-store', {});

  const powers = Far('Powers', {
    /** @param {string} name */
    lookup(name) {
      if (name === 'fetch-store') return storeRoot;
      if (name === 'fetch-policy-authority') {
        if (policyAuthority) return policyAuthority;
        throw Error('no policy authority granted');
      }
      throw Error(`unknown power ${name}`);
    },
  });
  return { powers };
};

test('make() returns a FetchService handing out the two facets', async t => {
  const { powers } = await makePowers();
  const { fetch } = makeFakeFetch('hi');

  const service = await make(powers, undefined, {
    env: { allowedOrigins: `${ALLOWED}, ${OTHER}`, maxResponseBytes: '4096' },
    fetch,
  });

  const client = await E(service).client();
  const control = await E(service).control();
  t.truthy(client);
  t.truthy(control);

  const inspected = control.inspect();
  t.deepEqual([...inspected.allowedOrigins].sort(), [ALLOWED, OTHER].sort());
  t.is(inspected.maxResponseBytes, 4096);

  const response = await client.fetch(ALLOWED_URL);
  t.is(response.status(), 200);
  t.is(await response.text(), 'hi');
});

test('make() runs strict without a policy authority (unknown origins fail closed)', async t => {
  const { powers } = await makePowers();
  const { fetch } = makeFakeFetch();

  const service = await make(powers, undefined, {
    env: { allowedOrigins: ALLOWED, policyMode: 'tofu-prompt' },
    fetch,
  });
  const client = await E(service).client();

  // No authority was granted, so a prompt-mode decision on an unknown origin
  // fails closed rather than reaching a (missing) authority.
  await t.throwsAsync(() => client.fetch(OTHER_URL), {
    message: /requires a policy authority|Policy refuses|not in the allowed-origin/,
  });
});

test('make() resolves a granted policy authority and pins an approved origin', async t => {
  const authority = Far('PolicyAuthority', {
    decide: _request => harden({ decision: 'allow', decidedBy: 'test' }),
  });
  const { powers } = await makePowers({ policyAuthority: authority });
  const { fetch } = makeFakeFetch();

  const service = await make(powers, undefined, {
    env: { policyMode: 'tofu-prompt' },
    fetch,
  });
  const client = await E(service).client();
  const control = await E(service).control();

  const response = await client.fetch(OTHER_URL);
  t.is(response.status(), 200);
  const bindings = control.listBindings();
  t.is(bindings.length, 1);
  t.is(bindings[0].target, OTHER);
  t.is(bindings[0].state, 'Pinned-Allow');
});

test('make() rejects a malformed env limit', async t => {
  const { powers } = await makePowers();
  await t.throwsAsync(
    () => make(powers, undefined, { env: { maxResponseBytes: 'lots' } }),
    { message: /maxResponseBytes must be a positive integer/ },
  );
});
