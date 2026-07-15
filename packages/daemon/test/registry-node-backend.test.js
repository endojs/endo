// @ts-check
// Unit tests for the Node registry powers and user-mode backend
// (packages/daemon/src/registry-node-powers.js and registry-user.js), focused
// on the fail-closed integrity check: a published-but-unverifiable integrity (malformed SRI, or
// an algorithm the backend cannot compute) must reject as tampered rather
// than silently accept the tarball.  A fake fetch injects crafted packument +
// tarball responses so no network is touched.  See
// designs/registry-capability.md § Failure surface.

import test from '@endo/ses-ava/prepare-endo.js';

import { makeRegistryNodePowers } from '../src/registry-node-powers.js';
import { RegistryTamperedErrorName } from '../src/registry.js';

const registryUrl = 'https://registry.example';

/**
 * A fake fetch answering the packument URL (`.../pkg`) with `packument` and
 * any tarball URL with `tarballBytes`.
 *
 * @param {any} packument
 * @param {Uint8Array} tarballBytes
 */
const makeFakeFetch = (packument, tarballBytes) => async url => {
  if (url.endsWith('/pkg')) {
    return harden({
      ok: true,
      status: 200,
      json: async () => packument,
      arrayBuffer: async () => new Uint8Array().buffer,
    });
  }
  return harden({
    ok: true,
    status: 200,
    json: async () => harden({}),
    arrayBuffer: async () => tarballBytes.buffer,
  });
};

/** @param {(url: string) => Promise<any>} fetch */
const stubPowers = fetch =>
  harden({
    contentStore: { store: async () => 'unreached' },
    makeReadableTree: () => harden({}),
    sha256Hex: () => 'unreached',
    registryUrl,
    fetch,
  });

/** @param {string} integrity */
const backendPublishing = integrity => {
  const packument = {
    versions: {
      '1.0.0': {
        dist: { tarball: `${registryUrl}/pkg/-/pkg-1.0.0.tgz`, integrity },
      },
    },
  };
  return makeRegistryNodePowers({
    fetch: makeFakeFetch(packument, new Uint8Array([1, 2, 3])),
    gunzip: async bytes => bytes,
    createHash: () => {
      const hash = harden({
        update: () => hash,
        digest: () => 'not-the-published-hash',
      });
      return hash;
    },
  }).makeRegistryBackend(
    stubPowers(makeFakeFetch(packument, new Uint8Array([1, 2, 3]))),
  );
};

test('provideTree fails closed on an unsupported integrity algorithm', async t => {
  const backend = backendPublishing('md5-Zm9vYmFy');
  const err = await t.throwsAsync(backend.provideTree('pkg', '1.0.0'));
  t.is(err.name, RegistryTamperedErrorName);
});

test('provideTree fails closed on a malformed integrity', async t => {
  const backend = backendPublishing('notasristring');
  const err = await t.throwsAsync(backend.provideTree('pkg', '1.0.0'));
  t.is(err.name, RegistryTamperedErrorName);
});

test('provideTree fails closed on a sha512 mismatch', async t => {
  const backend = backendPublishing('sha512-AAAAAAAA');
  const err = await t.throwsAsync(backend.provideTree('pkg', '1.0.0'));
  t.is(err.name, RegistryTamperedErrorName);
});

test('encodes every package name as one npm packument path segment', async t => {
  /** @type {string[]} */
  const requestedUrls = [];
  const backend = makeRegistryNodePowers({
    fetch: async url => {
      requestedUrls.push(url);
      return harden({
        ok: true,
        status: 200,
        json: async () => harden({ versions: {} }),
        arrayBuffer: async () => new Uint8Array().buffer,
      });
    },
    gunzip: async bytes => bytes,
    createHash: () => {
      throw Error('unreached');
    },
  }).makeRegistryBackend(stubPowers(async () => harden({})));

  await backend.fetchVersions('@scope/pkg');
  t.deepEqual(requestedUrls, [`${registryUrl}/%40scope%2Fpkg`]);
});
