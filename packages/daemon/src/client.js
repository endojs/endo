// @ts-check

import net from 'net';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';
import { makeNetstringCapTP } from './connection.js';

/**
 * @template TBootstrap
 * @param {string} name
 * @param {string} sockPath
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} [bootstrap]
 */
export const makeEndoClient = async (name, sockPath, cancelled, bootstrap) => {
  const conn = net.connect(sockPath);
  await new Promise((resolve, reject) => {
    conn.on('connect', resolve);
    conn.on('error', (/** @type {any} */ error) => {
      if (error.code === 'ENOENT') {
        reject(
          Error(`Cannot connect to Endo. Is Endo running? ${error.message}`),
        );
      } else {
        reject(error);
      }
    });
  });

  return makeNetstringCapTP(
    name,
    makeNodeWriter(conn),
    makeNodeReader(conn),
    cancelled,
    bootstrap,
  );
};
