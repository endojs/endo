// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers @agent
// Defaults to local Ollama. Override with env vars:
//   ENDO_LLM_HOST=https://api.anthropic.com
//   ENDO_LLM_MODEL=claude-sonnet-4-6-20250514
//   ENDO_LLM_AUTH_TOKEN=sk-ant-...

import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision the setup-lal guest, launch the agent caplet, then watch the
 * inbox for configuration forms from setup-lal and auto-submit ENDO_LLM_
 * env vars. Returns after the first form submission.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  if (await E(agent).has('controller-for-lal')) {
    console.log('Lal already provisioned — skipping setup.');
    return;
  }

  const hasLal = await E(agent).has('setup-lal');
  if (!hasLal) {
    await E(agent).provideGuest('setup-lal', {
      introducedNames: harden({ '@agent': 'host-agent' }),
      agentName: 'profile-for-lal',
    });
  }

  await E(agent).makeUnconfined('@main', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
  });

  const { env } = process;
  const host = env.ENDO_LLM_HOST || 'http://localhost:11434/v1';
  const model = env.ENDO_LLM_MODEL || 'qwen3';
  const authToken = env.ENDO_LLM_AUTH_TOKEN || 'ollama';
  const name = env.ENDO_LLM_NAME || 'lal';

  const selfLocator = await E(agent).locate('@self');
  const messages = makeRefIterator(E(agent).followMessages());

  console.log('Watching inbox for form from setup-lal...');

  for await (const message of messages) {
    if (message.type !== 'form' || message.from === selfLocator) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const [fromName] = await E(agent).reverseLocate(message.from);
    if (fromName === 'setup-lal') {
      console.log(`Found form at message ${message.number} — submitting...`);
      // eslint-disable-next-line no-await-in-loop
      await E(agent).submit(message.number, { name, host, model, authToken });
      console.log('Submitted.');
      return;
    }
  }
};
harden(main);
