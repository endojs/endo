// @ts-check
/* global process */

import { makeClaudeClient } from './claude-client.js';
import { makeOrchestratorClient } from './orchestrator-client.js';

/**
 * Per-session ClaudeClient caplet. The factory provisions one of these
 * per `Create Claude Container` submission via `makeUnconfined`, so the
 * resulting exo is a first-class formulated Endo capability that
 * survives daemon restarts (reincarnates with the same `env`).
 *
 * The exo itself holds no live network state: every call lazily opens
 * the orchestrator UDS, the attach socket, and so on. That keeps the
 * formula a pure value of its env, which is what makes reincarnation
 * correct.
 *
 * Expected env (set by the factory):
 *   ORCHESTRATOR_SOCKET    UDS path of the @endo/claude-orch API.
 *   SESSION_ID             Orchestrator session id (uuid).
 *   FS_SOCKET_PATH         9P UDS path (informational; the bridge lives
 *                          in the factory caplet, not here).
 *   ATTACH_SOCKET_PATH     Stdio mux attach UDS path.
 *   CREATED_AT             ISO timestamp.
 *   MODEL                  Optional claude model id.
 *   INITIAL_PROMPT         Optional one-shot prompt to fire on creation.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} _powers
 * @param {Promise<object> | object | undefined} _context
 * @param {object} [contextWrapper]
 * @returns {object}
 */
export const make = (_powers, _context, contextWrapper = {}) => {
  const env = contextWrapper.env ?? process.env;

  const orchestratorSocket = env.ORCHESTRATOR_SOCKET;
  const sessionId = env.SESSION_ID;
  const fsSocketPath = env.FS_SOCKET_PATH;
  const attachSocketPath = env.ATTACH_SOCKET_PATH;
  const createdAt = env.CREATED_AT;
  const model = env.MODEL || undefined;
  const initialPrompt = env.INITIAL_PROMPT || undefined;

  if (!orchestratorSocket) {
    throw new Error('claude-client-module: ORCHESTRATOR_SOCKET required.');
  }
  if (!sessionId) {
    throw new Error('claude-client-module: SESSION_ID required.');
  }

  const orchestrator = makeOrchestratorClient({
    socketPath: orchestratorSocket,
  });

  const session = harden({
    id: sessionId,
    fsSocketPath,
    attachSocketPath,
    createdAt,
  });

  // Bridge is owned by the factory caplet; the client doesn't see it.
  return makeClaudeClient({
    session,
    orchestrator,
    bridge: undefined,
    model,
    initialPrompt,
  });
};
harden(make);
