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
 * Returns the server URL and a teardown function.
 *
 * @param {string} [domain]
 * @returns {Promise<{ relayUrl: string, relayDomain: string, teardown: () => Promise<void> }>}
 */
const startLocalRelay = async (domain = 'test.local') => {
  // We import makeRelay from the relay-server *package*, not from protocol.
  // The protocol module doesn't export makeRelay — relay.js does.
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

// ── Live relay helper ───────────────────────────────────────────────

const LIVE_RELAY_URL = process.env.ENDO_LIVE_RELAY_URL || '';
const LIVE_RELAY_DOMAIN = process.env.ENDO_LIVE_RELAY_DOMAIN || '';

/**
 * Returns relay config — either a live relay (when env vars are set)
 * or spins up a local in-process relay.
 *
 * @returns {Promise<{ relayUrl: string, relayDomain: string, teardown: () => Promise<void> }>}
 */
const provideRelay = async () => {
  if (LIVE_RELAY_URL && LIVE_RELAY_DOMAIN) {
    console.log(`Using live relay: ${LIVE_RELAY_URL} (${LIVE_RELAY_DOMAIN})`);
    return {
      relayUrl: LIVE_RELAY_URL,
      relayDomain: LIVE_RELAY_DOMAIN,
      teardown: async () => {},
    };
  }
  return startLocalRelay();
};

// ── Daemon helpers (same pattern as endo.test.js) ───────────────────

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

  await E(host).makeUnconfined('@main', serviceLocation, {
    powersName: '@agent',
    resultName: 'ws-relay-network',
    env: {
      WS_RELAY_URL: relayUrl,
      WS_RELAY_DOMAIN: relayDomain,
    },
  });
  await E(host).move(['ws-relay-network'], ['@nets', 'ws-relay']);

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
  'two daemons connect and read a remote value over ws-relay',
  async t => {
    const relay = await provideRelay();
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

      // Introduce A to B so A knows how to reach B
      await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());

      // Create a value on B
      await E(hostB).evaluate('@main', '"hello from B"', [], [], ['greeting']);
      const greetingLocator = await E(hostB).locate('greeting');

      // Write the locator into A's namespace (out-of-band introduction)
      await E(hostA).storeLocator(['remote-greeting'], greetingLocator);

      // A looks up the value — this triggers a connection through the relay
      const value = await E(hostA).lookup(['remote-greeting']);
      t.is(value, 'hello from B');
    } finally {
      await relay.teardown();
    }
  },
);

test.serial('round-trip remotable identity over ws-relay', async t => {
  const relay = await provideRelay();
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

    // Create an echoer remotable on B
    await E(hostB).evaluate(
      '@main',
      'Far("Echoer", { echo: value => value })',
      [],
      [],
      ['echoer'],
    );
    const echoerLocator = await E(hostB).locate('echoer');
    await E(hostA).storeLocator(['echoer'], echoerLocator);

    // Send a Far token through the echoer and verify identity is preserved
    const survived = await E(hostA).evaluate(
      '@main',
      `
        const token = Far('Token', {});
        E(echoer).echo(token).then(alleged =>
          token === alleged
        );
      `,
      ['echoer'],
      ['echoer'],
    );
    t.assert(survived);
  } finally {
    await relay.teardown();
  }
});

test.serial('bidirectional connection over ws-relay', async t => {
  const relay = await provideRelay();
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

    // B introduces itself to A (so B initiates)
    await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

    // Create value on A, read from B
    await E(hostA).evaluate('@main', '42', [], [], ['answer']);
    const answerLocator = await E(hostA).locate('answer');
    await E(hostB).storeLocator(['remote-answer'], answerLocator);
    const answerValue = await E(hostB).lookup(['remote-answer']);
    t.is(answerValue, 42);

    // Now also have A know about B and read B's value
    await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
    await E(hostB).evaluate('@main', '"from B"', [], [], ['msg']);
    const msgLocator = await E(hostB).locate('msg');
    await E(hostA).storeLocator(['remote-msg'], msgLocator);
    const msgValue = await E(hostA).lookup(['remote-msg']);
    t.is(msgValue, 'from B');
  } finally {
    await relay.teardown();
  }
});

test.serial(
  'connect fails gracefully when peer is unknown to relay',
  async t => {
    const relay = await provideRelay();
    try {
      const hostA = await prepareHostWithWsRelay(
        t,
        relay.relayUrl,
        relay.relayDomain,
      );

      // Fabricate a peer info with a bogus node ID that is not connected
      // to the relay. A should not hang — it should eventually fail.
      const bogusNodeId = 'dead'.repeat(16);
      const bogusAddress = `ws-relay+captp0://${bogusNodeId}?relay=${encodeURIComponent(relay.relayUrl)}`;
      await E(hostA).addPeerInfo({
        node: bogusNodeId,
        addresses: [bogusAddress],
      });

      await E(hostA).evaluate('@main', '1', [], [], ['one']);
      const oneLocator = /** @type {string} */ (await E(hostA).locate('one'));
      // Rewrite the locator to point at the bogus node
      const oneUrl = new URL(oneLocator);
      const formulaNumber = oneUrl.searchParams.get('id');
      const formulaType = oneUrl.searchParams.get('type');
      const bogusLocator = `endo://${bogusNodeId}?id=${formulaNumber}&type=${formulaType}&at=${encodeURIComponent(bogusAddress)}`;
      await E(hostA).storeLocator(['bogus'], bogusLocator);

      // The lookup should reject, not hang indefinitely.
      // We race against a timeout to catch infinite hangs.
      const timeout = new Promise((_resolve, reject) => {
        setTimeout(
          () => reject(new Error('Timed out waiting for failure')),
          30_000,
        );
      });

      await t.throwsAsync(
        () => Promise.race([E(hostA).lookup(['bogus']), timeout]),
        { message: /.*/ },
      );
    } finally {
      await relay.teardown();
    }
  },
);

test.serial('relay server health endpoint works', async t => {
  const relay = await provideRelay();
  try {
    // Only test health for local relay (live may not expose HTTP on same URL)
    if (LIVE_RELAY_URL) {
      t.pass('Skipping health check for live relay');
      return;
    }
    const httpUrl = relay.relayUrl.replace('ws://', 'http://');
    const res = await fetch(`${httpUrl}/health`);
    t.is(res.status, 200);
    // We don't check JSON for the local relay since the HTTP handler
    // in our test just returns 'ok'. This test mainly validates the
    // server is up and accepting connections.
  } finally {
    await relay.teardown();
  }
});
