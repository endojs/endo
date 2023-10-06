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

globalThis.Far = Far;
globalThis.E = E;
globalThis.makePortConnection = makePortConnection;
globalThis.connect = (connection) => {
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

