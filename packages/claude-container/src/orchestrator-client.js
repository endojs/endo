// @ts-check

import http from 'node:http';
import net from 'node:net';
import { makeError, q, X } from '@endo/errors';

/**
 * @import {
 *   CreateSessionRequest,
 *   Session,
 *   SessionSummary,
 * } from '@endo/claude-orch/types'
 */

/**
 * HTTP-over-UDS client for the claude-orch daemon API (DESIGN.md §6.1).
 *
 * @param {{ socketPath: string }} opts
 */
export const makeOrchestratorClient = ({ socketPath }) => {
  /**
   * @param {string} method
   * @param {string} pathname
   * @param {unknown} [body]
   * @returns {Promise<{ status: number, body: any }>}
   */
  const request = (method, pathname, body) => {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          socketPath,
          method,
          path: pathname,
          headers: payload
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              }
            : undefined,
        },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            if (text.length === 0) {
              resolve({ status, body: null });
              return;
            }
            try {
              resolve({ status, body: JSON.parse(text) });
            } catch (e) {
              reject(e);
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  };

  /**
   * @param {string} method
   * @param {string} pathname
   * @param {unknown} [body]
   */
  const okOrThrow = async (method, pathname, body) => {
    const { status, body: resBody } = await request(method, pathname, body);
    if (status >= 200 && status < 300) return resBody;
    const err = resBody && resBody.error ? resBody.error : `HTTP ${status}`;
    throw makeError(X`${q(method)} ${q(pathname)} → ${q(err)}`);
  };

  return harden({
    /**
     * @param {CreateSessionRequest} opts
     * @returns {Promise<Session>}
     */
    async createSession(opts) {
      return /** @type {Session} */ (
        await okOrThrow('POST', '/v1/sessions', opts)
      );
    },

    /**
     * @returns {Promise<SessionSummary[]>}
     */
    async listSessions() {
      return /** @type {SessionSummary[]} */ (
        await okOrThrow('GET', '/v1/sessions')
      );
    },

    /**
     * @param {string} sessionId
     * @returns {Promise<Session>}
     */
    async getSession(sessionId) {
      return /** @type {Session} */ (
        await okOrThrow('GET', `/v1/sessions/${encodeURIComponent(sessionId)}`)
      );
    },

    /**
     * @param {string} sessionId
     */
    async markReady(sessionId) {
      await okOrThrow(
        'POST',
        `/v1/sessions/${encodeURIComponent(sessionId)}/ready`,
      );
    },

    /**
     * @param {string} sessionId
     */
    async terminateSession(sessionId) {
      await okOrThrow('DELETE', `/v1/sessions/${encodeURIComponent(sessionId)}`);
    },

    /**
     * Open a duplex UDS connection to a session's attach socket and
     * return it as a Node net.Socket. The caller frames `claude -p`
     * stream-json on top of this.
     *
     * @param {string} attachSocketPath
     * @returns {Promise<net.Socket>}
     */
    async openAttach(attachSocketPath) {
      return new Promise((resolve, reject) => {
        const sock = net.createConnection(attachSocketPath);
        sock.once('error', reject);
        sock.once('connect', () => resolve(sock));
      });
    },

    /**
     * Send a prompt over the session's attach stream. Resolves to an
     * AsyncIterable of parsed JSON events (one per line) matching
     * `claude -p --output-format stream-json`. v1: framing is the same
     * stream-json contract on both sides.
     *
     * @param {Session} session
     * @param {string} prompt
     * @param {{ model?: string }} [opts]
     */
    async sendPrompt(session, prompt, opts = {}) {
      if (!session.attachSocketPath) {
        throw makeError(
          X`session ${q(session.id)} has no attach stream; use attachMode "stream".`,
        );
      }
      const sock = await this.openAttach(session.attachSocketPath);
      const input = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
        ...(opts.model ? { model: opts.model } : {}),
      };
      sock.write(`${JSON.stringify(input)}\n`);
      return makeLineReader(sock);
    },
  });
};
harden(makeOrchestratorClient);

/**
 * Wrap a duplex byte stream as an async iterable of parsed JSON objects,
 * one per newline-delimited line.
 *
 * @param {net.Socket} sock
 * @returns {AsyncIterable<any>}
 */
const makeLineReader = sock => {
  return {
    async *[Symbol.asyncIterator]() {
      let buf = '';
      sock.setEncoding('utf8');
      const queue = [];
      let resolveNext = null;
      let done = false;
      let errored = null;

      sock.on('data', chunk => {
        buf += chunk;
        for (;;) {
          const i = buf.indexOf('\n');
          if (i < 0) break;
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (line.length === 0) continue;
          try {
            const parsed = JSON.parse(line);
            queue.push(parsed);
            if (resolveNext) {
              const r = resolveNext;
              resolveNext = null;
              r();
            }
          } catch (e) {
            errored = e;
          }
        }
      });
      sock.on('end', () => {
        done = true;
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      });
      sock.on('error', e => {
        errored = e;
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      });

      while (true) {
        if (errored) throw errored;
        if (queue.length > 0) {
          yield queue.shift();
          continue;
        }
        if (done) return;
        await new Promise(resolve => {
          resolveNext = resolve;
        });
      }
    },
  };
};
