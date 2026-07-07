// @ts-check
/// <reference types="ses"/>

/** @import { GitRemoteEndpoint } from '../src/git-remote.js' */

import test from '@endo/ses-ava/prepare-endo.js';

import {
  makeBearerCredential,
  makeGitCloner,
  makeGitRemoteEndpoint,
} from '../src/index.js';

const exampleCredential = () =>
  makeBearerCredential({
    audience: 'https://github.com',
    token: 'test-token',
  });

test('makeGitRemoteEndpoint factors URL transport and credential authority', t => {
  const credential = exampleCredential();
  const endpoint = makeGitRemoteEndpoint({
    url: 'https://github.com/example/repo.git',
    credential,
  });
  t.like(endpoint, {
    url: 'https://github.com/example/repo.git',
    origin: 'https://github.com',
    protocol: 'https:',
    requiresCredential: true,
    allowLocalFileTransport: false,
  });
  t.deepEqual(endpoint.ensureCredentialUsable(), {
    kind: 'bearer',
    material: { token: 'test-token' },
  });

  const fileEndpoint = makeGitRemoteEndpoint({
    url: 'file:///tmp/repo.git',
    allowLocalFileTransport: true,
  });
  t.false(fileEndpoint.requiresCredential);
  t.is(fileEndpoint.ensureCredentialUsable(), undefined);
  t.throws(
    () => makeGitRemoteEndpoint({ url: 'https://github.com/example/repo.git' }),
    {
      message: /HTTPS remotes require a Git credential cap/,
    },
  );
  t.throws(
    () =>
      makeGitRemoteEndpoint({
        url: 'file:///tmp/repo.git',
        allowLocalFileTransport: true,
        credential,
      }),
    { message: /credentials require https remotes/ },
  );
});

test('makeGitCloner composes endpoint and destination into Git plus origin remote', async t => {
  const endpoint = makeGitRemoteEndpoint({
    url: 'file:///tmp/repo.git',
    allowLocalFileTransport: true,
  });
  t.throws(
    () =>
      makeGitCloner({
        endpoint: /** @type {GitRemoteEndpoint} */ ({}),
        clone: async () => undefined,
        makeGit: async () => harden({}),
        makeRemote: async () => harden({}),
      }),
    { message: /requires a GitRemoteEndpoint/ },
  );
  t.throws(
    () =>
      makeGitCloner({
        endpoint,
        // @ts-expect-error invalid negative-path fixture
        clone: undefined,
        makeGit: async () => harden({}),
        makeRemote: async () => harden({}),
      }),
    { message: /requires a clone function/ },
  );
  /** @type {Array<Record<string, unknown>>} */
  const calls = [];
  const cloner = makeGitCloner({
    endpoint,
    clone: async input => {
      calls.push(harden({ clone: input }));
    },
    makeGit: async input => {
      calls.push(harden({ makeGit: input }));
      return 'git-cap';
    },
    makeRemote: async input => {
      calls.push(harden({ makeRemote: input }));
      return harden({ remote: 'origin' });
    },
  });
  const destMount = harden({});
  const result = await cloner.clone({ destMount, destPath: '/tmp/clone' });
  t.deepEqual(result, {
    git: 'git-cap',
    remote: { remote: 'origin' },
  });
  t.is(calls.length, 3);
  t.like(calls[0].clone, {
    url: 'file:///tmp/repo.git',
    destPath: '/tmp/clone',
    allowLocalFileTransport: true,
  });
  t.like(calls[2].makeRemote, {
    git: 'git-cap',
    endpoint,
  });
});

test('makeGitCloner resolves credential material for native clone', async t => {
  const endpoint = makeGitRemoteEndpoint({
    url: 'https://github.com/example/repo.git',
    credential: exampleCredential(),
  });
  /** @type {Array<Record<string, unknown>>} */
  const cloneCalls = [];
  const cloner = makeGitCloner({
    endpoint,
    clone: async input => {
      cloneCalls.push(harden(input));
    },
    makeGit: async () => harden({ git: 'cap' }),
    makeRemote: async () => harden({ remote: 'origin' }),
  });
  await cloner.clone({
    destMount: harden({}),
    destPath: '/tmp/clone',
  });
  t.deepEqual(cloneCalls[0].credential, {
    kind: 'bearer',
    material: { token: 'test-token' },
  });
});
