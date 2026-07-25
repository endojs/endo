// @ts-nocheck
/* eslint-disable import/order */

import '@endo/init/debug.js';
import test from 'ava';

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';

import { E } from '@endo/far';
import { start, stop, purge, makeEndoClient } from '@endo/daemon';

import { main as provisionFactory } from '../factory.js';
import { main as provisionCredentials } from '../credentials.js';

const dirname = fileURLToPath(new URL('.', import.meta.url));

// The shipped Node-backed Filesystem caplet; minted under a host pet name so
// the form path (and the peer's own daemon) can hand it to a session.
const nodeFsModuleHref = pathToFileURL(
  path.join(
    dirname,
    '..',
    '..',
    'platform',
    'src',
    'fs',
    'extended',
    'node-fs-module.js',
  ),
).href;

// The per-session powers `evaluate` resolves `sandbox-factory` / `fs-mounter`
// eagerly (caps-by-reference) under the factory's directory, so they must
// exist before a session is created. The real flow mints them in setup-host.js;
// here we mint trivial stubs (setup-host.js mints the real ones; status()/the
// unname path never call them).
const mintStub = (host, resultPath) =>
  E(host).evaluate(
    '@main',
    `Far('stub', { help: () => 'stub' })`,
    harden([]),
    harden([]),
    resultPath,
  );

// provisionFactory creates the `claude-sandbox/` directory; the factory caplet
// runs with SANDBOX_NAMESPACE='claude-sandbox', so the infra it endows lives at
// claude-sandbox/{sandbox-factory,fs-mounter}.
const provisionSandboxDeps = async host => {
  await mintStub(host, ['claude-sandbox', 'sandbox-factory']);
  await mintStub(host, ['claude-sandbox', 'fs-mounter']);
};

const makeConfig = name => ({
  statePath: path.join(dirname, 'tmp', name, 'state'),
  ephemeralStatePath: path.join(dirname, 'tmp', name, 'run'),
  cachePath: path.join(dirname, 'tmp', name, 'cache'),
  // The daemon's Unix domain socket path must stay under the ~108-char
  // sun_path limit. Under the repo checkout the per-test path
  // (…/packages/claude-sandbox/test/tmp/<name>/endo.sock) overruns it on
  // CI's long runner path for longer <name>s, so anchor the socket in the
  // OS temp dir with a short random name instead.
  sockPath: path.join(
    os.tmpdir(),
    `endo-cs-${randomBytes(6).toString('hex')}.sock`,
  ),
  address: '127.0.0.1:0',
  pets: new Map(),
  values: new Map(),
});

const prepareHost = async (t, name) => {
  let cancel;
  const cancelled = new Promise((_resolve, reject) => {
    cancel = reject;
  });
  cancelled.catch(() => {});
  const config = makeConfig(name);
  await purge(config);
  await start(config);
  t.teardown(async () => {
    // Fully stop the daemon before the next serial test starts, so a lingering
    // daemon-node child can't SIGTERM into the next test's startup. Cancel the
    // client connection only after the daemon is down.
    await stop(config).catch(() => {});
    cancel(new Error('teardown'));
    try {
      rmSync(path.join(dirname, 'tmp', name), { recursive: true, force: true });
    } catch {
      // ignore
    }
    // The socket lives in os.tmpdir() (sun_path-limit workaround), so it is not
    // under tmp/<name> — remove it explicitly or it leaks across CI runs.
    try {
      rmSync(config.sockPath, { force: true });
    } catch {
      // ignore
    }
  });
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  return { host, config, cancelled };
};

test.serial(
  'provisioning nests under directories, keeps the host root clean, and is idempotent',
  async t => {
    t.timeout(120_000);
    const { host } = await prepareHost(t, 'nesting');

    await provisionFactory(host);

    // The factory's objects (service + guest agent/handle) landed inside
    // the directory — proving the post-makeUnconfined `move`s ran.
    for (const name of ['service', 'profile', 'handle']) {
      // eslint-disable-next-line no-await-in-loop
      const present = await E(host).has('claude-sandbox', name);
      t.true(present, `claude-sandbox/${name} exists`);
    }

    // The host root is clean: the temp names the provisioner mints and then
    // `move`s into the directory do not linger at the root.
    const root = await E(host).list();
    for (const n of ['claude-sandbox-guest', 'claude-sandbox-agent']) {
      t.false(
        root.includes(n),
        `host root polluted with ${n}: ${root.join(', ')}`,
      );
    }
    t.true(root.includes('claude-sandbox'), 'the directory itself is at root');

    // A markdown blob documents the directory's objects + sharing security.
    // It is a verbatim copy of the on-disk source markdown.
    const readme = await E(host).lookup(['claude-sandbox', 'readme.md']);
    const readmeText = await E(readme).text();
    const readmeSource = readFileSync(
      new URL('../docs/claude-sandbox-directory.md', import.meta.url),
      'utf8',
    );
    t.true(readmeSource.length > 0, 'the source markdown is not empty');
    t.is(readmeText, readmeSource, 'the blob is a copy of the source markdown');

    // Idempotent: a second run is a no-op (no throw, same service, no dup).
    const c1 = await E(host).lookup(['claude-sandbox', 'service']);
    await t.notThrowsAsync(() => provisionFactory(host));
    const c2 = await E(host).lookup(['claude-sandbox', 'service']);
    t.is(c1, c2, 'no duplicate service on re-run');

    // The credentials provisioner nests into its own directory the same way.
    await provisionCredentials(host);
    for (const name of ['service', 'profile', 'handle']) {
      // eslint-disable-next-line no-await-in-loop
      const present = await E(host).has('claude-credentials', name);
      t.true(present, `claude-credentials/${name} exists`);
    }
    const root2 = await E(host).list();
    t.false(
      root2.includes('claude-credentials-guest'),
      'no credentials temp residue at root',
    );
    const credReadme = await E(host).lookup([
      'claude-credentials',
      'readme.md',
    ]);
    const credText = await E(credReadme).text();
    const credSource = readFileSync(
      new URL('../docs/claude-credentials-directory.md', import.meta.url),
      'utf8',
    );
    t.true(credSource.length > 0, 'the source markdown is not empty');
    t.is(credText, credSource, 'the blob is a copy of the source markdown');
  },
);

test.serial('daemon boots and the host responds', async t => {
  t.timeout(60_000);
  const { host } = await prepareHost(t, 'probe');
  const names = await E(host).list();
  t.true(Array.isArray(names));
});

test.serial(
  'the @host form path stores a ClaudeClient under its pet name',
  async t => {
    t.timeout(120_000);
    const { host } = await prepareHost(t, 'form-path');

    const workspaceDir = path.join(dirname, 'tmp', 'form-path', 'workspace');
    mkdirSync(workspaceDir, { recursive: true });
    await E(host).makeUnconfined('@main', nodeFsModuleHref, {
      resultName: 'project-fs',
      env: harden({ ENDO_FS_ROOT: workspaceDir }),
    });

    await provisionFactory(host);
    await provisionSandboxDeps(host);

    // Drive the form the way the operator does: the factory posts a "Create
    // Claude Sandbox" form into @host's inbox; submitting it formulates the
    // session under the chosen pet name. `runFactory` posts the form in the
    // background after the service caplet resolves, so poll for it.
    const findForm = async () => {
      const messages = await E(host).listMessages();
      return messages.find(
        m => m.type === 'form' && m.description === 'Create Claude Sandbox',
      );
    };
    let form;
    const formDeadline = Date.now() + 20_000;
    while (Date.now() < formDeadline) {
      // eslint-disable-next-line no-await-in-loop
      form = await findForm();
      if (form) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    t.truthy(form, 'factory posted a form to @host');

    await E(host).submit(
      form.number,
      harden({
        name: 'form-client',
        filesystem: 'project-fs',
        rootfs: 'oci:docker.io/library/alpine:3.19',
        network: 'private',
        model: '',
        credentials: '',
        initialPrompt: '',
      }),
    );

    // The factory's inbox loop processes the reply asynchronously; poll for
    // the resulting pet name rather than racing it.
    const deadline = Date.now() + 30_000;
    let stored = false;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      if (await E(host).has('form-client')) {
        stored = true;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    t.true(stored, 'submission stored the ClaudeClient under its pet name');

    const client = await E(host).lookup('form-client');
    const status = await E(client).status();
    t.regex(status.sessionId, /^form-client-/);
    t.is(status.terminated, false);

    // Host-rooted: removing the pet name fires the whenCancelled teardown.
    await E(host).remove('form-client');
    t.false(await E(host).has('form-client'), 'remove deletes the formula');
  },
);

// The daemon's loopback-TCP test transport, loaded the same way the daemon's
// own multi-daemon tests do (`prepareHostWithTestNetwork` in
// packages/daemon/test/endo.test.js). It lets two in-process daemons reach
// each other over a real CapTP mesh connection.
const daemonNetworkHref = pathToFileURL(
  path.join(
    dirname,
    '..',
    '..',
    'daemon',
    'src',
    'networks',
    'tcp-netstring.js',
  ),
).href;

// Install the loopback-TCP network on a host so it can be introduced to peers
// (mirrors the daemon test's `prepareHostWithTestNetwork`).
const installTestNetwork = async host => {
  await E(host).storeValue('127.0.0.1:0', 'tcp-listen-addr');
  const network = await E(host).makeUnconfined('@main', daemonNetworkHref, {
    powersName: '@agent',
    resultName: 'test-network',
  });
  await network;
  await E(host).move(['test-network'], ['@nets', 'tcp']);
};

const prepareNetworkedHost = async (t, name) => {
  const prepared = await prepareHost(t, name);
  await installTestNetwork(prepared.host);
  return prepared;
};

// This is the real deployment topology (DEMO.md): the host runs the
// containers and the factory; a *separate* peer owns the workspace. It pins
// down how a peer's cap can cross to the host so the factory can endow it
// into a per-session powers formula.
//
// Findings (this test is the evidence):
//  - A cap passed as a bare CapTP argument arrives on the host as a presence
//    with no local formula id, so `storeValue`/marshal cannot capture it
//    ("No corresponding formula").
//  - `storeLocator` names a remote id but does NOT mark it as a tracked
//    import (no `thisDiesIfThatDies`) and discards the peer's addresses, so
//    it is not a safe way to bring a peer's cap across.
//  - The correct path is `send`/`adopt`: the peer sends its cap in a package;
//    the host adopts it by edge name, which runs `thisDiesIfThatDies` to
//    mark it as an import, and yields a name the host can endow *by name*
//    into the eval worker (a remote formula id is a valid endowment).
test.serial(
  'a remote peer cap reaches the host via send/adopt and is endowable by name',
  async t => {
    t.timeout(120_000);
    const { host } = await prepareNetworkedHost(t, 'xpeer-host');
    const { host: peer } = await prepareNetworkedHost(t, 'xpeer-peer');

    // Introduce the daemons in both directions over the mesh.
    await E(host).addPeerInfo(await E(peer).getPeerInfo());
    await E(peer).addPeerInfo(await E(host).getPeerInfo());

    // The Filesystem cap lives on the PEER — remote to the host.
    const peerWorkspace = path.join(dirname, 'tmp', 'xpeer-peer', 'workspace');
    mkdirSync(peerWorkspace, { recursive: true });
    await E(peer).makeUnconfined('@main', nodeFsModuleHref, {
      resultName: 'project-fs',
      env: harden({ ENDO_FS_ROOT: peerWorkspace }),
    });

    // A bare remote presence cannot be marshalled into a new formula: the
    // host has no formula id for a cap it only received as a CapTP argument.
    const fsPresence = await E(peer).lookup('project-fs');
    await t.throwsAsync(
      () => E(host).storeValue(fsPresence, 'remote-fs-by-value'),
      { message: /No corresponding formula/ },
      'storeValue cannot capture a bare remote presence',
    );

    // Establish a mailbox relationship: the sender (peer) invites, the
    // recipient (host) accepts. Now the peer can `send` packages to the host.
    const invitation = await E(peer).invite('sandbox-host');
    const invitationLocator = await E(invitation).locate();
    await E(host).accept(invitationLocator, 'remote-peer');

    // The peer sends its own Filesystem cap as a package (named in the peer's
    // namespace). The host adopts it by edge name, which marks it as a
    // tracked import (`thisDiesIfThatDies`) under a host name.
    await E(peer).send(
      'sandbox-host',
      ['here is my workspace'],
      ['filesystem'],
      ['project-fs'],
    );
    const messages = /** @type {any[]} */ (await E(host).listMessages());
    const pkg = messages.find(
      m => m.type === 'package' && m.strings?.[0] === 'here is my workspace',
    );
    t.truthy(pkg, 'host received the package from the peer');
    await E(host).adopt(pkg.number, 'filesystem', ['remote-fs']);

    // The adopted cap is endowable *by name* into an eval worker, which
    // invokes a method on it across the mesh.
    const reachedRemoteCap = await E(host).evaluate(
      '@main',
      'E(fs).__getMethodNames__().then(ns => Array.isArray(ns) && ns.length > 0)',
      harden(['fs']),
      harden(['remote-fs']),
      'probe-result',
    );
    t.true(
      reachedRemoteCap,
      'host endowed and invoked the adopted remote fs cap by name',
    );
  },
);

// End-to-end peer flow through the factory: a remote peer sends a
// session-request *package* (its Filesystem cap + a JSON config) to the host;
// the factory's host-mailbox loop adopts the cap, formulates a session, and
// replies with the ClaudeClient cap, which the peer adopts and drives. This is
// the cross-peer path the send/adopt rewrite exists for — the peer never
// passes a cap as a bare argument, and the host never resolves a peer name.
test.serial(
  'a remote peer creates a session by sending a workspace package to the factory',
  async t => {
    t.timeout(120_000);
    const { host } = await prepareNetworkedHost(t, 'pkg-host');
    const { host: peer } = await prepareNetworkedHost(t, 'pkg-peer');

    await E(host).addPeerInfo(await E(peer).getPeerInfo());
    await E(peer).addPeerInfo(await E(host).getPeerInfo());

    // The workspace Filesystem lives on the peer.
    const peerWorkspace = path.join(dirname, 'tmp', 'pkg-peer', 'workspace');
    mkdirSync(peerWorkspace, { recursive: true });
    await E(peer).makeUnconfined('@main', nodeFsModuleHref, {
      resultName: 'project-fs',
      env: harden({ ENDO_FS_ROOT: peerWorkspace }),
    });

    // Provision the factory on the host; its session-request loop watches the
    // host mailbox.
    await provisionFactory(host);
    await provisionSandboxDeps(host);

    // Mailbox relationship: the peer (sender) invites, the host (recipient)
    // accepts. Now the peer can `send` packages to the host.
    const invitation = await E(peer).invite('sandbox-host');
    const invitationLocator = await E(invitation).locate();
    await E(host).accept(invitationLocator, 'remote-peer');

    // The peer sends its Filesystem cap + a JSON config as a package. The
    // config is marked `kind: 'claude-sandbox-session'` so the factory's host
    // loop recognises it (and ignores unrelated filesystem-edged traffic).
    await E(peer).send(
      'sandbox-host',
      [
        JSON.stringify({
          kind: 'claude-sandbox-session',
          name: 'pkg-1',
          rootfs: 'oci:docker.io/library/alpine:3.19',
          network: 'private',
        }),
      ],
      ['filesystem'],
      ['project-fs'],
    );

    // The factory replies with a package carrying the `client` edge. Poll the
    // peer inbox for it.
    const findReply = async () => {
      const messages = /** @type {any[]} */ (await E(peer).listMessages());
      return messages.find(
        m => m.type === 'package' && (m.names || []).includes('client'),
      );
    };
    let reply;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      reply = await findReply();
      if (reply) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    t.truthy(reply, 'factory replied with a client package');

    // Adopt the client and drive it across the mesh.
    await E(peer).adopt(reply.number, 'client', ['remote-client']);
    const client = await E(peer).lookup(['remote-client']);
    const status = await E(client).status();
    t.regex(status.sessionId, /^pkg-1-/, 'session id derives from the name');
    t.is(status.terminated, false);

    // The session is host-rooted under the factory directory (the reply
    // attaches by name), using a factory-minted leaf — not the peer's raw name.
    const sessions = await E(host).list('claude-sandbox');
    t.true(
      sessions.some(n => n.startsWith('session-pkg-1-')),
      `host-rooted session present under claude-sandbox/; saw: ${sessions.join(', ')}`,
    );
    // No per-session endowment residue (the adopted temp names were removed).
    const hostRoot = await E(host).list();
    t.false(
      hostRoot.some(n => n.endsWith('-fscap') || n.endsWith('-powers')),
      `no endowment residue at host root; saw: ${hostRoot.join(', ')}`,
    );
  },
);
