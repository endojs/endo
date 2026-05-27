// @ts-check
/// <reference types="ses"/>

import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify as nodePromisify } from 'node:util';

import { E, Far } from '@endo/far';

import { makeFilePowers } from '../src/daemon-node-powers.js';
import {
  makeBearerCredential,
  getGitCredentialController,
  revokeGitCredential,
} from '../src/git-credential.js';
import { makeMount } from '../src/mount.js';
import { makeGit, makeNotYetImplementedBackend } from '../src/git.js';
import { makeNativeGitBackend } from '../src/native-git-backend.js';
import { makeGitRemote, getGitRemoteController } from '../src/git-remote.js';

const execFileAsync = nodePromisify(execFile);
const exampleCredential = () =>
  makeBearerCredential({
    audience: 'https://github.com',
    token: 'test-token',
  });

/**
 * @param {import('ava').ExecutionContext} t
 */
const provisionGitContext = async t => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-remote-'));
  t.teardown(() => fs.promises.rm(root, { recursive: true, force: true }));
  await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=T',
      'commit',
      '--allow-empty',
      '-m',
      'init',
    ],
    { cwd: root },
  );
  const filePowers = makeFilePowers({ fs, path });
  const mount = makeMount({ rootPath: root, readOnly: false, filePowers });
  const backend = makeNativeGitBackend({ repoRoot: root });
  await backend.assertRepositoryRoot();
  const git = makeGit({ mount, backend });
  return { git, mount, root };
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {string} sourceRepo
 */
const provisionBareRemote = async (t, sourceRepo) => {
  const remoteParent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-remote-bare-'),
  );
  t.teardown(() =>
    fs.promises.rm(remoteParent, { recursive: true, force: true }),
  );
  const remoteRoot = path.join(remoteParent, 'remote.git');
  await execFileAsync('git', ['clone', '--bare', sourceRepo, remoteRoot]);
  return remoteRoot;
};

/**
 * @param {import('ava').ExecutionContext} t
 * @param {string} remoteRoot
 */
const advanceRemoteMain = async (t, remoteRoot) => {
  const cloneRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-remote-upstream-'),
  );
  t.teardown(() => fs.promises.rm(cloneRoot, { recursive: true, force: true }));
  await execFileAsync('git', ['clone', remoteRoot, cloneRoot]);
  await fs.promises.writeFile(
    path.join(cloneRoot, 'upstream.txt'),
    'upstream\n',
  );
  await execFileAsync('git', ['add', 'upstream.txt'], { cwd: cloneRoot });
  await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=T', 'commit', '-m', 'upstream'],
    { cwd: cloneRoot },
  );
  await execFileAsync('git', ['push', 'origin', 'main'], { cwd: cloneRoot });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'main'], {
    cwd: cloneRoot,
  });
  return stdout.trim();
};

test('makeGitRemote produces a paired (remote, controller) facet', async t => {
  const { git } = await provisionGitContext(t);
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
    },
  });
  t.truthy(remote);
  t.truthy(controller);
  t.is(getGitRemoteController(remote), controller);
  t.is(getGitRemoteController({}), undefined);
});

test('GitRemote.inspect returns the current policy snapshot', async t => {
  const { git } = await provisionGitContext(t);
  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch', 'push'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
      allowedBranches: ['refs/heads/agent/*'],
      allowForcePush: false,
      allowTags: false,
      allowDelete: false,
    },
  });
  const snapshot = await E(remote).inspect();
  t.is(snapshot.name, 'origin');
  t.is(snapshot.url, 'https://github.com/example/repo.git');
  t.deepEqual([...snapshot.allowedDirections].sort(), ['fetch', 'push']);
  t.deepEqual(
    [...snapshot.pushRefspecs],
    ['refs/heads/agent/*:refs/heads/agent/*'],
  );
  t.false(snapshot.allowForcePush);
});

test('GitRemote validates endpoint and refspec policy at construction', async t => {
  const { git } = await provisionGitContext(t);
  const basePolicy = harden({
    url: 'https://github.com/example/repo.git',
    allowedDirections: /** @type {Array<'fetch' | 'push'>} */ (['fetch']),
    fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
    pushRefspecs: /** @type {string[]} */ ([]),
  });

  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: { ...basePolicy, url: 'http://github.com/example/repo.git' },
      }),
    { message: /must use https/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          url: 'file:///tmp/repo.git',
        },
      }),
    { message: /must use https/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          url: 'https://token@github.com/example/repo.git',
        },
      }),
    { message: /embedded credentials/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: { ...basePolicy, fetchRefspecs: ['main:origin/main'] },
      }),
    { message: /fully qualified/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          fetchRefspecs: ['refs/heads/main:refs/heads/main'],
        },
      }),
    { message: /refs\/remotes\/origin/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          allowedDirections: ['push'],
          pushRefspecs: [],
        },
      }),
    { message: /allows push but has no pushRefspecs/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          allowedDirections: ['push'],
          pushRefspecs: ['+refs/heads/agent/x:refs/heads/agent/x'],
        },
      }),
    { message: /force-push/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          allowedDirections: ['push'],
          pushRefspecs: ['refs/tags/v1:refs/tags/v1'],
        },
      }),
    { message: /tag refs require allowTags/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          ...basePolicy,
          allowedDirections: ['push'],
          pushRefspecs: ['refs/heads/agent/*:refs/heads/agent/*'],
          allowedBranches: ['agent/x'],
        },
      }),
    { message: /choose allowedBranches or pushRefspecs/ },
  );
});

test('GitRemote requires matching credential authority for HTTPS', async t => {
  const { git } = await provisionGitContext(t);
  const policy = harden({
    url: 'https://github.com/example/repo.git',
    allowedDirections: /** @type {Array<'fetch' | 'push'>} */ (['fetch']),
    fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
    pushRefspecs: /** @type {string[]} */ ([]),
  });

  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        policy,
      }),
    { message: /HTTPS remotes require a Git credential cap/ },
  );

  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        credential: makeBearerCredential({
          audience: 'https://gitlab.com',
          token: 'wrong-host',
        }),
        policy,
      }),
    { message: /audience .* does not match remote origin/ },
  );

  const credential = exampleCredential();
  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    credential,
    policy,
  });
  const snapshot = await E(remote).inspect();
  t.false(Object.hasOwn(snapshot, 'credential'));

  revokeGitCredential(credential);
  await t.throwsAsync(E(remote).fetch({}), {
    message: /credential .* revoked/,
  });
});

test('GitRemote passes HTTPS credential material to backend transport only', async t => {
  /** @type {object[]} */
  const fetchCalls = [];
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remoteFetch: async input => {
      fetchCalls.push(input);
      return harden({ updatedRefs: harden([]), text: 'ok' });
    },
  });
  const git = makeGit({ mount: Far('FakeMount', {}), backend });
  const credential = exampleCredential();
  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    credential,
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
    },
  });

  t.false(JSON.stringify(await E(remote).inspect()).includes('test-token'));
  await E(remote).fetch();
  t.is(fetchCalls.length, 1);
  t.deepEqual(
    /** @type {{ credential?: unknown }} */ (fetchCalls[0]).credential,
    harden({ kind: 'bearer', material: harden({ token: 'test-token' }) }),
  );
});

test('GitCredentialController rotates material used by existing remotes', async t => {
  /** @type {object[]} */
  const fetchCalls = [];
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remoteFetch: async input => {
      fetchCalls.push(input);
      return harden({ updatedRefs: harden([]), text: 'ok' });
    },
  });
  const git = makeGit({ mount: Far('FakeMount', {}), backend });
  const credential = exampleCredential();
  const controller = getGitCredentialController(credential);
  t.truthy(controller);
  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    credential,
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
    },
  });

  await E(remote).fetch();
  await E(controller).rotate({ token: 'new-token' });
  await E(remote).fetch();
  await E(controller).revoke();

  t.deepEqual(
    /** @type {{ credential?: unknown }} */ (fetchCalls[0]).credential,
    harden({ kind: 'bearer', material: harden({ token: 'test-token' }) }),
  );
  t.deepEqual(
    /** @type {{ credential?: unknown }} */ (fetchCalls[1]).credential,
    harden({ kind: 'bearer', material: harden({ token: 'new-token' }) }),
  );
  await t.throwsAsync(E(remote).fetch(), {
    message: /credential .* revoked/,
  });
  const view = await E(controller).inspect();
  t.like(view, {
    kind: 'bearer',
    audience: 'https://github.com',
    available: false,
    revoked: true,
  });
});

test('GitRemoteController.revoke during in-flight fetch prevents stale success', async t => {
  /** @type {AbortSignal | undefined} */
  let fetchSignal;
  /** @type {(value?: unknown) => void} */
  let fetchStartedResolve = () => {};
  const fetchStarted = new Promise(resolve => {
    fetchStartedResolve = resolve;
  });
  /** @type {(value: unknown) => void} */
  let fetchResolve = () => {};
  const fetchResult = new Promise(resolve => {
    fetchResolve = resolve;
  });
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remoteFetch: async input => {
      fetchSignal = /** @type {{ signal?: AbortSignal }} */ (input).signal;
      fetchStartedResolve();
      return fetchResult;
    },
  });
  const git = makeGit({ mount: Far('FakeMount', {}), backend });
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
    },
  });

  const fetchP = E(remote).fetch();
  await fetchStarted;
  t.false(fetchSignal?.aborted);
  await E(controller).revoke();
  t.true(fetchSignal?.aborted);
  fetchResolve(harden({ updatedRefs: harden([]), text: 'ok' }));

  await t.throwsAsync(fetchP, { message: /revoked during fetch/ });
  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'revoke', 'fetch'],
  );
  t.like(audit[2], { type: 'fetch', outcome: 'error' });
});

test('GitCredentialController.rotate during in-flight fetch prevents stale success', async t => {
  /** @type {object[]} */
  const fetchCalls = [];
  /** @type {AbortSignal | undefined} */
  let fetchSignal;
  /** @type {(value?: unknown) => void} */
  let fetchStartedResolve = () => {};
  const fetchStarted = new Promise(resolve => {
    fetchStartedResolve = resolve;
  });
  /** @type {(value: unknown) => void} */
  let fetchResolve = () => {};
  const fetchResult = new Promise(resolve => {
    fetchResolve = resolve;
  });
  let callCount = 0;
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remoteFetch: async input => {
      fetchCalls.push(input);
      fetchSignal = /** @type {{ signal?: AbortSignal }} */ (input).signal;
      callCount += 1;
      if (callCount === 1) {
        fetchStartedResolve();
        return fetchResult;
      }
      return harden({ updatedRefs: harden([]), text: 'ok' });
    },
  });
  const git = makeGit({ mount: Far('FakeMount', {}), backend });
  const credential = exampleCredential();
  const credentialController = getGitCredentialController(credential);
  t.truthy(credentialController);
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential,
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
    },
  });

  const fetchP = E(remote).fetch();
  await fetchStarted;
  t.false(fetchSignal?.aborted);
  await E(credentialController).rotate({ token: 'new-token' });
  t.true(fetchSignal?.aborted);
  fetchResolve(harden({ updatedRefs: harden([]), text: 'ok' }));

  await t.throwsAsync(fetchP, {
    message: /credential .* changed during fetch/,
  });
  t.deepEqual(
    /** @type {{ credential?: unknown }} */ (fetchCalls[0]).credential,
    harden({ kind: 'bearer', material: harden({ token: 'test-token' }) }),
  );

  await E(remote).fetch();
  t.deepEqual(
    /** @type {{ credential?: unknown }} */ (fetchCalls[1]).credential,
    harden({ kind: 'bearer', material: harden({ token: 'new-token' }) }),
  );
  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'fetch', 'fetch'],
  );
  t.like(audit[1], { type: 'fetch', outcome: 'error' });
  t.like(audit[2], { type: 'fetch', outcome: 'ok' });
});

test('GitRemoteController.revoke during in-flight pull aborts before local integration', async t => {
  /** @type {AbortSignal | undefined} */
  let fetchSignal;
  /** @type {(value?: unknown) => void} */
  let fetchStartedResolve = () => {};
  const fetchStarted = new Promise(resolve => {
    fetchStartedResolve = resolve;
  });
  /** @type {(value: unknown) => void} */
  let fetchResolve = () => {};
  const fetchResult = new Promise(resolve => {
    fetchResolve = resolve;
  });
  let mergeCalled = false;
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remoteFetch: async input => {
      fetchSignal = /** @type {{ signal?: AbortSignal }} */ (input).signal;
      fetchStartedResolve();
      return fetchResult;
    },
    merge: async () => {
      mergeCalled = true;
      return 'merged';
    },
  });
  const git = makeGit({ mount: Far('FakeMount', {}), backend });
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['refs/heads/main:refs/remotes/origin/main'],
      pushRefspecs: [],
    },
  });

  const pullP = E(remote).pull({
    branch: 'refs/remotes/origin/main',
    strategy: 'ff-only',
  });
  await fetchStarted;
  t.false(fetchSignal?.aborted);
  await E(controller).revoke();
  t.true(fetchSignal?.aborted);
  fetchResolve(harden({ updatedRefs: harden([]), text: 'ok' }));

  await t.throwsAsync(pullP, { message: /revoked during pull/ });
  t.false(mergeCalled);
  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'revoke', 'pull'],
  );
  t.like(audit[2], { type: 'pull', outcome: 'error' });
});

test('GitRemote fetch / pull / push use the bounded native data plane', async t => {
  const { git, mount, root } = await provisionGitContext(t);
  const remoteRoot = await provisionBareRemote(t, root);
  const remoteUrl = pathToFileURL(remoteRoot).href;
  const remoteHead = await advanceRemoteMain(t, remoteRoot);

  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    policy: {
      url: remoteUrl,
      allowLocalFileTransport: true,
      allowedDirections: ['fetch', 'push'],
      fetchRefspecs: ['+refs/heads/main:refs/remotes/origin/main'],
      pushRefspecs: ['refs/heads/agent/*:refs/heads/agent/*'],
      allowDelete: true,
    },
  });

  const fetchResult = await E(remote).fetch({ prune: true });
  const fetchUpdates = [...fetchResult.updatedRefs];
  t.is(fetchUpdates.length, 1);
  t.deepEqual(fetchUpdates[0], {
    local: {
      name: 'refs/remotes/origin/main',
      kind: 'branch',
      oid: remoteHead,
    },
    remote: 'refs/heads/main',
    result: 'created',
  });
  const fetched = await E(git).revParse('refs/remotes/origin/main');
  t.is(fetched.oid, remoteHead);

  const pullResult = await E(remote).pull({
    branch: 'refs/remotes/origin/main',
    strategy: 'ff-only',
  });
  t.is(pullResult.integration, 'fast-forward');
  t.deepEqual(
    [...pullResult.fetch.updatedRefs],
    [
      {
        local: {
          name: 'refs/remotes/origin/main',
          kind: 'branch',
          oid: remoteHead,
        },
        remote: 'refs/heads/main',
        result: 'up-to-date',
      },
    ],
  );
  t.is(await E(mount).readText(['upstream.txt']), 'upstream\n');

  const upToDatePullResult = await E(remote).pull({
    branch: 'refs/remotes/origin/main',
    strategy: 'ff-only',
  });
  t.is(upToDatePullResult.integration, 'up-to-date');

  await E(git).createBranch('agent/topic', { switchAfterCreate: true });
  const note = await E(mount).entry(['agent.txt']);
  await E(mount).writeText(note, 'agent\n');
  await E(git).add([note]);
  await E(git).commit('test: agent branch');
  const pushResult = await E(remote).push({
    source: 'refs/heads/agent/topic',
    destination: 'refs/heads/agent/topic',
    setUpstream: true,
  });
  const { stdout: pushedRef } = await execFileAsync(
    'git',
    ['show-ref', '--hash', 'refs/heads/agent/topic'],
    { cwd: remoteRoot },
  );
  const pushedOid = pushedRef.trim();
  t.regex(pushedOid, /^[0-9a-f]{40}$/u);
  t.deepEqual(
    [...pushResult.updatedRefs],
    [
      {
        local: {
          name: 'refs/heads/agent/topic',
          kind: 'branch',
          oid: pushedOid,
        },
        remote: 'refs/heads/agent/topic',
        result: 'created',
      },
    ],
  );
  const { stdout: upstreamRemote } = await execFileAsync(
    'git',
    ['config', '--get', 'branch.agent/topic.remote'],
    { cwd: root },
  );
  const { stdout: upstreamMerge } = await execFileAsync(
    'git',
    ['config', '--get', 'branch.agent/topic.merge'],
    { cwd: root },
  );
  t.is(upstreamRemote.trim(), remoteUrl);
  t.is(upstreamMerge.trim(), 'refs/heads/agent/topic');

  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'fetch', 'pull', 'pull', 'push'],
  );
  t.like(audit[1], { type: 'fetch', outcome: 'ok' });
  t.like(audit[2], {
    type: 'pull',
    outcome: 'ok',
    integration: 'fast-forward',
  });
  t.like(audit[3], {
    type: 'pull',
    outcome: 'ok',
    integration: 'up-to-date',
  });
  t.like(audit[4], { type: 'push', outcome: 'ok' });
  t.deepEqual([...audit[4].updatedRefs], [...pushResult.updatedRefs]);
});

test('GitRemote enforces allowedDirections at the call boundary', async t => {
  const { git } = await provisionGitContext(t);
  // Fetch-only policy: push must be refused before transport is reached.
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: [],
      pushRefspecs: [],
    },
  });
  await t.throwsAsync(E(remote).push({}), {
    message: /does not permit "push"/,
  });
  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'push'],
  );
  t.like(audit[1], { type: 'push', outcome: 'error' });
  t.regex(audit[1].message, /does not permit "push"/);
});

test('GitRemote enforces tag and prune policy at the call boundary', async t => {
  const { mount } = await provisionGitContext(t);
  /** @type {unknown[]} */
  const fetchCalls = [];
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remoteFetch: async input => {
      fetchCalls.push(input);
      return harden({ updatedRefs: [] });
    },
  });
  const git = makeGit({ mount, backend });
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: ['+refs/heads/*:refs/remotes/origin/*'],
      pushRefspecs: [],
    },
  });

  await t.throwsAsync(E(remote).fetch({ tags: true }), {
    message: /tags require allowTags/,
  });
  await t.throwsAsync(E(remote).pull({ prune: true }), {
    message: /prune requires allowDelete/,
  });
  t.deepEqual(fetchCalls, []);

  await E(controller).setAllowTags(true);
  await E(controller).setAllowDelete(true);
  await E(remote).fetch({ tags: true, prune: true });
  t.like(/** @type {{ tags?: boolean, prune?: boolean }} */ (fetchCalls[0]), {
    tags: true,
    prune: true,
  });
});

test('GitRemote wildcard push policy binds source and destination names', async t => {
  const { mount } = await provisionGitContext(t);
  /** @type {unknown[]} */
  const pushCalls = [];
  const backend = harden({
    ...makeNotYetImplementedBackend(),
    remotePush: async input => {
      pushCalls.push(input);
      return harden({ updatedRefs: [] });
    },
  });
  const git = makeGit({ mount, backend });
  const { remote } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['push'],
      fetchRefspecs: [],
      pushRefspecs: ['refs/heads/safe/*:refs/heads/safe/*'],
    },
  });

  await t.throwsAsync(
    E(remote).push({
      source: 'refs/heads/safe/topic-a',
      destination: 'refs/heads/safe/topic-b',
    }),
    { message: /outside policy/ },
  );
  t.deepEqual(pushCalls, []);

  await E(remote).push({
    source: 'refs/heads/safe/topic-a',
    destination: 'refs/heads/safe/topic-a',
  });
  t.like(/** @type {{ refspecs?: string[] }} */ (pushCalls[0]), {
    refspecs: ['refs/heads/safe/topic-a:refs/heads/safe/topic-a'],
  });
});

test('makeGitRemote rejects a read-only Git cap', async t => {
  const { git } = await provisionGitContext(t);
  const readOnlyGit = await E(git).readOnly();
  t.throws(
    () =>
      makeGitRemote({
        git: readOnlyGit,
        name: 'origin',
        credential: exampleCredential(),
        policy: {
          url: 'https://github.com/example/repo.git',
          allowedDirections: ['fetch'],
          fetchRefspecs: [],
          pushRefspecs: [],
        },
      }),
    { message: /read-only Git/ },
  );
});

test('GitRemoteController mutates policy, snapshot reflects the change', async t => {
  const { git } = await provisionGitContext(t);
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: [],
      pushRefspecs: [],
    },
  });
  // Configure a push target, widen to allow push, then narrow back.
  await E(controller).setAllowedBranches(['agent/x']);
  await E(controller).setAllowedDirections(['fetch', 'push']);
  let snapshot = await E(remote).inspect();
  t.deepEqual([...snapshot.allowedDirections].sort(), ['fetch', 'push']);
  t.deepEqual(
    [...snapshot.pushRefspecs],
    ['refs/heads/agent/x:refs/heads/agent/x'],
  );

  await E(controller).setAllowedDirections(['fetch']);
  snapshot = await E(remote).inspect();
  t.deepEqual([...snapshot.allowedDirections], ['fetch']);

  // The controller's inspect also reports the revoked flag.
  const controllerView = await E(controller).inspect();
  t.false(controllerView.revoked);
  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'policy', 'policy', 'policy'],
  );
  t.deepEqual(audit.map(event => event.method).slice(1), [
    'setAllowedBranches',
    'setAllowedDirections',
    'setAllowedDirections',
  ]);
});

test('GitRemoteController.revoke makes all remote ops refuse', async t => {
  const { git } = await provisionGitContext(t);
  const { remote, controller } = makeGitRemote({
    git,
    name: 'origin',
    credential: exampleCredential(),
    policy: {
      url: 'https://github.com/example/repo.git',
      allowedDirections: ['fetch'],
      fetchRefspecs: [],
      pushRefspecs: [],
    },
  });
  await E(controller).revoke();

  // Every guest-visible operation now refuses.  The controller still
  // works so the host can inspect after revocation.
  await t.throwsAsync(E(remote).inspect(), { message: /has been revoked/ });
  await t.throwsAsync(E(remote).fetch({}), { message: /has been revoked/ });
  const view = await E(controller).inspect();
  t.true(view.revoked);
  const audit = await E(controller).audit();
  t.deepEqual(
    audit.map(event => event.type),
    ['create', 'revoke', 'fetch'],
  );
  t.like(audit[2], { type: 'fetch', outcome: 'error' });
});

test('makeGitRemote rejects an empty url or empty name', async t => {
  const { git } = await provisionGitContext(t);
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: '',
        policy: {
          url: 'https://x',
          allowedDirections: ['fetch'],
          fetchRefspecs: [],
          pushRefspecs: [],
        },
      }),
    { message: /non-empty string/ },
  );
  t.throws(
    () =>
      makeGitRemote({
        git,
        name: 'origin',
        policy: {
          url: '',
          allowedDirections: ['fetch'],
          fetchRefspecs: [],
          pushRefspecs: [],
        },
      }),
    { message: /non-empty url/ },
  );
});

test('getGitRemoteController rejects fabricated remote exos', async t => {
  // A spoof exo cannot recover the controller — the WeakMap is the
  // only entry point, and spoofs never landed in it.
  const fake = Far('FakeGitRemote', {
    inspect: () => Promise.resolve({}),
    fetch: () => Promise.reject(new Error('spoof')),
    pull: () => Promise.reject(new Error('spoof')),
    push: () => Promise.reject(new Error('spoof')),
  });
  t.is(getGitRemoteController(fake), undefined);
});
