// @ts-check
/* global AbortSignal */

import test from '@endo/ses-ava/prepare-endo.js';

import {
  HeaderRejectedError,
  MethodNotAllowedError,
  OriginNotAllowedError,
  RateLimitError,
  RevokedError,
  assertHeadersSafe,
  checkOriginAllowed,
  limitResponseBytes,
  makeHttpConfinement,
  makeRateLimiter,
  makeRequestSignal,
  normalizeMethod,
  parseAllowedOrigins,
  resolveRedirect,
} from '../src/http-confine.js';

/** @import { FetchLike } from '../src/types.js' */

/**
 * @param {Array<string | Uint8Array>} chunks
 * @param {object} [options]
 * @param {(reason?: unknown) => void} [options.onCancel]
 */
const makeBody = (chunks, { onCancel = () => {} } = {}) =>
  harden({
    getReader: () => {
      let index = 0;
      return harden({
        read: async () => {
          if (index >= chunks.length) {
            return harden({ done: true });
          }
          const value = chunks[index];
          index += 1;
          return harden({ done: false, value });
        },
        cancel: async reason => {
          index = chunks.length;
          onCancel(reason);
        },
        releaseLock: () => {},
      });
    },
  });

test('parseAllowedOrigins normalizes http origins and rejects other schemes', t => {
  t.deepEqual(
    [...parseAllowedOrigins(['https://API.example.com:443/path?q=1'])],
    ['https://api.example.com'],
  );
  t.throws(() => parseAllowedOrigins(['file:///tmp/secret']));
  t.throws(() => parseAllowedOrigins(['not a url']));
});

test('checkOriginAllowed enforces exact origin matches', t => {
  const origins = parseAllowedOrigins(['https://api.example.com']);
  t.notThrows(() =>
    checkOriginAllowed('https://api.example.com/data', origins),
  );
  t.throws(
    () => checkOriginAllowed('https://api.example.com.evil/data', origins),
    { instanceOf: OriginNotAllowedError },
  );
});

test('normalizeMethod uppercases and validates against a closed set', t => {
  t.is(normalizeMethod('head'), 'HEAD');
  t.throws(() => normalizeMethod('POST'), {
    instanceOf: MethodNotAllowedError,
  });
  t.is(normalizeMethod('post', { allowedMethods: new Set(['POST']) }), 'POST');
});

test('assertHeadersSafe rejects CRLF and forbidden header names', t => {
  t.notThrows(() => assertHeadersSafe({ accept: 'application/json' }));
  t.throws(() => assertHeadersSafe({ host: 'internal.example.com' }), {
    instanceOf: HeaderRejectedError,
  });
  t.throws(() => assertHeadersSafe({ 'x-inject': 'ok\r\nHost: x' }), {
    instanceOf: HeaderRejectedError,
  });
});

test('makeRateLimiter uses the injected clock', t => {
  let clock = 1000;
  const limiter = makeRateLimiter({ maxPerMinute: 2, now: () => clock });
  limiter.take();
  limiter.take();
  t.is(limiter.remaining(), 0);
  t.throws(() => limiter.take(), { instanceOf: RateLimitError });
  clock += 60_001;
  t.is(limiter.remaining(), 2);
});

test('limitResponseBytes truncates at read time and marks exact fills', async t => {
  /** @type {unknown[]} */
  const cancelReasons = [];
  const limited = limitResponseBytes(
    makeBody(['abc'], {
      onCancel: reason => cancelReasons.push(reason),
    }),
    { maxBytes: 3 },
  );

  const bytes = await limited.stream;

  t.deepEqual([...bytes], [...new TextEncoder().encode('abc')]);
  t.true(limited.truncated());
  t.deepEqual(cancelReasons, ['maxResponseBytes exceeded']);
});

test('resolveRedirect only follows to allowlisted origins', t => {
  const origins = parseAllowedOrigins(['https://api.example.com']);
  t.is(resolveRedirect(harden({ status: 200 }), origins), 'follow');
  t.is(
    resolveRedirect(
      harden({
        status: 302,
        url: 'https://api.example.com/start',
        headers: { location: '/next' },
      }),
      origins,
    ),
    'follow',
  );
  t.is(
    resolveRedirect(
      harden({
        status: 302,
        url: 'https://api.example.com/start',
        headers: { location: 'https://evil.example.com/' },
      }),
      origins,
    ),
    'reject',
  );
});

test('makeRequestSignal aborts for cancellation and disposes timeout', async t => {
  /** @type {(reason?: never) => void} */
  let cancel = () => {};
  const cancellation = /** @type {Promise<never>} */ (
    new Promise((_, reject) => {
      cancel = reject;
    })
  );
  const { signal, dispose } = makeRequestSignal({
    timeoutMs: 10_000,
    cancellation,
  });
  t.true(signal instanceof AbortSignal);
  cancel();
  await Promise.resolve();
  t.true(signal.aborted);
  dispose();
});

test('makeHttpConfinement rejects invalid falsy defense limits', t => {
  /** @type {FetchLike} */
  const fetch = url =>
    harden({
      status: 200,
      url,
      headers: {},
      body: makeBody(['ok']),
    });
  const seams = harden({ fetch, now: () => 1000 });

  t.throws(
    () =>
      makeHttpConfinement(
        {
          allowedOrigins: ['https://api.example.com'],
          maxRequestsPerMinute: 0,
        },
        seams,
      ),
    { message: /"maxPerMinute" must be a positive safe integer/ },
  );
  t.throws(
    () =>
      makeHttpConfinement(
        {
          allowedOrigins: ['https://api.example.com'],
          maxResponseBytes: 0,
        },
        seams,
      ),
    { message: /"maxResponseBytes" must be a positive safe integer/ },
  );
  t.throws(
    () =>
      makeHttpConfinement(
        {
          allowedOrigins: ['https://api.example.com'],
          timeoutMs: NaN,
        },
        seams,
      ),
    { message: /"timeoutMs" must be a positive safe integer/ },
  );
});

test('makeHttpConfinement composes rate, origin, fetch, redirect, and byte cap', async t => {
  let clock = 1000;
  /** @type {Array<{ url: string, options: Record<string, unknown> }>} */
  const calls = [];
  /** @type {FetchLike} */
  const fetch = (url, options) => {
    calls.push({
      url,
      options: /** @type {Record<string, unknown>} */ (options || {}),
    });
    return harden({
      status: 200,
      statusText: 'OK',
      ok: true,
      headers: {},
      url,
      body: makeBody(['abcdef']),
    });
  };
  const core = makeHttpConfinement(
    {
      allowedOrigins: ['https://api.example.com'],
      maxRequestsPerMinute: 1,
      maxResponseBytes: 3,
      allowedMethods: new Set(['GET', 'POST']),
    },
    { fetch, now: () => clock },
  );

  const response = await core.request({
    url: 'https://api.example.com/data',
    method: 'post',
  });
  t.true(response.truncated);
  t.is(new TextDecoder().decode(response.bytes), 'abc');
  t.is(calls[0].options.redirect, 'manual');
  t.is(calls[0].options.method, 'POST');
  t.true(calls[0].options.signal instanceof AbortSignal);

  await t.throwsAsync(
    () => core.request({ url: 'https://api.example.com/again' }),
    { instanceOf: RateLimitError },
  );
  clock += 60_001;
  await t.throwsAsync(
    () => core.request({ url: 'https://evil.example.com/' }),
    { instanceOf: OriginNotAllowedError },
  );

  core.revoke();
  await t.throwsAsync(
    () => core.request({ url: 'https://api.example.com/revoked' }),
    { instanceOf: RevokedError },
  );
});

test('makeHttpConfinement array mode owns allowlist mutators', async t => {
  /** @type {FetchLike} */
  const fetch = url =>
    harden({
      status: 200,
      url,
      headers: {},
      body: makeBody(['ok']),
    });
  const core = makeHttpConfinement(
    {
      allowedOrigins: ['https://api.example.com'],
      maxRequestsPerMinute: 10,
    },
    { fetch, now: () => 1000 },
  );

  await t.throwsAsync(
    () => core.request({ url: 'https://next.example.com/data' }),
    { instanceOf: OriginNotAllowedError },
  );
  core.addAllowedOrigin('https://next.example.com/path');
  t.deepEqual(core.allowedOrigins(), [
    'https://api.example.com',
    'https://next.example.com',
  ]);
  await t.notThrowsAsync(() =>
    core.request({ url: 'https://next.example.com/data' }),
  );

  core.removeAllowedOrigin('https://api.example.com/elsewhere');
  await t.throwsAsync(
    () => core.request({ url: 'https://api.example.com/data' }),
    { instanceOf: OriginNotAllowedError },
  );

  core.setAllowedOrigins(['https://reset.example.com']);
  t.deepEqual(core.inspect().allowedOrigins, ['https://reset.example.com']);
});

test('makeHttpConfinement thunk mode consults live allowlist authority', async t => {
  const authority = new Set(['https://api.example.com']);
  /** @type {FetchLike} */
  const fetch = url =>
    harden({
      status: 200,
      url,
      headers: {},
      body: makeBody(['ok']),
    });
  const core = makeHttpConfinement(
    {
      allowedOrigins: () => [...authority],
      maxRequestsPerMinute: 10,
    },
    { fetch, now: () => 1000 },
  );

  await t.notThrowsAsync(() =>
    core.request({ url: 'https://api.example.com/data' }),
  );

  authority.delete('https://api.example.com');
  authority.add('https://next.example.com');

  t.deepEqual(core.allowedOrigins(), ['https://next.example.com']);
  t.deepEqual(core.inspect().allowedOrigins, ['https://next.example.com']);
  await t.throwsAsync(
    () => core.request({ url: 'https://api.example.com/data' }),
    { instanceOf: OriginNotAllowedError },
  );
  await t.notThrowsAsync(() =>
    core.request({ url: 'https://next.example.com/data' }),
  );
});

test('makeHttpConfinement thunk mode resolves redirects against live allowlist', async t => {
  const authority = new Set(['https://api.example.com']);
  /** @type {FetchLike} */
  const fetch = url => {
    authority.delete('https://api.example.com');
    authority.add('https://redirect.example.com');
    return harden({
      status: 302,
      url,
      headers: { location: 'https://redirect.example.com/next' },
      body: makeBody([]),
    });
  };
  const core = makeHttpConfinement(
    {
      allowedOrigins: () => [...authority],
      maxRequestsPerMinute: 10,
    },
    { fetch, now: () => 1000 },
  );

  await t.notThrowsAsync(() =>
    core.request({ url: 'https://api.example.com/start' }),
  );
});

test('makeHttpConfinement thunk mode rejects origin mutators', t => {
  const core = makeHttpConfinement(
    {
      allowedOrigins: () => ['https://api.example.com'],
    },
    {
      fetch: () =>
        harden({
          status: 200,
          url: 'https://api.example.com/data',
          headers: {},
          body: makeBody([]),
        }),
      now: () => 1000,
    },
  );

  t.throws(() => core.setAllowedOrigins(['https://next.example.com']), {
    message: /externally owned/,
  });
  t.throws(() => core.addAllowedOrigin('https://next.example.com'), {
    message: /externally owned/,
  });
  t.throws(() => core.removeAllowedOrigin('https://api.example.com'), {
    message: /externally owned/,
  });
});
