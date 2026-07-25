// @ts-nocheck
/* eslint-disable import/order, no-empty-function, no-plusplus */

import '@endo/init';
import test from 'ava';

import { make, makeCredentialsExo } from '../src/claude-credentials-factory.js';

test('makeCredentialsExo.issue returns a single-shot IssuedCredential', async t => {
  const creds = makeCredentialsExo('sk-ant-key');
  const issued = await creds.issue('session-a');
  t.is(await issued.sessionTag(), 'session-a');
  t.is(await issued.materialise(), 'sk-ant-key');
  await t.throwsAsync(() => issued.materialise(), {
    message: /single-shot; already materialised/,
  });
});

test('makeCredentialsExo defaults to the apiKey kind', async t => {
  const creds = makeCredentialsExo('sk-ant-key');
  t.is(await creds.kind(), 'apiKey');
});

test('makeCredentialsExo carries the oauthToken kind', async t => {
  const creds = makeCredentialsExo('sk-ant-oat-token', 'oauthToken');
  t.is(await creds.kind(), 'oauthToken');
  const issued = await creds.issue('session-oauth');
  t.is(await issued.materialise(), 'sk-ant-oat-token');
});

test('makeCredentialsExo rejects an unknown kind', t => {
  t.throws(() => makeCredentialsExo('sk-ant-key', 'bogus'), {
    message: /must be one of/,
  });
});

test('revoke(tag) invalidates outstanding grants for that tag', async t => {
  const creds = makeCredentialsExo('sk-ant-key');
  const issued = await creds.issue('session-b');
  await creds.revoke('session-b');
  await t.throwsAsync(() => issued.materialise(), {
    message: /revoked or rotated/,
  });
});

test('rotate replaces the key and invalidates outstanding grants', async t => {
  const creds = makeCredentialsExo('old-key');
  const stale = await creds.issue('session-c');
  await creds.rotate('new-key');
  await t.throwsAsync(() => stale.materialise(), {
    message: /revoked or rotated/,
  });
  const fresh = await creds.issue('session-c');
  t.is(await fresh.materialise(), 'new-key');
});

test('rotate rejects an empty key', async t => {
  const creds = makeCredentialsExo('old-key');
  await t.throwsAsync(() => creds.rotate(''), { message: /EINVAL/ });
});

// ── Factory form loop (in-process path) ──
//
// `E(target)` deep-hardens its target, so recorders live in closures
// (not properties of `powers`); `Map` survives `harden`. The factory
// consumes messages via the injected `iterateMessages`.

const makeMockPowers = () => {
  const replies = [];
  const pendingMessages = [];
  let nextWaiter = null;
  let formMessageNumber = 0;
  let currentFormId = null;
  let formPresented = false;

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
    async form(_target, _description, _fields) {
      formPresented = true;
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
    async locate() {
      return 'self-id';
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
  };

  return {
    powers,
    replies,
    iterateMessages: () => messageIterator,
    isFormPresented: () => formPresented,
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

const makeMockHostAgent = () => {
  const stored = new Map();
  return {
    hostAgent: {
      async storeValue(value, name) {
        stored.set(name, value);
      },
    },
    storedValues: stored,
  };
};

const waitFor = async (pred, deadlineMs = 2000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > deadlineMs) throw new Error('waitFor timeout');
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, 10));
  }
};

test('factory (in-process) stores a working ClaudeCredentials cap', async t => {
  const host = makeMockHostAgent();
  const mock = makeMockPowers();
  mock.setHostAgent(host.hostAgent);

  const exo = make(mock.powers, undefined, {
    inProcessFactory: true,
    iterateMessages: mock.iterateMessages,
  });
  t.regex(exo.help(), /ClaudeCredentialsFactory/);

  await waitFor(() => mock.isFormPresented());
  mock.simulateSubmission({ name: 'creds', apiKey: 'sk-ant-xyz' });

  await waitFor(() => host.storedValues.size > 0);
  const cap = host.storedValues.get('creds');
  const issued = await cap.issue('tag-1');
  t.is(await issued.materialise(), 'sk-ant-xyz');

  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /ClaudeCredentials "creds" created/);
});

test('factory rejects an unsafe credential name', async t => {
  const host = makeMockHostAgent();
  const mock = makeMockPowers();
  mock.setHostAgent(host.hostAgent);
  make(mock.powers, undefined, {
    inProcessFactory: true,
    iterateMessages: mock.iterateMessages,
  });

  await waitFor(() => mock.isFormPresented());
  mock.simulateSubmission({ name: '../escape', apiKey: 'sk-ant-xyz' });

  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /Error creating credentials/);
  t.is(host.storedValues.size, 0);
});
