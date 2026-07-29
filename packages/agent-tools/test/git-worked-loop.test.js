// @ts-check

// Establish a SES perimeter (provides the `harden` global).
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { makeGitRemote } from '@endo/exo-git';
import { makeShell } from '@endo/exo-shell';

import {
  seedBareRemote,
  composeGitOverWorktree,
} from './git-remote-fixtures.js';
import {
  provisionWorkspaceTools,
  makeWorkspaceTools,
  provisionHistoryTools,
} from '../src/workspace.js';

const execFileAsync = promisify(execFile);

/**
 * Wrap a Node readable in a fresh async-iterable closure so the returned
 * `Spawner` process can be `harden`ed without transitively freezing the raw
 * child socket (a frozen socket breaks Node's own `onReadableStreamEnd`
 * teardown, which reassigns the socket's `write`). Mirrors
 * `@endo/host-spawner`'s `readableToAsyncIterable`.
 *
 * @param {import('node:stream').Readable | null} stream
 */
const readableToAsyncIterable = stream => {
  if (stream === null) return null;
  return harden({
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        yield chunk instanceof Uint8Array
          ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
          : new TextEncoder().encode(String(chunk));
      }
    },
  });
};

/**
 * A real, minimal `Spawner` (the `@endo/host-spawner` contract) over
 * `node:child_process`, so the worked loop's shell build step runs an actual
 * subprocess in the workspace — not a canned stub. Every tool in the loop is
 * driven against live capabilities; the shell is no exception.
 *
 * @type {import('@endo/host-spawner').Spawner}
 */
const realSpawner = async (argv, opts = {}) => {
  const [command, ...args] = argv;
  const child = spawn(command, args, {
    cwd: opts.cwd,
    // Node's coverage plumbing mutates the child's `env` object (it adds
    // `NODE_V8_COVERAGE` when the parent runs under c8), so hand `spawn` a
    // fresh extensible copy rather than the hardened `opts.env`, which is
    // non-extensible. With no env supplied, inherit the ambient environment.
    env: opts.env ? { ...opts.env } : undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const wait = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve(harden({ code, signal })));
  });
  return harden({
    pid: child.pid || 0,
    stdout: readableToAsyncIterable(child.stdout),
    stderr: readableToAsyncIterable(child.stderr),
    wait: () => wait,
    kill: async signal => {
      child.kill(/** @type {NodeJS.Signals | number | undefined} */ (signal));
    },
  });
};

/**
 * Bootstrap a workspace the way a host provisions one: clone the bare remote at
 * the host, then compose a `mount -> Git` over the cloned worktree, threading a
 * formula-owned commit identity (the Phase-2 `{ identity }` construction option
 * on `provideGit`) into the backend.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} remoteRoot
 * @param {{ identity?: { authorName: string, authorEmail: string } }} [options]
 */
const provisionHostWorkspace = async (t, remoteRoot, { identity } = {}) => {
  const parent = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'worked-loop-host-'),
  );
  t.teardown(() => fs.promises.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'worktree');
  await execFileAsync('git', ['clone', remoteRoot, root]);
  return composeGitOverWorktree(root, { identity });
};

/**
 * Provision a real, allowlisted `Shell` over the workspace worktree for the
 * build step. `node` is the only allowed command; the spawner is a genuine
 * child-process spawner.
 *
 * @param {string} root
 */
const provisionWorkspaceShell = root =>
  makeShell({
    cwd: root,
    policy: harden({
      allowedCommands: harden(['node']),
      timeoutMs: 30_000,
      maxOutputBytes: 1_000_000,
      env: harden({ PATH: process.env.PATH || '' }),
    }),
    spawner: realSpawner,
  });

/** @param {{ name: string, invoke: (a: Record<string, unknown>) => Promise<unknown> }[]} records */
const byNameOf = records => {
  const map = new Map(records.map(record => [record.name, record]));
  return name => {
    const record = map.get(name);
    if (!record) throw new Error(`no tool named ${name}`);
    return record;
  };
};

test('the version-controlled-filesystem loop closes end to end through provisioned tools', async t => {
  t.timeout(60_000);

  // The M3 exit criterion, driven entirely through the agent-tool catalog the
  // provisioning adapter composes — branch → edit via file tools → shell build
  // step → status / diff / commit via git tools → push via the remote tool →
  // inspect the pushed ref via `filesystemAt` — with the Phase-2 commit
  // identity threaded through `provideGit` and asserted on the pushed commit.
  const identity = harden({
    authorName: 'Fae Agent',
    authorEmail: 'fae@agents.invalid',
  });

  const remoteRoot = await seedBareRemote(t);
  const remoteUrl = pathToFileURL(remoteRoot).href;

  // Host provisioning: derive Git (with identity) + GitRemote over the mount.
  const workspace = await provisionHostWorkspace(t, remoteRoot, { identity });
  const { remote } = makeGitRemote({
    git: workspace.git,
    name: 'origin',
    policy: {
      url: remoteUrl,
      allowLocalFileTransport: true,
      allowedDirections: ['push'],
      fetchRefspecs: [],
      pushRefspecs: ['refs/heads/agent/*:refs/heads/agent/*'],
    },
  });

  // Compose the version-control catalog from the single Git grant (the file
  // tools are derived from its worktree mount) plus the push tier. Shell is a
  // separately-granted capability composed into its own group (see the loop's
  // build step): both makers emit an `inspect` tool, so a single flat catalog
  // holds at most one of them — an intentional fail-closed the adapter enforces.
  const vcs = byNameOf(
    await provisionWorkspaceTools({ git: workspace.git, remote }),
  );
  const shellTools = byNameOf(
    makeWorkspaceTools({ shell: provisionWorkspaceShell(workspace.root) }),
  );

  // 1. Branch off the cloned base.
  const created = /** @type {{ name: string }} */ (
    await vcs('createBranch').invoke({
      name: 'agent/loop',
      options: { switchAfterCreate: true },
    })
  );
  t.is(created.name, 'agent/loop');

  // 2. Edit an existing file and create a new one, through the file tools.
  const editedReadme = 'seed\nedited by the agent through the file tool\n';
  await vcs('mountWriteText').invoke({
    path: 'README.md',
    content: editedReadme,
  });
  const notes = 'agent notes\n';
  await vcs('mountWriteText').invoke({ path: 'AGENT.md', content: notes });

  // 3. Shell build step: a real subprocess in the workspace that reads the
  // agent's edit back — proving the shell tool runs against the same worktree.
  const build = /** @type {{ stdout: string, exitCode: number }} */ (
    await shellTools('exec').invoke({
      command: 'node',
      args: [
        '-e',
        'process.stdout.write(require("fs").readFileSync("README.md","utf8"))',
      ],
    })
  );
  t.is(build.exitCode, 0, 'the build step exits cleanly');
  t.is(build.stdout, editedReadme, 'the build step sees the agent edit');

  // 4. status → add → diff → commit → log, through the git tools.
  const dirty = /** @type {{ path: string }[]} */ (
    await vcs('status').invoke({})
  );
  const dirtyPaths = dirty.map(row => row.path).sort();
  t.deepEqual(dirtyPaths, ['AGENT.md', 'README.md']);

  await vcs('add').invoke({ paths: ['README.md', 'AGENT.md'] });

  const staged = /** @type {{ path: string, index?: string }[]} */ (
    await vcs('status').invoke({})
  );
  t.true(
    staged.every(row => row.index && row.index !== 'unmodified'),
    'both paths are staged after add',
  );

  const diff = /** @type {string} */ (
    await vcs('diff').invoke({ options: { cached: true } })
  );
  t.is(typeof diff, 'string');
  t.true(diff.includes('AGENT.md'), 'the staged diff names the new file');

  const commit = /** @type {{ oid: string }} */ (
    await vcs('commit').invoke({
      message: 'feat: agent worked-loop commit through provisioned tools',
    })
  );
  t.regex(commit.oid, /^[0-9a-f]{7,64}$/u);

  const log = /** @type {{ oid: string, summary: string }[]} */ (
    await vcs('log').invoke({})
  );
  t.is(
    log[0].summary,
    'feat: agent worked-loop commit through provisioned tools',
  );

  // 5. Push through the remote tool.
  const pushResult =
    /** @type {{ updatedRefs: { local: { oid: string }, remote: string, result: string }[] }} */ (
      await vcs('push').invoke({
        options: {
          source: 'refs/heads/agent/loop',
          destination: 'refs/heads/agent/loop',
          setUpstream: true,
        },
      })
    );
  const pushed = [...pushResult.updatedRefs];
  t.is(pushed.length, 1);
  const pushedOid = pushed[0].local.oid;
  t.regex(pushedOid, /^[0-9a-f]{40}$/u);
  t.is(pushed[0].remote, 'refs/heads/agent/loop');

  // The pushed commit is the commit the tools recorded.
  t.true(pushedOid.startsWith(commit.oid) || commit.oid.startsWith(pushedOid));

  // 6. Inspect the pushed ref through history tools over `filesystemAt`: the
  // read-only file tools over the pushed commit's tree read the edit back.
  const history = byNameOf(
    await provisionHistoryTools({ git: workspace.git, ref: pushedOid }),
  );
  const historyReadme = await history('mountReadText').invoke({
    path: 'README.md',
  });
  t.is(historyReadme, editedReadme, 'the pushed ref carries the edit');
  // The history view is read-only: it never advertises a write tool.
  t.throws(() => history('mountWriteText'), { message: /no tool named/ });

  // 7. The formula-owned identity attributed both author and committer of the
  // pushed commit — the Phase-2 boundary threaded through the whole loop.
  const { stdout: attribution } = await execFileAsync(
    'git',
    ['show', '-s', '--format=%an|%ae|%cn|%ce', pushedOid],
    { cwd: workspace.root },
  );
  t.is(
    attribution.trim(),
    'Fae Agent|fae@agents.invalid|Fae Agent|fae@agents.invalid',
  );
});

test('without an identity grant the loop attributes commits to the default author', async t => {
  t.timeout(60_000);

  // Regression evidence that the identity thread is load-bearing: the same loop
  // with no `{ identity }` falls back to the backend default `Endo
  // <endo@invalid.local>`, so the attribution asserted above is caused by the
  // grant, not incidental.
  const remoteRoot = await seedBareRemote(t);
  const workspace = await provisionHostWorkspace(t, remoteRoot);

  const vcs = byNameOf(await provisionWorkspaceTools({ git: workspace.git }));

  await vcs('createBranch').invoke({
    name: 'agent/default-identity',
    options: { switchAfterCreate: true },
  });
  await vcs('mountWriteText').invoke({
    path: 'README.md',
    content: 'seed\ndefault\n',
  });
  await vcs('add').invoke({ paths: ['README.md'] });
  const commit = /** @type {{ oid: string }} */ (
    await vcs('commit').invoke({ message: 'chore: default-identity commit' })
  );

  const { stdout: attribution } = await execFileAsync(
    'git',
    ['show', '-s', '--format=%an|%ae|%cn|%ce', commit.oid],
    { cwd: workspace.root },
  );
  t.is(attribution.trim(), 'Endo|endo@invalid.local|Endo|endo@invalid.local');
});
