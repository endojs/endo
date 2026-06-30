// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { E } from '@endo/far';
import { makeGitRemote } from '@endo/exo-git';

import {
  seedBareRemote,
  composeGitOverWorktree,
} from './git-remote-fixtures.js';

const execFileAsync = promisify(execFile);

/**
 * Host-stand-in clone: run an OS-level `git clone` of the bare remote into a
 * fresh working directory, then compose a mount -> Git over that cloned
 * worktree. This is the deliberate degenerate form of a not-yet-built host
 * clone capability: today the operator clones at the host, then wraps the
 * result; once that capability lands this bootstrap is the only part that
 * changes.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} remoteRoot
 */
const hostCloneStandIn = async (t, remoteRoot) => {
  const cloneParent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-clone-loop-host-'),
  );
  t.teardown(() =>
    fs.promises.rm(cloneParent, { recursive: true, force: true }),
  );
  const root = path.join(cloneParent, 'worktree');
  await execFileAsync('git', ['clone', remoteRoot, root]);
  return composeGitOverWorktree(root);
};

test('host-clone -> edit (incl. new path) -> add -> commit -> push -> re-fetch round-trips over file://', async t => {
  t.timeout(30_000);
  // The full local SWE loop against a real file:// bare remote, bootstrapped
  // from a host-stand-in clone (no new capability). The producer worktree is
  // an OS-level clone of the bare remote; the loop edits an existing file and
  // a path that does not yet exist, commits through the exo Git, and pushes
  // through the exo GitRemote. A second, independent consumer clone re-fetches
  // the pushed branch, and raw `git cat-file` proves the commit and the new
  // blob are materially present in the consumer's object store — the same
  // object-presence bar the push/fetch round-trip set, now drawn around the
  // whole loop.
  const remoteRoot = await seedBareRemote(t);
  const remoteUrl = pathToFileURL(remoteRoot).href;

  // 1 + 2. Host-stand-in bootstrap.
  const host = await hostCloneStandIn(t, remoteRoot);
  const { remote } = makeGitRemote({
    git: host.git,
    name: 'origin',
    policy: {
      url: remoteUrl,
      allowLocalFileTransport: true,
      allowedDirections: ['push'],
      fetchRefspecs: [],
      pushRefspecs: ['refs/heads/agent/*:refs/heads/agent/*'],
    },
  });

  // 3. Drive the loop on a fresh branch.
  await E(host.git).createBranch('agent/loop', { switchAfterCreate: true });

  // Edit an existing file...
  const editedReadme = 'seed\nedited by agent\n';
  const readmeEntry = await E(host.mount).entry(['README.md']);
  await E(host.mount).writeText(readmeEntry, editedReadme);

  // ...and create a path that does not yet exist (a nested one, to exercise
  // parent-directory creation on the way to the new blob).
  const freshContent = 'fresh agent file\n';
  const freshEntry = await E(host.mount).entry(['agent', 'notes.md']);
  await E(host.mount).writeText(freshEntry, freshContent);

  await E(host.git).add([readmeEntry, freshEntry]);
  await E(host.git).commit('test: agent SWE-loop commit over host clone');

  const pushResult = await E(remote).push({
    source: 'refs/heads/agent/loop',
    destination: 'refs/heads/agent/loop',
    setUpstream: true,
  });
  const pushedRefs = [...pushResult.updatedRefs];
  t.is(pushedRefs.length, 1);
  const pushedOid = pushedRefs[0].local.oid;
  t.regex(pushedOid, /^[0-9a-f]{40}$/u);
  t.like(pushedRefs[0], {
    remote: 'refs/heads/agent/loop',
    result: 'created',
  });

  // 4. Re-fetch into a second, independent consumer clone of the same bare
  // remote (unrelated to the host clone). A fresh clone materializes every
  // remote branch as a remote-tracking ref, so the pushed branch and its
  // objects arrive here.
  const consumerParent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'git-clone-loop-consumer-'),
  );
  t.teardown(() =>
    fs.promises.rm(consumerParent, { recursive: true, force: true }),
  );
  const consumerRoot = path.join(consumerParent, 'worktree');
  await execFileAsync('git', ['clone', remoteRoot, consumerRoot]);

  // The pushed commit must resolve in the consumer to the same oid.
  const { stdout: consumerOid } = await execFileAsync(
    'git',
    ['rev-parse', 'refs/remotes/origin/agent/loop'],
    { cwd: consumerRoot },
  );
  t.is(consumerOid.trim(), pushedOid);

  // The commit object is materially present, not just a dangling ref.
  const { stdout: objectType } = await execFileAsync(
    'git',
    ['cat-file', '-t', pushedOid],
    { cwd: consumerRoot },
  );
  t.is(objectType.trim(), 'commit');

  // The newly created path's blob is present by object id and recovers its
  // bytes verbatim.
  const { stdout: freshBlobOid } = await execFileAsync(
    'git',
    ['rev-parse', `${pushedOid}:agent/notes.md`],
    { cwd: consumerRoot },
  );
  const { stdout: freshBlobType } = await execFileAsync(
    'git',
    ['cat-file', '-t', freshBlobOid.trim()],
    { cwd: consumerRoot },
  );
  t.is(freshBlobType.trim(), 'blob');
  const { stdout: freshBlob } = await execFileAsync(
    'git',
    ['cat-file', '-p', `${pushedOid}:agent/notes.md`],
    { cwd: consumerRoot },
  );
  t.is(freshBlob, freshContent);

  // The edited existing file round-trips its new contents too.
  const { stdout: readmeBlob } = await execFileAsync(
    'git',
    ['cat-file', '-p', `${pushedOid}:README.md`],
    { cwd: consumerRoot },
  );
  t.is(readmeBlob, editedReadme);
});
