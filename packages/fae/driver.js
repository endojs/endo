// @ts-nocheck
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';

import { spawnWorkerLoop } from './agent.js';

/**
 * Fae agent driver caplet.
 *
 * A lightweight caplet whose sole job is to run the inbox/LLM loop for
 * a single fae agent.  Its namespace holds two capability references
 * written by the factory at creation time:
 *
 *   - `llm-provider`  – the provider config `{ host, model, authToken }`
 *   - `agent`          – the agent's EndoGuest (inbox, mail, petstore, tools)
 *
 * When this formula is pinned (`PINS`), `revivePins()` re-provides it on
 * daemon restart, which re-imports this module and calls `make()` again,
 * restarting the inbox loop automatically.
 *
 * IMPORTANT: This make() must return immediately without awaiting any
 * remote references.  During reincarnation, awaiting lookups on the
 * powers guest can deadlock with the provision chain that is creating
 * this very formula.  Instead, we fire off the async work and return
 * the Far object synchronously.
 *
 * @param {import('@endo/eventual-send').ERef<object>} powers
 * @param {Promise<object> | object | undefined} context
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {Promise<object>}
 */
export const make = async (powers, context, { env } = {}) => {
  const systemPrompt = env?.FAE_SYSTEM_PROMPT || undefined;

  const startLoop = async () => {
    const providerConfig =
      /** @type {{ host: string, model: string, authToken: string }} */ (
        await E(powers).lookup('llm-provider')
      );
    const agentPowers = await E(powers).lookup('agent');
    await spawnWorkerLoop(agentPowers, context, providerConfig, systemPrompt);
  };

  startLoop().catch(error => {
    console.error(
      '[fae-driver] inbox loop error:',
      error instanceof Error ? error.message : String(error),
    );
  });

  return Far('FaeDriver', {
    /** @returns {string} */
    help() {
      return 'Fae agent driver: runs the inbox/LLM loop for a single agent. Pin to PINS for auto-restart on daemon reboot.';
    },
  });
};
harden(make);
