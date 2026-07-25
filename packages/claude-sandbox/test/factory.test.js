// @ts-nocheck
/* eslint-disable import/order, no-empty-function, no-plusplus */

import '@endo/init';
import test from 'ava';

import { make } from '../src/claude-sandbox-factory.js';

// `E(target)` deep-hardens its target. Recording arrays therefore stay
// in closures (returned via a separate wrapper) rather than as
// properties on the objects the factory drives through `E()`. `Map`
// instances survive `harden` (their data lives in internal slots, not
// frozen own-properties), so recorders can be Maps/arrays in closures.
//
// Post-refactor the factory no longer mounts / mints slices itself: it
// validates the submission and formulates a first-class `claude-client`
// caplet via `hostAgent.makeUnconfined`. These tests assert that
// formulation (the specifier + env); the mount/slice/credential
// behaviour is covered by `claude-client-module.test.js`.

/**
 * Mock guest powers. The factory consumes the message stream via the
 * injected `iterateMessages` (see `make(..., { iterateMessages })`),
 * which returns this mock's simple `.next()` iterator directly.
 */
const makeMockPowers = () => {
  const formCalls = [];
  const replies = [];
  const dismissed = [];
  const pendingMessages = [];
  let nextWaiter = null;
  let formMessageNumber = 0;
  let currentFormId = null;

  const pushMessage = msg => {
    if (nextWaiter) {
      const w = nextWaiter;
      nextWaiter = null;
      w({ value: msg, done: false });
    } else {
      pendingMessages.push(msg);
    }
  };

  const messageIterator = {
    async next() {
      if (pendingMessages.length > 0) {
        return { value: pendingMessages.shift(), done: false };
      }
      return new Promise(resolve => {
        nextWaiter = resolve;
      });
    },
  };

  const valueStore = new Map();

  const powers = {
    async form(_target, _description, fields) {
      formCalls.push({ fields });
      formMessageNumber += 1;
      currentFormId = `form-${formMessageNumber}`;
      pushMessage({
        from: 'self-id',
        type: 'form',
        messageId: currentFormId,
        number: formMessageNumber,
      });
    },
    async lookup(name) {
      if (name === 'host-agent') return powers.hostAgent;
      throw new Error(`unknown lookup: ${name}`);
    },
    async locate(name) {
      if (name === '@self') return 'self-id';
      throw new Error(`unknown locate: ${name}`);
    },
    async listMessages() {
      return [];
    },
    followMessages() {
      return harden({ kind: 'fake-reader' });
    },
    async lookupById(id) {
      return valueStore.get(id);
    },
    async reply(number, body) {
      replies.push({ number, body });
    },
    async dismiss(number) {
      dismissed.push(number);
    },
  };

  return {
    powers,
    formCalls,
    replies,
    dismissed,
    iterateMessages: () => messageIterator,
    setHostAgent(hostAgent) {
      powers.hostAgent = hostAgent;
    },
    simulateSubmission(values, { number, replyTo } = {}) {
      const id = `value-${Date.now()}-${Math.random()}`;
      valueStore.set(id, values);
      pushMessage({
        from: 'host-id',
        type: 'value',
        number: number ?? ++formMessageNumber,
        replyTo: replyTo ?? currentFormId,
        valueId: id,
      });
    },
  };
};

const makeMockHostAgent = ({ filesystems = {}, evaluateThrows } = {}) => {
  const unconfinedCalls = [];
  const evaluateCalls = [];
  const removeCalls = [];
  const adoptCalls = [];
  const replyCalls = [];
  const dismissCalls = [];
  // Track the pet names the "daemon" would resolve, so `reply` can reject a
  // name that was never actually stored — mirroring the real daemon, which
  // throws "Unknown pet name" (mail.js). Without this the mock would green-light
  // a factory bug that replies with a name `makeUnconfined` never created.
  const storedNames = new Set();
  const nameKey = petName =>
    Array.isArray(petName) ? petName.join('/') : petName;
  const hostAgent = {
    // The form path validates that the operator's pet names exist (then endows
    // them by name); `filesystems` doubles as the existence map.
    async has(name) {
      return name in filesystems;
    },
    // The peer-package path adopts the caps from the host mailbox. The daemon
    // requires a non-empty edge name and a valid pet-name path.
    async adopt(number, edge, petName) {
      if (typeof edge !== 'string' || edge.length === 0) {
        throw new Error(`adopt: invalid edge name ${JSON.stringify(edge)}`);
      }
      adoptCalls.push({ number, edge, petName });
      storedNames.add(nameKey(petName));
    },
    async evaluate(workerName, source, codeNames, petNames, resultName) {
      evaluateCalls.push({
        workerName,
        source,
        codeNames,
        petNames,
        resultName,
      });
      if (evaluateThrows) throw new Error(evaluateThrows);
      if (resultName !== undefined) storedNames.add(nameKey(resultName));
      return harden({ kind: 'fake-powers', name: resultName });
    },
    async makeUnconfined(powersName, specifier, opts) {
      unconfinedCalls.push({ powersName, specifier, opts });
      if (opts.resultName !== undefined)
        storedNames.add(nameKey(opts.resultName));
      return harden({ kind: 'fake-client', name: opts.resultName });
    },
    async remove(name) {
      removeCalls.push(name);
      storedNames.delete(nameKey(name));
    },
    async reply(number, strings, edgeNames, petNames) {
      // Mirror the daemon's Mail.reply validation so an interface-shape mistake
      // fails here rather than only against a real daemon.
      if (petNames.length !== edgeNames.length) {
        throw new Error('reply: one pet name per edge name');
      }
      if (Number(strings.length) < Number(petNames.length)) {
        throw new Error('reply: one string before every delivered value');
      }
      for (const pn of petNames) {
        if (!storedNames.has(nameKey(pn))) {
          throw new Error(`reply: Unknown pet name ${nameKey(pn)}`);
        }
      }
      replyCalls.push({ number, strings, edgeNames, petNames });
    },
    async dismiss(number) {
      dismissCalls.push(number);
    },
    followMessages() {
      return harden({ kind: 'fake-host-reader' });
    },
  };
  return {
    hostAgent,
    unconfinedCalls,
    evaluateCalls,
    removeCalls,
    adoptCalls,
    replyCalls,
    dismissCalls,
  };
};

// A controllable host-message stream injected as `iterateHostMessages` to
// drive the factory's session-request loop in unit tests.
const makeHostMessageStream = () => {
  const pending = [];
  let waiter = null;
  const push = msg => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w({ value: msg, done: false });
    } else {
      pending.push(msg);
    }
  };
  const iterator = {
    async next() {
      if (pending.length > 0) {
        return { value: pending.shift(), done: false };
      }
      return new Promise(resolve => {
        waiter = resolve;
      });
    },
  };
  return { push, iterateHostMessages: () => iterator };
};

const sessionRequestPackage = (number, config, names = ['filesystem']) =>
  harden({
    type: 'package',
    number,
    names,
    strings: [JSON.stringify(config)],
  });

const waitFor = async (pred, deadlineMs = 2000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > deadlineMs) throw new Error('waitFor timeout');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 10));
  }
};

const wireDeps = (mock, host) => {
  mock.setHostAgent(host.hostAgent);
  return { iterateMessages: mock.iterateMessages };
};

test('factory presents the Create Claude Sandbox form to @host', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();

  const exo = make(mock.powers, undefined, wireDeps(mock, host));

  t.regex(exo.help(), /ClaudeSandboxFactory/);
  await waitFor(() => mock.formCalls.length > 0);
  const names = mock.formCalls[0].fields.map(f => f.name);
  t.deepEqual(names, [
    'name',
    'filesystem',
    'rootfs',
    'network',
    'model',
    'credentials',
    'initialPrompt',
  ]);
});

test('submission formulates a claude-client caplet with the right env', async t => {
  const fsCap = { kind: 'fake-fs' };
  const credCap = { kind: 'fake-creds' };
  const mock = makeMockPowers();
  // Form path: the operator's pet names are resolved to caps with host
  // authority (legitimate — the submitter is the host).
  const host = makeMockHostAgent({
    filesystems: { 'my-fs': fsCap, 'my-creds': credCap },
  });

  make(mock.powers, undefined, wireDeps(mock, host));

  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({
    name: 'my-claude',
    filesystem: 'my-fs',
    network: 'private',
    credentials: 'my-creds',
    model: 'claude-sonnet-4-6',
  });

  await waitFor(() => host.unconfinedCalls.length > 0);
  const call = host.unconfinedCalls[0];

  // First-class formulation, stored under the chosen pet name.
  t.is(call.powersName, '@main');
  t.regex(call.specifier, /claude-client-module\.js$/);
  t.is(call.opts.resultName, 'my-claude');
  // Least authority: the client runs as a per-session powers cap, not @agent
  // and not a shared cap. The name is per-session (`claude-<sessionId>-powers`).
  t.regex(call.opts.powersName, /^claude-my-claude-.*-powers$/);

  // The per-session powers was built by `evaluate`, endowing the operator's
  // own pet names **directly** (the form path does not storeValue — the names
  // already exist in the host petstore), plus `@agent` for provideMount.
  t.is(host.evaluateCalls.length, 1);
  const evalCall = host.evaluateCalls[0];
  t.is(evalCall.resultName, call.opts.powersName);
  t.deepEqual(evalCall.petNames, [
    '@agent',
    'sandbox-factory',
    'fs-mounter',
    'my-fs',
    'my-creds',
  ]);
  t.deepEqual(evalCall.codeNames, [
    'agent',
    'sandboxFactory',
    'fsMounter',
    'filesystem',
    'credentials',
  ]);
  // Only the per-session powers name is removed — the operator's `my-fs` /
  // `my-creds` names are durable and must NOT be removed.
  t.deepEqual(host.removeCalls, [call.opts.powersName]);

  const { env } = call.opts;
  // Caps are passed by reference through powers — no cap-name env vars.
  t.is(env.FILESYSTEM_NAME, undefined);
  t.is(env.CREDENTIALS_NAME, undefined);
  t.is(env.SANDBOX_FACTORY_NAME, undefined);
  t.is(env.NETWORK, 'private');
  t.is(env.MODEL, 'claude-sonnet-4-6');
  t.is(env.BACKEND, 'podman');
  t.is(env.WORKSPACE_PATH, '/workspace');
  t.regex(env.SESSION_ID, /^my-claude-/);
  t.regex(env.WORKSPACE_MOUNT_POINT, /claude-sandbox-my-claude-/);
  // No secret is threaded through the formula env.
  t.is(env.ANTHROPIC_API_KEY, undefined);
  t.is(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);

  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /ClaudeClient "my-claude" created/);
});

test('SANDBOX_NAMESPACE endows the infra caps under the factory directory', async t => {
  const fsCap = { kind: 'fake-fs' };
  const mock = makeMockPowers();
  const host = makeMockHostAgent({ filesystems: { 'my-fs': fsCap } });

  // The provisioner sets SANDBOX_NAMESPACE so the per-session powers endows
  // `claude-sandbox/sandbox-factory` and `claude-sandbox/fs-mounter` by path,
  // rather than the bare top-level names.
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    env: { SANDBOX_NAMESPACE: 'claude-sandbox' },
  });

  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({
    name: 'ns-claude',
    filesystem: 'my-fs',
    network: 'private',
  });

  await waitFor(() => host.evaluateCalls.length > 0);
  t.deepEqual(host.evaluateCalls[0].petNames, [
    '@agent',
    ['claude-sandbox', 'sandbox-factory'],
    ['claude-sandbox', 'fs-mounter'],
    'my-fs',
  ]);
});

test('submission with an unknown filesystem replies with an error', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent({ filesystems: {} });

  make(mock.powers, undefined, wireDeps(mock, host));

  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({ name: 'x', filesystem: 'missing-fs' });

  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /Error creating sandbox/);
  t.is(host.unconfinedCalls.length, 0);
});

test('submission with an unknown network profile is rejected', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent({
    filesystems: { 'my-fs': { kind: 'fake-fs' } },
  });

  make(mock.powers, undefined, wireDeps(mock, host));

  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({
    name: 'x',
    filesystem: 'my-fs',
    network: 'wide-open',
  });

  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /Unknown network profile/);
  t.is(host.unconfinedCalls.length, 0);
});

test('submission naming absent credentials replies with an error', async t => {
  const mock = makeMockPowers();
  // Filesystem exists, credentials pet name does not.
  const host = makeMockHostAgent({
    filesystems: { 'my-fs': { kind: 'fake-fs' } },
  });

  make(mock.powers, undefined, wireDeps(mock, host));

  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({
    name: 'x',
    filesystem: 'my-fs',
    credentials: 'no-such-creds',
    network: 'private',
  });

  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /Unknown credentials/);
  t.is(host.unconfinedCalls.length, 0);
});

test('duplicate form replies are ignored (replay guard)', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent({
    filesystems: { 'my-fs': { kind: 'fake-fs' } },
  });

  make(mock.powers, undefined, wireDeps(mock, host));

  await waitFor(() => mock.formCalls.length > 0);
  const payload = { name: 'replay', filesystem: 'my-fs', network: 'private' };
  mock.simulateSubmission(payload, { number: 99, replyTo: 'form-1' });
  await waitFor(() => host.unconfinedCalls.length >= 1);
  mock.simulateSubmission(payload, { number: 99, replyTo: 'form-1' });
  await new Promise(r => setTimeout(r, 100));
  t.is(host.unconfinedCalls.length, 1);
  // The consumed form reply is dismissed, so a daemon restart's replay does not
  // re-create/overwrite the reincarnated session (durable, not just in-memory).
  t.deepEqual(mock.dismissed, [99]);
});

// --- Peer session-request package path (handleSessionRequest / loop) ---

test('a session-request package adopts the cap, formulates, replies, and dismisses', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  stream.push(
    sessionRequestPackage(7, {
      kind: 'claude-sandbox-session',
      name: 'peer-1',
      network: 'private',
    }),
  );
  await waitFor(() => host.replyCalls.length > 0);

  // Adopted the filesystem edge into a temp host name and endowed THAT name.
  t.is(host.adoptCalls.length, 1);
  t.like(host.adoptCalls[0], { number: 7, edge: 'filesystem' });
  t.regex(host.adoptCalls[0].petName, /^claude-peer-1-.*-fscap$/);
  t.is(host.evaluateCalls[0].petNames[3], host.adoptCalls[0].petName);

  // Host-rooted under a Date.now()-bearing leaf (restart-collision-safe).
  const { resultName } = host.unconfinedCalls[0].opts;
  t.regex(resultName, /^session-peer-1-/);

  // Replied with a `client` edge naming the session, then dismissed the request.
  t.deepEqual(host.replyCalls[0].edgeNames, ['client']);
  t.is(host.replyCalls[0].petNames[0], resultName);
  t.deepEqual(host.dismissCalls, [7]);

  // No residue: the adopted temp name and powers were removed.
  t.true(host.removeCalls.includes(host.adoptCalls[0].petName));
});

test('a session-request package with a credentials edge adopts both caps', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  stream.push(
    sessionRequestPackage(
      8,
      { kind: 'claude-sandbox-session', name: 'peer-2', network: 'private' },
      ['filesystem', 'credentials'],
    ),
  );
  await waitFor(() => host.replyCalls.length > 0);

  t.is(host.adoptCalls.length, 2);
  t.deepEqual(
    host.adoptCalls.map(c => c.edge),
    ['filesystem', 'credentials'],
  );
  const evalCall = host.evaluateCalls[0];
  t.is(evalCall.petNames.length, 5);
  t.regex(evalCall.petNames[3], /-fscap$/);
  t.regex(evalCall.petNames[4], /-credcap$/);
  t.true(evalCall.codeNames.includes('credentials'));
});

test('a package without the kind marker is ignored (no hijack of host traffic)', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  // An unrelated filesystem-edged package (no marker) followed by a real one.
  stream.push(sessionRequestPackage(10, { name: 'not-a-session' }));
  stream.push(
    sessionRequestPackage(11, {
      kind: 'claude-sandbox-session',
      name: 'peer-3',
      network: 'private',
    }),
  );
  await waitFor(() => host.replyCalls.length > 0);

  // Only the marked request (11) was handled; the unmarked one was skipped
  // (not adopted, not replied, not dismissed).
  t.is(host.adoptCalls.length, 1);
  t.is(host.replyCalls.length, 1);
  t.deepEqual(host.dismissCalls, [11]);
});

test('a session-request that fails formulation replies an error, cleans up, and dismisses', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent({ evaluateThrows: 'boom' });
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  stream.push(
    sessionRequestPackage(12, {
      kind: 'claude-sandbox-session',
      name: 'peer-4',
      network: 'private',
    }),
  );
  await waitFor(() => host.replyCalls.length > 0);

  // No client formulated; error replied; request still dismissed.
  t.is(host.unconfinedCalls.length, 0);
  t.regex(host.replyCalls[0].strings.join('\n'), /Error creating sandbox/);
  t.deepEqual(host.replyCalls[0].edgeNames, []);
  t.deepEqual(host.dismissCalls, [12]);
  // The adopted temp name was cleaned up despite the failure (no orphan).
  t.true(host.removeCalls.includes(host.adoptCalls[0].petName));
});

test('a duplicate session-request number is processed once (mailbox replay guard)', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  // The SAME message number redelivered (as a restart's `followMessages`
  // replay would) must not double-adopt / double-formulate the session.
  const pkg = sessionRequestPackage(20, {
    kind: 'claude-sandbox-session',
    name: 'dup-1',
    network: 'private',
  });
  stream.push(pkg);
  await waitFor(() => host.replyCalls.length > 0);
  stream.push(pkg);
  // Give the loop a chance to (not) reprocess.
  await new Promise(r => setTimeout(r, 50));

  t.is(host.adoptCalls.length, 1, 'adopted exactly once');
  t.is(host.unconfinedCalls.length, 1, 'formulated exactly once');
  t.is(host.replyCalls.length, 1, 'replied exactly once');
  t.deepEqual(host.dismissCalls, [20]);
});

test('concurrent session-request packages each get a distinct session, no residue', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  // Two requests back-to-back exercise the shared sessionCounter/tempCounter
  // and the interleaved evaluate→makeUnconfined→remove name dance.
  stream.push(
    sessionRequestPackage(30, {
      kind: 'claude-sandbox-session',
      name: 'conc-a',
      network: 'private',
    }),
  );
  stream.push(
    sessionRequestPackage(31, {
      kind: 'claude-sandbox-session',
      name: 'conc-b',
      network: 'private',
    }),
  );
  await waitFor(() => host.replyCalls.length >= 2);

  t.is(host.unconfinedCalls.length, 2);
  const names = host.unconfinedCalls.map(c => c.opts.resultName);
  t.regex(names[0], /^session-conc-a-/);
  t.regex(names[1], /^session-conc-b-/);
  t.not(names[0], names[1], 'distinct session names');
  // Distinct per-session powers + adopt temp names (no counter collision).
  const powers = host.evaluateCalls.map(c => c.resultName);
  t.not(powers[0], powers[1]);
  const fscaps = host.adoptCalls.map(c => c.petName);
  t.not(fscaps[0], fscaps[1]);
  // Both requests dismissed; every temp powers/adopt name was removed (only
  // the two client names should survive).
  t.deepEqual(host.dismissCalls.slice().sort(), [30, 31]);
  for (const n of [...powers, ...fscaps]) {
    t.true(host.removeCalls.includes(n), `removed ${n}`);
  }
});

test('a marked-but-malformed session request is answered with an error and dismissed', async t => {
  const mock = makeMockPowers();
  const host = makeMockHostAgent();
  const stream = makeHostMessageStream();
  make(mock.powers, undefined, {
    ...wireDeps(mock, host),
    iterateHostMessages: stream.iterateHostMessages,
  });

  // Marked as ours, but no `filesystem` edge — must NOT be silently ignored
  // (which would strand the peer), but replied-to and dismissed.
  stream.push(
    sessionRequestPackage(
      40,
      { kind: 'claude-sandbox-session', name: 'bad-1', network: 'private' },
      [],
    ),
  );
  await waitFor(() => host.replyCalls.length > 0);

  t.is(host.adoptCalls.length, 0, 'nothing adopted');
  t.is(host.unconfinedCalls.length, 0, 'nothing formulated');
  t.regex(host.replyCalls[0].strings.join('\n'), /filesystem. edge/);
  t.deepEqual(host.dismissCalls, [40]);
});
