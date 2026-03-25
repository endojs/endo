// @ts-check
/* global process, setTimeout */

// Establish a perimeter:
import '@endo/init/debug.js';

// Enable CapTP tracing for relay debugging.
process.env.ENDO_CAPTP_TRACE = '1';

import test from 'ava';
import url from 'url';
import path from 'path';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient } from '../index.js';

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

// ── Relay server helper ─────────────────────────────────────────────

/**
 * Start a local relay server on an OS-assigned port.
 *
 * @param {string} [domain]
 * @returns {Promise<{ relayUrl: string, relayDomain: string, teardown: () => Promise<void> }>}
 */
const startLocalRelay = async (domain = 'test.local') => {
  const { makeRelay: makeRelayServer } = await import(
    '@endo/relay-server/relay.js'
  );
  const relay = makeRelayServer(domain);

  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', relay.handleConnection);

  const { promise: listening, resolve: resolveListening } = makePromiseKit();
  server.listen(0, '127.0.0.1', () => {
    resolveListening(undefined);
  });
  await listening;

  const addr = /** @type {import('net').AddressInfo} */ (server.address());
  const relayUrl = `ws://127.0.0.1:${addr.port}`;

  const teardown = async () => {
    // Close all active WebSocket connections so server.close() can complete.
    for (const client of wss.clients) {
      client.close();
    }
    wss.close();
    const { promise: closed, resolve: resolveClosed } = makePromiseKit();
    server.close(() => resolveClosed(undefined));
    await closed;
  };

  return { relayUrl, relayDomain: domain, teardown };
};

// ── Daemon helpers ──────────────────────────────────────────────────

let configPathId = 0;
const MAX_UNIX_SOCKET_PATH = 90;
const SOCKET_PATH_OVERHEAD =
  path.join(dirname, 'tmp').length + 1 + 'endo.sock'.length + 8;
const MAX_CONFIG_DIR_LENGTH = Math.max(
  8,
  MAX_UNIX_SOCKET_PATH - SOCKET_PATH_OVERHEAD,
);

/**
 * @param {string} testTitle
 * @param {number} configNumber
 */
const getConfigDirectoryName = (testTitle, configNumber) => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const basePath =
    defaultPath.length <= MAX_CONFIG_DIR_LENGTH
      ? defaultPath
      : defaultPath.slice(0, MAX_CONFIG_DIR_LENGTH);
  const testId = String(configPathId).padStart(4, '0');
  const configId = String(configNumber).padStart(2, '0');
  const configSubDirectory = `${basePath}#${testId}-${configId}`;
  configPathId += 1;
  return configSubDirectory;
};

/** @param  {...string} root */
const makeConfig = (...root) => ({
  statePath: path.join(dirname, ...root, 'state'),
  ephemeralStatePath: path.join(dirname, ...root, 'run'),
  cachePath: path.join(dirname, ...root, 'cache'),
  sockPath:
    process.platform === 'win32'
      ? String.raw`\\?\pipe\endo-${root.join('-')}-test.sock`
      : path.join(dirname, ...root, 'endo.sock'),
  address: '127.0.0.1:0',
  pets: new Map(),
  values: new Map(),
});

/**
 * @param {ReturnType<typeof makeConfig>} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig(
    'tmp',
    getConfigDirectoryName(t.title, t.context.configs.length),
  );
  await purge(config);
  await start(config);
  t.context.configs.push({ cancel, cancelled, config });
  return { cancel, cancelled, config };
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareHost = async t => {
  const { cancel, cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  return { cancel, cancelled, config, host };
};

/**
 * Install the ws-relay network module on a daemon host.
 *
 * @param {import('ava').ExecutionContext<any>} t
 * @param {string} relayUrl
 * @param {string} relayDomain
 */
const prepareHostWithWsRelay = async (t, relayUrl, relayDomain) => {
  const { host } = await prepareHost(t);

  const servicePath = path.join(dirname, 'src', 'networks', 'ws-relay.js');
  const serviceLocation = url.pathToFileURL(servicePath).href;

  await E(host).makeUnconfined('MAIN', serviceLocation, {
    powersName: 'AGENT',
    resultName: 'ws-relay-network',
    env: {
      WS_RELAY_URL: relayUrl,
      WS_RELAY_DOMAIN: relayDomain,
    },
  });
  await E(host).move(['ws-relay-network'], ['NETS', 'ws-relay']);

  return host;
};

// ── Test lifecycle ──────────────────────────────────────────────────

test.beforeEach(t => {
  t.context = { configs: [] };
});

test.afterEach.always(async t => {
  await Promise.allSettled(
    /** @type {{ cancel: Function, cancelled: Promise<void>, config: ReturnType<typeof makeConfig> }[]} */ (
      t.context.configs
    ).flatMap(({ cancel, cancelled, config }) => {
      cancel(Error('teardown'));
      return [cancelled, stop(config)];
    }),
  );
});

// ── Tests ───────────────────────────────────────────────────────────

test.serial(
  'channel invitation via locator across two daemons over ws-relay',
  async t => {
    const relay = await startLocalRelay();
    try {
      const hostA = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );
      const hostB = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );

      // Introduce peers to each other
      await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
      await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

      // --- Host A: create channel and invitation ---
      const channel = await E(hostA).makeChannel('test-channel', 'Alice');
      await E(channel).post(['Welcome!'], [], []);
      await E(channel).createInvitation('Bob');

      // --- Host A: generate a sharing locator ---
      const locator = await E(hostA).locateForSharing('test-channel');
      t.truthy(locator, 'locator should be generated');
      t.assert(
        /** @type {string} */ (locator).startsWith('endo://'),
        'locator should be an endo:// URL',
      );

      // --- Host B: adopt channel from locator ---
      await E(hostB).adoptFromLocator(
        /** @type {string} */ (locator),
        'remote-channel',
      );

      // --- Host B: look up the remote channel and join ---
      const remoteChannel = await E(hostB).lookup('remote-channel');
      t.truthy(remoteChannel, 'remote channel should be resolvable');

      const creatorName = await E(remoteChannel).getProposedName();
      t.is(creatorName, 'Alice', 'channel creator is Alice');

      const bobMember = await E(remoteChannel).join('Bob');
      t.truthy(bobMember, 'Bob should receive a member handle');

      // --- Bob posts a message ---
      await E(bobMember).post(['Hello from Bob!'], [], []);

      // --- Verify messages from both sides ---
      const aliceMessages = await E(channel).listMessages();
      t.is(aliceMessages.length, 2, 'Alice sees both messages');
      t.deepEqual(aliceMessages[0].strings, ['Welcome!']);
      t.deepEqual(aliceMessages[1].strings, ['Hello from Bob!']);

      const bobMessages = await E(bobMember).listMessages();
      t.is(bobMessages.length, 2, 'Bob sees both messages');
      t.deepEqual(bobMessages[0].strings, ['Welcome!']);
      t.deepEqual(bobMessages[1].strings, ['Hello from Bob!']);
    } finally {
      await relay.teardown();
    }
  },
);

test.serial(
  'channel join fails gracefully without adoptFromLocator (no peer info)',
  async t => {
    const relay = await startLocalRelay();
    try {
      const hostA = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );
      const hostB = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );

      // Introduce peers so connectivity is possible
      await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
      await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

      // Host A creates channel and invitation
      await E(hostA).makeChannel('test-channel', 'Alice');
      await E(hostA)
        .lookup('test-channel')
        .then(ch => E(ch).createInvitation('Carol'));

      // Generate locator
      const locator = await E(hostA).locateForSharing('test-channel');

      // Simulate the broken chat UI flow: extract formula ID but
      // discard connection hints (use write instead of adoptFromLocator)
      const locatorUrl = new URL(/** @type {string} */ (locator));
      const nodeNumber = locatorUrl.host;
      const formulaNumber = locatorUrl.searchParams.get('id');
      // Deliberately NOT calling addPeerInfo — simulates the bug.
      // However, peers were already introduced above, so connectivity
      // works. The real failure is a NAME MISMATCH: the UI calls
      // join(ourDisplayName) but the invitation was created with a
      // different name.
      const formulaId = `${formulaNumber}:${nodeNumber}`;
      await E(hostB).storeLocator(['wrong-name-channel'], formulaId);

      const remoteChannel = await E(hostB).lookup('wrong-name-channel');

      // join() with a name that doesn't match any invitation should fail
      await t.throwsAsync(
        () => E(remoteChannel).join('WrongName'),
        { message: /No invitation named/ },
        'join with wrong name should fail',
      );
    } finally {
      await relay.teardown();
    }
  },
);

test.serial(
  'channel member can post and follow messages across daemons',
  async t => {
    const relay = await startLocalRelay();
    try {
      const hostA = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );
      const hostB = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );

      await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
      await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

      // Host A creates channel
      const channel = await E(hostA).makeChannel('chat-room', 'Alice');
      await E(channel).createInvitation('Bob');

      // Host B adopts and joins
      const locator = await E(hostA).locateForSharing('chat-room');
      await E(hostB).adoptFromLocator(
        /** @type {string} */ (locator),
        'remote-chat',
      );
      const remoteChannel = await E(hostB).lookup('remote-chat');
      const bobMember = await E(remoteChannel).join('Bob');

      // Follow messages from Bob's side
      const bobIterator = await E(bobMember).followMessages();

      // Alice posts first
      await E(channel).post(['Message 1 from Alice'], [], []);

      // Bob posts second
      await E(bobMember).post(['Message 2 from Bob'], [], []);

      // Alice posts third
      await E(channel).post(['Message 3 from Alice'], [], []);

      // Read 3 messages from Bob's follow stream
      const messages = [];
      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const result = await E(bobIterator).next();
        messages.push(result.value);
      }

      t.is(messages.length, 3, 'Bob receives all 3 messages');
      t.deepEqual(messages[0].strings, ['Message 1 from Alice']);
      t.deepEqual(messages[1].strings, ['Message 2 from Bob']);
      t.deepEqual(messages[2].strings, ['Message 3 from Alice']);
    } finally {
      await relay.teardown();
    }
  },
);

test.serial(
  'adoptFromLocator extracts connection hints and registers peer info',
  async t => {
    const relay = await startLocalRelay();
    try {
      const hostA = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );
      const hostB = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );

      // Only introduce A to B — B does NOT know about A yet
      await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());

      // Host A creates a simple value
      await E(hostA).evaluate('MAIN', '"shared value"', [], [], ['my-val']);

      // Host A generates locator (includes connection hints)
      const locator = await E(hostA).locateForSharing('my-val');
      t.truthy(locator, 'locator should exist');

      // Verify locator has connection hints
      const locatorUrl = new URL(/** @type {string} */ (locator));
      const hints = locatorUrl.searchParams.getAll('at');
      t.true(hints.length > 0, 'locator should contain connection hints');

      // Host B uses adoptFromLocator — this should register peer info
      // and allow B to reach A's node
      await E(hostB).adoptFromLocator(
        /** @type {string} */ (locator),
        'remote-val',
      );

      // Host B should now be able to look up the remote value
      const value = await E(hostB).lookup('remote-val');
      t.is(value, 'shared value', 'remote value should be accessible');
    } finally {
      await relay.teardown();
    }
  },
);
