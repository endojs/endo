// @ts-check
// endo run --UNCONFINED setup.js --powers AGENT

import { E } from '@endo/eventual-send';

const faeSpecifier = new URL('agent.js', import.meta.url).href;

/**
 * Provision a fae manager guest and launch the agent caplet.
 * Configuration is handled via the form flow inside the agent.
 *
 * @param {import('@endo/eventual-send').ERef<object>} agent
 */
export const main = async agent => {
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasFae = await E(agent).has('fae');
  if (!hasFae) {
    await E(agent).provideGuest('fae', {
      introducedNames: harden({ AGENT: 'host-agent' }),
      agentName: 'profile-for-fae',
    });
  }

  await E(agent).makeUnconfined('MAIN', faeSpecifier, {
    powersName: 'profile-for-fae',
    resultName: 'controller-for-fae',
  });
};
harden(main);
