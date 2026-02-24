// @ts-check
/* global Buffer, process */

// Establish a perimeter:
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import fs from 'fs';
import http from 'http';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makePipe, mapWriter, mapReader } from '@endo/stream';

import * as ws from 'ws';

import { start, stop, purge, makeEndoClient } from '../index.js';
import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from '../src/connection.js';

const { raw } = String;
const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {string[]} root
 */
const makeConfig = (...root) => {
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};

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

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig(
    'tmp',
    getConfigDirectoryName(t.title, t.context.length),
  );

  // Set port to 0 so the OS assigns a free port.
  process.env.ENDO_ADDR = '127.0.0.1:0';

  await purge(config);
  await start(config);

  const contextObj = { cancel, cancelled, config };
  t.context.push(contextObj);
  return { ...contextObj };
};

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
const prepareHost = async t => {
  const { cancel, cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  return { cancel, cancelled, config, host };
};

/**
 * Make an HTTP GET request.
 * @param {string} urlStr
 * @param {Record<string, string>} [headers]
 * @returns {Promise<{ status: number, body: string }>}
 */
const httpGet = (urlStr, headers = {}) =>
  new Promise((resolve, reject) => {
    const reqUrl = new URL(urlStr);
    const req = http.get(
      {
        hostname: reqUrl.hostname,
        port: reqUrl.port,
        path: reqUrl.pathname + reqUrl.search,
        headers,
      },
      res => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: /** @type {number} */ (res.statusCode),
            body: Buffer.concat(chunks).toString('utf-8'),
          });
        });
      },
    );
    req.on('error', reject);
  });

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  delete process.env.ENDO_ADDR;
  await Promise.allSettled(
    /** @type {Array<{cancel: Function, cancelled: Promise<void>, config: ReturnType<typeof makeConfig>}>} */ (
      t.context
    ).flatMap(({ cancel, cancelled, config }) => {
      cancel(Error('teardown'));
      return [cancelled, stop(config)];
    }),
  );
});

// Tests are serial because each forks a full daemon process (SES lockdown,
// CapTP, HTTP server). Running them concurrently in a single ava worker
// causes resource contention that leads to timeouts.

test.serial('gateway HTTP returns info page', async t => {
  const { host } = await prepareHost(t);

  const apps = E(host).lookup('APPS');
  const address = await E(apps).getAddress();
  t.is(typeof address, 'string');
  t.regex(address, /^http:\/\//);

  const { status, body } = await httpGet(`${address}/`);
  t.is(status, 200);
  t.is(body, 'Endo Gateway');
});

test.serial('gateway WebSocket fetch(token)', async t => {
  const { host } = await prepareHost(t);

  // Store a value and get its formula identifier.
  await E(host).evaluate('MAIN', '42', [], [], ['answer']);
  const formulaId = await E(host).identify('answer');
  t.truthy(formulaId);

  // Discover the gateway address.
  const apps = E(host).lookup('APPS');
  const address = await E(apps).getAddress();

  // Connect WebSocket.
  const socket = new ws.WebSocket(`${address.replace(/^http/, 'ws')}/`);
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });

  t.teardown(() => socket.close());

  const [reader, sink] = makePipe();

  socket.on(
    'message',
    (/** @type {Uint8Array} */ bytes, /** @type {boolean} */ isBinary) => {
      if (isBinary) {
        sink.next(bytes);
      }
    },
  );
  socket.on('close', () => {
    sink.return(undefined);
  });

  const writer = harden({
    /** @param {Uint8Array} bytes */
    async next(bytes) {
      socket.send(bytes, { binary: true });
      return harden({ done: false, value: undefined });
    },
    async return() {
      socket.close();
      return harden({ done: true, value: undefined });
    },
    /** @param {Error} error */
    async throw(error) {
      socket.close();
      return harden({ done: true, value: error });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const messageWriter = mapWriter(writer, messageToBytes);
  const messageReader = mapReader(reader, bytesToMessage);

  const { promise: cancelled, reject: cancelCapTP } = makePromiseKit();
  t.teardown(() => cancelCapTP(Error('test done')));

  const { getBootstrap } = makeMessageCapTP(
    'Test',
    messageWriter,
    messageReader,
    cancelled,
    undefined,
  );

  const bootstrap = getBootstrap();
  const result = await E(bootstrap).fetch(/** @type {string} */ (formulaId));
  t.is(result, 42);
});

test.serial('weblet on unified server', async t => {
  const { host } = await prepareHost(t);

  // Discover the gateway address.
  const apps = E(host).lookup('APPS');
  const address = await E(apps).getAddress();

  // Create a weblet on the unified server (no dedicated port).
  // makeWeblet(bundle, powers, requestedPort, webletId, webletCancelled)
  // The webletId must be >= 32 chars; the first 32 chars become the access token.
  const webletId = 'abcdef01234567890abcdef012345678extra';
  const accessToken = webletId.slice(0, 32);
  const { promise: webletCancelled, reject: cancelWeblet } = makePromiseKit();
  t.teardown(() => cancelWeblet(Error('test done')));

  const weblet = E(apps).makeWeblet(
    undefined,
    undefined,
    undefined,
    webletId,
    webletCancelled,
  );

  const location = await E(weblet).getLocation();
  t.true(location.startsWith('localhttp://'));
  t.true(location.includes(accessToken));

  // HTTP GET with Host header set to the access token.
  const { status, body } = await httpGet(`${address}/`, {
    Host: accessToken,
  });
  t.is(status, 200);
  t.true(body.includes('<body>'));

  // HTTP GET for bootstrap.js.
  const { status: jsStatus, body: jsBody } = await httpGet(
    `${address}/bootstrap.js`,
    { Host: accessToken },
  );
  t.is(jsStatus, 200);
  t.true(jsBody.length > 0);
});

test.serial('weblet on dedicated port', async t => {
  const { host } = await prepareHost(t);

  const apps = E(host).lookup('APPS');

  // Create a weblet with a dedicated port (port 0 = OS-assigned).
  const webletId = 'fedcba98765432100fedcba987654321extra';
  const accessToken = webletId.slice(0, 32);
  const { promise: webletCancelled, reject: cancelWeblet } = makePromiseKit();
  t.teardown(() => cancelWeblet(Error('test done')));

  const weblet = E(apps).makeWeblet(
    undefined,
    undefined,
    0,
    webletId,
    webletCancelled,
  );

  const location = await E(weblet).getLocation();
  // Dedicated-port weblets use http://127.0.0.1:PORT/TOKEN/ format.
  t.regex(location, /^http:\/\/127\.0\.0\.1:\d+\//);
  t.true(location.includes(accessToken));

  // HTTP GET to the weblet location.
  const { status, body } = await httpGet(location);
  t.is(status, 200);
  t.true(body.includes('<body>'));

  // HTTP GET for bootstrap.js via the dedicated port.
  const bsUrl = location.replace(/\/$/, '/bootstrap.js');
  const { status: jsStatus, body: jsBody } = await httpGet(bsUrl);
  t.is(jsStatus, 200);
  t.true(jsBody.length > 0);
});

test.serial(
  'daemon writes root file matching AGENT identifier',
  async t => {
    const { config, host } = await prepareHost(t);

    // The daemon writes root before signaling ready, so the file
    // should already exist by the time prepareHost completes.
    const agentIdPath = path.join(config.statePath, 'root');
    const agentIdFromFile = fs.readFileSync(agentIdPath, 'utf-8').trim();

    // The identifier from the file should match what E(host).identify('AGENT')
    // returns over CapTP.
    const agentIdFromCapTP = await E(host).identify('AGENT');

    t.is(typeof agentIdFromFile, 'string');
    t.truthy(agentIdFromFile.length > 0);
    t.is(agentIdFromFile, agentIdFromCapTP);

    // The root should be a valid formula identifier (number:node format).
    t.regex(agentIdFromFile, /^[0-9a-f]{128}:[0-9a-f]{128}$/);
  },
);
