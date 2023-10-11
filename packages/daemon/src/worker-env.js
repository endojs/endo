// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/promise-kit/shim.js';
// import '@endo/lockdown/commit.js';
import '@endo/lockdown/commit-debug.js';

import { Far, E } from "@endo/far";
import { makePortConnection } from "./daemon-web-powers.js";
import { mapReader, mapWriter } from '@endo/stream';
import { bytesToMessage, makeMessageCapTP, messageToBytes } from './connection.js';


const connect = (connection) => {
  const messageWriter = mapWriter(connection.writer, messageToBytes);
  const messageReader = mapReader(connection.reader, bytesToMessage);

  const cancelled = new Promise(() => {});

  return makeMessageCapTP(
    'OcapsGuest',
    messageWriter,
    messageReader,
    cancelled,
    undefined, // bootstrap
  );
}

const channel = new MessageChannel();
window.parent.postMessage({ type: 'HELLO_PORT' }, '*', [channel.port2]);
const connection = makePortConnection(channel.port1);
const { closed: capTpClosed, getBootstrap } = connect(connection)
const loadApp = (appExports) => {
  appExports.make(getBootstrap())
}

globalThis.capTpClosed = capTpClosed;
globalThis.getBootstrap = getBootstrap;
globalThis.Far = Far;
globalThis.E = E;
globalThis.makePortConnection = makePortConnection;
globalThis.loadApp = loadApp

// const bundle = await bundleSource(filePath);
// const bundleText = JSON.stringify(bundle);
// const bundleBytes = textEncoder.encode(bundleText);
// bundleReaderRef = makeReaderRef([bundleBytes]);

// await E(party).store(bundleReaderRef, bundleName);

// E(party).importBundleAndEndow(
//   workerName,
//   bundleName,
//   powersName,
//   resultName,
// );