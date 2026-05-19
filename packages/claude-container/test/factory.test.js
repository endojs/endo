// @ts-nocheck
/* global setTimeout */
/* eslint-disable import/order, no-empty-function, no-plusplus, no-underscore-dangle */

import '@endo/init';
import test from 'ava';

import { make } from '../src/claude-container-factory.js';

/**
 * Mock `guest powers` capability with the surface the factory caplet uses:
 * form, lookup, locate, listMessages, followMessages, reply, lookupById.
 *
 * Lets the test drive simulated form replies into the iterator and inspect
 * what reply payloads come back.
 */
const makeMockPowers = ({ filesystem = {}, hostAgent }) => {
  /** @type {any[]} */
  const formCalls = [];
  /** @type {any[]} */
  const replies = [];
  /** @type {any[]} */
  const pendingMessages = [];
  /** @type {((value: any) => void) | null} */
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

  /** @type {any} */
  const powers = {
    async form(_target, _description, fields) {
      formCalls.push({ fields });
      // Inject the form message itself so the factory's bootstrap path
      // picks it up.
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
      if (name === 'host-agent') return hostAgent;
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
      return messageIterator;
    },
    async lookupById(id) {
      return valueStore.get(id);
    },
    async reply(number, body, _attachments, _types) {
      replies.push({ number, body });
    },
  };

  return {
    powers,
    formCalls,
    replies,
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

const makeMockHostAgent = ({ filesystems = {} } = {}) => {
  const stored = new Map();
  return {
    storedValues: stored,
    async lookup(name) {
      return filesystems[name];
    },
    async storeValue(value, name) {
      stored.set(name, value);
    },
  };
};

const waitFor = async (pred, deadlineMs = 1000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > deadlineMs) throw new Error('waitFor timeout');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 10));
  }
};

test('factory presents the Create Claude Container form to @host', async t => {
  const hostAgent = makeMockHostAgent();
  const mock = makeMockPowers({ hostAgent });
  const orchestrator = {
    async createSession() {
      return {
        id: 's1',
        state: 'pending',
        fsSocketPath: '/x',
        controlSocketPath: '/x',
        attachSocketPath: '/x',
        createdAt: '2026-05-15T00:00:00Z',
      };
    },
    async markReady() {},
    async terminateSession() {},
    async sendPrompt() {},
  };

  const exo = make(mock.powers, undefined, {
    orchestrator,
    bridgeFactory: () => ({
      async start() {},
      async stop() {},
    }),
    clientFactory: ({ session }) => ({ id: session.id, _kind: 'mock-client' }),
  });

  t.regex(exo.help(), /ClaudeContainerFactory/);
  await waitFor(() => mock.formCalls.length > 0);
  t.is(mock.formCalls.length, 1);
  const names = mock.formCalls[0].fields.map(f => f.name);
  t.deepEqual(names, [
    'name',
    'filesystem',
    'network',
    'model',
    'credentials',
    'initialPrompt',
  ]);
});

test('factory creates a ClaudeClient on form submission and stores it under the chosen name', async t => {
  const fsCap = { _kind: 'fake-fs' };
  const hostAgent = makeMockHostAgent({ filesystems: { 'my-fs': fsCap } });
  const mock = makeMockPowers({ hostAgent });

  let createCalls = 0;
  let markReadyCalls = 0;
  const orchestrator = {
    async createSession(opts) {
      createCalls += 1;
      t.is(opts.network, 'egress');
      t.is(opts.attachMode, 'stream');
      return {
        id: 'session-42',
        state: 'pending',
        fsSocketPath: '/x',
        controlSocketPath: '/x',
        attachSocketPath: '/x',
        createdAt: '2026-05-15T00:00:00Z',
      };
    },
    async markReady(id) {
      markReadyCalls += 1;
      t.is(id, 'session-42');
    },
    async terminateSession() {},
    async sendPrompt() {},
  };

  let bridgeStarted = 0;
  const bridgeFactory = ({ fs, socketPath }) => {
    t.is(fs, fsCap);
    t.is(socketPath, '/x');
    return {
      async start() {
        bridgeStarted += 1;
      },
      async stop() {},
    };
  };

  const clientFactory = ({ session }) => ({
    id: session.id,
    _kind: 'mock-client',
  });

  make(mock.powers, undefined, { orchestrator, bridgeFactory, clientFactory });

  await waitFor(() => mock.formCalls.length > 0);

  mock.simulateSubmission({
    name: 'my-claude',
    filesystem: 'my-fs',
    network: 'egress',
    model: 'claude-sonnet-4-6',
    initialPrompt: '',
  });

  await waitFor(() => hostAgent.storedValues.size > 0, 2000);
  t.is(createCalls, 1);
  t.is(markReadyCalls, 1);
  t.is(bridgeStarted, 1);
  t.true(hostAgent.storedValues.has('my-claude'));
  t.is(hostAgent.storedValues.get('my-claude')._kind, 'mock-client');

  await waitFor(() => mock.replies.length > 0, 2000);
  t.regex(mock.replies[0].body.join('\n'), /ClaudeClient "my-claude" created/);
});

test('factory replies with an error if the named filesystem cannot be resolved', async t => {
  const hostAgent = makeMockHostAgent({ filesystems: {} });
  const mock = makeMockPowers({ hostAgent });
  const orchestrator = {
    async createSession() {
      throw new Error('should not be called');
    },
    async markReady() {},
    async terminateSession() {},
    async sendPrompt() {},
  };
  make(mock.powers, undefined, {
    orchestrator,
    bridgeFactory: () => ({
      async start() {},
      async stop() {},
    }),
    clientFactory: () => ({}),
  });

  await waitFor(() => mock.formCalls.length > 0);

  mock.simulateSubmission({
    name: 'x',
    filesystem: 'missing-fs',
    network: 'egress',
  });

  await waitFor(() => mock.replies.length > 0, 2000);
  t.regex(mock.replies[0].body.join('\n'), /Error creating container/);
  t.is(hostAgent.storedValues.size, 0);
});

test('factory ignores duplicate form replies (replay guard)', async t => {
  const fsCap = { _kind: 'fake-fs' };
  const hostAgent = makeMockHostAgent({ filesystems: { 'my-fs': fsCap } });
  const mock = makeMockPowers({ hostAgent });

  let createCalls = 0;
  const orchestrator = {
    async createSession() {
      createCalls += 1;
      return {
        id: `s${createCalls}`,
        state: 'pending',
        fsSocketPath: '/x',
        controlSocketPath: '/x',
        attachSocketPath: '/x',
        createdAt: '2026-05-15T00:00:00Z',
      };
    },
    async markReady() {},
    async terminateSession() {},
    async sendPrompt() {},
  };

  make(mock.powers, undefined, {
    orchestrator,
    bridgeFactory: () => ({
      async start() {},
      async stop() {},
    }),
    clientFactory: ({ session }) => ({ id: session.id }),
  });

  await waitFor(() => mock.formCalls.length > 0);

  const payload = {
    name: 'claude-replay',
    filesystem: 'my-fs',
    network: 'egress',
  };
  // Submit once with a specific number.
  mock.simulateSubmission(payload, { number: 99, replyTo: 'form-1' });
  await waitFor(() => createCalls >= 1, 2000);
  // Replay with the same number — should be ignored by seenFormReplies.
  mock.simulateSubmission(payload, { number: 99, replyTo: 'form-1' });
  // Give the loop a chance to process.
  await new Promise(r => setTimeout(r, 100));
  t.is(createCalls, 1);
});
