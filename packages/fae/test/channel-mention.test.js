// @ts-check
/* global process */

/**
 * Integration test: agent receives a channel mention notification and
 * replies in the channel (not to inbox).
 *
 * Requires a running LLM — reads config from packages/lal/.env or
 * the environment.  NOT part of the automated suite; run manually:
 *
 *   cd packages/fae && npx ava test/channel-mention.test.js --timeout=120s
 */

import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import fs from 'fs';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

import { start, stop, purge, makeEndoClient } from '@endo/daemon';

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();
const { raw } = String;

// ---------------------------------------------------------------------------
// Environment: load LLM config from .env or env vars
// ---------------------------------------------------------------------------

/** @returns {{ host: string, model: string, authToken: string }} */
const loadLLMConfig = () => {
  // Try packages/lal/.env (the user's existing config)
  const envPaths = [
    path.join(dirname, '.env'),
    path.join(dirname, '..', 'lal', '.env'),
  ];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim();
        }
      }
    }
  }

  const host = process.env.LAL_HOST || 'http://localhost:11434';
  const model = process.env.LAL_MODEL || 'qwen3';
  const authToken = process.env.LAL_AUTH_TOKEN || '';

  return { host, model, authToken };
};

// ---------------------------------------------------------------------------
// Daemon lifecycle helpers (adapted from gateway.test.js)
// ---------------------------------------------------------------------------

let configPathId = 0;

/** @param {string[]} root */
const makeConfig = (...root) => ({
  statePath: path.join(dirname, ...root, 'state'),
  ephemeralStatePath: path.join(dirname, ...root, 'run'),
  cachePath: path.join(dirname, ...root, 'cache'),
  sockPath:
    process.platform === 'win32'
      ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
      : path.join(dirname, ...root, 'endo.sock'),
  pets: new Map(),
  values: new Map(),
});

/**
 * @param {string} testTitle
 * @param {number} configNumber
 */
const getConfigDir = (testTitle, configNumber) => {
  const base = testTitle
    .replace(/\s/giu, '-')
    .replace(/[^\w-]/giu, '')
    .slice(0, 40);
  const id = `${String(configPathId).padStart(4, '0')}-${String(configNumber).padStart(2, '0')}`;
  configPathId += 1;
  return `${base}#${id}`;
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareHost = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig('tmp', getConfigDir(t.title, t.context.length));

  process.env.ENDO_ADDR = '127.0.0.1:0';
  await purge(config);
  await start(config);

  const { getBootstrap } = await makeEndoClient(
    'test-client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  const ctx = { cancel, cancelled, config, host };
  t.context.push(ctx);
  return ctx;
};

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

test.beforeEach((/** @type {import('ava').ExecutionContext<any[]>} */ t) => {
  t.context = [];
});

test.afterEach.always(
  async (/** @type {import('ava').ExecutionContext<any[]>} */ t) => {
    delete process.env.ENDO_ADDR;
    await Promise.allSettled(
      t.context.flatMap(
        (
          /** @type {{ cancel: Function, cancelled: Promise<void>, config: any }} */ ctx,
        ) => {
          ctx.cancel(Error('teardown'));
          return [ctx.cancelled, stop(ctx.config)];
        },
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a channel to receive a message matching a predicate,
 * timing out after `ms` milliseconds.
 *
 * @param {any} channelRef
 * @param {(msg: any) => boolean} predicate
 * @param {number} ms
 * @returns {Promise<any>}
 */
const waitForChannelMessage = async (channelRef, predicate, ms = 90_000) => {
  const messagesRef = await E(channelRef).followMessages();
  const iter = makeRefIterator(messagesRef);
  const deadline = Date.now() + ms;

  while (Date.now() < deadline) {
    const raced = await Promise.race([
      iter.next(),
      new Promise(resolve =>
        setTimeout(() => resolve({ done: true, timeout: true }), ms),
      ),
    ]);
    const { value, done, timeout } = /** @type {any} */ (raced);
    if (timeout || done) break;
    if (predicate(value)) {
      try {
        await iter.return?.();
      } catch {
        // ignore
      }
      return value;
    }
  }
  try {
    await iter.return?.();
  } catch {
    // ignore
  }
  throw new Error(`Timed out waiting for channel message (${ms}ms)`);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.serial('agent replies to channel mention (not inbox)', async t => {
  const llmConfig = loadLLMConfig();
  t.log('LLM config:', llmConfig.host, llmConfig.model);

  if (!llmConfig.authToken && llmConfig.host.includes('anthropic')) {
    t.log('Skipping: no LAL_AUTH_TOKEN set');
    t.pass();
    return;
  }

  const { host } = await prepareHost(t);

  // 1. Create a channel
  t.log('Creating channel...');
  await E(host).makeChannel('test-channel', 'TestAdmin');
  /** @type {any} */
  const channel = await E(host).lookup('test-channel');
  const adminMemberId = await E(channel).getMemberId();
  t.truthy(adminMemberId, 'admin has a memberId');

  // 2. Set up LLM provider config as a stored value
  t.log('Storing LLM provider config...');
  await E(host).storeValue(
    harden({
      host: llmConfig.host,
      model: llmConfig.model,
      authToken: llmConfig.authToken,
    }),
    'llm-provider',
  );

  // 3. Create fae factory and agent
  t.log('Creating fae factory...');
  const faeFactorySpecifier = new URL('../agent.js', import.meta.url).href;
  const factoryGuestName = 'fae-factory-handle';
  const factoryAgentName = 'profile-for-fae-factory';

  await E(host).provideGuest(factoryGuestName, {
    introducedNames: harden({ '@agent': 'host-agent' }),
    agentName: factoryAgentName,
  });

  // Write provider ref into factory's namespace
  /** @type {any} */
  const factoryPowers = await E(host).lookup(factoryAgentName);
  const providerId = await E(host).identify('llm-provider');
  await E(factoryPowers).write(
    'llm-provider',
    /** @type {string} */ (providerId),
  );

  // Launch factory caplet
  await E(host).makeUnconfined('@main', faeFactorySpecifier, {
    powersName: factoryAgentName,
    resultName: 'fae-factory',
  });

  /** @type {any} */
  const factory = await E(host).lookup('fae-factory');
  t.truthy(factory, 'fae factory exists');

  // 4. Create a fae agent
  t.log('Creating fae agent...');
  const faeProfileName = await E(factory).createAgent('fae', harden({}));
  t.truthy(faeProfileName, 'fae agent created');

  // Wait a moment for the agent to start its inbox loop
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 5. Invite fae to the channel
  t.log('Inviting fae to channel...');
  await E(channel).createInvitation('fae');

  // 6. Post a message in the channel mentioning fae
  t.log('Posting mention in channel...');
  await E(channel).post(
    ['Hey ', ', what do you think about this channel?'],
    ['fae'],
    [],
  );

  // 7. Send fae a notification (simulating chat UI's handleMentionNotify)
  t.log('Sending mention notification to fae...');
  const faePetName = `fae-agent-for-fae`;
  // The fae agent's profile is accessible via faeProfileName
  // We need to find the pet name the host uses for fae
  // The factory wrote it — let's check
  const faeAgentNames = await E(host).list();
  t.log('Host names:', faeAgentNames);

  // Send the notification: embed the channel as a reference
  await E(host).send(
    faeProfileName,
    [
      'You were mentioned in ',
      `:\n\nTestAdmin: Hey fae, what do you think about this channel?\n\n` +
        `You are already a member of this channel. ` +
        `Look up your existing channel reference and ` +
        `use E(channel).post([text], [], []) to reply. ` +
        `Author references above are informational only.`,
    ],
    ['test-channel'],
    ['test-channel'],
  );

  // 8. Wait for the agent to post in the channel
  t.log('Waiting for agent to reply in channel...');
  const agentMessage = await waitForChannelMessage(
    channel,
    msg => msg.memberId !== adminMemberId,
    90_000,
  );

  t.truthy(agentMessage, 'agent posted a message in the channel');
  t.log('Agent posted:', agentMessage.strings?.join(''));

  // 9. Verify the response is clean — no reasoning leaked
  const responseText = (agentMessage.strings || []).join('');
  t.true(responseText.length > 0, 'response is not empty');
  t.true(
    responseText.length < 1000,
    `response should be concise, got ${responseText.length} chars`,
  );

  // Check for reasoning patterns that should NOT appear in channel
  const reasoningPatterns = [
    /Thus we (need|should)/i,
    /The (user|instruction) says/i,
    /We need to (adopt|process|handle)/i,
    /^Proceed\./m,
    /messageNumber/,
    /<think>/,
    /<tool_call>/,
    /adoptTool/,
    /E\(powers\)\./,
  ];
  for (const pattern of reasoningPatterns) {
    t.false(
      pattern.test(responseText),
      `channel post should not contain reasoning: ${pattern}`,
    );
  }
});
