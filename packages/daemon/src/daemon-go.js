// @ts-check
/* global process */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init';

import crypto from 'crypto';
import net from 'net';
import fs from 'fs';
import path from 'path';
import url from 'url';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeDaemon } from './daemon.js';
import {
  makeFilePowers,
  makeNetworkPowers,
  makeCryptoPowers,
} from './daemon-node-powers.js';
import { makeDaemonicGoPowers } from './daemon-go-powers.js';
import {
  encodeEnvelope,
  decodeEnvelope,
  readFrameFromStream,
  writeFrameToStream,
} from './envelope.js';

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { Config } from './types.js' */

// The daemon-go entry point receives its configuration as command-line
// arguments, identical to daemon-node.js. It also opens fd 3/4 for the
// envelope protocol with the engo supervisor.
//
// fd 3: daemon writes envelopes to engo (child → parent)
// fd 4: daemon reads envelopes from engo (parent → child)
//
// Note: This matches the Go subprocess convention where fd 3 is the
// child's write end and fd 4 is the child's read end.

if (process.argv.length < 5) {
  throw new Error(
    `daemon-go.js requires arguments [sockPath] [statePath] [ephemeralStatePath] [cachePath], got ${process.argv.join(
      ', ',
    )}`,
  );
}

const [sockPath, statePath, ephemeralStatePath, cachePath] =
  process.argv.slice(2);

/** @type {Config} */
const config = {
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
};

const { pid } = process;

// Open envelope protocol pipes.
// @ts-ignore This is in fact how you open a file descriptor.
const envelopeReadStream = fs.createReadStream(null, { fd: 4 });
// @ts-ignore This is in fact how you open a file descriptor.
const envelopeWriteStream = fs.createWriteStream(null, { fd: 3 });

// Read the init envelope from engo to learn our handle.
const readInitEnvelope = async () => {
  const frameData = await readFrameFromStream(envelopeReadStream);
  if (frameData === null) {
    throw new Error('daemon-go: EOF before init envelope');
  }
  const env = decodeEnvelope(frameData);
  if (env.verb !== 'init') {
    throw new Error(`daemon-go: expected init envelope, got ${env.verb}`);
  }
  return env.handle;
};

/**
 * Send an envelope to engo.
 * @param {number} handle
 * @param {string} verb
 * @param {Uint8Array} [payload]
 * @param {number} [nonce]
 */
const sendEnvelope = async (handle, verb, payload, nonce) => {
  const data = encodeEnvelope({
    handle,
    verb,
    payload: payload || new Uint8Array(0),
    nonce: nonce || 0,
  });
  await writeFrameToStream(envelopeWriteStream, data);
};

const networkPowers = makeNetworkPowers({ net });
const filePowers = makeFilePowers({ fs, path });
const cryptoPowers = makeCryptoPowers(crypto);
const powers = makeDaemonicGoPowers({
  config,
  url,
  filePowers,
  cryptoPowers,
  sendEnvelope,
  envelopeReadStream,
});
const { persistence: daemonicPersistencePowers } = powers;

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

// Engo owns endo.pid (the authoritative PID for kill). This function
// overwrites it with the node daemon PID so that killDaemonProcess
// targets the process that owns the socket and its child workers.
// Killing the node daemon causes engo to detect the exit and cascade.
const updateRecordedPid = async () => {
  const pidPath = filePowers.joinPath(ephemeralStatePath, 'endo.pid');
  await filePowers.writeFileText(pidPath, `${pid}\n`);
};

const main = async () => {
  const daemonLabel = `daemon on PID ${pid}`;
  console.log(`Endo daemon (go platform) starting on PID ${pid}`);
  cancelled.catch(() => {
    console.log(`Endo daemon (go platform) stopping on PID ${pid}`);
  });

  // Read init envelope from engo supervisor.
  const selfHandle = await readInitEnvelope();
  console.log(`Endo daemon assigned handle ${selfHandle} by engo`);

  // Start the envelope reader now that the init envelope has been consumed.
  // This must happen after readInitEnvelope() to avoid a race on fd 4.
  powers.control.startEnvelopeReader();

  await daemonicPersistencePowers.initializePersistence();

  const { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar } =
    await makeDaemon(powers, daemonLabel, cancel, cancelled);

  /** @param {Error} error */
  const exitWithError = error => {
    cancel(error);
    cancelGracePeriod(error);
  };

  // Start network services
  const privatePathService = networkPowers.makePrivatePathService(
    endoBootstrap,
    sockPath,
    cancelled,
    exitWithError,
    capTpConnectionRegistrar,
  );
  const services = [privatePathService];

  // Start all services, persist the root formula identifier, and start the gateway.
  try {
    await Promise.all(services.map(({ started }) => started));

    const host = await E(endoBootstrap).host();
    const agentId = /** @type {string} */ (await E(host).identify('@agent'));
    const agentIdPath = filePowers.joinPath(statePath, 'root');
    await filePowers.writeFileText(agentIdPath, `${agentId}\n`);

    // Signal readiness to engo supervisor.
    await sendEnvelope(0, 'ready');
    console.log('Endo daemon (go platform) ready, signaled engo');
  } catch (error) {
    // No IPC to parent like daemon-node.js; just log and throw.
    console.error('Daemon startup failed:', error);
    throw error;
  }

  const servicesStopped = Promise.all(services.map(({ stopped }) => stopped));

  // Record self as official daemon process so killDaemonProcess targets
  // the node daemon (which owns workers) rather than engo.
  await updateRecordedPid();

  // Wait for services to end normally
  await servicesStopped;
  cancel(new Error('Terminated normally'));
  cancelGracePeriod(new Error('Terminated normally'));
};

process.once('SIGINT', () => cancel(new Error('SIGINT')));

// @ts-ignore Yes, we can assign to exitCode, typedoc.
process.exitCode = 1;
main().then(
  () => {
    process.exitCode = 0;
  },
  error => {
    console.error(error);
  },
);
