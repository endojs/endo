// @ts-check

/** @typedef {import('./src/server.js').makeCapricornServer} makeCapricornServer */

import '@endo/init';

import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { makeCapricornServer } from './src/server.js';
import { makeFileStorageProvider } from './src/storage.js';

const storageFilePath =
  process.env.CAPRICORN_STORAGE_FILE ||
  path.join(os.homedir(), '.capricorn', 'capricorn-storage.json');

const startCapricornServer = async () => {
  const storageProvider = makeFileStorageProvider(storageFilePath);
  const debugLabel = 'Capricorn';
  const { tcpLocation, webSocketLocation, adminFacetSwissnum } = await makeCapricornServer(
    debugLabel,
    storageProvider,
  );
  console.log('Capricorn server started:', tcpLocation, webSocketLocation);
  console.log('Admin facet swissnum:', adminFacetSwissnum);
};

startCapricornServer();
