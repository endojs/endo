// @ts-check
/* global process */
// endo run --UNCONFINED setup.js --powers @agent
//   -E LAL_HOST=https://api.anthropic.com
//   -E LAL_MODEL=claude-sonnet-4-6-20250514
//   -E LAL_AUTH_TOKEN=sk-ant-...

import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision the setup-lal guest, launch the agent caplet, then watch the
 * inbox for configuration forms from setup-lal and auto-submit LAL_ env vars.
 * Runs until interrupted.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
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
  const host = env.LAL_HOST;
  const model = env.LAL_MODEL;
  const authToken = env.LAL_AUTH_TOKEN;
  const name = env.LAL_NAME || 'lal';

  if (!host || !model || !authToken) {
    console.log('No LAL_HOST/LAL_MODEL/LAL_AUTH_TOKEN — skipping auto-submit.');
    return;
  }

  const selfLocator = await E(agent).locate('@self');
  const messages = makeRefIterator(E(agent).followMessages());

  console.log('Watching inbox for form from setup-lal...');

  for await (const message of messages) {
    if (message.type !== 'form') continue;
    if (message.from === selfLocator) continue;

    const [fromName] = await E(agent).reverseLocate(message.from);
    if (fromName !== 'setup-lal') continue;

    console.log(`Found form at message ${message.number} — submitting...`);
    await E(agent).submit(message.number, { name, host, model, authToken });
    console.log('Submitted.');
  }
};
harden(main);
