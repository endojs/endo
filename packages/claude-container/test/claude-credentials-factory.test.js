// @ts-nocheck
/* global setTimeout */
/* eslint-disable import/order, no-empty-function, no-plusplus, no-await-in-loop */

/**
 * ClaudeCredentials factory tests (R3).
 */

import '@endo/init';
import test from 'ava';

import { make } from '../src/claude-credentials-factory.js';

const makeMockPowers = ({ hostAgent }) => {
  const formCalls = [];
  const replies = [];
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
    async form(_t, _d, fields) {
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
    async reply(number, body, _a, _t) {
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

const makeMockHostAgent = () => {
  const stored = new Map();
  return {
    storedValues: stored,
    async storeValue(value, name) {
      stored.set(name, value);
    },
  };
};

const waitFor = async (pred, deadlineMs = 2000) => {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > deadlineMs) throw new Error('waitFor timeout');
    await new Promise(r => setTimeout(r, 10));
  }
};

test('factory presents the Create Claude Credentials form', async t => {
  const hostAgent = makeMockHostAgent();
  const mock = makeMockPowers({ hostAgent });
  const exo = make(mock.powers);
  t.regex(exo.help(), /ClaudeCredentialsFactory/);
  await waitFor(() => mock.formCalls.length > 0);
  const names = mock.formCalls[0].fields.map(f => f.name);
  t.deepEqual(names, ['name', 'apiKey']);
});

test('form submission stores a ClaudeCredentials under the chosen name', async t => {
  const hostAgent = makeMockHostAgent();
  const mock = makeMockPowers({ hostAgent });
  make(mock.powers);
  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({ name: 'my-creds', apiKey: 'sk-ant-xyz' });
  await waitFor(() => hostAgent.storedValues.size > 0);
  t.true(hostAgent.storedValues.has('my-creds'));

  const cred = hostAgent.storedValues.get('my-creds');
  const issued = await cred.issue('session-1');
  t.is(issued.apiKey, 'sk-ant-xyz');
});

test('rotate replaces the stored key', async t => {
  const hostAgent = makeMockHostAgent();
  const mock = makeMockPowers({ hostAgent });
  make(mock.powers);
  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({ name: 'c', apiKey: 'sk-old' });
  await waitFor(() => hostAgent.storedValues.size > 0);
  const cred = hostAgent.storedValues.get('c');
  await cred.rotate('sk-new');
  const issued = await cred.issue('session-1');
  t.is(issued.apiKey, 'sk-new');
});

test('rotate rejects empty string', async t => {
  const hostAgent = makeMockHostAgent();
  const mock = makeMockPowers({ hostAgent });
  make(mock.powers);
  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({ name: 'c', apiKey: 'sk-old' });
  await waitFor(() => hostAgent.storedValues.size > 0);
  const cred = hostAgent.storedValues.get('c');
  await t.throwsAsync(() => cred.rotate(''), { message: /EINVAL/ });
});

test('missing apiKey rejects with form error reply', async t => {
  const hostAgent = makeMockHostAgent();
  const mock = makeMockPowers({ hostAgent });
  make(mock.powers);
  await waitFor(() => mock.formCalls.length > 0);
  mock.simulateSubmission({ name: 'c' });
  await waitFor(() => mock.replies.length > 0);
  t.regex(mock.replies[0].body.join('\n'), /Missing "apiKey"/);
  t.is(hostAgent.storedValues.size, 0);
});
