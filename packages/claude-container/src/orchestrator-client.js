// @ts-check

import { makeError, X } from '@endo/errors';

/**
 * HTTP-over-UDS client for the claude-orch daemon API (see DESIGN.md §6.1).
 *
 * Skeleton: surface and shapes are stable; bodies are TODO and gated on
 * milestone 1 of DESIGN.md §10 (the orchestrator binary itself).
 *
 * @param {{ socketPath: string }} opts
 */
export const makeOrchestratorClient = ({ socketPath }) => {
  // The real implementation uses node:http with `socketPath` set on
  // the agent. v1 plans to use node:undici with a UDS connector, which
  // gives streaming bodies for the attach channel out of the box.
  const notImplemented = name =>
    makeError(
      X`orchestrator-client.${name} not implemented (socket=${socketPath}). See DESIGN.md §6.1 and §10 milestone 1.`,
    );

  return harden({
    /**
     * @param {object} opts
     * @returns {Promise<{
     *   id: string,
     *   fsSocketPath: string,
     *   attachSocketPath?: string,
     *   createdAt: string,
     * }>}
     */
    async createSession(opts) {
      void opts;
      throw notImplemented('createSession');
    },

    /**
     * @param {string} sessionId
     */
    async markReady(sessionId) {
      void sessionId;
      throw notImplemented('markReady');
    },

    /**
     * @param {string} sessionId
     */
    async terminateSession(sessionId) {
      void sessionId;
      throw notImplemented('terminateSession');
    },

    /**
     * @param {string} sessionId
     * @param {string} prompt
     * @param {object} [opts]
     * @returns {Promise<object>}  // reader of stream-json events
     */
    async sendPrompt(sessionId, prompt, opts) {
      void sessionId;
      void prompt;
      void opts;
      throw notImplemented('sendPrompt');
    },

    /**
     * @param {string} sessionId
     */
    async interrupt(sessionId) {
      void sessionId;
      throw notImplemented('interrupt');
    },
  });
};
harden(makeOrchestratorClient);
