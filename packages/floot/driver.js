// @ts-nocheck
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';

import { makeStreamingAgent } from './agent.js';
import { makeReplyChannel } from './src/stream.js';
import { createStreamingProvider } from './providers/index.js';

/**
 * Floot agent driver caplet.
 *
 * A lightweight caplet whose namespace holds two capability references written
 * by the factory at creation time:
 *
 *   - `agent`        – the agent's EndoGuest (conversation history petstore)
 *   - `llm-provider` – the provider config `{ provider, model, authToken }`
 *
 * The LLM provider config (including the API key) is read from the
 * `llm-provider` handle rather than the caplet's env — the same pattern fae
 * uses, so the secret lives behind a capability reference. The default is the
 * Anthropic API endpoint (a plain LLM API, no local session).
 *
 * Its returned Far object exposes `converse(text) -> replyReader`, a streaming
 * conversation interface that clients look up by pet name and call directly.
 *
 * IMPORTANT (same constraint as the fae driver): make() must return
 * synchronously without awaiting remote references. During reincarnation,
 * awaiting lookups on the powers guest can deadlock with the provision chain
 * creating this very formula. So we build the streaming agent lazily on the
 * first converse() call, and return the Far object immediately.
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @param {Promise<object> | object | undefined} context
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {object}
 */
export const make = (powers, context, { env } = {}) => {
  const systemPrompt = env?.FLOOT_SYSTEM_PROMPT || undefined;

  let agentP;
  const getAgent = () => {
    if (!agentP) {
      agentP = (async () => {
        const agentPowers = await E(powers).lookup('agent');
        const cfg = await E(powers).lookup('llm-provider');
        const provider = createStreamingProvider({
          FLOOT_PROVIDER: cfg.provider,
          FLOOT_MODEL: cfg.model,
          FLOOT_AUTH_TOKEN: cfg.authToken,
        });
        return makeStreamingAgent(
          agentPowers,
          context,
          { provider },
          systemPrompt,
        );
      })().catch(error => {
        // Reset so a transient failure can be retried on the next call.
        agentP = undefined;
        throw error;
      });
    }
    return agentP;
  };

  return Far('FlootDriver', {
    /**
     * Begin a conversation turn. Returns a Far StreamReader immediately; the
     * reply streams into it as the model produces tokens.
     *
     * @param {string | import('@endo/eventual-send').ERef<object>} input -
     *   the user message: a plain string, or a streaming reader yielding
     *   transcript-style events (e.g. the audio caplet's transcribe() reader).
     * @param {string} [sessionId] - independent conversation thread; each
     *   session keeps its own context (its own root in the conversation tree).
     *   Defaults to 'default'.
     * @returns {import('@endo/far').FarRef<object>} replyReader
     */
    converse(input, sessionId) {
      const { writer, reader } = makeReplyChannel();
      (async () => {
        try {
          const agent = await getAgent();
          await agent.converse(input, writer, sessionId);
        } catch (error) {
          writer.abort(error instanceof Error ? error.message : String(error));
        }
      })();
      return reader;
    },

    /** @returns {string} */
    help() {
      return 'Floot agent driver: converse(input, sessionId?) returns a streaming reply reader (next() yields delta/final/end events). input is a string or a streaming user-message reader (e.g. a transcribe() reader). sessionId selects an independent conversation thread (default "default"). Pin to PINS for auto-restart on daemon reboot.';
    },
  });
};
harden(make);
