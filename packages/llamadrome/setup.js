// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers AGENT

import { E } from '@endo/eventual-send';

const llamadromeSpecifier = new URL('llm-agent.js', import.meta.url).href;

/**
 * Read LLM configuration from environment variables and validate it.
 *
 * @returns {{ backend: string, apiKey: string | undefined, model: string | undefined, ollamaHost: string | undefined, ollamaApiKey: string | undefined }}
 */
const readConfig = () => {
  const backend = process.env.LLM_BACKEND || 'ollama';

  if (backend === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is required when LLM_BACKEND is "anthropic"',
    );
  }

  return harden({
    backend,
    apiKey: process.env.ANTHROPIC_API_KEY,
    model:
      backend === 'anthropic'
        ? process.env.ANTHROPIC_MODEL
        : process.env.OLLAMA_MODEL,
    ollamaHost: process.env.OLLAMA_HOST,
    ollamaApiKey: process.env.OLLAMA_API_KEY,
  });
};
harden(readConfig);

export const main = async agent => {
  const config = readConfig();

  const guest = await E(agent).provideGuest('llamadrome', {
    introducedNames: {},
    agentName: 'powers-for-llamadrome',
  });

  // Persist config into the guest's pet store so the agent can read it
  // on incarnation without needing process.env.
  await E(guest).storeValue(config, 'llm-config');

  await E(agent).makeUnconfined(
    'MAIN',
    llamadromeSpecifier,
    'powers-for-llamadrome',
    ['PINS', 'llamadrome-server'],
  );
};
harden(main);
