// @ts-check

import { Far } from '@endo/far';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X } from '@endo/errors';

const ClaudeClientInterface = M.interface('ClaudeClient', {
  send: M.call(M.string())
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.promise()),
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
 * @property {(session: Session, prompt: string, opts?: object) => Promise<AsyncIterable<any>>} sendPrompt
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
 * Wrap an AsyncIterable as a Far iterator reference that consumers can
 * traverse with `makeRefIterator` from @endo/daemon/ref-reader.js.
 *
 * @param {AsyncIterable<any>} iterable
 */
const wrapAsIteratorRef = iterable => {
  const iter = iterable[Symbol.asyncIterator]();
  return Far('ClaudeEventIterator', {
    async next() {
      return iter.next();
    },
    async return(value) {
      if (iter.return) return iter.return(value);
      return harden({ value, done: true });
    },
    async throw(err) {
      if (iter.throw) return iter.throw(err);
      throw err;
    },
  });
};
harden(wrapAsIteratorRef);

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
    ? orchestrator.sendPrompt(session, initialPrompt, { model })
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
      const iterable = await orchestrator.sendPrompt(session, prompt, {
        model,
        ...opts,
      });
      return wrapAsIteratorRef(iterable);
    },

    async interrupt() {
      guardLive();
      // No interrupt endpoint on the orchestrator yet — DESIGN.md §6.1
      // does not surface one. Roadmap: add /v1/sessions/:id/interrupt
      // that issues a Detach + Attach cycle via the agent RPC.
      throw makeError(X`ClaudeClient.interrupt is not implemented in v1.`);
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
        fsSocketPath: session.fsSocketPath,
        attachSocketPath: session.attachSocketPath,
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
