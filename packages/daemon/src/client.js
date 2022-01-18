// @ts-check

import net from 'net';
import { makeCapTPWithConnection } from './connection.js';

/**
 * @template TBootstrap
 * @param {string} name
 * @param {string} sockPath
 * @param {TBootstrap=} bootstrap
 */
export const makeEndoClient = async (name, sockPath, bootstrap) => {
  const conn = net.connect(sockPath);
  await new Promise((resolve, reject) => {
    conn.on('connect', resolve);
    conn.on('error', reject);
  });
  return makeCapTPWithConnection(name, conn, bootstrap);
};
