// @ts-check
/**
 * @import {
 *   BrokerRequest,
 *   BrokerResponse,
 *   Credentials,
 * } from '../../protocol.types.d.ts'
 */

import net from 'node:net';

import { makePromiseKit } from '@endo/promise-kit';

/**
 * Send one request to the broker and resolve to its response.
 *
 * Connections are short-lived. Concurrency is bounded by the operating
 * system's UDS backlog; the orchestrator should not have hundreds of
 * outstanding broker calls.
 *
 * @param {string} socketPath
 * @param {BrokerRequest} req
 * @returns {Promise<BrokerResponse>}
 */
const callBroker = (socketPath, req) => {
  const { promise, resolve, reject } = makePromiseKit();
  const conn = net.createConnection(socketPath);
  let buf = '';
  let settled = false;

  const settle = (
    /** @type {(value: BrokerResponse) => void} */ res,
    /** @type {BrokerResponse} */ value,
  ) => {
    if (settled) return;
    settled = true;
    res(value);
    conn.end();
  };

  conn.once('error', reject);
  conn.on('data', chunk => {
    buf += chunk.toString('utf8');
    const i = buf.indexOf('\n');
    if (i < 0) return;
    try {
      const res = /** @type {BrokerResponse} */ (JSON.parse(buf.slice(0, i)));
      settle(resolve, res);
    } catch (e) {
      if (!settled) {
        settled = true;
        reject(e);
        conn.destroy();
      }
    }
  });
  conn.once('close', () => {
    if (!settled) {
      settled = true;
      reject(new Error('Broker connection closed before response'));
    }
  });

  conn.write(`${JSON.stringify(req)}\n`);
  return /** @type {Promise<BrokerResponse>} */ (promise);
};

/**
 * @param {{ socketPath: string }} opts
 */
export const makeBrokerClient = ({ socketPath }) => {
  return harden({
    /**
     * @param {string} sessionId
     * @returns {Promise<Credentials>}
     */
    async issue(sessionId) {
      const res = await callBroker(socketPath, { type: 'issue', sessionId });
      if (res.type !== 'creds') {
        const detail =
          'message' in res && res.message ? ` (${res.message})` : '';
        throw new Error(
          `broker issue: unexpected response ${res.type}${detail}`,
        );
      }
      return res.credentials;
    },

    /**
     * @param {string} sessionId
     */
    async revoke(sessionId) {
      const res = await callBroker(socketPath, { type: 'revoke', sessionId });
      if (res.type !== 'ok') {
        throw new Error(`broker revoke: unexpected response ${res.type}`);
      }
    },

    /**
     * @param {string} sessionId
     * @returns {Promise<Credentials | null>}
     */
    async rotateIfNeeded(sessionId) {
      const res = await callBroker(socketPath, {
        type: 'rotate_if_needed',
        sessionId,
      });
      if (res.type === 'noop') return null;
      if (res.type === 'creds') return res.credentials;
      throw new Error(`broker rotate: unexpected response ${res.type}`);
    },
  });
};
harden(makeBrokerClient);
