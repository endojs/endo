// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { E } from '@endo/far';
import { makeGitRemote } from '@endo/exo-git';

import {
  provisionGitContext,
  provisionBareRemote,
  advanceRemoteMain,
} from './git-remote-fixtures.js';

const execFileAsync = promisify(execFile);

/**
 * End-to-end proof that the exo `Git` + `GitRemote` capabilities move real git
 * objects over a `file://` remote through the bounded native data plane. A
 * freshly initialized local repo fetches, fast-forward pulls, and pushes a new
 * branch against a real bare remote; the assertions check the structured
 * fetch/pull/push results, the materialized working-tree contents, the upstream
 * tracking config the push set, and the controller's audit trail.
 */
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
