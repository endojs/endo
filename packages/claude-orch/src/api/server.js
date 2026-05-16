// @ts-check
/* global Buffer */
/**
 * @import {
 *   CreateSessionRequest,
 *   Session,
 *   SessionSummary,
 * } from '../../protocol.types.js'
 */

import http from 'node:http';
import { unlink, chmod } from 'node:fs/promises';

/**
 * HTTP/1.1 caller-facing API over a UDS (DESIGN.md §6.1).
 *
 * Endpoints:
 *   POST   /v1/sessions             -> Session
 *   GET    /v1/sessions             -> SessionSummary[]
 *   GET    /v1/sessions/:id         -> Session
 *   POST   /v1/sessions/:id/ready   -> 204
 *   DELETE /v1/sessions/:id         -> 204
 *
 * @typedef {object} ApiHandlers
 * @property {(req: CreateSessionRequest) => Promise<Session>} createSession
 * @property {() => SessionSummary[]} listSessions
 * @property {(id: string) => Session | undefined} getSession
 * @property {(id: string) => Promise<void>} markReady
 * @property {(id: string) => Promise<void>} terminateSession
 *
 * @param {{ socketPath: string, handlers: ApiHandlers }} opts
 */
export const makeApiServer = ({ socketPath, handlers }) => {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://unix');
      const parts = url.pathname.split('/').filter(Boolean);

      // POST /v1/sessions
      if (
        req.method === 'POST' &&
        parts.length === 2 &&
        parts[0] === 'v1' &&
        parts[1] === 'sessions'
      ) {
        const body = await readBody(req);
        const session = await handlers.createSession(body);
        respondJson(res, 200, session);
        return;
      }

      // GET /v1/sessions
      if (
        req.method === 'GET' &&
        parts.length === 2 &&
        parts[0] === 'v1' &&
        parts[1] === 'sessions'
      ) {
        respondJson(res, 200, handlers.listSessions());
        return;
      }

      // GET /v1/sessions/:id
      if (
        req.method === 'GET' &&
        parts.length === 3 &&
        parts[0] === 'v1' &&
        parts[1] === 'sessions'
      ) {
        const session = handlers.getSession(parts[2]);
        if (!session) {
          respondJson(res, 404, { error: 'unknown session' });
          return;
        }
        respondJson(res, 200, session);
        return;
      }

      // POST /v1/sessions/:id/ready
      if (
        req.method === 'POST' &&
        parts.length === 4 &&
        parts[0] === 'v1' &&
        parts[1] === 'sessions' &&
        parts[3] === 'ready'
      ) {
        await handlers.markReady(parts[2]);
        res.writeHead(204);
        res.end();
        return;
      }

      // DELETE /v1/sessions/:id
      if (
        req.method === 'DELETE' &&
        parts.length === 3 &&
        parts[0] === 'v1' &&
        parts[1] === 'sessions'
      ) {
        await handlers.terminateSession(parts[2]);
        res.writeHead(204);
        res.end();
        return;
      }

      respondJson(res, 404, { error: 'not found' });
    } catch (e) {
      const err = /** @type {Error} */ (e);
      respondJson(res, 500, { error: err.message });
    }
  });

  return harden({
    async listen() {
      await unlink(socketPath).catch(() => {});
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, () => resolve(undefined));
      });
      await chmod(socketPath, 0o600);
      return server;
    },
    async close() {
      await new Promise(resolve => server.close(() => resolve(undefined)));
    },
  });
};
harden(makeApiServer);

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
const readBody = async req => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
};

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} code
 * @param {any} body
 */
const respondJson = (res, code, body) => {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(json),
  });
  res.end(json);
};
