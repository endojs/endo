// @ts-check
/* global process */
/* eslint-disable no-continue */
// endo run --UNCONFINED setup.js --powers @agent
// Defaults to local Ollama. Override with env vars:
//   ENDO_LLM_HOST=https://api.anthropic.com
//   ENDO_LLM_MODEL=claude-sonnet-4-6-20250514
//   ENDO_LLM_AUTH_TOKEN=sk-ant-...

import { E } from '@endo/eventual-send';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import { chooseModel, fetchAvailableModels } from './model-detect.js';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision the setup-lal guest and launch the agent caplet.
 *
 * If ENDO_LLM_HOST (or any ENDO_LLM_ var) is explicitly set, or if
 * local Ollama is reachable, auto-submit the configuration form.
 * Otherwise, leave the form in the HOST inbox for the user to fill
 * in manually (e.g. via Chat or `yarn setup-lal`).
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
  const hasExplicitConfig =
    env.ENDO_LLM_HOST || env.ENDO_LLM_MODEL || env.ENDO_LLM_AUTH_TOKEN;

  const host = env.ENDO_LLM_HOST || 'http://localhost:11434/v1';
  // Temporary default until the subagent creation wizard ships; the probe
  // below upgrades it to an actually-installed model when one is found.
  const defaultModel = env.ENDO_LLM_MODEL || 'qwen3.6';
  const authToken = env.ENDO_LLM_AUTH_TOKEN || 'ollama';
  const name = env.ENDO_LLM_NAME || 'lal';

  let model = defaultModel;

  if (!hasExplicitConfig) {
    const available = await fetchAvailableModels(host);
    if (available === null) {
      console.log(
        'Lal provisioned. No ENDO_LLM_ env vars set and Ollama is ' +
          'not reachable — leaving form for manual submission.',
      );
      return;
    }
    const chosen = chooseModel(available, defaultModel);
    if (chosen === undefined) {
      console.log(
        'Lal provisioned. Ollama is reachable but advertises no models — ' +
          'leaving form for manual submission.',
      );
      return;
    }
    if (chosen !== defaultModel) {
      console.log(
        `Default model ${defaultModel} not installed — using ${chosen} ` +
          'from the available models.',
      );
    }
    model = chosen;
    console.log('Ollama is reachable — auto-submitting defaults.');
  }

  const selfLocator = await E(agent).locate('@self');
  const messages = iterateReader(E(agent).followMessages());

  console.log('Watching inbox for form from setup-lal...');

  for await (const rawMessage of messages) {
    const message = /** @type {any} */ (rawMessage);
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
