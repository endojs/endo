// @ts-nocheck

import '@endo/init/debug.js';

import test from 'ava';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/pass-style';
import { makePromiseKit } from '@endo/promise-kit';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';

import {
  makeHttpContentDataPlane,
  makeHttpContentShare,
} from '../src/http-content-plane.js';
import { startWsGateway } from '../src/ws-gateway.js';

test('HTTP content share vends a web-seed URL for blobs and tar trees', async t => {
  const share = makeHttpContentShare('https://gateway.example/base/');

  t.deepEqual(await E(share).source('a'.repeat(64), 'blob'), [
    {
      plane: 'ws',
      payload: `https://gateway.example/base/content/${'a'.repeat(64)}`,
    },
  ]);
  t.deepEqual(await E(share).source('b'.repeat(64), 'tree'), [
    {
      plane: 'ws',
      payload: `https://gateway.example/base/content/${'b'.repeat(64)}?kind=tree`,
    },
  ]);
});

test('HTTP content plane delegates sharing and returns untrusted bytes', async t => {
  const fetchedUrls = [];
  const plane = makeHttpContentDataPlane(async url => {
    fetchedUrls.push(url.href);
    return new Response(new Uint8Array([1, 2, 3]));
  });
  const share = Far('HTTP content share', {
    source: async hash => [
      { plane: 'ws', payload: `https://gateway.example/content/${hash}` },
    ],
  });

  t.deepEqual(await plane.source('c'.repeat(64), 'blob', share), [
    {
      plane: 'ws',
      payload: `https://gateway.example/content/${'c'.repeat(64)}`,
    },
  ]);
  t.deepEqual(
    await plane.fetch(
      {
        plane: 'ws',
        payload: `https://gateway.example/content/${'c'.repeat(64)}`,
      },
      'c'.repeat(64),
      'blob',
    ),
    new Uint8Array([1, 2, 3]),
  );
  t.deepEqual(fetchedUrls, [
    `https://gateway.example/content/${'c'.repeat(64)}`,
  ]);
});

test('HTTP content plane rejects non-HTTP web seeds before fetching', async t => {
  const plane = makeHttpContentDataPlane(async () => {
    t.fail('fetch must not run for a non-HTTP source');
    return new Response();
  });

  await t.throwsAsync(
    plane.fetch(
      { plane: 'ws', payload: 'file:///untrusted-content' },
      'a'.repeat(64),
      'blob',
    ),
    { message: /Invalid HTTP web-seed protocol/ },
  );
});

test('Gateway serves a content-addressed blob from its web-seed route', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  cancelled.catch(() => {});
  const bytes = new TextEncoder().encode('gateway web-seed');
  const gateway = Far('Gateway', {
    provideBlob: async hash => {
      t.is(hash, 'd'.repeat(64));
      return bytesReaderFromIterator([bytes]);
    },
    provideTree: async () => {
      t.fail('provideTree must not run for a blob web-seed route');
      return bytesReaderFromIterator([]);
    },
  });
  const bootstrap = Far('EndoBootstrap', {
    gateway: async () => gateway,
  });
  const service = startWsGateway({
    endoBootstrap: bootstrap,
    host: '127.0.0.1',
    port: 0,
    cancelled,
  });
  const address = await service.started;
  try {
    const response = await globalThis.fetch(
      `${address}/content/${'d'.repeat(64)}`,
    );
    t.is(response.status, 200);
    t.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  } finally {
    cancel(Error('test complete'));
    await service.stopped;
  }
});
