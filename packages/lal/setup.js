// @ts-check
// endo run --UNCONFINED setup.js --powers AGENT

import { E } from '@endo/eventual-send';

const lalSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision a lal manager guest and launch the agent caplet.
 * Configuration is handled via the form flow inside the agent.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasLal = await E(agent).has('lal');
  if (!hasLal) {
    await E(agent).provideGuest('lal', {
      introducedNames: harden({ AGENT: 'host-agent' }),
      agentName: 'profile-for-lal',
    });
  }

  await E(agent).makeUnconfined('@main', lalSpecifier, {
    powersName: 'profile-for-lal',
    resultName: 'controller-for-lal',
  });
};
harden(main);
