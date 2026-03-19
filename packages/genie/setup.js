// @ts-check
// endo run --UNCONFINED setup.js --powers AGENT

/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/eventual-send';

const genieSpecifier = new URL('main.js', import.meta.url).href;

/**
 * Provision a genie guest and launch the main caplet.
 *
 * @param {EndoHost} agent
 */
export const main = async agent => {
  // Only create the guest on first run; on restart the guest already exists
  // and re-running provideGuest with introducedNames hits a daemon bug
  // where the handle formula lacks the write method.
  const hasGenie = await E(agent).has('genie');
  if (!hasGenie) {
    await E(agent).provideGuest('genie', {
      introducedNames: harden({ '@host': 'host-agent' }),
      agentName: 'profile-for-genie',
    });
  }

  await E(agent).makeUnconfined('@main', genieSpecifier, {
    powersName: 'profile-for-genie',
    resultName: 'controller-for-genie',
  });
};
harden(main);
