// @ts-check
/* global process, setTimeout, clearTimeout */

import '@endo/init';

import { spawn, spawnSync } from 'child_process';
import { once } from 'events';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import test from '@endo/ses-ava/test.js';

import { makeClient, swissnumFromBytes } from '@endo/ocapn';
import { makeTorNetLayer } from '@endo/ocapn/src/netlayers/tor.js';

import { makeChatroom } from '../src/backend.js';
import { runChatParticipant } from '../src/interop-driver.js';

const RUN_TOR_LIVE_TESTS = process.env.OCAPN_RUN_TOR_LIVE_TESTS === '1';
const liveTest = RUN_TOR_LIVE_TESTS ? test : test.skip;

const ROOM_SWISS = 'interop-room-tor';
const ROOM_NAME = '#interop-room-tor';
const HOST_MESSAGE = 'hello from JS host over Tor';
const CLIENT_MESSAGE = 'hello from Endo OCapN over Tor';
const CAPTP_VERSION = 'goblins-0.16';

const sharedControlSocketPath =
  process.env.OCAPN_TOR_CONTROL_PATH ||
  process.env.OCAPN_TOR_CONTROL_SOCKET_PATH;
const sharedSocksSocketPath =
  process.env.OCAPN_TOR_SOCKS_PATH || process.env.OCAPN_TOR_SOCKS_SOCKET_PATH;

const swissnumEncoder = new TextEncoder();

/** @param {number} milliseconds */
const sleep = milliseconds =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

/** @param {string} value */
const swissnumFromAsciiString = value => {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 127) {
      throw Error(`Non-ASCII byte in swissnum at position ${i}: ${value[i]}`);
    }
  }
  return swissnumFromBytes(swissnumEncoder.encode(value));
};

const hasTorBinary = () => {
  const result = spawnSync('tor', ['--version'], {
    stdio: 'ignore',
  });
  return !result.error && result.status === 0;
};

/**
 * @param {string} socketPath
 * @param {number} timeoutMs
 * @param {() => void} [onTick]
 */
const waitForUnixSocket = (socketPath, timeoutMs, onTick) => {
  const deadline = Date.now() + timeoutMs;
  /** @type {(value?: unknown) => void} */
  let resolveDone;
  /** @type {(reason?: unknown) => void} */
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  /** @type {NodeJS.Timeout | undefined} */
  let timer;

  const check = () => {
    onTick?.();
    if (Date.now() >= deadline) {
      rejectDone(Error(`Timed out waiting for unix socket: ${socketPath}`));
      return;
    }
    fs.stat(socketPath)
      .then(stat => {
        if (stat.isSocket()) {
          resolveDone(undefined);
          return;
        }
        timer = setTimeout(check, 100);
      })
      .catch(() => {
        timer = setTimeout(check, 100);
      });
  };

  check();
  return done.finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
};

/**
 * @param {import('child_process').ChildProcess} processHandle
 */
const stopProcess = async processHandle => {
  if (processHandle.exitCode !== null) {
    return;
  }
  processHandle.kill('SIGTERM');
  await Promise.race([once(processHandle, 'exit'), sleep(5000)]);
  if (processHandle.exitCode === null) {
    processHandle.kill('SIGKILL');
    await once(processHandle, 'exit');
  }
};

/**
 * @param {string} tempRoot
 * @returns {Promise<{
 *   controlSocketPath: string;
 *   socksSocketPath: string;
 *   stop: () => Promise<void>;
 * }>}
 */
const startManagedTor = async tempRoot => {
  const torRoot = path.join(tempRoot, 'tor-daemon');
  const dataDirectory = path.join(torRoot, 'data');
  const controlSocketPath = path.join(torRoot, 'tor-control.sock');
  const socksSocketPath = path.join(torRoot, 'tor-socks.sock');
  const configPath = path.join(torRoot, 'torrc');

  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(
    configPath,
    [
      `DataDirectory ${dataDirectory}`,
      `SocksPort unix:${socksSocketPath} RelaxDirModeCheck`,
      `ControlSocket unix:${controlSocketPath} RelaxDirModeCheck`,
      'CookieAuthentication 0',
      'Log notice stderr',
      '',
    ].join('\n'),
  );

  const torProcess = spawn('tor', ['-f', configPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  torProcess.stderr.on('data', chunk => {
    stderr += chunk.toString('utf8');
    if (stderr.length > 12000) {
      stderr = stderr.slice(-12000);
    }
  });

  const throwIfExited = () => {
    if (torProcess.exitCode !== null) {
      throw Error(
        `Tor exited before sockets were ready (code=${torProcess.exitCode})\n${stderr}`,
      );
    }
  };

  await waitForUnixSocket(controlSocketPath, 60000, throwIfExited);
  await waitForUnixSocket(socksSocketPath, 60000, throwIfExited);

  return {
    controlSocketPath,
    socksSocketPath,
    stop: async () => stopProcess(torProcess),
  };
};

liveTest(
  'endo OCapN clients interop with each other over Tor onion netlayer',
  async t => {
    t.timeout(180000);

    const tempRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'endo-ocapn-tor-self-'),
    );

    /** @type {string} */
    let controlSocketPath;
    /** @type {string} */
    let socksSocketPath;
    /** @type {(() => Promise<void>) | undefined} */
    let stopManagedTor;
    let hostClient;
    let remoteClient;

    try {
      if (sharedControlSocketPath && sharedSocksSocketPath) {
        controlSocketPath = sharedControlSocketPath;
        socksSocketPath = sharedSocksSocketPath;
        await waitForUnixSocket(controlSocketPath, 10000);
        await waitForUnixSocket(socksSocketPath, 10000);
      } else {
        if (!hasTorBinary()) {
          throw Error(
            'Tor binary not found. Install tor or provide OCAPN_TOR_CONTROL_PATH and OCAPN_TOR_SOCKS_PATH.',
          );
        }
        const managedTor = await startManagedTor(tempRoot);
        controlSocketPath = managedTor.controlSocketPath;
        socksSocketPath = managedTor.socksSocketPath;
        stopManagedTor = managedTor.stop;
      }

      const hostOcapnSocketDir = path.join(tempRoot, 'host-ocapn-sockets');
      const remoteOcapnSocketDir = path.join(tempRoot, 'remote-ocapn-sockets');
      const chatroom = makeChatroom(ROOM_NAME);

      hostClient = makeClient({
        debugLabel: 'js-host-tor',
        captpVersion: CAPTP_VERSION,
      });
      hostClient.registerSturdyRef(ROOM_SWISS, chatroom);
      const hostNetlayer = await hostClient.registerNetlayer(
        (handlers, logger) =>
          makeTorNetLayer({
            handlers,
            logger,
            controlSocketPath,
            socksSocketPath,
            ocapnSocketDir: hostOcapnSocketDir,
          }),
      );

      remoteClient = makeClient({
        debugLabel: 'endo-remote-tor',
        captpVersion: CAPTP_VERSION,
      });
      await remoteClient.registerNetlayer((handlers, logger) =>
        makeTorNetLayer({
          handlers,
          logger,
          controlSocketPath,
          socksSocketPath,
          ocapnSocketDir: remoteOcapnSocketDir,
        }),
      );

      const sturdyRef = remoteClient.makeSturdyRef(
        hostNetlayer.location,
        swissnumFromAsciiString(ROOM_SWISS),
      );
      const remoteChatroom = await remoteClient.enlivenSturdyRef(sturdyRef);

      await Promise.all([
        runChatParticipant({
          chatroom,
          name: 'js-host-tor',
          localMessage: HOST_MESSAGE,
          expectedRemoteMessage: CLIENT_MESSAGE,
          log: line => t.log(line),
        }),
        runChatParticipant({
          chatroom: remoteChatroom,
          name: 'endo-remote-tor',
          localMessage: CLIENT_MESSAGE,
          expectedRemoteMessage: HOST_MESSAGE,
          log: line => t.log(line),
        }),
      ]);

      t.pass('both Endo clients observed bilateral message exchange over Tor');
    } finally {
      if (remoteClient) {
        remoteClient.shutdown();
      }
      if (hostClient) {
        hostClient.shutdown();
      }
      if (stopManagedTor) {
        await stopManagedTor();
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  },
);
