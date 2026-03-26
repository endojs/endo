// @ts-nocheck
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';

import { spawnWorkerLoop } from './agent.js';

/**
 * Jaine agent driver caplet.
 *
 * Lightweight caplet that runs the stateless mention-response loop.
 * Each incoming message gets a fresh LLM call — no conversation history.
 *
 * Namespace holds:
 *   - `llm-provider` – provider config { host, model, authToken }
 *   - `llm-provider-fast` – (optional) fast model config for routing decisions
 *   - `agent` – the agent's EndoGuest powers
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @param {Promise<object> | object | undefined} context
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {Promise<object>}
 */
export const make = async (powers, context, { env } = {}) => {
  const systemPrompt = env?.JAINE_SYSTEM_PROMPT || undefined;

  const startLoop = async () => {
    const providerConfig =
      /** @type {{ host: string, model: string, authToken: string }} */ (
        await E(powers).lookup('llm-provider')
      );
    /** @type {{ host: string, model: string, authToken: string } | null} */
    let fastProviderConfig = null;
    try {
      fastProviderConfig =
        /** @type {{ host: string, model: string, authToken: string }} */ (
          await E(powers).lookup('llm-provider-fast')
        );
    } catch {
      // No fast provider configured — router will use the main provider.
    }
    const agentPowers = await E(powers).lookup('agent');
    await spawnWorkerLoop(
      agentPowers,
      context,
      providerConfig,
      systemPrompt,
      fastProviderConfig,
    );
  };

  startLoop().catch(error => {
    console.error(
      '[jaine-driver] loop error:',
      error instanceof Error ? error.message : String(error),
    );
  });

  return Far('JaineDriver', {
    /** @returns {string} */
    help() {
      return 'Jaine agent driver: stateless per-mention LLM loop. Pin to PINS for auto-restart.';
    },
  });
};
harden(make);
