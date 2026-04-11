// @ts-check
/* global process */
/* eslint-disable no-continue */
// endo run --UNCONFINED setup-lal.js --powers @agent
// Defaults to local Ollama. Override with env vars:
//   ENDO_LLM_HOST=https://api.anthropic.com
//   ENDO_LLM_MODEL=claude-sonnet-4-6-20250514
//   ENDO_LLM_AUTH_TOKEN=sk-ant-...
//   ENDO_LLM_NAME=lal

import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

/**
 * Scan the host inbox for the "Add an agent" form from setup-lal
 * and submit a response using ENDO_LLM_ environment variables.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  const { env } = process;
  const name = env.ENDO_LLM_NAME || 'lal';
  const host = env.ENDO_LLM_HOST || 'http://localhost:11434/v1';
  const model = env.ENDO_LLM_MODEL || 'qwen3';
  const authToken = env.ENDO_LLM_AUTH_TOKEN || 'ollama';

  console.log(`Setting up lal agent "${name}" (${host}, ${model})`);

  const selfLocator = await E(agent).locate('@self');
  const messages = makeRefIterator(E(agent).followMessages());

  console.log('Scanning inbox for form from setup-lal...');

  for await (const message of messages) {
    if (message.type !== 'form' || message.from === selfLocator) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const [fromName] = await E(agent).reverseLocate(message.from);
    if (fromName === 'setup-lal') {
      console.log(`Found form at message ${message.number} — submitting...`);
      // eslint-disable-next-line no-await-in-loop
      await E(agent).submit(message.number, {
        name,
        host,
        model,
        authToken,
      });
      console.log(`Agent "${name}" submitted.`);
      return;
    }
  }
};
harden(main);
