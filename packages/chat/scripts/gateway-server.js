#!/usr/bin/env node
// @ts-check
/* global process, setTimeout */

/**
 * Gateway server for the Endo Chat application.
 *
 * This script:
 * 1. Connects to the system Endo daemon via Unix socket
 * 2. Starts an HTTP/WebSocket gateway server
 * 3. Outputs connection info as JSON to stdout
 *
 * The gateway provides a `fetch(token)` CapTP interface for browser clients.
 */

import '@endo/init';

import http from 'http';
import os from 'os';
// @ts-ignore
import * as ws from 'ws';

import { makePromiseKit } from '@endo/promise-kit';
import { makePipe, mapWriter, mapReader } from '@endo/stream';
import { E } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeCapTP } from '@endo/captp';
import { makeEndoClient } from '@endo/daemon';
import { whereEndoSock } from '@endo/where';

const { WebSocketServer } = ws;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @param {unknown} message */
const messageToBytes = message => {
  const text = JSON.stringify(message);
  return textEncoder.encode(text);
};

/** @param {Uint8Array} bytes */
const bytesToMessage = bytes => {
  const text = textDecoder.decode(bytes);
  return JSON.parse(text);
};

// Bootstrap interface that gateway exposes to WebSocket clients
const GatewayBootstrapInterface = M.interface('GatewayBootstrap', {
  fetch: M.call(M.string()).returns(M.promise()),
});

const RECONNECT_INTERVAL_MS = 5000;

const main = async () => {
  const args = JSON.parse(process.argv[2] || '{}');
  const port = args.port ?? 0;

  // Determine the socket path for the system Endo daemon
  const { username, homedir } = os.userInfo();
  const temp = os.tmpdir();
  const info = { user: username, home: homedir, temp };
  const sockPath = whereEndoSock(process.platform, process.env, info);

  // Daemon connection state (updated on reconnect)
  /** @type {unknown} */
  let gateway;
  /** @type {unknown} */
  let host;
  /** @type {string | undefined} */
  let endoId;
  let isConnected = false;
  let isShuttingDown = false;

  /** @type {((error: Error) => void) | undefined} */
  let currentCancel;

  /**
   * Schedule a reconnection attempt.
   */
  const scheduleReconnect = () => {
    if (isShuttingDown) return;
    console.error(`[Gateway] Will attempt to reconnect in ${RECONNECT_INTERVAL_MS / 1000}s...`);
    setTimeout(async () => {
      if (isShuttingDown) return;
      try {
        await connectToDaemon(); // eslint-disable-line no-use-before-define
      } catch (error) {
        console.error('[Gateway] Reconnection failed:', /** @type {Error} */ (error).message);
        scheduleReconnect();
      }
    }, RECONNECT_INTERVAL_MS);
  };

  /**
   * Connect to the Endo daemon.
   * @returns {Promise<void>}
   */
  const connectToDaemon = async () => {
    console.error(`[Gateway] Connecting to Endo daemon at ${sockPath}...`);

    const { promise: cancelled, reject: cancel } = makePromiseKit();

    // Store cancel function for shutdown
    currentCancel = cancel;

    const { getBootstrap, closed } = await makeEndoClient(
      'Gateway',
      sockPath,
      cancelled,
    );
    const endoBootstrap = getBootstrap();

    console.error('[Gateway] Connected to Endo daemon');

    // Get the gateway and host from bootstrap
    gateway = await E(endoBootstrap).gateway();
    host = await E(endoBootstrap).host();

    // Get the AGENT identifier for the host
    endoId = /** @type {string} */ (await E(host).identify('AGENT'));
    isConnected = true;

    console.error(`[Gateway] ENDO_ID: ${endoId.slice(0, 16)}...`);

    // Handle daemon disconnection - trigger reconnection
    closed.catch(error => {
      if (isShuttingDown) return;
      console.error('[Gateway] Daemon connection lost:', error.message);
      isConnected = false;
      gateway = undefined;
      host = undefined;
      scheduleReconnect();
    });
  };

  // Initial connection with retry loop
  while (!isConnected && !isShuttingDown) {
    try {
      await connectToDaemon();
    } catch (error) {
      console.error('[Gateway] Failed to connect to Endo daemon:', /** @type {Error} */ (error).message);
      console.error('[Gateway] Is the daemon running? Try: endo start');
      console.error(`[Gateway] Retrying in ${RECONNECT_INTERVAL_MS / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL_MS));
    }
  }

  // Start HTTP/WebSocket server
  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  const server = http.createServer();

  server.on('request', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(
      'Endo Gateway WebSocket Server\n\nConnect via WebSocket and call bootstrap.fetch(token) to get capabilities.',
    );
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket, req) => {
    const remoteAddress = req.socket.remoteAddress;
    if (
      remoteAddress !== '127.0.0.1' &&
      remoteAddress !== '::1' &&
      remoteAddress !== '::ffff:127.0.0.1'
    ) {
      console.error(
        `[Gateway] Rejected non-local connection from ${remoteAddress}`,
      );
      socket.close(1008, 'Only local connections allowed');
      return;
    }

    const { value: connectionNumber } = connectionNumbers.next();
    console.error(
      `[Gateway] Connection ${connectionNumber} from ${remoteAddress}`,
    );

    const { promise: closed, resolve: close, reject: abort } = makePromiseKit();

    closed.finally(() => socket.close());

    const [reader, sink] = makePipe();

    socket.on('message', (bytes, isBinary) => {
      if (!isBinary) {
        abort(new Error('expected binary WebSocket frames'));
        return;
      }
      sink.next(bytes);
    });

    socket.on('close', () => {
      sink.return(undefined);
      close(undefined);
    });

    socket.on('error', error => {
      console.error(`[Gateway] WebSocket error:`, error.message);
      abort(error);
    });

    const writer = harden({
      async next(bytes) {
        socket.send(bytes, { binary: true });
        return { done: false };
      },
      async return() {
        socket.close();
        return { done: true };
      },
      async throw(error) {
        socket.close();
        abort(error);
        return { done: true };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    });

    const messageWriter = mapWriter(writer, messageToBytes);
    const messageReader = mapReader(reader, bytesToMessage);

    const clientBootstrap = makeExo(
      'GatewayBootstrap',
      GatewayBootstrapInterface,
      {
        async fetch(token) {
          if (!isConnected || !gateway) {
            throw new Error('Gateway is not connected to daemon');
          }
          return E(gateway).provide(token);
        },
      },
    );

    const send = message => messageWriter.next(message);
    const captp = makeCapTP('Gateway', send, clientBootstrap);
    const { dispatch, getBootstrap, abort: _abortCapTP } = captp;

    (async () => {
      for await (const message of messageReader) {
        dispatch(message);
      }
    })();

    const remoteBootstrap = getBootstrap();
    E.sendOnly(remoteBootstrap).ping();

    closed.finally(() => {
      console.error(`[Gateway] Closed connection ${connectionNumber}`);
    });
  });

  // Start listening
  const assignedPort = await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Expected listener to be assigned a port'));
      } else {
        resolve(address.port);
      }
    });
    server.on('error', reject);
  });

  console.error(`[Gateway] Listening on 127.0.0.1:${assignedPort}`);

  // Output connection info as JSON to stdout (for Vite plugin to read)
  console.log(JSON.stringify({ httpPort: assignedPort, endoId }));

  // Handle shutdown
  process.on('SIGINT', () => {
    console.error('[Gateway] Shutting down...');
    isShuttingDown = true;
    if (currentCancel) {
      currentCancel(new Error('SIGINT'));
    }
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error('[Gateway] Shutting down...');
    isShuttingDown = true;
    if (currentCancel) {
      currentCancel(new Error('SIGTERM'));
    }
    server.close();
    process.exit(0);
  });
};

main().catch(error => {
  console.error('[Gateway] Fatal error:', error.message);
  process.exit(1);
});
