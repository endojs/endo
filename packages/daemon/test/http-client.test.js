// @ts-check
/// <reference types="ses"/>

import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/far';
import { makeHttpClientAndControl } from '@endo/exo-http-client';

import { normalizeHttpClientPolicy } from '../src/host.js';

/**
 * Build a fake streaming `fetch` response mirroring the shape
 * `@endo/http-confine` consumes (`body.getReader()` yielding `Uint8Array`
 * chunks), so the daemon `http-client` maker's composition is exercised with no
 * real network — exactly as `shell.test.js` drives the shell maker over a temp
 * mount instead of the host process at large.
 *
 * @param {string} text
 * @param {{ status?: number, url?: string, headers?: Record<string, string> }} [options]
 */
const makeResponse = (
  text,
  { status = 200, url = 'https://api.example.com/data', headers = {} } = {},
) => {
  const bytes = new TextEncoder().encode(text);
  return harden({
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    ok: status >= 200 && status < 300,
    headers,
    url,
    body: harden({
      getReader: () => {
        let done = false;
        return harden({
          read: async () => {
            if (done) {
              return harden({ done: true });
            }
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

/**
 * @param {{ body?: string, status?: number }} [options]
 */
const makeFakeFetch = ({ body = 'ok', status = 200 } = {}) => {
  /** @type {Array<{ url: string, options: unknown }>} */
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return makeResponse(body, { status, url: String(url) });
  };
  return { fetch, calls };
};

/**
 * Compose the `HttpClient` / `HttpClientControl` pair exactly as the daemon
 * `http-client` formula maker does (`makeHttpClientAndControl` with injected
 * `fetch` / `now` seams and the formula-owned policy), without booting a full
 * daemon.  The maker's own `globalThis.fetch` seam is swapped for `fetch` here
 * so the test stays hermetic.
 *
 * @param {import('../src/types.js').HttpClientPolicy} policy
 * @param {import('@endo/exo-http-client').FetchLike} fetch
 * @param {() => number} [now]
 */
const makeHttpClientLikeFormulaMaker = (policy, fetch, now = Date.now) =>
  makeHttpClientAndControl({
    fetch,
    now,
    allowedOrigins: harden([...policy.allowedOrigins]),
    maxRequestsPerMinute: policy.maxRequestsPerMinute,
    maxResponseBytes: policy.maxResponseBytes,
    policyMode: policy.policyMode,
  });

const basePolicy = normalizeHttpClientPolicy({
  allowedOrigins: ['https://api.example.com'],
});

test('normalizeHttpClientPolicy defaults strict mode and the exo limits', t => {
  t.deepEqual(basePolicy, {
    allowedOrigins: ['https://api.example.com'],
    maxRequestsPerMinute: 60,
    maxResponseBytes: 1024 * 1024,
    policyMode: 'strict',
  });
});

test('normalizeHttpClientPolicy rejects a policyMode that needs a live authority', t => {
  t.throws(
    () =>
      normalizeHttpClientPolicy({
        allowedOrigins: ['https://api.example.com'],
        policyMode: 'tofu-prompt',
      }),
    { message: /policyMode must be one of/ },
  );
});

test('normalizeHttpClientPolicy rejects a non-origin allowlist entry', t => {
  t.throws(
    () =>
      normalizeHttpClientPolicy({ allowedOrigins: ['https://ok.example', 42] }),
    { message: /allowedOrigins must be an array of non-empty origin strings/ },
  );
});

test('normalizeHttpClientPolicy rejects a path-bearing origin up front (would doom the formula at incarnation)', t => {
  t.throws(
    () =>
      normalizeHttpClientPolicy({
        allowedOrigins: ['https://api.example.com/v1'],
      }),
    { message: /must be exactly an http\(s\) origin/ },
  );
});

test('normalizeHttpClientPolicy rejects an off-scheme origin', t => {
  t.throws(
    () =>
      normalizeHttpClientPolicy({ allowedOrigins: ['ftp://files.example'] }),
    { message: /must be exactly an http\(s\) origin/ },
  );
});

test('normalizeHttpClientPolicy rejects an unsafe-integer limit the exo would reject', t => {
  t.throws(
    () =>
      normalizeHttpClientPolicy({
        allowedOrigins: ['https://api.example.com'],
        maxResponseBytes: Number.MAX_SAFE_INTEGER + 1,
      }),
    { message: /maxResponseBytes must be a positive safe integer/ },
  );
});

test('normalizeHttpClientPolicy accepts an origin with an explicit non-default port', t => {
  const policy = normalizeHttpClientPolicy({
    allowedOrigins: ['https://api.example.com:8443'],
  });
  t.deepEqual(policy.allowedOrigins, ['https://api.example.com:8443']);
});

test('provideHttpClient composition: a fetch to an allowlisted origin succeeds', async t => {
  const { fetch, calls } = makeFakeFetch({ body: '{"ok":true}' });
  const { client } = makeHttpClientLikeFormulaMaker(basePolicy, fetch);

  const response = await E(client).fetch('https://api.example.com/data', {
    method: 'POST',
    headers: { accept: 'application/json' },
  });
  t.is(await E(response).status(), 200);
  t.is(await E(response).text(), '{"ok":true}');
  t.deepEqual(await E(response).json(), { ok: true });
  t.is(calls.length, 1);
  t.is(calls[0].url, 'https://api.example.com/data');
});

test('provideHttpClient composition: an off-allowlist origin is refused (strict)', async t => {
  const { fetch, calls } = makeFakeFetch();
  const { client } = makeHttpClientLikeFormulaMaker(basePolicy, fetch);

  await t.throwsAsync(() => E(client).fetch('https://evil.example.com/x'));
  t.is(calls.length, 0, 'the refused request never reached the fetch seam');
});

test('provideHttpClient composition: control.inspect reveals the bounds, not the seam', async t => {
  const { fetch } = makeFakeFetch();
  const { control } = makeHttpClientLikeFormulaMaker(basePolicy, fetch);

  const revealed = await E(control).inspect();
  t.deepEqual(revealed, {
    allowedOrigins: ['https://api.example.com'],
    maxRequestsPerMinute: 60,
    maxResponseBytes: 1024 * 1024,
    policyMode: 'strict',
    revoked: false,
  });
  t.false(
    JSON.stringify(revealed).includes('fetch'),
    'the fetch seam did not leak through inspect',
  );
});

test('provideHttpClient composition: revoke stops further requests', async t => {
  const { fetch } = makeFakeFetch();
  const { client, control } = makeHttpClientLikeFormulaMaker(basePolicy, fetch);

  t.is(await E(control).isRevoked(), false);
  await E(control).revoke();
  t.is(await E(control).isRevoked(), true);
  await t.throwsAsync(() => E(client).fetch('https://api.example.com/data'), {
    message: /revoked/,
  });
});

test('provideHttpClient composition: the response-byte cap truncates a large body', async t => {
  const cappedPolicy = normalizeHttpClientPolicy({
    allowedOrigins: ['https://api.example.com'],
    maxResponseBytes: 4,
  });
  const { fetch } = makeFakeFetch({ body: 'abcdefghij' });
  const { client } = makeHttpClientLikeFormulaMaker(cappedPolicy, fetch);

  const response = await E(client).fetch('https://api.example.com/data');
  t.true(await E(response).truncated());
  t.is(await E(response).maxResponseBytes(), 4);
  t.is(await E(response).text(), 'abcd');
});

test('provideHttpClient composition: the rate limit is enforced per minute', async t => {
  let clock = 1_000_000;
  const now = () => clock;
  const throttledPolicy = normalizeHttpClientPolicy({
    allowedOrigins: ['https://api.example.com'],
    maxRequestsPerMinute: 1,
  });
  const { fetch } = makeFakeFetch();
  const { client } = makeHttpClientLikeFormulaMaker(
    throttledPolicy,
    fetch,
    now,
  );

  await E(client).fetch('https://api.example.com/a');
  await t.throwsAsync(() => E(client).fetch('https://api.example.com/b'));
  // Advance past the one-minute window; the budget refills.
  clock += 61_000;
  const refilled = await E(client).fetch('https://api.example.com/c');
  t.is(await E(refilled).status(), 200);
});
