// @ts-check

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X } from '@endo/errors';

const ClaudeClientInterface = M.interface('ClaudeClient', {
  send: M.call(M.string()).optional(M.recordOf(M.string(), M.any())).returns(
    M.promise(),
  ),
  interrupt: M.call().returns(M.promise()),
  terminate: M.call().returns(M.promise()),
  status: M.call().returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});

/**
 * @typedef {object} Session
 * @property {string} id
 * @property {string} fsSocketPath
 * @property {string} [attachSocketPath]
 * @property {string} createdAt
 */

/**
 * @typedef {object} OrchestratorClient
 * @property {(opts: object) => Promise<Session>} createSession
 * @property {(id: string) => Promise<void>} markReady
 * @property {(id: string) => Promise<void>} terminateSession
 * @property {(id: string, prompt: string, opts?: object) => Promise<object>} sendPrompt
 * @property {(id: string) => Promise<void>} interrupt
 */

/**
 * @typedef {object} ClaudeClientArgs
 * @property {Session} session
 * @property {OrchestratorClient} orchestrator
 * @property {object} bridge       // 9P bridge handle; kept alive for the session
 * @property {string} [model]
 * @property {string} [initialPrompt]
 */

/**
 * Build a ClaudeClient exo that wraps a single microVM session.
 *
 * `send(prompt)` resolves to an Endo reader of parsed JSON events
 * matching `claude -p --output-format stream-json` — the contract
 * Anthropic ships. v1 forwards events verbatim; callers iterate with
 * `makeRefIterator` from `@endo/daemon/ref-reader.js`.
 *
 * @param {ClaudeClientArgs} args
 */
export const makeClaudeClient = ({
  session,
  orchestrator,
  bridge,
  model,
  initialPrompt,
}) => {
  let terminated = false;
  const sentInitial = initialPrompt
    ? orchestrator.sendPrompt(session.id, initialPrompt, { model })
    : null;

  const guardLive = () => {
    if (terminated) {
      throw makeError(X`ClaudeClient(${session.id}) is terminated.`);
    }
  };

  return makeExo('ClaudeClient', ClaudeClientInterface, {
    /**
     * @param {string} prompt
     * @param {object} [opts]
     */
    async send(prompt, opts = {}) {
      guardLive();
      if (sentInitial) await sentInitial;
      return orchestrator.sendPrompt(session.id, prompt, { model, ...opts });
    },

    async interrupt() {
      guardLive();
      await orchestrator.interrupt(session.id);
    },

    async terminate() {
      if (terminated) return;
      terminated = true;
      try {
        await orchestrator.terminateSession(session.id);
      } finally {
        // Bridge stop is best-effort; orchestrator teardown already
        // closes the chardev from the VM side.
        try {
          // eslint-disable-next-line no-unused-expressions
          bridge && bridge.stop && (await bridge.stop());
        } catch {
          // ignore
        }
      }
    },

    async status() {
      return harden({
        sessionId: session.id,
        createdAt: session.createdAt,
        terminated,
      });
    },

    /**
     * @param {string} [methodName]
     */
    help(methodName) {
      if (methodName === undefined) {
        return [
          'ClaudeClient: a single Claude Code microVM session.',
          '  send(prompt, opts?) → reader of stream-json events',
          '  interrupt()         → cancel the in-flight prompt',
          '  terminate()         → tear down the microVM',
          '  status()            → { sessionId, createdAt, terminated }',
        ].join('\n');
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(makeClaudeClient);
